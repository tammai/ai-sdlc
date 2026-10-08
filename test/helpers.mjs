// Fixtures for the hook and CLI tests: throwaway repos, and the plugin's scripts run the way
// Claude Code runs them (JSON on stdin, decision on stdout). Zero dependencies, Node >= 18.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const PLUGIN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SCRIPTS = path.join(PLUGIN, 'scripts');

const made = [];
process.on('exit', () => { for (const d of made) fs.rmSync(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });

// The session running these tests may export CLAUDE_PROJECT_DIR (pointing at this repo) or
// RELEASE_APPROVAL (which silences the production gate). Neither may leak into a fixture run.
export function cleanEnv(extra = {}) {
  const env = { ...process.env };
  delete env.CLAUDE_PROJECT_DIR;
  delete env.RELEASE_APPROVAL;
  return { ...env, ...extra };
}

export function write(dir, rel, text) {
  const file = path.join(dir, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  return file;
}

export function read(dir, rel) {
  return fs.readFileSync(path.join(dir, rel), 'utf8');
}

// A repo root (`.git` stops findRoot) — initialized with `.sdlc/config.json` unless init: false.
// `active` creates docs/sdlc/<id>/ and makes it the active change; `plan` writes its plan.md status.
export function makeRepo({ init = true, config = {}, state, active, plan, files = {} } = {}) {
  const dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'ai-sdlc-test-')));
  made.push(dir);
  fs.mkdirSync(path.join(dir, '.git'));
  if (init) write(dir, '.sdlc/config.json', JSON.stringify(config, null, 2));
  if (active) {
    fs.mkdirSync(path.join(dir, 'docs/sdlc', active), { recursive: true });
    if (plan) write(dir, `docs/sdlc/${active}/plan.md`, `---\nstatus: ${plan}\n---\n# Plan\n`);
  }
  if (state || active) write(dir, '.sdlc/local/state.json', JSON.stringify({ active: active || null, ...state }));
  for (const [rel, text] of Object.entries(files)) write(dir, rel, text);
  return dir;
}

// Turn the fake `.git` that makeRepo creates into a real repository with one empty commit.
export function realGit(dir) {
  fs.rmSync(path.join(dir, '.git'), { recursive: true });
  spawnSync('git', ['init', '-q'], { cwd: dir });
  spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--allow-empty', '-m', 'init'], { cwd: dir });
  return dir;
}

export function state(dir) {
  return JSON.parse(read(dir, '.sdlc/local/state.json'));
}

// Run a hook script with a hook payload. `json` is the parsed stdout (null when the hook is silent).
export function hook(script, dir, payload, env = {}) {
  const r = spawnSync(process.execPath, [path.join(SCRIPTS, script)], {
    cwd: dir, input: JSON.stringify({ cwd: dir, ...payload }), encoding: 'utf8',
    env: cleanEnv({ CLAUDE_PROJECT_DIR: dir, ...env })
  });
  let json = null;
  try { json = r.stdout.trim() ? JSON.parse(r.stdout) : null; } catch { /* plain-text hook output */ }
  return { code: r.status, stdout: r.stdout, stderr: r.stderr, json };
}

// PreToolUse decision: 'allow' when the guard stays silent, else 'deny' | 'ask'.
export function guard(dir, tool_name, tool_input, env) {
  const r = hook('guard.mjs', dir, { hook_event_name: 'PreToolUse', tool_name, tool_input }, env);
  if (r.code !== 0) throw new Error(`guard.mjs exited ${r.code}: ${r.stderr}`);
  const out = r.json?.hookSpecificOutput;
  return { decision: out?.permissionDecision || 'allow', reason: out?.permissionDecisionReason || '' };
}

// The sdlc CLI against a fixture repo.
export function sdlc(dir, args, env = {}) {
  const r = spawnSync(process.execPath, [path.join(SCRIPTS, 'sdlc.mjs'), ...args], {
    cwd: dir, encoding: 'utf8', env: cleanEnv({ CLAUDE_PROJECT_DIR: dir, ...env })
  });
  return { code: r.status, out: `${r.stdout}${r.stderr}`, stdout: r.stdout };
}
