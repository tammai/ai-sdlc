#!/usr/bin/env node
// Stop hook: "every session checks its own work before a human sees it."
// If the active change has unverified edits, push Claude back once to run the feedback loop.
import { fileURLToPath } from 'node:url';
import { findRoot, isInitialized, loadConfig, loadState, readStdinJson } from './lib.mjs';

const input = await readStdinJson();
if (input.stop_hook_active) process.exit(0); // never loop
const root = findRoot(input.cwd);
if (!isInitialized(root)) process.exit(0);
const cfg = loadConfig(root);
const state = loadState(root);
if (!cfg.requireVerifyOnStop || !state.active || !state.dirty) process.exit(0);

process.stdout.write(JSON.stringify({
  decision: 'block',
  reason: `[ai-sdlc] Change "${state.active}" has edits that have not been verified. ` +
    `Run \`node "${fileURLToPath(new URL('./sdlc.mjs', import.meta.url))}" verify\` (all configured build/test/lint commands), ` +
    'fix the code until it passes, and paste the evidence. If you are deliberately pausing to ask the user something, ' +
    'say so in one line and stop again.'
}));
