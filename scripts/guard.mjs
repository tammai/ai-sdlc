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
  findRoot, isInitialized, loadConfig, loadState, toRel, isInside, matchesAny, globToRegExp, planApproved, readStdinJson, foldPath, ntfsPath
} from './lib.mjs';

// A hook that outlives its timeout is killed and Claude Code treats that as "no objection", so anything that could
// make a scan slow (a huge command, a pathological glob) pauses for a human before it is scanned.
const MAX_COMMAND = 20000;
const MAX_GLOB = 512;

const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
const SEARCH_TOOLS = new Set(['Grep', 'Glob']);
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
// Text the shell still runs is not prose: an unquoted heredoc, a "…" here-string or a "…" message expands $(…) and
// backticks, and a `<<X` inside a quoted string is not a heredoc at all. Those are kept for scanning.
const EXPANDS = /\$\(|`/;
function stripProse(cmd) {
  return cmd
    .replace(/<<-?\s*(['"]?)([A-Za-z_][\w-]*)\1([^\n]*)\n([\s\S]*?)\n[ \t]*\2[ \t]*(?=\n|$)/g, (m, q, delim, rest, body, offset, all) => {
      const before = all.slice(all.lastIndexOf('\n', offset - 1) + 1, offset);
      const insideQuote = (before.match(/"/g) || []).length % 2 === 1 || (before.match(/'/g) || []).length % 2 === 1;
      return insideQuote || (!q && EXPANDS.test(body)) ? m : `<<${delim}${rest}`;
    })
    .replace(/@(['"])([\s\S]*?)\n\1@/g, (m, q, body) => (q === '"' && EXPANDS.test(body) ? m : '')) // PowerShell here-strings
    .replace(/(\s(?:-m|--message)\s*)("(?:[^"\\]|\\.)*"|'[^']*')/g, (m, flag, msg) => (msg[0] === '"' && EXPANDS.test(msg) ? m : `${flag}MSG`));
}

// The same command as the shell or PowerShell may read it once quotes, concatenation, escapes and ${x:-default} are
// resolved: `.en""v`, `".en"+"v"`, `.e\nv` and `${x:-.env}` all name .env. Each variant is scanned.
function scanVariants(cmd) {
  const base = stripProse(cmd);
  const joined = base.replace(/["']\s*\+\s*["']/g, '').replace(/""|''/g, '');
  const defaults = [...base.matchAll(/\$\{[^}]*?:?[-=+?]([^}]*)\}/g)].map((m) => m[1]);
  return [base, joined, joined.replace(/\\(?=[A-Za-z0-9._-])/g, ''), defaults.join(' ')];
}

// $HOME, %USERPROFILE%, $env:USERPROFILE (also quoted, as in "$HOME"/.aws/credentials) → the home directory
function expandHome(s) {
  const home = process.env.USERPROFILE || process.env.HOME || '';
  return s.replace(/["']?(?:\$\{?(?:HOME|USERPROFILE)\}?|%USERPROFILE%|\$env:USERPROFILE|\$env:HOMEDRIVE\$env:HOMEPATH)["']?(?=[\\/])/gi, () => home);
}

const GLOB_CHARS = /[*?[\]{}]/;

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
  // `git show HEAD:.env`, `git show :.env` name the file after the colon
  const afterRev = /^(?![A-Za-z]:[\\/])[^:\\/]*:/.test(t) ? t.replace(/^[^:\\/]*:/, '') : null;
  const candidates = [rel, t.replace(/^~[\\/]/, ''), ...tails, ...(afterRev ? [afterRev] : [])];
  if (candidates.some((c) => matchesAny(c, cfg.secretAllow))) return false;
  const byName = cfg.secretPaths.filter((g) => !g.includes('/'));
  const byDir = cfg.secretPaths.filter((g) => g.includes('/'));
  if (candidates.some((c) => matchesAny(c, byName))) return true;
  // a wildcard token (`secrets/*`, `.e*`, `.[e]nv`, `.env{,}`) is judged by what it matches in its directory
  if (GLOB_CHARS.test(t)) {
    const slash = Math.max(expanded.lastIndexOf('/'), expanded.lastIndexOf('\\'));
    const parent = expanded.slice(0, slash + 1);
    if (!GLOB_CHARS.test(parent)) {
      const re = globToRegExp(expanded.slice(slash + 1));
      for (const d of dirs) {
        let names = [];
        try { names = fs.readdirSync(path.resolve(d, parent || '.')).slice(0, 2000); } catch { /* not a directory */ }
        for (const n of names) if (re.test(n) && !GLOB_CHARS.test(n) && secretToken(cfg, parent + n, dirs)) return true;
      }
    }
  }
  // a directory of secrets (`cd ~/.aws`, `cd secrets`): what is inside is one `cat` away
  for (const d of dirs) {
    try {
      const p = path.resolve(d, expanded);
      if (fs.statSync(p).isDirectory() && secretDirectory(p)) return true;
    } catch { /* does not exist */ }
  }
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
  if (cmd.length > MAX_COMMAND) decide('ask', `The command is ${cmd.length} characters, too long for the guard to scan in time; review it manually.`);

  // 1. secrets referenced on the command line
  const dirs = [...new Set([input.cwd, root].filter(Boolean))];
  for (const variant of scanVariants(cmd)) {
    for (const t of tokens(expandHome(variant))) {
      if (secretToken(cfg, t, dirs)) decide('deny', `"${t}" matches a secret path. Secrets stay out of the session; use an env-injected value or ask the user.`);
    }
  }

  // a recursive grep reads ignored files too, so a .env anywhere under the directory it searches is read
  if (/\b(?:grep|egrep|fgrep|ack)\b[^\n]*\s(?:-[a-zA-Z]*[rR]|--recursive)\b/.test(cmd) || /Select-String[^\n]*-Recurse|-Recurse[^\n]*Select-String/i.test(cmd)) {
    // operands after the command word, minus flags; the first is the pattern, the rest are paths (none: the cwd)
    const operands = tokens(cmd).filter((t) => !t.startsWith('-')).slice(1);
    const paths = operands.slice(1);
    const targets = paths.length ? paths.filter((p) => { try { return fs.statSync(path.resolve(input.cwd || root, expandHome(p))).isDirectory(); } catch { return false; } }) : [input.cwd || root];
    for (const t of targets) {
      const found = secretsUnder(path.resolve(input.cwd || root, expandHome(t)), true);
      if (found.length) decide('deny', `A recursive search of ${t} would print the contents of ${found[0]}. Search a source directory instead.`);
    }
  }

  // the guard's own config and state: an agent that can rewrite secretPaths has switched the guard off
  const WRITES_ANY = /(?:>|\b(?:tee|sed|perl|mv|cp|rm|del|erase|ren|move|copy|truncate|Set-Content|Add-Content|Out-File|Clear-Content|Remove-Item|Move-Item|Copy-Item|Rename-Item|node|python3?|ruby|jq|git\s+(?:checkout|restore|apply)|write\w*)\b)/i;
  if (/\.sdlc[\\/](?:config\.json|local)\b/i.test(cmd) && WRITES_ANY.test(cmd)) {
    decide('ask', 'This command changes the guard\'s own settings or state (.sdlc/config.json, .sdlc/local/). A person should confirm it.');
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

// A Grep `path` that is a directory holding secrets (~/.ssh, ./secrets): test a file inside it with the same rules
// as a file path, including the outside-the-repo tails that make `**/.ssh/**` match under the home directory.
// (Function declarations only below this point: the Bash branch above calls them before the consts further down.)
function secretDirectory(p) {
  return ['__grep__', 'credentials'].some((name) => { // credentials: **/.aws/credentials
    const probe = path.join(p, name);
    const segs = path.resolve(root, probe).normalize('NFC').split(/[\\/]+/).filter(Boolean);
    const r = toRel(root, probe);
    return [r, ...(isInside(r) ? [] : segs.map((_, i) => segs.slice(i).join('/')))]
      .some((c) => matchesAny(c, cfg.secretPaths) && !matchesAny(c, cfg.secretAllow));
  });
}

// A file the secret globs name. Inside the repo the repo-relative path is tested; outside it (the home directory,
// another drive) every trailing sub-path is, so `**/.aws/credentials` and `**/.ssh/**` match under any parent.
function secretFile(p) {
  const rel = toRel(root, p);
  if (isInside(rel)) return isSecretPath(cfg, rel);
  const segs = path.resolve(p).normalize('NFC').split(/[\\/]+/).filter(Boolean);
  return segs.some((_, i) => isSecretPath(cfg, segs.slice(i).join('/')));
}

// Files under a directory, bounded in count and depth so a scan cannot outlast the hook's timeout.
function walkFiles(dir, { maxFiles = 20000, maxDepth = 6 } = {}) {
  const out = [];
  const stack = [[dir, 0]];
  while (stack.length && out.length < maxFiles) {
    const [d, depth] = stack.pop();
    let entries = [];
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      if (e.name === 'node_modules' || e.name === '.git') continue;
      const full = path.join(d, e.name);
      if (e.isDirectory()) { if (depth < maxDepth) stack.push([full, depth + 1]); } else out.push(full);
    }
  }
  return out;
}

