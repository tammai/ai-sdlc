#!/usr/bin/env node
// UserPromptSubmit: in a repo set up with /ai-sdlc:setup, every message is checked against the ai-sdlc skills
// before Claude acts. A hook cannot invoke a skill, so it adds a short routing note (plus a keyword hint and the
// active change's state) to the turn; Claude decides and calls the Skill. Off with `"routePrompts": false`.
import { findRoot, isInitialized, loadConfig, loadState, chainStatus, readStdinJson, saveState, treeId } from './lib.mjs';

// First match wins; a hint, never a decision. Anything that matches nothing gets the note without a suggestion.
const HINTS = [
  [/\b(incident|outage|alert (?:fired|is firing)|pager|production is (?:down|broken)|on-?call|sev ?[0-3])\b/i, 'triage'],
  [/\b(bug|broken|regression|crash(?:es|ed|ing)?|stack ?trace|exception|not working|doesn'?t work|fails?|failing|error when|fix (?:the|this|that|a))\b/i, 'fix'],
  [/\b(open (?:a )?pr|pull request|ship (?:it|this)|merge (?:it|this)|release|deploy)\b/i, 'ship'],
  [/\b(code review|review (?:the|this|my) (?:change|diff|code|pr)|review it)\b/i, 'review'],
  [/\b(where are we|what'?s next|status|how are we doing|progress)\b/i, 'status'],
  [/\b(adr|architecture decision|which (?:database|datastore|framework|queue)|should we use)\b/i, 'architecture'],
  [/\b(capacity|scal(?:e|ing|ability)|throughput|what breaks if|load|sizing)\b/i, 'system-design'],
  [/\b(ui|ux|screen|layout|section|landing|design direction|look and feel|visual|figma|responsive|dark mode)\b/i, 'uiux'],
  [/\b(add|build|create|implement|change|update|make|turn|replace|rename|remove|refactor|support|i want|let'?s|continue|next step)\b/i, 'vibe']
];

const input = await readStdinJson();
const prompt = String(input.prompt || '').trim();
const root = findRoot(input.cwd);
if (!prompt || !isInitialized(root)) process.exit(0);
const cfg = loadConfig(root);
const state = loadState(root);
// Baseline for the Stop gate: whatever differs from this tree by the end of the turn was changed in it, by any
// route (edit tools, shell commands, formatters). Recorded whether or not the routing note is on.
if (state.active) { const turnTree = treeId(root); if (turnTree) { state.turnTree = turnTree; saveState(root, state); } }
if (cfg.routePrompts === false) process.exit(0);
if (prompt.startsWith('/')) process.exit(0); // an explicit slash command already chose its skill

const lines = ['[ai-sdlc] Before acting, check this message against the ai-sdlc skills and call the matching one with the Skill tool:'];
lines.push(
  '  idea / feature / change / "continue" → vibe (sizes the tier, resumes the active change) · bug or regression → fix · incident or alert → triage',
  '  UI or screen work → uiux · datastore/framework/contract choice → architecture · capacity or "what breaks if" → system-design',
  '  "where are we" → status · verified and reviewed → ship · review a diff → review · a repeated correction → learn'
);
const hint = HINTS.find(([re]) => re.test(prompt))?.[1];
if (hint) lines.push(`Keyword hint: ${hint} (a guess from wording; ignore it if the message means something else).`);
if (state.active) {
  const c = chainStatus(root, cfg, state.active);
  lines.push(`Active change ${c.id} (tier ${c.tier}), next step: ${c.next}. A request to change this app's code or copy is part of the change: go through the skill, not a direct edit.`);
  if (state.dirty) lines.push('Unverified edits exist: run `sdlc verify` before reporting done.');
}
lines.push('Questions, explanations and chat need no skill: answer them directly.');

process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: lines.join('\n') } }));
