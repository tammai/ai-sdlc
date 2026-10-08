#!/usr/bin/env node
// Stop hook: "every session checks its own work before a human sees it."
// If the active change has unverified edits, push Claude back once to run the feedback loop.
import { fileURLToPath } from 'node:url';
import { findRoot, isInitialized, loadConfig, loadState, saveState, readStdinJson, verifiedUnchanged, changedSince } from './lib.mjs';

const input = await readStdinJson();
if (input.stop_hook_active) process.exit(0); // never loop
const root = findRoot(input.cwd);
if (!isInitialized(root)) process.exit(0);
const cfg = loadConfig(root);
const state = loadState(root);
if (!cfg.requireVerifyOnStop || !state.active) process.exit(0);
// Unverified work = an edit tool marked the change dirty, or the working tree differs from the one this turn started
// on. The second catches changes made through the shell (python/sed/codegen), which no edit hook sees.
let unverified = !!state.dirty;
if (!unverified && state.turnTree) unverified = (changedSince(root, cfg, state.turnTree)?.files.length || 0) > 0;
if (!unverified) process.exit(0);
// edited and then reverted, or only docs touched: the tree is the one that already passed, so there is nothing to re-run
if (verifiedUnchanged(root, cfg, state.active)) { saveState(root, { ...state, dirty: false }); process.exit(0); }
if (!state.dirty) saveState(root, { ...state, dirty: true }); // stays enforced next turn if this reminder is ignored

process.stdout.write(JSON.stringify({
  decision: 'block',
  reason: `[ai-sdlc] Change "${state.active}" has edits that have not been verified. ` +
    `Run \`node "${fileURLToPath(new URL('./sdlc.mjs', import.meta.url))}" verify\` (all configured build/test/lint commands), ` +
    'fix the code until it passes, and paste the evidence. If you are deliberately pausing to ask the user something, ' +
    'say so in one line and stop again.'
}));
