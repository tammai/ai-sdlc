#!/usr/bin/env node
// PostToolUse on edits: run the file-scoped formatter (if configured) and mark the active
// change "dirty" so the Stop gate knows the session has unverified work.
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { findRoot, isInitialized, loadConfig, loadState, saveState, toRel, isInside, matchesAny, readStdinJson, shellQuote } from './lib.mjs';

const input = await readStdinJson();
const ti = input.tool_input || {};
const filePath = ti.file_path || ti.notebook_path;
const root = findRoot(input.cwd);
if (!filePath || !isInitialized(root)) process.exit(0);

const cfg = loadConfig(root);
const rel = toRel(root, filePath);
if (!isInside(rel) || rel.startsWith(cfg.artifactsDir + '/') || rel.startsWith('.sdlc/')) process.exit(0);

// formatOnEdit: "cmd {file}" or [{ "glob": "web/**/*.{ts,vue}", "cmd": "cd web && pnpm exec eslint --fix {file}" }, …]
const fmt = typeof cfg.formatOnEdit === 'string'
  ? cfg.formatOnEdit
  : (cfg.formatOnEdit || []).find((e) => matchesAny(rel, [e.glob]))?.cmd;
if (fmt) {
  // the file name is model-chosen: quote it for the shell that will run it, or skip when it cannot be quoted safely
  const quoted = shellQuote(path.resolve(root, rel));
  if (quoted) spawnSync(fmt.replaceAll('{file}', () => quoted), { cwd: root, shell: true, stdio: 'ignore', timeout: 20000 });
}

const state = loadState(root);
if (state.active && !state.dirty) {
  state.dirty = true;
  saveState(root, state);
}
