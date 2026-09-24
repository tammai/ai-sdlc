#!/usr/bin/env node
// Claude Code hook for the risk tiers.
//
//   node hook.mjs pre   — PreToolUse on Edit|Write|MultiEdit|NotebookEdit|Bash. Denies edits that
//                         hit a `block` rule (everyone) or a `protected` rule (unless
//                         RISK_TIER_ROLE=engineer), and Bash commands that deploy, touch live
//                         data or skip the review path. Fails closed: if this script errors, the
//                         call is denied.
//   node hook.mjs post  — PostToolUse on file edits. Re-classifies the whole branch and, when the
//                         tier changes, tells Claude so it can explain it to the user.
//
// The session hook is a convenience that catches problems early. The merge gate is CI
// (ci.mjs), which re-checks every change no matter how it was made.

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, relative } from 'node:path'
import { classify, normalizePath } from './classify.mjs'
import { collectChanges, currentBranch, gitDir, isGitRepo, resolveBase } from './git.mjs'
import { formatForSession } from './report.mjs'
import { validateReview } from './review-record.mjs'

const here = new URL('.', import.meta.url)
const config = JSON.parse(readFileSync(new URL('rules.json', here), 'utf8'))
const isEngineer = process.env.RISK_TIER_ROLE === 'engineer'

const TAIL = 'Explain this to the user in plain words. Do not look for another way to make this change.'

function emit(obj) {
  process.stdout.write(JSON.stringify(obj))
  process.exit(0)
}

const deny = (reason) =>
  emit({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } })

// ---------- Bash ----------

const PROTECTED_IN_SHELL =
  /(?:>>?|\btee\b|\bsed\s+-i|\bmv\b|\bcp\b|\brm\b|\bgit\s+(?:checkout|restore)\b)[^\n|;&]*(?:\.github[\\/]|\.claude[\\/]|scripts[\\/]|layers[\\/]|ui-templates[\\/]|wrangler\.(?:jsonc|toml)|app\.registry\.json|CLAUDE\.md|REVIEW\.md|POLICIES\.md|LEARNED\.md|docs[\\/]|\.ai-sdlc\.json|content\.config\.ts|colada\.options\.ts)/

// `git push`, also with options before it: git -C . push, git -c k=v push, git --no-pager push.
const PUSH = String.raw`\bgit(?:\s+-[Cc]\s+\S+|\s+-\S+)*\s+push\b`
const isPush = (command) => new RegExp(PUSH).test(command)

const BASH_RULES = [
  {
    re: /\bwrangler\b[^\n]*\b(?:deploy|publish|rollback|delete|secret|versions\s+(?:upload|deploy))\b/,
    why: 'Going live, rolling back and managing secrets happen only through the reviewed pipeline, never from a session.',
  },
  {
    re: /\b(?:pnpm|npm|yarn)\s+(?:run\s+)?deploy/,
    why: 'Going live happens only through the reviewed pipeline, never from a session.',
  },
  {
    re: /\bwrangler\b[^\n]*\b(?:d1|kv|r2)\b[^\n]*--remote\b/,
    why: 'This command would read or change the live database or storage. Live data changes only through a reviewed migration. Engineers read it from their own terminal.',
  },
  {
    re: new RegExp(PUSH + String.raw`[^\n]*(?:\s--force(?:-with-lease)?\b|\s-f\b|\s\+\S)`),
    why: 'Force-pushing rewrites history that other people may depend on.',
  },
  {
    re: new RegExp(PUSH + String.raw`[^\n]*\s(?:\S+:)?(?:main|master)\b`),
    why: 'Changes reach main only through a pull request, where the checks run.',
  },
  { re: /--no-verify\b/, why: 'Skipping the checks is not allowed.' },
  { re: /\bgh\s+pr\s+merge\b[^\n]*--admin\b/, why: 'Merging past the required checks is not allowed.' },
  { re: /\bgh\s+(?:secret|variable)\s+(?:set|delete)\b/, why: 'Repository secrets and settings are managed by engineers.' },
]

function checkBash(command, cwd) {
  for (const rule of BASH_RULES) if (rule.re.test(command)) deny(`Blocked by the risk check: ${rule.why} ${TAIL}`)
  if (isPush(command) && ['main', 'master'].includes(currentBranch(cwd))) {
    deny(`Blocked by the risk check: you're on main. Work happens on a branch and reaches main through a pull request. ${TAIL}`)
  }
  if (!isEngineer && PROTECTED_IN_SHELL.test(command)) {
    deny(`Blocked by the risk check: this command would change an engineer-owned file (safety checks, infrastructure or ownership). ${TAIL}`)
  }
  if (isPush(command)) requireReviewBeforePush(cwd)
}

