#!/usr/bin/env node
// ai-sdlc CLI — the committed artifact chain (intent → spec → plan → verify → review) as files + state.
// Usage: node sdlc.mjs <command> [args]   (run `help` for the list)
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  STAGES, DEFAULT_CONFIG, findRoot, isInitialized, loadConfig, loadState, saveState, changeDir,
  readDoc, writeMeta, toRel, gitUser, nowIso, chainStatus, ROLES, TIERS, TIER_TO_COMPLEXITY, routeAgent,
  GATE_LEVELS, DEFAULT_GATES, gateLevel, crossModelCfg, readinessProblems, openItems
} from './lib.mjs';
import { detectProject, detectedVerify, packageManager, globExists } from './detect.mjs';
import { scaffoldApp } from './scaffold-app.mjs';

const PLUGIN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TEMPLATES = path.join(PLUGIN, 'templates');
const root = findRoot();
const [cmd, ...argv] = process.argv.slice(2);

function flags(args) {
  const out = { _: [] };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=');
      if (v !== undefined) out[k] = v;
      else if (args[i + 1] && !args[i + 1].startsWith('--')) out[k] = args[++i];
      else out[k] = true;
    } else out._.push(a);
  }
  return out;
}
const f = flags(argv);
const die = (msg, code = 1) => { console.error(`ai-sdlc: ${msg}`); process.exit(code); };
const need = () => { if (!isInitialized(root)) die('not initialized — run `sdlc init` (or /ai-sdlc:setup) first'); };
// A value in the frontmatter block is quoted when plain YAML would misread it (`title: Stack: Nuxt 4` is invalid); the body is left as is.
const yamlValue = (v) => {
  const s = String(v ?? '');
  return s && /:(\s|$)|\s#|^[\s>|*&!%@`'"\-?,[\]{}#]|\s$/.test(s) ? JSON.stringify(s) : s;
};
const render = (text, vars) => {
  const fill = (t) => t.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? '');
  const m = text.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
  if (!m) return fill(text);
  const fm = m[0].replace(/^([A-Za-z0-9_-]+:[ \t]*)\{\{(\w+)\}\}[ \t]*$/gm, (_, head, k) => head + yamlValue(vars[k]));
  return fill(fm) + fill(text.slice(m[0].length));
};
// A slug of at most 48 characters, cut at a word boundary (never mid-word).
const slugify = (s) => {
  const full = s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (full.length <= 48) return full || 'change';
  const cut = full.slice(0, 48);
  const trimmed = full[48] === '-' ? cut : cut.slice(0, cut.lastIndexOf('-') > 16 ? cut.lastIndexOf('-') : 48);
  return trimmed.replace(/-$/, '');
};
const today = () => new Date().toISOString().slice(0, 10);

function activeOrArg(cfg) {
  const id = f.id || loadState(root).active;
  if (!id) die('no active change (pass --id <id> or run `sdlc activate <id>`)');
  if (!fs.existsSync(changeDir(root, cfg, id))) die(`unknown change ${id}`);
  return id;
}

// A gate that found `problems`: advisory warns, soft blocks unless --override "<reason>" (returned as
// frontmatter to record), hard blocks. Returns the frontmatter patch to write on approval.
function applyGate(cfg, gate, problems, what) {
  const level = gateLevel(cfg, gate);
  if (!problems.length || level === 'off') return {};
  const list = problems.map((p) => `  - ${p}`).join('\n');
  if (level === 'advisory') { console.error(`ai-sdlc: advisory (${gate} gate, ${what}):\n${list}`); return {}; }
  const reason = typeof f.override === 'string' ? f.override.trim() : '';
  if (level === 'soft' && reason) {
    console.error(`ai-sdlc: ${gate} gate overridden (${what}): ${reason}\n${list}`);
    return { [`${gate}_override`]: reason };
  }
  die(`cannot approve ${what}: ${gate} gate (${level}) found\n${list}\n` +
    (level === 'soft' ? `Resolve these, or accept the risk with --override "<reason>" (recorded in the artifact).` : 'Resolve these first; this gate is hard.'));
}

// ---------------------------------------------------------------- init ---
function detectVerify() {
  return detectedVerify(root);
}

function init() {
  const cfgFile = path.join(root, '.sdlc', 'config.json');
  fs.mkdirSync(path.join(root, '.sdlc'), { recursive: true });
  if (!fs.existsSync(cfgFile) || f.force) {
    const { prodPatterns, secretPaths, secretAllow, testGlobs, ...visible } = DEFAULT_CONFIG;
    const cfg = { ...visible, verify: detectVerify() };
    fs.writeFileSync(cfgFile, JSON.stringify(cfg, null, 2) + '\n');
    console.log(`wrote .sdlc/config.json (verify: ${cfg.verify.map((v) => v.cmd).join(' && ') || 'NONE DETECTED — fill in "verify"'})`);
  } else console.log('.sdlc/config.json exists (use --force to regenerate)');
  fs.writeFileSync(path.join(root, '.sdlc', '.gitignore'), 'local/\n');
  const cfg = loadConfig(root);
  const art = path.join(root, cfg.artifactsDir);
  fs.mkdirSync(art, { recursive: true });
  const readme = path.join(art, 'README.md');
  if (!fs.existsSync(readme)) fs.copyFileSync(path.join(TEMPLATES, 'artifacts-README.md'), readme);
  console.log(`artifact chain lives in ${cfg.artifactsDir}/<change-id>/{intent,spec,plan,verify,review}.md`);
}

// ------------------------------------------------------------ scaffold ---
const SCAFFOLD = {
  'claude-md': ['repo/CLAUDE.md', 'CLAUDE.md'],
  review: ['repo/REVIEW.md', 'REVIEW.md'],
  evals: [['evals/README.md', 'evals/README.md'], ['evals/run.mjs', 'evals/run.mjs'], ['evals/example-fix-keeps-tests.json', 'evals/example-fix-keeps-tests.json'], ['evals/config.json', 'evals/config.json']],
  'ci-review': ['github/claude-review.yml', '.github/workflows/claude-review.yml'],
  'ci-evals': ['github/agent-evals.yml', '.github/workflows/agent-evals.yml'],
  'ci-triage': ['github/build-triage.yml', '.github/workflows/build-triage.yml'],
  'ci-monitor': [['github/monitor.yml', '.github/workflows/monitor.yml'], ['bands.json', '.sdlc/bands.json']],
  'managed-settings': ['managed-settings.example.json', '.sdlc/managed-settings.example.json'],
  'babysit-command': ['commands/babysit.md', '.claude/commands/babysit.md'],
  'design-md': ['repo/DESIGN.md', 'DESIGN.md']
};
function scaffold() {
  const what = f._;
  if (!what.length) die(`scaffold what? one of: ${Object.keys(SCAFFOLD).join(', ')}`);
  for (const w of what) {
    const spec = SCAFFOLD[w];
    if (!spec) die(`unknown scaffold ${w}`);
    const pairs = Array.isArray(spec[0]) ? spec : [spec];
    for (const [src, dst] of pairs) {
      const out = path.join(root, dst);
      if (fs.existsSync(out) && !f.force) { console.log(`skip  ${dst} (exists; --force to overwrite)`); continue; }
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.copyFileSync(path.join(TEMPLATES, src), out);
      console.log(`wrote ${dst}`);
    }
  }
}

