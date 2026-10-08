#!/usr/bin/env node
// PreToolUse guard — the deterministic layer under the skills (playbook: "Hooks as build-time
// guardrails" + "Hooks as approval gates"). Fast and file-scoped; heavy checks belong in CI.
//   1. secrets      — never read/write .env, keys, credentials; never write secret-looking strings
//   2. protected    — generated/frozen paths from .sdlc/config.json
//   3. test lock    — during a fix, the failing test must not be edited
//   4. plan gate    — nothing is implemented without an accepted plan.md
//   5. prod gate    — the agent does everything up to the production gate and nothing past it
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  findRoot, isInitialized, loadConfig, loadState, toRel, isInside, matchesAny, planApproved, readStdinJson, foldPath, ntfsPath
} from './lib.mjs';

const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
const SECRET_CONTENT = [
  [/AKIA[0-9A-Z]{16}/, 'AWS access key'],
  [/-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/, 'private key'],
  [/\bghp_[A-Za-z0-9]{36}\b|\bgithub_pat_[A-Za-z0-9_]{40,}/, 'GitHub token'],
  [/\bsk-ant-[A-Za-z0-9_-]{20,}/, 'Anthropic API key'],
  [/\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}/, 'API secret key'],
  [/\bxox[abprs]-[A-Za-z0-9-]{10,}/, 'Slack token'],
  [/\bAIza[0-9A-Za-z_-]{35}\b/, 'Google API key']
];

function decide(decision, reason) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: decision, permissionDecisionReason: `[ai-sdlc] ${reason}` }
  }));
  process.exit(0);
}

const isSecretPath = (cfg, rel) => matchesAny(rel, cfg.secretPaths) && !matchesAny(rel, cfg.secretAllow);

