#!/usr/bin/env node
// Agent eval runner (playbook Stage 4, "Continuous evals in CI").
// Each evals/*.json is a real task + checks. Every eval runs in a throwaway git worktree at HEAD,
// so CLAUDE.md / .claude/** changes are tested exactly as committed. Exits 1 below passThreshold.
//   node evals/run.mjs [--filter substring] [--keep]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';

const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
const dir = path.join(root, 'evals');
const cfg = { passThreshold: 0.9, maxTurns: 30, model: undefined, ...JSON.parse(fs.readFileSync(path.join(dir, 'config.json'), 'utf8')) };
const args = process.argv.slice(2);
const filter = args.includes('--filter') ? args[args.indexOf('--filter') + 1] : '';
const keep = args.includes('--keep');

const globRe = (g) => new RegExp('^' + g.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*\/?/g, '\u0000').replace(/\*/g, '[^/]*').replace(/\u0000/g, '.*') + '$');
const changedFiles = (cwd) => execFileSync('git', ['status', '--porcelain', '-uall'], { cwd, encoding: 'utf8' })
  .split('\n').filter(Boolean).map((l) => l.slice(3).replace(/^.* -> /, '').replace(/^"|"$/g, ''));

function check(c, ctx) {
  switch (c.type) {
    case 'command': {
      const r = spawnSync(c.cmd, { cwd: ctx.cwd, shell: true, encoding: 'utf8', timeout: c.timeoutMs || 600000 });
      return { ok: r.status === 0, detail: `${c.cmd} → exit ${r.status}` };
    }
    case 'unchanged': {
      const bad = ctx.changed.filter((f) => c.paths.some((p) => globRe(p).test(f)));
      return { ok: bad.length === 0, detail: bad.length ? `modified protected: ${bad.join(', ')}` : 'protected paths untouched' };
    }
    case 'changed': {
      const missing = c.paths.filter((p) => !ctx.changed.some((f) => globRe(p).test(f)));
      return { ok: missing.length === 0, detail: missing.length ? `expected changes missing: ${missing.join(', ')}` : 'expected files changed' };
    }
    case 'only_changed': {
      const extra = ctx.changed.filter((f) => !c.paths.some((p) => globRe(p).test(f)));
      return { ok: extra.length === 0, detail: extra.length ? `unexpected changes: ${extra.join(', ')}` : 'blast radius ok' };
    }
    case 'file_contains': {
      const p = path.join(ctx.cwd, c.file);
      const ok = fs.existsSync(p) && new RegExp(c.pattern, c.flags || '').test(fs.readFileSync(p, 'utf8'));
      return { ok: c.negate ? !ok : ok, detail: `${c.file} ${c.negate ? '!~' : '~'} /${c.pattern}/` };
    }
    case 'output_contains': {
      const ok = new RegExp(c.pattern, c.flags || 'i').test(ctx.output);
      return { ok: c.negate ? !ok : ok, detail: `agent output ${c.negate ? '!~' : '~'} /${c.pattern}/` };
    }
    default: return { ok: false, detail: `unknown check ${c.type}` };
  }
}

const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'config.json' && f.includes(filter)).sort();
const results = [];
for (const file of files) {
  const ev = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
  const wt = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-eval-'));
  execFileSync('git', ['worktree', 'add', '--detach', wt, 'HEAD'], { cwd: root, stdio: 'ignore' });
  try {
    if (ev.setup) spawnSync(ev.setup, { cwd: wt, shell: true, stdio: 'ignore' });
    const claudeArgs = ['-p', '--output-format', 'json', '--max-turns', String(ev.maxTurns || cfg.maxTurns)];
    if (ev.allowedTools || cfg.allowedTools) claudeArgs.push('--allowedTools', ev.allowedTools || cfg.allowedTools);
    if (cfg.model) claudeArgs.push('--model', cfg.model);
    const t0 = Date.now();
    // the prompt goes on stdin: `claude -p` reads it there, so it never meets a shell. On Windows `claude` can be a .cmd
    // shim that needs one, and a shell re-splits arguments at spaces, so the remaining arguments are quoted.
    const win = process.platform === 'win32';
    const r = spawnSync('claude', win ? claudeArgs.map((a) => `"${a.replaceAll('"', '\\"')}"`) : claudeArgs, {
      cwd: wt, encoding: 'utf8', input: ev.prompt, timeout: (ev.timeoutSec || 900) * 1000, maxBuffer: 64 * 1024 * 1024, shell: win
    });
    let output = r.stdout || '';
    try { output = JSON.parse(output).result ?? output; } catch { /* keep raw */ }
    const ctx = { cwd: wt, output, changed: changedFiles(wt) };
    const checks = ev.checks.map((c) => ({ ...c, ...check(c, ctx) }));
    const ok = r.status === 0 && checks.every((c) => c.ok);
    results.push({ id: ev.id || file, ok, secs: Math.round((Date.now() - t0) / 1000), checks: checks.map(({ type, ok, detail }) => ({ type, ok, detail })) });
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${ev.id || file}`);
    for (const c of checks) if (!c.ok) console.log(`      ✗ ${c.detail}`);
  } finally {
    if (!keep) execFileSync('git', ['worktree', 'remove', '--force', wt], { cwd: root, stdio: 'ignore' });
  }
}

const rate = results.length ? results.filter((r) => r.ok).length / results.length : 1;
fs.mkdirSync(path.join(dir, 'results'), { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
fs.writeFileSync(path.join(dir, 'results', `${stamp}.json`), JSON.stringify({ rate, threshold: cfg.passThreshold, results }, null, 2));
console.log(`\npass rate ${(rate * 100).toFixed(0)}% (threshold ${(cfg.passThreshold * 100).toFixed(0)}%)`);
process.exit(rate >= cfg.passThreshold ? 0 : 1);