// --------------------------------------------------------- change mgmt ---
function create() {
  need();
  const cfg = loadConfig(root);
  const title = f._.join(' ').trim();
  if (!title) die('usage: sdlc new "<title>" [--tier S|M|L] [--source human|monitor|scan|incident|review] [--fix] [--no-activate]');
  const tier = String(f.tier || 'M').toUpperCase();
  if (!['S', 'M', 'L'].includes(tier)) die('tier must be S, M or L');
  let id = `${today()}-${slugify(title)}`;
  for (let n = 2; fs.existsSync(changeDir(root, cfg, id)); n++) id = `${today()}-${slugify(title)}-${n}`;
  const dir = changeDir(root, cfg, id);
  fs.mkdirSync(dir, { recursive: true });
  const vars = { id, title, tier, author: f.author || gitUser(root), created: nowIso(), source: f.source || 'human', kind: f.fix ? 'fix' : 'feature' };
  fs.writeFileSync(path.join(dir, 'intent.md'), render(fs.readFileSync(path.join(TEMPLATES, 'artifacts', 'intent.md'), 'utf8'), vars));
  if (!f['no-activate']) {
    const st = loadState(root);
    saveState(root, { ...st, active: id, dirty: false, fixMode: !!f.fix, testLock: [] });
  }
  console.log(JSON.stringify({ id, dir: toRel(root, dir), intent: toRel(root, path.join(dir, 'intent.md')), tier, active: !f['no-activate'] }));
}