// Split on whitespace and shell punctuation; a quoted string is also kept whole, so a path with a space
// ("C:\Users\Jane Doe\.aws\credentials") is checked as one path and not only as its pieces.
function tokens(cmd) {
  const quoted = [...cmd.matchAll(/"([^"\n]+)"|'([^'\n]+)'/g)].map((m) => m[1] ?? m[2]).filter((q) => /\s/.test(q));
  return [...cmd.split(/[\s'"`;|&<>()=]+/).filter(Boolean), ...quoted];
}

// Prose is not a file access: drop heredoc bodies (keep the header line, which holds redirects
// like `> .env`) and commit/tag messages before scanning a shell command for secret paths.
function stripProse(cmd) {
  return cmd
    .replace(/<<-?\s*(['"]?)([A-Za-z_][\w-]*)\1([^\n]*)\n[\s\S]*?\n[ \t]*\2[ \t]*(?=\n|$)/g, '<<$2$3')
    .replace(/@(['"])[\s\S]*?\n\1@/g, '')                                   // PowerShell here-strings
    .replace(/(\s(?:-m|--message)\s*)("(?:[^"\\]|\\.)*"|'[^']*')/g, '$1MSG');
}

// A command-line token is a secret access when it names a distinctive secret file (.env, *.pem,
// id_rsa…) or matches a directory-style secret glob (secrets/**, .ssh/**) AND that path exists.
// "D1/secrets/deploy" in prose matches secrets/** but exists nowhere, so it is allowed.
function secretToken(cfg, raw, dirs) {
  const t = raw.replace(/^@/, ''); // curl -F file=@.env
  const home = process.env.USERPROFILE || process.env.HOME || '';
  const expanded = /^~[\\/]/.test(t) ? path.join(home, t.slice(2))
    : t.replace(/^(?:\$\{?(?:HOME|USERPROFILE)\}?|%USERPROFILE%|\$env:USERPROFILE)(?=[\\/])/i, home);
  const rel = toRel(root, expanded) ?? t;
  // outside the repo (home dir, absolute paths): the repo-relative globs apply to every trailing sub-path
  const segs = expanded.normalize('NFC').split(/[\\/]+/).filter(Boolean);
  const tails = isInside(rel) ? [] : segs.map((_, i) => segs.slice(i).join('/'));
  const candidates = [rel, t.replace(/^~[\\/]/, ''), ...tails];
  if (candidates.some((c) => matchesAny(c, cfg.secretAllow))) return false;
  const byName = cfg.secretPaths.filter((g) => !g.includes('/'));
  const byDir = cfg.secretPaths.filter((g) => g.includes('/'));
  if (candidates.some((c) => matchesAny(c, byName))) return true;
  if (!/[\\/.]/.test(t)) return false;
  if (!candidates.some((c) => matchesAny(c, byDir))) return false;
  return dirs.some((d) => fs.existsSync(path.resolve(d, expanded)) || fs.existsSync(path.resolve(d, expanded.split('\\').join('/'))));
}

// A guard that crashes exits 1, which Claude Code treats as non-blocking: that would silently switch every
// check off. Unreadable input or an unexpected error pauses for a human instead.
process.on('uncaughtException', (e) => decide('ask', `The guard failed (${e.message}); review this action manually.`));
const input = await readStdinJson({ strict: true });
if (input.invalidInput) decide('ask', 'The guard could not parse its input; review this action manually.');
const tool = input.tool_name;
const ti = input.tool_input || {};
const root = findRoot(input.cwd);
const cfg = loadConfig(root);
const state = loadState(root);

if (tool === 'Bash' || tool === 'PowerShell') {
  const cmd = String(ti.command || '');

  // 1. secrets referenced on the command line
  const dirs = [...new Set([input.cwd, root].filter(Boolean))];
  for (const t of tokens(stripProse(cmd))) {
    if (secretToken(cfg, t, dirs)) decide('deny', `"${t}" matches a secret path. Secrets stay out of the session; use an env-injected value or ask the user.`);
  }

  // 3. test lock — destructive commands against locked tests
  const locked = state.testLock || [];
  const WRITERS = /\b(rm|ri|rd|del|erase|mv|move|mi|ren|rni|cp|copy|tee|ac|truncate|(?:sed|perl)\s+-\S*i|git\s+(?:checkout|restore|rm)|Remove-Item|Move-Item|Rename-Item|Copy-Item|Set-Content|Add-Content|Clear-Content|Out-File)\b|>/i;
  if (locked.length && WRITERS.test(cmd)) {
    // the full path, or just the file name (`cd tests && rm a.test.ts`), compared the way the filesystem does
    const hay = foldPath(cmd).split('\\').join('/');
    const hit = locked.find((p) => hay.includes(foldPath(p)) || hay.includes(foldPath(path.posix.basename(p))));
    if (hit) decide('deny', `${hit} is locked while the fix is in progress. Fix the code, not the test. Unlock only after verify passes.`);
  }

  // 5. production gate
  const bare = cmd.replace(/\b([\w-]+)\.(?:cmd|exe|ps1|bat)\b(?=\s|$)/gi, '$1'); // npm.cmd publish → npm publish
  const prod = [...(cfg.prodPatterns || []), ...(cfg.prodPatternsExtra || [])].find((p) => new RegExp(p, 'i').test(bare));
  if (prod) {
    if (process.env.RELEASE_APPROVAL) process.exit(0);
    const why = `Production gate: "${cmd.slice(0, 120)}" crosses the release boundary. A named human must authorize it ` +
      `(set RELEASE_APPROVAL=<ticket or approver> in the launching shell, or approve this prompt). ` +
      `Route: open a PR and let branch protection + the release manager decide.`;
    decide(cfg.prodGate === 'deny' ? 'deny' : 'ask', why);
  }
  process.exit(0);
}

// Grep prints file contents. A glob is judged by what it matches: names a secret file (`.env*`, `*.{env,pem}`)
// without being a catch-all that also matches ordinary source (`*`, `**/*`).
const SECRET_PROBES = ['.env', '.env.local', '.env.production', 'x.pem', 'x.key', 'x.p12', 'id_rsa', 'id_ed25519', '.aws/credentials', '.ssh/id_rsa', 'secrets/x'];
const ORDINARY_PROBES = ['app.ts', 'README.md', 'src/index.js', 'main.go'];
function globNamesSecret(glob) {
  if (!glob || glob.startsWith('!')) return false;
  const hits = (names) => names.some((n) => matchesAny(n, [glob]) || matchesAny(`dir/${n}`, [glob]));
  return hits(SECRET_PROBES.filter((n) => !matchesAny(n, cfg.secretAllow))) && !hits(ORDINARY_PROBES);
}
// A Grep `path` that is a directory holding secrets (~/.ssh, ./secrets): test a file inside it with the same rules
// as a file path, including the outside-the-repo tails that make `**/.ssh/**` match under the home directory.
function secretDirectory(p) {
  return ['__grep__', 'credentials'].some((name) => { // credentials: **/.aws/credentials
    const probe = path.join(p, name);
    const segs = path.resolve(root, probe).normalize('NFC').split(/[\\/]+/).filter(Boolean);
    const r = toRel(root, probe);
    return [r, ...(isInside(r) ? [] : segs.map((_, i) => segs.slice(i).join('/')))]
      .some((c) => matchesAny(c, cfg.secretPaths) && !matchesAny(c, cfg.secretAllow));
  });
}
// Secret files a directory-wide Grep would print: what git lists under the search root (tracked, or untracked and
// not ignored), which is what ripgrep walks. A .env that is gitignored is skipped by ripgrep too, so it is not listed.
function exposedSecrets(dir) {
  const rel = toRel(root, path.resolve(root, dir));
  if (rel !== '' && !isInside(rel)) return [];
  try {
    if (!fs.statSync(path.resolve(root, dir)).isDirectory()) return [];
    const out = execFileSync('git', ['ls-files', '-co', '--exclude-standard', '-z', '--', rel || '.'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    const glob = ti.glob && !ti.glob.startsWith('!') ? [ti.glob] : null;
    return out.split('\0').filter((f) => f && isSecretPath(cfg, f) && (!glob || matchesAny(f, glob)));
  } catch { return []; }
}
if (tool === 'Grep' && globNamesSecret(ti.glob)) {
  decide('deny', `Grep glob "${ti.glob}" targets secret files (secretPaths in .sdlc/config.json). Do not read them; reference the variable name instead.`);
}
if (tool === 'Grep' && ti.output_mode === 'content') {
  const found = exposedSecrets(ti.path || input.cwd || root);
  if (found.length) {
    decide('deny', `This search would print the contents of ${found[0]}${found.length > 1 ? ` and ${found.length - 1} more secret file(s)` : ''}. ` +
      'Narrow the path or glob to source files, use output_mode files_with_matches, or add the secret file to .gitignore.');
  }
}
const rawPath = ti.file_path || ti.notebook_path || ti.path;
if (!rawPath) process.exit(0);
const filePath = process.platform === 'win32' ? ntfsPath(rawPath) : rawPath;
if (tool === 'Grep' && secretDirectory(filePath)) {
  decide('deny', `${filePath} holds secret files (secretPaths in .sdlc/config.json). Do not search it; reference the variable name instead.`);
}
const rel = toRel(root, filePath);
const inside = isInside(rel);

// 1. secrets — paths
if (['Read', 'Grep', ...EDIT_TOOLS].includes(tool) && isSecretPath(cfg, inside ? rel : path.basename(filePath))) {
  decide('deny', `${rel} is a secret file (secretPaths in .sdlc/config.json). Do not read or write it; reference the variable name instead.`);
}
if (!EDIT_TOOLS.has(tool)) process.exit(0);

// 1. secrets — content
const content = [ti.content, ti.new_string, ti.new_source, ...(ti.edits || []).map((e) => e.new_string)].filter(Boolean).join('\n');
for (const [re, label] of SECRET_CONTENT) {
  if (re.test(content)) decide('deny', `The new content contains what looks like a ${label}. Keep credentials out of the diff; read them from the environment.`);
}
if (!inside) process.exit(0);

// 2. protected paths
if (matchesAny(rel, cfg.protectedPaths)) {
  decide('deny', `${rel} is protected (generated or frozen — see protectedPaths in .sdlc/config.json). Change the source or the owning package instead.`);
}

// 3. test lock
if ((state.testLock || []).some((p) => foldPath(p) === foldPath(rel))) {
  decide('deny', `${rel} is the locked failing test for the current fix. Fix the code, not the test (playbook Stage 4).`);
}

// 4. plan gate — only when a change is active in an initialized repo
if (isInitialized(root) && cfg.enforcePlan && state.active) {
  const exempt = rel.startsWith(cfg.artifactsDir.replace(/\/$/, '') + '/') || rel.startsWith('.sdlc/') ||
    matchesAny(rel, cfg.alwaysEditable) ||
    // fix flow: the reproducing test is written before the plan is executed
    (state.fixMode && matchesAny(rel, cfg.testGlobs));
  if (!exempt && !planApproved(root, cfg, state.active)) {
    decide('deny', `No approved plan for active change "${state.active}". Nothing is implemented without an accepted plan: ` +
      `run /ai-sdlc:plan, get the user's approval, then \`sdlc approve plan\`. (Or \`sdlc deactivate\` for out-of-band edits.)`);
  }
}
process.exit(0);