// Review before push: a yellow or red branch leaves this computer only after the engineer
// review of its exact commit (/ai-sdlc:ship step 3 saves it to .git/ai-sdlc-review/<sha>.json).
// Engineers, and apps where people review instead ("claudeReview": false), push freely.
function requireReviewBeforePush(cwd) {
  if (isEngineer || registryField(cwd, 'claudeReview') === false || !isGitRepo(cwd)) return
  const base = resolveBase(cwd, 'origin/main')
  const { tier } = classify(collectChanges({ cwd, base }), config, { data: registryField(cwd, 'data') })
  if (tier === 'green') return
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' }).trim()
  if (reviewSaved(cwd, head)) return
  deny(
    `Blocked by the risk check: this is a ${tier} change, and commit ${head.slice(0, 7)} hasn't had its engineer review yet. ` +
      `Run the review first (/ai-sdlc:ship step 3): it saves to .git/ai-sdlc-review/${head}.json, and then the push goes through. ${TAIL}`,
  )
}

// A saved review counts only if it's a complete review of exactly this commit, the same check
// `pnpm review:post` makes. The file is local and could be forged: the merge gate is the lock.
function reviewSaved(cwd, head) {
  try {
    const review = JSON.parse(readFileSync(join(gitDir(cwd), 'ai-sdlc-review', `${head}.json`), 'utf8'))
    return validateReview(review).length === 0 && review.sha === head
  } catch {
    return false
  }
}

function registryField(cwd, field) {
  try {
    return JSON.parse(readFileSync(join(cwd, 'app.registry.json'), 'utf8'))[field]
  } catch {
    return undefined
  }
}

// ---------- File edits ----------

function lines(s) {
  return s ? s.split(/\r?\n/) : []
}

// Lines in `after` that weren't in `before` — enough to judge what an edit introduces.
function newLines(before, after) {
  const had = new Set(lines(before))
  return lines(after).filter((l) => !had.has(l))
}

function applyEdit(content, { old_string, new_string, replace_all }) {
  if (old_string === undefined) return content
  return replace_all ? content.split(old_string).join(new_string) : content.replace(old_string, () => new_string)
}

function changeFor(tool, input, projectDir) {
  const abs = input.file_path ?? input.notebook_path
  if (!abs) return null
  const rel = normalizePath(relative(projectDir, isAbsolute(abs) ? abs : join(projectDir, abs)))
  if (rel.startsWith('../') || isAbsolute(rel)) return null // outside the project
  const exists = existsSync(abs)
  const before = exists ? readFileSync(abs, 'utf8') : ''
  let after = before
  let added = []
  if (tool === 'Write') {
    after = input.content ?? ''
    added = newLines(before, after)
  } else if (tool === 'Edit') {
    after = applyEdit(before, input)
    added = newLines(input.old_string, input.new_string)
  } else if (tool === 'MultiEdit') {
    for (const e of input.edits ?? []) {
      after = applyEdit(after, e)
      added.push(...newLines(e.old_string, e.new_string))
    }
  } else if (tool === 'NotebookEdit') {
    added = lines(input.new_source)
    after = null
  }
  return { path: rel, status: exists ? 'modified' : 'added', added, content: after }
}

function checkEdit(tool, input, projectDir) {
  const change = changeFor(tool, input, projectDir)
  if (!change) return
  const gating = { ...config, rules: config.rules.filter((r) => r.block || (r.protected && !isEngineer)) }
  const { findings } = classify([change], gating)
  const hit = findings[0]
  if (!hit) return
  const next = hit.next ? ` ${hit.next}` : ''
  deny(`Blocked by the risk check (${hit.rule}): ${hit.why}${next} ${TAIL}`)
}

// ---------- Post: tier notice ----------

function registryData(projectDir) {
  try {
    return JSON.parse(readFileSync(join(projectDir, 'app.registry.json'), 'utf8')).data
  } catch {
    return undefined
  }
}

function notifyTier(projectDir) {
  if (!isGitRepo(projectDir)) return
  const base = resolveBase(projectDir)
  const result = classify(collectChanges({ cwd: projectDir, base }), config, { data: registryData(projectDir) })
  const stateFile = join(gitDir(projectDir), 'risk-tier-last')
  const previous = existsSync(stateFile) ? readFileSync(stateFile, 'utf8').trim() : 'green'
  if (previous === result.tier) return
  writeFileSync(stateFile, result.tier)
  emit({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: formatForSession(result, previous) } })
}

// ---------- Main ----------

const mode = process.argv[2]
let payload = {}
try {
  payload = JSON.parse(readFileSync(0, 'utf8') || '{}')
} catch {}
const projectDir = process.env.CLAUDE_PROJECT_DIR || payload.cwd || process.cwd()
const tool = payload.tool_name
const input = payload.tool_input ?? {}

try {
  if (mode === 'pre') {
    if (tool === 'Bash') checkBash(input.command ?? '', projectDir)
    else checkEdit(tool, input, projectDir)
  } else if (mode === 'post') {
    notifyTier(projectDir)
  }
} catch (err) {
  if (mode === 'pre') deny(`The risk check itself failed (${err.message}), so this change was stopped to be safe. Ask an engineer to look at scripts/risk-tier.`)
  // post is advisory — never break the session over a notice
}
process.exit(0)