function draft() {
  need();
  const cfg = loadConfig(root);
  const kind = f._[0];
  if (!['design', 'ui', 'spec', 'plan', 'review'].includes(kind)) die('usage: sdlc draft design|ui|spec|plan|review');
  const id = activeOrArg(cfg);
  const dir = changeDir(root, cfg, id);
  const out = path.join(dir, `${kind}.md`);
  if (fs.existsSync(out) && !f.force) { console.log(toRel(root, out)); return; }
  const intent = readDoc(path.join(dir, 'intent.md'));
  const vars = { id, title: intent?.body.match(/^# Intent:\s*(.+)$/m)?.[1] || id, tier: intent?.meta.tier || 'M', author: gitUser(root), created: nowIso() };
  fs.writeFileSync(out, render(fs.readFileSync(path.join(TEMPLATES, 'artifacts', `${kind}.md`), 'utf8'), vars));
  console.log(toRel(root, out));
}

function setStatus(status) {
  need();
  const cfg = loadConfig(root);
  const kind = f._[0];
  if (![...STAGES, 'design', 'ui', 'review'].includes(kind)) die(`usage: sdlc ${cmd} intent|design|ui|spec|plan|review [--by name] [--reason text]`);
  const id = activeOrArg(cfg);
  const dir = changeDir(root, cfg, id);
  const file = path.join(dir, `${kind}.md`);
  if (!fs.existsSync(file)) die(`${kind}.md does not exist yet for ${id}`);
  const gatePatch = {};
  if (status === 'approved') {
    const c = chainStatus(root, cfg, id);
    const specPrereq = ['intent', ...(c.tier === 'L' || c.docs.design ? ['design'] : []), ...(c.docs.ui ? ['ui'] : [])];
    const prereq = { intent: [], design: ['intent'], ui: ['intent'], spec: specPrereq, plan: c.tier === 'S' ? ['intent'] : ['intent', 'spec'], review: ['plan'] }[kind];
    const missing = prereq.filter((p) => c.status[p] !== 'approved');
    if (missing.length) die(`cannot approve ${kind}: ${missing.join(', ')} not approved yet (chain order)`);
    if (kind === 'review' && c.status.verify !== 'passed') die('cannot approve review: verification has not passed');
    Object.assign(gatePatch, applyGate(cfg, 'ready', ['spec', 'plan'].includes(kind) ? readinessProblems(root, cfg, id, kind) : [], `${kind} (definition of ready)`));
    if (kind === 'review') Object.assign(gatePatch, applyGate(cfg, 'independence', independenceProblems(cfg, c), 'review (reviewer independence)'));
  }
  // an override recorded on an earlier approval does not carry over to this one
  const prior = readDoc(file)?.meta || {};
  for (const g of Object.keys(DEFAULT_GATES)) if (prior[`${g}_override`] && !gatePatch[`${g}_override`]) gatePatch[`${g}_override`] = '';
  const patch = { status, ...gatePatch };
  if (status === 'approved') Object.assign(patch, { approved_by: f.by || gitUser(root), approved_at: nowIso() });
  if (status === 'rejected') Object.assign(patch, { rejected_by: f.by || gitUser(root), rejected_at: nowIso(), reason: f.reason || '' });
  writeMeta(file, patch);
  console.log(`${id}/${kind}.md → ${status}`);
  if (status === 'approved' && kind === 'plan') {
    const st = loadState(root);
    if (st.active === id) saveState(root, { ...st, planApprovedAt: patch.approved_at });
  }
}

function activate() {
  need();
  const cfg = loadConfig(root);
  const id = f._[0];
  if (!id || !fs.existsSync(changeDir(root, cfg, id))) die('usage: sdlc activate <id> (see `sdlc list`)');
  const st = loadState(root);
  saveState(root, { ...st, active: id, dirty: false, testLock: [], fixMode: readDoc(path.join(changeDir(root, cfg, id), 'intent.md'))?.meta.kind === 'fix' });
  console.log(`active: ${id}`);
}

function deactivate() {
  const st = loadState(root);
  saveState(root, { ...st, active: null, dirty: false, testLock: [], fixMode: false });
  console.log('no active change (plan gate off)');
}

function close() {
  need();
  const cfg = loadConfig(root);
  const id = activeOrArg(cfg);
  const outcome = f._[0] || 'shipped';
  if (!['shipped', 'abandoned', 'superseded'].includes(outcome)) die('usage: sdlc close [shipped|abandoned|superseded] [--pr URL]');
  writeMeta(path.join(changeDir(root, cfg, id), 'intent.md'), { outcome, closed_at: nowIso(), ...(f.pr ? { pr: f.pr } : {}) });
  if (loadState(root).active === id) deactivate();
  console.log(`${id} closed as ${outcome}`);
}

function status() {
  need();
  const cfg = loadConfig(root);
  const st = loadState(root);
  const dir = path.join(root, cfg.artifactsDir);
  const ids = fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
  const rows = ids.map((id) => {
    const c = chainStatus(root, cfg, id);
    const outcome = c.docs.intent?.meta.outcome;
    return { id, active: st.active === id, tier: c.tier, open: c.open, ...c.status, next: outcome ? `closed (${outcome})` : c.next };
  });
  if (f.json) { console.log(JSON.stringify({ active: st.active, dirty: st.dirty, testLock: st.testLock, changes: rows }, null, 2)); return; }
  if (!rows.length) { console.log('no changes yet — `sdlc new "<title>"`'); return; }
  for (const r of rows.filter((r) => f.all || !r.next.startsWith('closed'))) {
    console.log(`${r.active ? '*' : ' '} ${r.id}  [${r.tier}]  intent:${r.intent}${r.design !== 'missing' ? ` design:${r.design}` : ''}${r.ui !== 'missing' ? ` ui:${r.ui}` : ''} spec:${r.spec} plan:${r.plan} verify:${r.verify} review:${r.review}${r.open ? `  open:${r.open}` : ''}  → ${r.next}`);
  }
  if (st.active && st.dirty) console.log('  (active change has unverified edits)');
  if (st.testLock?.length) console.log(`  locked tests: ${st.testLock.join(', ')}`);
}

// --------------------------------------------------------------- verify ---
function tail(text, n = 40) {
  const lines = text.trimEnd().split(/\r?\n/);
  return (lines.length > n ? [`… (${lines.length - n} lines omitted)`, ...lines.slice(-n)] : lines).join('\n');
}

function verify() {
  need();
  const cfg = loadConfig(root);
  if (!cfg.verify?.length) die('no verify commands in .sdlc/config.json — add {"name","cmd"} entries (playbook: one command, non-zero on failure)');
  const st = loadState(root);
  const only = f._.length ? new Set(f._) : null;
  const results = [];
  for (const v of cfg.verify) {
    if (only && !only.has(v.name)) continue;
    const t0 = Date.now();
    const r = spawnSync(v.cmd, { cwd: root, shell: true, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: v.timeoutMs || cfg.verifyTimeoutMs || 15 * 60 * 1000 });
    const out = `${r.stdout || ''}${r.stderr || ''}${r.error ? `\n${r.error.message}` : ''}`;
    const ok = r.status === 0;
    // a check that was already red before ai-sdlc (sdlc baseline) is reported, not enforced
    const knownRed = !ok && v.baseline === 'red';
    results.push({ ...v, ok: ok || knownRed, knownRed, code: r.status, secs: ((Date.now() - t0) / 1000).toFixed(1), out });
    const label = ok ? 'PASS' : knownRed ? 'KNOWN-RED' : 'FAIL';
    console.log(`${label}  ${v.name}  (${v.cmd})  ${results.at(-1).secs}s`);
    if (ok && v.baseline === 'red') console.log(`      ${v.name} is green now — run \`sdlc baseline\` to start enforcing it`);
    if (!ok && !knownRed) { console.log(tail(out, 60)); if (!f.all) break; }
  }
  const known = results.filter((r) => r.knownRed);
  if (known.length) console.log(`(${known.length} check(s) were already failing before ai-sdlc and are not enforced: ${known.map((r) => r.name).join(', ')})`);
  const passed = results.every((r) => r.ok) && (!only || results.length === only.size);
  const full = passed && !only;

  if (st.active) {
    const file = path.join(changeDir(root, cfg, st.active), 'verify.md');
    const prev = readDoc(file)?.meta || {};
    const attempts = Number(prev.attempts || 0) + 1;
    const meta = {
      id: st.active, artifact: 'verify', status: full ? 'passed' : passed ? prev.status || 'partial' : 'failed',
      attempts, first_pass: prev.first_pass || (full ? String(attempts === 1) : ''), last_run: nowIso(), run_by: 'agent-session'
    };
    const body = ['# Verification evidence', '', `Change: ${st.active} · run ${attempts} · ${meta.last_run}`, '',
      ...results.flatMap((r) => [`## ${r.name} — ${r.knownRed ? `KNOWN-RED baseline (exit ${r.code}), not enforced` : r.ok ? 'PASS' : `FAIL (exit ${r.code})`} · ${r.secs}s`, '', '```', `$ ${r.cmd}`, tail(r.out, 25), '```', ''])];
    fs.writeFileSync(file, `---\n${Object.entries(meta).map(([k, v]) => `${k}: ${v}`).join('\n')}\n---\n${body.join('\n')}`);
    if (full) saveState(root, { ...st, dirty: false, lastVerify: meta.last_run });
    console.log(`evidence → ${toRel(root, file)}`);
  }
  console.log(full ? (known.length ? `VERIFY: green — ${known.length} known-red baseline check(s) not enforced` : 'VERIFY: all green') : passed ? 'VERIFY: selected checks green (run without args for the full gate)' : 'VERIFY: FAILED — fix the code, not the test');
  process.exit(passed ? 0 : 1);
}

// ------------------------------------------------------------- baseline ---
// Run every verify command once on the current tree. Checks that already fail are marked
// baseline:red so the verify gate (and the Stop hook) only enforce what was green before.
function baseline() {
  need();
  const cfgFile = path.join(root, '.sdlc', 'config.json');
  const cfg = JSON.parse(fs.readFileSync(cfgFile, 'utf8'));
  if (!cfg.verify?.length) die('no verify commands to baseline');
  const red = [];
  for (const v of cfg.verify) {
    const r = spawnSync(v.cmd, { cwd: root, shell: true, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: v.timeoutMs || cfg.verifyTimeoutMs || 15 * 60 * 1000 });
    if (r.status === 0) {
      delete v.baseline; delete v.baselineAt; delete v.baselineReason;
      console.log(`green  ${v.name}  (${v.cmd})`);
      continue;
    }
    const out = `${r.stdout || ''}${r.stderr || ''}${r.error ? r.error.message : ''}`;
    const missing = r.status === 127 || /not recognized|not found|missing script|ENOENT/i.test(out);
    Object.assign(v, { baseline: 'red', baselineAt: nowIso(), baselineReason: missing ? 'tool or script missing' : `exit ${r.status}` });
    red.push(v);
    console.log(`RED    ${v.name}  (${v.cmd})  — ${v.baselineReason}`);
    console.log(tail(out, 8).replace(/^/gm, '       '));
  }
  fs.writeFileSync(cfgFile, JSON.stringify(cfg, null, 2) + '\n');
  console.log(red.length
    ? `baseline: ${red.length} check(s) already failing — reported but not enforced until fixed (${red.map((v) => v.name).join(', ')})`
    : 'baseline: all green — every check is enforced');
}

// ---------------------------------------------------------- scaffold-app ---
function scaffoldAppCmd() {
  need();
  const cfgFile = path.join(root, '.sdlc', 'config.json');
  scaffoldApp({
    root, plugin: PLUGIN, args: f._, flags: f, die,
    loadConfigRaw: () => JSON.parse(fs.readFileSync(cfgFile, 'utf8')),
    saveConfigRaw: (c) => fs.writeFileSync(cfgFile, JSON.stringify(c, null, 2) + '\n')
  });
}

// --------------------------------------------------------------- inspect ---
function inspect() {
  const d = detectProject(root);
  if (f.json) { console.log(JSON.stringify(d, null, 2)); return; }
  if (!d.existing) { console.log('no app detected — new project (use sdlc stack --surfaces … --backend …)'); return; }
  for (const a of d.apps) {
    const fw = a.framework && a.framework !== a.kind ? ` (${a.framework})` : '';
    console.log(`${a.dir.padEnd(16)} ${a.kind}${fw}${a.cloudflare ? ' on Cloudflare' : ''}  → ${a.profile ? `profile ${a.profile}` : 'no profile'}`);
    for (const v of a.verify) console.log(`${' '.repeat(19)}${v.name}: ${v.cmd}`);
  }
  if (d.rootMake.length) console.log(`root Makefile drives verify: ${d.rootMake.map((v) => v.cmd).join(', ')}`);
}

// ------------------------------------------------------------ test lock ---
function lockTests() {
  need();
  const paths = f._.map((p) => toRel(root, p));
  if (!paths.length) die('usage: sdlc lock-tests <test-file>...');
  for (const p of paths) if (!fs.existsSync(path.join(root, p))) die(`${p} does not exist — write the failing test first`);
  const st = loadState(root);
  saveState(root, { ...st, testLock: [...new Set([...(st.testLock || []), ...paths])], fixMode: false });
  console.log(`locked: ${paths.join(', ')} — edits to these are now blocked until \`sdlc unlock-tests\``);
}
function unlockTests() {
  const st = loadState(root);
  saveState(root, { ...st, testLock: [] });
  console.log('tests unlocked');
}

// -------------------------------------------------------------- metrics ---
function gitDates(file) {
  try {
    return execFileSync('git', ['log', '--format=%aI', '--follow', '--', file], { cwd: root, encoding: 'utf8' })
      .trim().split('\n').filter(Boolean).map((d) => new Date(d)).reverse();
  } catch { return []; }
}
function metrics() {
  need();
  const cfg = loadConfig(root);
  const dir = path.join(root, cfg.artifactsDir);
  const ids = fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
  const hrs = (a, b) => (a && b ? (new Date(b) - new Date(a)) / 36e5 : null);
  const med = (xs) => { const s = xs.filter((x) => x != null).sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };
  const rows = ids.map((id) => {
    const c = chainStatus(root, cfg, id);
    const m = (k) => c.docs[k]?.meta || {};
    const planFirst = gitDates(toRel(root, path.join(c.dir, 'plan.md')))[0];
    const specCommits = gitDates(toRel(root, path.join(c.dir, 'spec.md')));
    const planCommits = gitDates(toRel(root, path.join(c.dir, 'plan.md')));
    return {
      id,
      survived: m('intent').status === 'approved',
      decided: ['approved', 'rejected'].includes(m('intent').status),
      intentToSpecH: hrs(m('intent').approved_at, m('spec').approved_at),
      specToPlanH: hrs(m('spec').approved_at || m('intent').approved_at, m('plan').approved_at),
      specReworkAfterPlan: planFirst ? specCommits.filter((d) => d > planFirst).length : null,
      // the first commit of plan.md usually carries the approval itself — only later commits are deviations
      planEditsAfterApproval: m('plan').approved_at ? planCommits.slice(1).filter((d) => d > new Date(m('plan').approved_at)).length : null,
      firstPassVerify: m('verify').first_pass === 'true' ? true : m('verify').first_pass === 'false' ? false : null,
      verifyAttempts: Number(m('verify').attempts || 0) || null,
      outcome: m('intent').outcome || null
    };
  });
  const decided = rows.filter((r) => r.decided);
  const fp = rows.filter((r) => r.firstPassVerify != null);
  const summary = {
    changes: rows.length,
    'Plan · intent survival rate': decided.length ? `${Math.round((100 * decided.filter((r) => r.survived).length) / decided.length)}%` : 'n/a',
    'Design · median hours intent→spec approval': med(rows.map((r) => r.intentToSpecH))?.toFixed(1) ?? 'n/a',
    'Design · spec edits after plan committed (rework, total)': rows.reduce((a, r) => a + (r.specReworkAfterPlan || 0), 0),
    'Build · median hours spec→plan approval': med(rows.map((r) => r.specToPlanH))?.toFixed(1) ?? 'n/a',
    'Build · plan edits after approval (deviation, total)': rows.reduce((a, r) => a + (r.planEditsAfterApproval || 0), 0),
    'Test · first-pass verify rate': fp.length ? `${Math.round((100 * fp.filter((r) => r.firstPassVerify).length) / fp.length)}%` : 'n/a',
    shipped: rows.filter((r) => r.outcome === 'shipped').length
  };
  if (f.json) console.log(JSON.stringify({ summary, rows }, null, 2));
  else for (const [k, v] of Object.entries(summary)) console.log(`${k.padEnd(56)} ${v}`);
}

// --------------------------------------------------------------- detect ---
// Deterministic anomaly detection (playbook Stage 6): rolling mean/σ + Western Electric rules.
// Claude is only invoked by the caller once a band is breached; the tier sets what it may do.
function westernElectric(series, window) {
  const base = series.slice(-window - 8, -8).length >= 5 ? series.slice(-window - 8, -8) : series.slice(0, -1);
  const mean = base.reduce((a, b) => a + b, 0) / base.length;
  const sd = Math.sqrt(base.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, base.length - 1)) || 1e-9;
  const z = series.slice(-8).map((v) => (v - mean) / sd);
  const last = z.at(-1);
  const side = (xs, k) => xs.every((x) => x > k) || xs.every((x) => x < -k);
  const countSide = (xs, k, need) => xs.filter((x) => x > k).length >= need || xs.filter((x) => x < -k).length >= need;
  const rules = [];
  if (Math.abs(last) > 3) rules.push('WE1: 1 point beyond 3σ');
  if (countSide(z.slice(-3), 2, 2)) rules.push('WE2: 2 of 3 beyond 2σ (same side)');
  if (countSide(z.slice(-5), 1, 4)) rules.push('WE3: 4 of 5 beyond 1σ (same side)');
  if (z.length >= 8 && side(z.slice(-8), 0)) rules.push('WE4: 8 in a row on one side of mean (drift)');
  let tier = 'none';
  if (rules.some((r) => r.startsWith('WE1'))) tier = '3sigma';
  else if (rules.some((r) => /WE2|WE3|WE4/.test(r)) || Math.abs(last) > 2) tier = '2sigma';
  else if (Math.abs(last) > 1) tier = '1sigma';
  return { mean: +mean.toFixed(4), sd: +sd.toFixed(4), last: series.at(-1), z: +last.toFixed(2), rules, tier };
}
function detect() {
  const bandsFile = path.resolve(root, f.bands || '.sdlc/bands.json');
  if (!fs.existsSync(bandsFile)) die(`no bands file at ${toRel(root, bandsFile)} — \`sdlc scaffold ci-monitor\``);
  const bands = [].concat(JSON.parse(fs.readFileSync(bandsFile, 'utf8')));
  const results = [];
  for (const b of bands) {
    let raw;
    if (f.series) raw = fs.readFileSync(path.resolve(root, f.series), 'utf8');
    else if (b.source?.file) raw = fs.readFileSync(path.resolve(root, b.source.file), 'utf8');
    else if (b.source?.cmd) raw = execFileSync(b.source.cmd, { cwd: root, shell: true, encoding: 'utf8' });
    else die(`band ${b.metric} has no source.file or source.cmd`);
    const series = JSON.parse(raw).map((p) => (typeof p === 'number' ? p : Number(p.v ?? p.value)));
    if (series.length < 10) { results.push({ metric: b.metric, tier: 'none', note: 'need ≥10 points for a baseline' }); continue; }
    const r = westernElectric(series, b.window || 30);
    results.push({ metric: b.metric, ...r, action: b.tiers?.[r.tier]?.action || (r.tier === 'none' ? 'none' : 'log'), tierConfig: b.tiers?.[r.tier] || null });
  }
  const order = ['none', '1sigma', '2sigma', '3sigma'];
  const worst = results.reduce((w, r) => (order.indexOf(r.tier) > order.indexOf(w.tier) ? r : w), { tier: 'none' });
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `tier=${worst.tier}\naction=${worst.action || 'none'}\nmetric=${worst.metric || ''}\n`);
  console.log(JSON.stringify({ worst: worst.tier, results }, null, 2));
}