// Secret files a directory-wide search would print. Inside a git repo that is what git lists under the root: tracked,
// or untracked and not ignored (what ripgrep walks, so a gitignored .env is skipped by it too); `all` also lists
// ignored files, for tools like `grep -r` that do not skip them. With no usable git, or outside the repo, walk the tree.
function secretsUnder(dir, all = false, glob = null) {
  const abs = path.resolve(root, dir);
  try { if (!fs.statSync(abs).isDirectory()) return []; } catch { return []; }
  const rel = toRel(root, abs);
  const keep = (names) => names.filter((f) => f && secretFile(path.resolve(root, f)) && (!glob || matchesAny(f, [glob])));
  if (rel === '' || isInside(rel)) {
    try {
      const out = execFileSync('git', ['ls-files', '-co', ...(all ? [] : ['--exclude-standard']), '-z', '--', rel || '.'],
        { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
      return keep(out.split('\0'));
    } catch { /* not a git repo, or git is missing: walk it */ }
  }
  return keep(walkFiles(abs));
}

// Grep prints file contents. A glob is judged by what it matches: names a secret file (`.env*`, `*.{env,pem}`,
// `.[e]nv`) without being a catch-all that also matches ordinary source (`*`, `**/*`).
function globNamesSecret(glob) {
  if (!glob || glob.startsWith('!')) return false;
  const secret = ['.env', '.env.local', '.env.production', 'x.pem', 'x.key', 'x.p12', 'id_rsa', 'id_ed25519', '.aws/credentials', '.ssh/id_rsa', 'secrets/x'];
  const ordinary = ['app.ts', 'README.md', 'src/index.js', 'main.go'];
  // a glob can carry several space-separated patterns
  return glob.split(/\s+/).filter(Boolean).some((g) => {
    const hits = (names) => names.some((n) => matchesAny(n, [g]) || matchesAny(`dir/${n}`, [g]));
    return hits(secret.filter((n) => !matchesAny(n, cfg.secretAllow))) && !hits(ordinary);
  });
}

if (SEARCH_TOOLS.has(tool)) {
  const glob = String(ti.glob || '');
  if (glob.length > MAX_GLOB || (glob.match(/[{[]/g) || []).length > 8) {
    decide('ask', 'The search glob is too long or too intricate for the guard to check in time; review it manually.');
  }
  if (tool === 'Grep' && globNamesSecret(glob)) {
    decide('deny', `Grep glob "${glob}" targets secret files (secretPaths in .sdlc/config.json). Do not read them; reference the variable name instead.`);
  }
  if (tool === 'Grep' && ti.output_mode === 'content') {
    const found = secretsUnder(ti.path || input.cwd || root, false, glob && !glob.startsWith('!') && !/\s/.test(glob) ? glob : null);
    if (found.length) {
      decide('deny', `This search would print the contents of ${found[0]}${found.length > 1 ? ` and ${found.length - 1} more secret file(s)` : ''}. ` +
        'Narrow the path or glob to source files, use output_mode files_with_matches, or add the secret file to .gitignore.');
    }
  }
}
const rawPath = ti.file_path || ti.notebook_path || ti.path;
// a search with only a glob has no path, but its glob is still checked below
if (!rawPath && !(SEARCH_TOOLS.has(tool) && ti.glob)) process.exit(0);
const filePath = rawPath && process.platform === 'win32' ? ntfsPath(rawPath) : rawPath;
if (tool === 'Grep' && filePath && secretDirectory(filePath)) {
  decide('deny', `${filePath} holds secret files (secretPaths in .sdlc/config.json). Do not search it; reference the variable name instead.`);
}
const rel = toRel(root, filePath);
const inside = isInside(rel);

// 1. secrets — paths
if (filePath && ['Read', 'Grep', ...EDIT_TOOLS].includes(tool) && secretFile(filePath)) {
  decide('deny', `${inside ? rel : filePath} is a secret file (secretPaths in .sdlc/config.json). Do not read or write it; reference the variable name instead.`);
}
// Grep/Glob read contents too: a search aimed at a secret file or directory (path, or Grep's glob filter) is a read.
// A search with no path walks the repo and skips gitignored files, which is where .env normally lives.
if (SEARCH_TOOLS.has(tool)) {
  // a Grep glob filter like `.env*` or `*.pem` is tried with its wildcards removed and replaced
  const globVariants = ti.glob && !ti.glob.startsWith('!') ? [ti.glob, ti.glob.replace(/[*?]/g, ''), ti.glob.replace(/\*/g, '.x').replace(/\?/g, 'x')] : [];
  for (const target of [filePath, ...globVariants].filter(Boolean)) {
    const r = toRel(root, target);
    // a directory such as `secrets` or `.ssh` matches its `dir/**` glob only through a child path
    if (isInside(r) && (isSecretPath(cfg, r) || isSecretPath(cfg, `${r}/x`))) {
      decide('deny', `${r} is a secret path (secretPaths in .sdlc/config.json). Do not search it; reference the variable name instead.`);
    }
    if (!isInside(r) && secretFile(target)) decide('deny', `${target} is a secret file. Do not search it.`);
  }
}
if (!EDIT_TOOLS.has(tool)) process.exit(0);

// 1. secrets — content
const content = [ti.content, ti.new_string, ti.new_source, ...(ti.edits || []).map((e) => e.new_string)].filter(Boolean).join('\n');
for (const [re, label] of SECRET_CONTENT) {
  if (re.test(content)) decide('deny', `The new content contains what looks like a ${label}. Keep credentials out of the diff; read them from the environment.`);
}
if (!inside) process.exit(0);

// the guard's own config and state: an agent that can rewrite secretPaths has switched the guard off, so a person confirms
if (matchesAny(rel, ['.sdlc/config.json', '.sdlc/local/**'])) {
  decide('ask', `${rel} holds the guard's own settings or state (secretPaths, protectedPaths, test lock). A person should confirm this change.`);
}

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
