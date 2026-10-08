#!/usr/bin/env node
// One entry point for the plugin's own quality checks.
//
//   node test/run.mjs                 quick: unit tests + validate, then the eval cases that cover what you changed
//   node test/run.mjs --full          everything: unit tests + validate + every eval case, 3 runs each, with/without-plugin delta
//
//   --base <ref>     compare against <ref> instead of origin/main (quick)
//   --no-evals       unit tests + validate only (free, no Claude usage)
//   --evals-only     skip unit tests and validate
//   --only <tags>    run the eval cases with any of these comma-separated tags (e.g. --only hooks,skill-fix)
//   --runs <n>       runs per eval case (quick: 1, full: 3)
//   --dry-run        print what would run, run nothing
//   -- <args>        passed through to `claude plugin eval` (e.g. -- --no-publish -j 4)
//
// Unit tests are free and take seconds. Eval cases spend your Claude plan usage (or API credit).
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { evalTags, changedFiles } from './select.mjs';

const PLUGIN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const dash = argv.indexOf('--');
const own = dash < 0 ? argv : argv.slice(0, dash);
const passthrough = dash < 0 ? [] : argv.slice(dash + 1);
const has = (flag) => own.includes(flag);
const opt = (flag) => { const i = own.indexOf(flag); return i < 0 ? undefined : own[i + 1]; };

const full = has('--full');
const dry = has('--dry-run');
const runs = opt('--runs') || (full ? '3' : '1');
const failures = [];

function run(label, cmd, args) {
  console.log(`\n▶ ${label}\n  ${[cmd, ...args].join(' ')}`);
  if (dry) return;
  // `claude` is a .cmd shim on Windows, which only a shell can launch
  const win = process.platform === 'win32' && cmd !== process.execPath;
  const q = (a) => (/[\s"&|<>^%]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a);
  const r = win
    ? spawnSync([cmd, ...args].map(q).join(' '), { cwd: PLUGIN, stdio: 'inherit', shell: true })
    : spawnSync(cmd, args, { cwd: PLUGIN, stdio: 'inherit' });
  // a missing CLI is a failure, not a skip: a green run must mean the checks ran
  if (r.error) failures.push(`${label} (${r.error.code === 'ENOENT' ? `${cmd} is not installed` : r.error.message})`);
  else if (r.status !== 0) failures.push(`${label} (exit ${r.status})`);
}

if (!has('--evals-only')) {
  const tests = fs.readdirSync(path.join(PLUGIN, 'test')).filter((f) => f.endsWith('.test.mjs')).map((f) => path.join('test', f));
  run('unit tests', process.execPath, ['--test', ...tests]);
  for (const target of ['.claude-plugin/plugin.json', '.claude-plugin/marketplace.json', 'skills', 'agents']) {
    run(`validate ${target}`, 'claude', ['plugin', 'validate', target, '--strict']);
  }
}

// Every case under evals/, with its tags and whether it needs a shell tool.
function listCases() {
  const dir = path.join(PLUGIN, 'evals');
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(dir, d.name, 'prompt.md')))
    .map((d) => {
      const text = fs.readFileSync(path.join(dir, d.name, 'prompt.md'), 'utf8');
      const list = (key) => (text.match(new RegExp(`^${key}:\\s*\\[(.*)\\]\\s*$`, 'm'))?.[1] || '').split(',').map((s) => s.trim()).filter(Boolean);
      return { name: d.name, tags: list('tags'), shell: list('allowed_tools').some((t) => /^(Bash|PowerShell)$/.test(t)) };
    });
}

if (!has('--no-evals')) {
  let tags = null;
  if (opt('--only')) tags = new Set(opt('--only').split(','));
  else if (!full) {
    const files = changedFiles(PLUGIN, opt('--base'));
    tags = evalTags(files);
    console.log(`\nchanged (${files.length}): ${files.join(', ') || '(none)'}`);
    console.log(tags ? `eval tags: ${[...tags].join(', ') || '(none)'}` : 'eval tags: ALL (a shared or unmapped file changed)');
  }
  let cases = listCases().filter((c) => !tags || c.tags.some((t) => tags.has(t)));
  // Claude Code refuses to grant a shell tool where it cannot sandbox it (Windows today). Run those on Linux, macOS or WSL.
  const shellOk = process.platform !== 'win32';
  if (!shellOk) {
    const skipped = cases.filter((c) => c.shell).map((c) => c.name);
    if (skipped.length) console.log(`skipped on Windows (needs a sandboxed shell — run on Linux, macOS or WSL): ${skipped.join(', ')}`);
    cases = cases.filter((c) => !c.shell);
  }
  // an explicit --only that selects nothing (a typo, or every match skipped on this OS) must not read as green
  if (!cases.length && opt('--only')) failures.push(`evals (--only ${opt('--only')} selected no runnable case on ${process.platform})`);
  else if (!cases.length) console.log('\nno eval case covers these changes — skipping evals');
  else {
    const args = ['plugin', 'eval', '.', '--runs', runs, '--trust-plugin',
      // hook cases build a fixture repo (--scaffold) and need write tools; trigger cases only use read-only tools
      '--scaffold', '--allow-tools', ...(shellOk ? ['Bash'] : []), 'Write', 'Edit',
      // quick: one run, no baseline arm, every run must pass; full: with/without delta, 2 of 3 runs must pass
      ...(full ? ['--threshold', '0.66'] : ['--ablation', 'none', '--threshold', '1']),
      // every case is tagged with its own name, so this selects exactly `cases`
      '--tag', ...cases.map((c) => c.name),
      ...passthrough];
    run(full ? `evals (full suite, ${cases.length} cases)` : `evals (changed areas, ${cases.length} cases)`, 'claude', args);
  }
}

console.log(failures.length ? `\nFAILED: ${failures.join('; ')}` : `\n${dry ? 'dry run — nothing executed' : 'all green'}`);
process.exit(failures.length ? 1 : 0);