// ------------------------------------------------------------------ adr ---
function adr() {
  need();
  const cfg = loadConfig(root);
  const title = f._.join(' ').trim();
  const dir = path.join(root, cfg.artifactsDir, 'adr');
  fs.mkdirSync(dir, { recursive: true });
  const existing = fs.readdirSync(dir).filter((n) => /^\d{4}-.*\.md$/.test(n)).sort();
  for (const status of ['accept', 'reject', 'deprecate']) {
    if (!f[status]) continue;
    const n = existing.find((x) => x.startsWith(String(f[status]).padStart(4, '0')));
    if (!n) die(`no ADR ${f[status]}`);
    const st = { accept: 'accepted', reject: 'rejected', deprecate: 'deprecated' }[status];
    writeMeta(path.join(dir, n), { status: st, deciders: f.by || gitUser(root), decided_at: nowIso(), ...(f.reason ? { reason: f.reason } : {}) });
    console.log(`${n} → ${st}`);
    return;
  }
  if (!title) {
    for (const n of existing) { const d = readDoc(path.join(dir, n)); console.log(`${n}  [${d?.meta.status || '?'}]`); }
    if (!existing.length) console.log('no ADRs yet — sdlc adr "<decision title>"');
    return;
  }
  const num = String((existing.length ? Number(existing.at(-1).slice(0, 4)) : 0) + 1).padStart(4, '0');
  const file = path.join(dir, `${num}-${slugify(title)}.md`);
  const change = f.id || loadState(root).active || '';
  const vars = { num, title, author: f.author || gitUser(root), created: nowIso(), change, supersedes: f.supersedes || '' };
  fs.writeFileSync(file, render(fs.readFileSync(path.join(TEMPLATES, 'artifacts', 'adr.md'), 'utf8'), vars));
  if (f.supersedes) {
    const old = existing.find((n) => n.startsWith(String(f.supersedes).padStart(4, '0')));
    if (old) writeMeta(path.join(dir, old), { status: 'superseded', superseded_by: num });
  }
  console.log(toRel(root, file));
}

