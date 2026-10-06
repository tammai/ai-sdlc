#!/usr/bin/env node
// SessionStart: re-hydrate the artifact chain so a vibe session picks up where the last one left off.
import { fileURLToPath } from 'node:url';
import { findRoot, isInitialized, loadConfig, loadState, chainStatus, readStdinJson } from './lib.mjs';

const input = await readStdinJson();
const root = findRoot(input.cwd);
if (!isInitialized(root)) process.exit(0);
const cfg = loadConfig(root);
const state = loadState(root);

const cli = fileURLToPath(new URL('./sdlc.mjs', import.meta.url));
const lines = [
  '[ai-sdlc] This repo runs the AI-native SDLC (intent → spec → plan → build/verify → review → ship).',
  `CLI ("sdlc" in ai-sdlc skills): node "${cli}"`
];
if (state.active) {
  const c = chainStatus(root, cfg, state.active);
  lines.push(
    `Active change: ${c.id} (tier ${c.tier}) in ${cfg.artifactsDir}/${c.id}/`,
    `  intent=${c.status.intent} design=${c.status.design} ui=${c.status.ui} spec=${c.status.spec} plan=${c.status.plan} verify=${c.status.verify} review=${c.status.review}`,
    `  Next step: ${c.next}. Use /ai-sdlc:vibe to continue.`
  );
  if (state.dirty) lines.push('  Unverified edits exist — run `sdlc verify` before reporting done.');
  if (state.testLock?.length) lines.push(`  Locked tests (do not edit): ${state.testLock.join(', ')}`);
} else {
  lines.push('No active change. Start one with /ai-sdlc:vibe <idea> or /ai-sdlc:fix <bug>.');
}
process.stdout.write(lines.join('\n') + '\n');