// ---------------------------------------------------------------- stack ---
// Record the stack decision and merge its component presets into .sdlc/config.json.
function stack() {
  need();
  const profiles = JSON.parse(fs.readFileSync(path.join(PLUGIN, 'skills', 'stack', 'profiles.json'), 'utf8')).components;
  // A regex written with one backslash in JSON ("\b", "\s") is not a regex: JSON turns "\b" into a backspace character and the
  // pattern silently never matches (the Expo production gate was inert for this reason). Refuse to merge such a pattern into the config.
  for (const [name, c] of Object.entries(profiles)) {
    for (const p of c.prodPatterns || []) {
      if (/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(p)) die(`skills/stack/profiles.json: a prod pattern of "${name}" contains a control character, so it can never match (write \\\\b and \\\\s with two backslashes in JSON): ${JSON.stringify(p)}`);
      try { new RegExp(p, 'i'); } catch (e) { die(`skills/stack/profiles.json: a prod pattern of "${name}" is not a valid regex (${e.message}): ${p}`); }
    }
  }
  const stackFile = path.join(root, '.sdlc', 'stack.json');
  const sub = (str, dir) => str.replaceAll('cd {dir} && ', dir === '.' ? '' : `cd ${dir} && `).replaceAll('{dir}/', dir === '.' ? '' : `${dir}/`).replaceAll('{dir}', dir);
  const union = (a = [], b = []) => [...new Set([...a, ...b])];
  if (fs.existsSync(stackFile) && !f.force && (f.detect || f.surfaces || f.components)) {
    die('.sdlc/stack.json exists — the stack is decided. Changing it is a tier-L change with an ADR; re-run with --force when that is approved.');
  }

  // --adr alone: link the ADR to the stack that is already recorded. The ADR is written after the stack is chosen,
  // so this must not need --force (which would also reset verify and the formatter).
  if (f.adr && !f.detect && !f.surfaces && !f.components) {
    if (!fs.existsSync(stackFile)) die('no .sdlc/stack.json yet — record the stack first (sdlc stack --surfaces … --backend …), then link its ADR');
    if (!fs.existsSync(path.join(root, String(f.adr)))) die(`ADR not found: ${f.adr} (create it with: sdlc adr "<decision title>")`);
    const rec = JSON.parse(fs.readFileSync(stackFile, 'utf8'));
    rec.adr = String(f.adr);
    fs.writeFileSync(stackFile, JSON.stringify(rec, null, 2) + '\n');
    console.log(`linked ${f.adr} to .sdlc/stack.json`);
    return;
  }

  // --detect: an existing project keeps its stack. Record what's there; add only presets that fit.
  if (f.detect) {
    const d = detectProject(root);
    if (!d.existing) die('no existing app detected — for a new app use --surfaces … --backend …');
    const cfgFile = path.join(root, '.sdlc', 'config.json');
    const cfg = JSON.parse(fs.readFileSync(cfgFile, 'utf8'));
    const detected = detectedVerify(root);
    if (!cfg.verify?.length || f.force) cfg.verify = detected;
    else for (const v of detected) if (!cfg.verify.some((e) => e.name === v.name)) cfg.verify.push(v);
    const matched = d.apps.filter((a) => a.profile && profiles[a.profile]);
    const added = matched.flatMap((a) => profiles[a.profile].protectedPaths.map((p) => sub(p, a.dir))).filter((g) => globExists(root, g));
    cfg.protectedPaths = union(cfg.protectedPaths, added);
    cfg.prodPatternsExtra = union(cfg.prodPatternsExtra, matched.flatMap((a) => profiles[a.profile].prodPatterns));
    if (f.format) {
      const runner = (dir) => ({ npm: 'npx', pnpm: 'pnpm exec', yarn: 'yarn', bun: 'bunx' })[packageManager(root, path.join(root, dir))] || 'npx';
      cfg.formatOnEdit = matched.map((a) => {
        const fo = profiles[a.profile].formatOnEdit;
        if (!fo) return null;
        if (/eslint/.test(fo.cmd)) {
          const pkg = JSON.parse(fs.readFileSync(path.join(root, a.dir, 'package.json'), 'utf8'));
          if (!{ ...pkg.dependencies, ...pkg.devDependencies }.eslint && !pkg.devDependencies?.['@nuxt/eslint']) return null;
        }
        return { glob: sub(fo.glob, a.dir), cmd: sub(fo.cmd.replace('pnpm exec', runner(a.dir)), a.dir) };
      }).filter(Boolean);
    }
    fs.writeFileSync(cfgFile, JSON.stringify(cfg, null, 2) + '\n');
    const record = {
      mode: 'existing',
      apps: d.apps.map(({ verify: _v, ...a }) => ({ ...a, reference: a.profile ? `skills/stack/references/${profiles[a.profile].reference}` : null })),
      components: matched.map((a) => ({ name: a.profile, dir: a.dir })),
      ui: d.apps.find((a) => a.ui)?.ui === 'react' ? 'React' : d.apps.some((a) => a.ui) ? 'Vue/Nuxt' : null,
      decidedBy: f.by || gitUser(root), decidedAt: nowIso(), adr: f.adr || null
    };
    fs.writeFileSync(stackFile, JSON.stringify(record, null, 2) + '\n');
    console.log(JSON.stringify({
      apps: d.apps.map((a) => `${a.dir} → ${a.kind}${a.profile ? ` (profile ${a.profile})` : ' (no profile — conventions from CLAUDE.md)'}`),
      verify: cfg.verify.map((v) => v.cmd), protectedAdded: added, formatOnEdit: cfg.formatOnEdit || 'off'
    }, null, 2));
    return;
  }

    if ((f.surfaces || f.components) && !f.force && detectProject(root).existing) {
    die('this repo already contains an app — use `sdlc stack --detect` (keeps the existing stack). Use --force only to add new-app presets on purpose.');
  }
  // Stack choice:
  //   --choice claude (default) → Claude's own picks (React + Hono at the edge, React SPA, Expo, Tauri + React)
  //   --choice templates        → "From templates": the team's stack (Nuxt on the web, Vue desktop, Flutter)
  // Backend: fullstack (the edge app is the backend) | separated (new Go API) | existing (an API you don't own → BFF)
  const PICKS = {
    // Static sites are Nuxt (SSG) whichever choice was made, and a --ui override never changes them.
    templates: { 'edge-web': 'vue', 'spa-web': 'vue', 'bff-web': 'vue', tauri: 'vue', mobile: 'flutter', 'site-landing': 'vue', 'site-marketing': 'vue' },
    claude: { 'edge-web': 'react-hono', 'spa-web': 'react', 'bff-web': 'react', tauri: 'react', mobile: 'expo', 'site-landing': 'vue', 'site-marketing': 'vue' }
  };
  let surfaces = null;
  let backend = null;
  const choice = f.choice || 'claude';
  if (!PICKS[choice]) die('--choice must be claude or templates');
  const picks = { ...PICKS[choice] };
  if (f.ui) { // explicit UI override for every web/desktop component
    if (!['vue', 'react', 'react-hono'].includes(f.ui)) die('--ui must be vue, react or react-hono');
    for (const k of ['edge-web', 'spa-web', 'bff-web', 'tauri']) picks[k] = f.ui === 'react-hono' && k !== 'edge-web' ? 'react' : f.ui;
  }
  let compList;
  if (f.surfaces) {
    surfaces = String(f.surfaces).split(',').map((x) => x.trim()).filter(Boolean);
    for (const x of surfaces) if (!['web', 'mobile', 'desktop', 'site'].includes(x)) die(`unknown surface ${x} (web|mobile|desktop|site)`);
    // site = a static marketing/landing site (SSG, Nuxt on both stack choices). It has no backend of its own.
    const siteOnly = surfaces.length > 0 && surfaces.every((x) => x === 'site');
    if (surfaces.includes('site') && !['landing', 'marketing'].includes(f.site)) die('--site must be landing (a few static pages) or marketing (Nuxt Content blog + pages, media on R2) when the surfaces include site');
    if (f.site && !surfaces.includes('site')) die('--site only applies when --surfaces includes site');
    if (siteOnly) {
      if (f.backend && f.backend !== 'none') die('a site has no backend: omit --backend (or pass none). To add one, list an app surface too, e.g. --surfaces web,site.');
      backend = 'none';
    } else {
      backend = f.backend;
      if (!['fullstack', 'separated', 'existing-own', 'existing'].includes(backend)) die('--backend must be fullstack, separated, existing-own (an API the team owns and can change) or existing (an API the team does not control)');
    }
    compList = [];
    if (siteOnly) {
      // nothing else to build
    } else if (backend === 'separated') {
      // a new contract-first Go API owns auth + sessions for every client; the web SPA reaches it same-origin via a passthrough Worker
      if (surfaces.includes('web')) compList.push('spa-web');
      compList.push('go-api');
    } else if (backend === 'existing-own') {
      // the team's own existing API (another repo): it owns sessions; the SPA reaches it same-origin via the passthrough Worker
      if (surfaces.includes('web')) compList.push('spa-web');
    } else if (backend === 'existing') {
      // an API the team doesn't control: the BFF keeps its tokens/keys server-side and owns the browser session
      if (surfaces.includes('web')) compList.push('bff-web');
    } else if (surfaces.includes('web') || surfaces.includes('mobile')) {
      compList.push('edge-web'); // fullstack: the Cloudflare app is the backend; native clients call its /api
    } // desktop-only fullstack: Tauri's Rust side is the whole backend (local SQLite)
    if (surfaces.includes('mobile')) compList.push(picks.mobile);
    if (surfaces.includes('desktop')) compList.push('tauri');
    if (surfaces.includes('site')) compList.push(`site-${f.site}`);
  } else if (f.components) {
    compList = String(f.components).split(',').map((x) => x.trim()).filter(Boolean);
  }
  if (!compList) {
    if (fs.existsSync(stackFile)) { console.log(fs.readFileSync(stackFile, 'utf8')); return; }
    die(`usage: sdlc stack --surfaces web,mobile,desktop --backend fullstack|separated|existing-own|existing [--choice claude|templates] [--api-url URL]\n   or: sdlc stack --surfaces site --site landing|marketing   (a static site; --surfaces may also list the app surfaces, with their --backend)\n   or: sdlc stack --components <${Object.keys(profiles).join('|')}>[,…] [--ui vue|react|react-hono] [--dirs name=dir,…] [--force]`);
  }
  for (const n of compList) if (!profiles[n]) die(`unknown component ${n}`);
  // desktop next to a Nuxt web app → Nuxt desktop extending the shared layer (packages/ui-layer);
  // desktop-only stays Vite + Vue
  if (compList.includes('tauri') && picks.tauri === 'vue' && compList.some((n) => ['edge-web', 'spa-web', 'bff-web'].includes(n) && picks[n] === 'vue')) picks.tauri = 'nuxt';
  const dirOverrides = Object.fromEntries(String(f.dirs || '').split(',').filter(Boolean).map((kv) => kv.split('=')));
  const comps = compList.map((n) => ({ name: n, dir: dirOverrides[n] || (compList.length === 1 ? '.' : profiles[n].defaultDir), ...(picks[n] ? { ui: picks[n] } : {}) }));
  const presetKey = (c) => ({ 'react-hono': 'react', nuxt: 'vue' })[c.ui] || c.ui || 'vue';

  const cfgFile = path.join(root, '.sdlc', 'config.json');
  const cfg = JSON.parse(fs.readFileSync(cfgFile, 'utf8'));
  const verify = comps.flatMap((c) => (profiles[c.name].verify[presetKey(c)] || profiles[c.name].verify.any).map((v) => ({ ...v, cmd: sub(v.cmd, c.dir) })));
  if (!cfg.verify?.length || f.force) cfg.verify = verify;
  else for (const v of verify) if (!cfg.verify.some((e) => e.name === v.name)) cfg.verify.push(v);
  cfg.protectedPaths = union(cfg.protectedPaths, comps.flatMap((c) => profiles[c.name].protectedPaths.map((pp) => sub(pp, c.dir))));
  cfg.prodPatternsExtra = union(cfg.prodPatternsExtra, comps.flatMap((c) => profiles[c.name].prodPatterns));
  const fmt = comps.map((c) => profiles[c.name].formatOnEdit && { glob: sub(profiles[c.name].formatOnEdit.glob, c.dir), cmd: sub(profiles[c.name].formatOnEdit.cmd, c.dir) }).filter(Boolean);
  if (!cfg.formatOnEdit || f.force) cfg.formatOnEdit = fmt;
  fs.writeFileSync(cfgFile, JSON.stringify(cfg, null, 2) + '\n');

  const UI_LABEL = { vue: 'Vue/Nuxt + Nuxt UI + Tailwind', react: 'React + shadcn/ui + Tailwind', 'react-hono': 'React + shadcn/ui + Tailwind, Hono API' };
  const record = {
    mode: 'new', choice, surfaces: surfaces || undefined, backend: backend || undefined, apiUrl: f['api-url'] || undefined,
    // `render: prerender` marks a static site: SSR is on at build time only (nuxt generate), never at runtime.
    components: comps.map((c) => ({ ...c, title: profiles[c.name].title, reference: `skills/stack/references/${profiles[c.name].reference}`, ...(profiles[c.name].render ? { render: profiles[c.name].render } : {}) })),
    ui: UI_LABEL[comps.find((c) => c.ui)?.ui] || null,
    ssr: comps.every((c) => profiles[c.name].render === 'prerender') ? 'prerender' : false, decidedBy: f.by || gitUser(root), decidedAt: nowIso(), adr: f.adr || null
  };
  fs.writeFileSync(stackFile, JSON.stringify(record, null, 2) + '\n');
  console.log(`wrote .sdlc/stack.json (${choice}): ${comps.map((c) => `${c.name}${c.ui ? `[${c.ui}]` : ''}@${c.dir}`).join(', ')}\nverify: ${cfg.verify.map((v) => v.name).join(', ')}\nformatter on edit: ${cfg.formatOnEdit?.length ? cfg.formatOnEdit.map((x) => x.cmd).join(' ; ') + '  (turn off: set formatOnEdit to null in .sdlc/config.json)' : 'off'}`);
}

// ---------------------------------------------------------------- route ---
// Which subagent (model/effort) handles each role for the active change. --complexity overrides
// for a single step (e.g. the auth step of an M change is complex).
// Routing is also the provenance record: routing an implementer notes its model for the change, and
// routing the reviewer stamps who implemented and who reviews into review.md. For tiers in
// crossModelReview.tiers (default L) the reviewer is routed to a model the implementer did not use.
function independenceProblems(cfg, c) {
  if (!crossModelCfg(cfg).tiers.includes(c.tier)) return [];
  const v = c.docs.review?.meta.independence;
  if (v === 'cross-model') return [];
  return [`reviewer independence is ${v ? `"${v}"` : 'not recorded'}; tier ${c.tier} needs a reviewer on a different model than the implementer — dispatch the reviewer as \`sdlc route reviewer\` says (add --implementer-model <m> if the main session implemented)`];
}

function route() {
  const cfg = loadConfig(root);
  const id = f.id || loadState(root).active;
  const chain = id && isInitialized(root) && fs.existsSync(changeDir(root, cfg, id)) ? chainStatus(root, cfg, id) : null;
  let complexity = f.complexity;
  let tier = null;
  if (!complexity) {
    tier = chain ? chain.tier : 'M';
    complexity = TIER_TO_COMPLEXITY[tier] || 'normal';
  }
  if (!['simple', 'normal', 'complex'].includes(complexity)) die('--complexity must be simple|normal|complex');
  const roles = f._.length ? f._ : Object.keys(ROLES);
  const out = Object.fromEntries(roles.map((r) => [r, routeAgent(r, complexity)]));
  const extra = {};

  if (chain && roles.includes('implementer')) {
    const st = loadState(root);
    const seen = st.implementers?.[id] || [];
    const me = out.implementer;
    if (!seen.some((x) => x.agent === me.agent && x.model === me.model)) {
      saveState(root, { ...st, implementers: { ...st.implementers, [id]: [...seen, { agent: me.agent, model: me.model }] } });
    }
  }

  if (chain && roles.includes('reviewer') && !f.complexity) {
    const impl = [...(loadState(root).implementers?.[id] || [])];
    if (f['implementer-model']) impl.push({ agent: 'main-session', model: String(f['implementer-model']) });
    const cm = crossModelCfg(cfg);
    const needs = cm.tiers.includes(chain.tier) && gateLevel(cfg, 'independence') !== 'off';
    const used = new Set(impl.map((x) => x.model));
    if (needs && used.size) {
      const want = cm.ladder.find((m) => !used.has(m));
      const variant = ROLES.reviewer.find((t) => TIERS[t].model === want);
      if (variant) out.reviewer = routeAgent('reviewer', variant);
    }
    const independence = !impl.length ? 'unverified' : impl.some((x) => x.model === out.reviewer.model) ? 'same-model' : 'cross-model';
    extra.independence = independence;
    if (needs && independence !== 'cross-model') {
      extra.warning = used.size
        ? `no model in crossModelReview.ladder differs from the implementer's (${[...used].join(', ')})`
        : 'no implementer was routed for this change, so independence cannot be verified; pass --implementer-model <m> if the main session implemented';
    }
    const reviewFile = path.join(chain.dir, 'review.md');
    if (fs.existsSync(reviewFile)) {
      const label = (x) => `${x.agent} (${x.model})`;
      writeMeta(reviewFile, { implemented_by: impl.map(label).join(', ') || 'unknown', reviewed_by: label(out.reviewer), independence });
    } else extra.note = 'review.md does not exist yet — run `sdlc draft review` first, then route again, so the provenance is recorded';
  }
  console.log(JSON.stringify({ tier, complexity, sdlc: `node "${fileURLToPath(import.meta.url)}"`, agents: out, ...extra }, null, 2));
}

// ---------------------------------------------------------------- gates ---
// Rollout: start a gate as advisory, move it to soft, then hard once the team trusts it.
function gates() {
  need();
  const cfgFile = path.join(root, '.sdlc', 'config.json');
  const raw = JSON.parse(fs.readFileSync(cfgFile, 'utf8'));
  const [verb, name, level] = f._;
  if (verb === 'set') {
    if (!DEFAULT_GATES[name]) die(`unknown gate ${name} (one of: ${Object.keys(DEFAULT_GATES).join(', ')})`);
    if (!GATE_LEVELS.includes(level)) die(`level must be one of: ${GATE_LEVELS.join(', ')}`);
    fs.writeFileSync(cfgFile, JSON.stringify({ ...raw, gates: { ...raw.gates, [name]: level } }, null, 2) + '\n');
  } else if (verb) die('usage: sdlc gates [set <ready|independence> <off|advisory|soft|hard>]');
  const cfg = loadConfig(root);
  for (const g of Object.keys(DEFAULT_GATES)) console.log(`${g.padEnd(13)} ${gateLevel(cfg, g)}`);
  const cm = crossModelCfg(cfg);
  console.log(`cross-model review tiers: ${cm.tiers.join(', ') || 'none'} (ladder ${cm.ladder.join(' > ')})`);
  console.log('levels: off · advisory (warn) · soft (blocks; --override "<reason>" is recorded) · hard (blocks)');
}

// ---------------------------------------------------------------- ready ---
function ready() {
  need();
  const cfg = loadConfig(root);
  const id = activeOrArg(cfg);
  const problems = readinessProblems(root, cfg, id, 'spec');
  if (f.json) { console.log(JSON.stringify({ id, ready: !problems.length, open: problems })); return; }
  console.log(problems.length
    ? `${id}: NOT ready — ${problems.length} open:\n${problems.map((p) => `  - ${p}`).join('\n')}`
    : `${id}: ready — no open questions or concerns`);
}

// ----------------------------------------------------------------- help ---
const HELP = `ai-sdlc — AI-native SDLC artifact chain

  inspect [--json]                   detect existing apps, their stack profile and verify commands
  baseline                           run verify once; mark already-failing checks known-red (not enforced)
  init [--force]                     create .sdlc/config.json (auto-detects verify cmds) + ${DEFAULT_CONFIG.artifactsDir}/
  scaffold-app [component...] [--name n] [--title "Display Name"] [--ui vue|react] [--dir d] [--no-install] [--no-verify]
                                     copy a full app template for the recorded stack, install, verify green
  scaffold <what...> [--force]       ${Object.keys(SCAFFOLD).join(' | ')}
  new "<title>" [--tier S|M|L] [--source human|monitor|scan|incident|review] [--fix] [--no-activate]
  draft design|ui|spec|plan|review  create the next artifact from its template (active change)
  approve intent|design|ui|spec|plan|review [--by name]
  reject  intent|spec|plan|review [--reason text]
  reopen  intent|spec|plan|review    back to draft
  status [--json] [--all]            the chain for every open change
  activate <id> | deactivate         choose the change the plan gate guards
  verify [name...] [--all]           run configured build/test/lint; write verify.md evidence
  lock-tests <file...> | unlock-tests   fix flow: protect the failing test
  close [shipped|abandoned|superseded] [--pr URL]
  metrics [--json]                   playbook leading/lagging indicators from the chain + git
  detect [--bands file] [--series file]  rolling-baseline + Western Electric band check
  adr ["<title>"] [--supersedes NNNN] | adr --accept|--reject|--deprecate NNNN [--by name]
  stack --surfaces web,mobile,desktop --backend fullstack|separated|existing-own|existing [--choice claude|templates] [--ui vue|react|react-hono] [--api-url URL]   (new app)
  stack --surfaces site --site landing|marketing                                       (new static site, Nuxt SSG on Cloudflare)
  stack --adr <file>                 link the stack ADR to the recorded stack (no --force needed)
  stack --detect [--format]          existing app: keep its stack, add only presets that fit
  stack --components a,b [--ui vue|react|react-hono] [--dirs name=dir]  record stack + merge presets into config
  route [role...] [--complexity simple|normal|complex] [--implementer-model m]
                                     subagent + model/effort for the active tier; records who implements and reviews
  ready                              open questions (intent.md) and Concerns (spec.md) that block approval
  gates [set <ready|independence> <off|advisory|soft|hard>]   gate rollout levels
  approve ... --override "<reason>"  accept a soft gate's finding; the reason is recorded in the artifact
Common flag: --id <change-id> to target a non-active change.`;

const COMMANDS = {
  init, inspect, baseline, 'scaffold-app': scaffoldAppCmd, scaffold, adr, stack, route, gates, ready, new: create, draft, status, list: status, activate, deactivate, close, verify, metrics, detect,
  approve: () => setStatus('approved'), reject: () => setStatus('rejected'), reopen: () => setStatus('draft'),
  'lock-tests': lockTests, 'unlock-tests': unlockTests, help: () => console.log(HELP)
};
(COMMANDS[cmd] || COMMANDS.help)();
