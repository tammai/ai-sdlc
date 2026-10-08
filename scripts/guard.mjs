#!/usr/bin/env node
// PreToolUse guard — the deterministic layer under the skills (playbook: "Hooks as build-time
// guardrails" + "Hooks as approval gates"). Fast and file-scoped; heavy checks belong in CI.
//   1. secrets      — never read/write .env, keys, credentials; never write secret-looking strings
//   2. protected    — generated/frozen paths from .sdlc/config.json
//   3. test lock    — during a fix, the failing test must not be edited
//   4. plan gate    — nothing is implemented without an accepted plan.md
//   5. prod gate    — the agent does everything up to the production gate and nothing past it
//
// Reading a shell command is a heuristic: the scan below resolves quotes, escapes, ${x:-default}, $HOME, braces and
// wildcards, and checks recursive searches, but it is not a shell parser. A command built at run time (eval, a
// variable assembled over several statements, $(printf …)) can still name a secret file the guard never sees.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  findRoot, isInitialized, loadConfig, loadState, toRel, isInside, matchesAny, globToRegExp, planApproved, readStdinJson, foldPath, ntfsPath,
  heartbeat, readDoc, parseDoc
} from './lib.mjs';

// A hook that outlives its timeout (10 s) is killed, and Claude Code treats that as "no objection". So every scan is
// bounded, and one that cannot finish pauses for a human instead of running on.
const START = Date.now();
const BUDGET_MS = 6000;
const MAX_COMMAND = 20000;
const MAX_GLOB = 512;
const MAX_TOKEN = 300;
const MAX_STARS = 8;
const MAX_EXPANSION = 500;
const MAX_FILES = 20000;

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
const SEGMENT = /(\n|;|&&|\|\||\||&)/;
const GLOB_CHARS = /[*?[]/;
const SECRET_PROBES = ['.env', '.env.local', '.env.production', 'x.pem', 'x.key', 'x.p12', 'id_rsa', 'id_ed25519', '.aws/credentials', '.ssh/id_rsa', 'secrets/x'];
const ORDINARY_PROBES = ['app.ts', 'README.md', 'src/index.js', 'main.go'];

// Set once the hook input is read (bottom of the file); the functions below use them when called.
let input, tool, ti, root, cfg, state;

function decide(decision, reason) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: decision, permissionDecisionReason: `[ai-sdlc] ${reason}` }
  }));
  process.exit(0);
}

function slow() {
  if (Date.now() - START > BUDGET_MS) decide('ask', 'The guard ran out of time scanning this action; review it manually.');
}

const homeDir = () => process.env.USERPROFILE || process.env.HOME || '';
const isSecretPath = (c, rel) => matchesAny(rel, c.secretPaths) && !matchesAny(rel, c.secretAllow);

// ------------------------------------------------------------------ shell text ---

// Split on whitespace and shell punctuation; a quoted string is also kept whole, so a path with a space
// ("C:\Users\Jane Doe\.aws\credentials") is checked as one path and not only as its pieces.
function tokens(cmd) {
  const quoted = [...cmd.matchAll(/"([^"\n]+)"|'([^'\n]+)'/g)].map((m) => m[1] ?? m[2]).filter((q) => /\s/.test(q));
  return [...cmd.split(/[\s'"`;|&<>()=]+/).filter(Boolean), ...quoted];
}

// Prose is not a file access: drop heredoc bodies (keep the header line, which holds redirects like `> .env`) and
// commit/tag messages. Text the shell still runs is not prose: an unquoted heredoc, a "…" here-string or a "…" message
// expands $(…) and backticks, and a `<<X` inside a quoted string is not a heredoc at all. Those are kept.
// `keepShell`: leave heredoc bodies alone when they feed a shell (`bash <<EOF`, `ssh host <<EOF`), because those lines
// run as commands: the production and approval gates need them, the secret scan does not.
const EXPANDS = /\$\(|`/;
const SHELLISH = /\b(?:ba|z|da|k)?sh\b|\bssh\b|\beval\b|\bsource\b|\bpwsh\b|\bpowershell\b/i;
function stripProse(cmd, { keepShell = false } = {}) {
  return cmd
    .replace(/<<-?\s*(['"]?)([A-Za-z_][\w-]*)\1([^\n]*)\n([\s\S]*?)\n[ \t]*\2[ \t]*(?=\n|$)/g, (m, q, delim, rest, body, offset, all) => {
      const before = all.slice(all.lastIndexOf('\n', offset - 1) + 1, offset);
      const insideQuote = (before.match(/"/g) || []).length % 2 === 1 || (before.match(/'/g) || []).length % 2 === 1;
      return insideQuote || (!q && EXPANDS.test(body)) || (keepShell && SHELLISH.test(before + rest)) ? m : `<<${delim}${rest}`;
    })
    .replace(/@(['"])([\s\S]*?)\n\1@/g, (m, q, body) => (q === '"' && EXPANDS.test(body) ? m : '')) // PowerShell here-strings
    .replace(/(\s(?:-m|--message)\s*)("(?:[^"\\]|\\.)*"|'[^']*')/g, (m, flag, msg) => (msg[0] === '"' && EXPANDS.test(msg) ? m : `${flag}MSG`));
}

// Approval is a human act. The gated stages (cfg.approvalGate) pause at the permission prompt, whichever way the
// approval is attempted: the CLI, a forged `status: approved` in the artifact, or a shell edit of that file.
// SDLC_APPROVER=<name> in the *launching* shell pre-authorizes (text inside the command does not count).
const STAGE_RE = '(intent|design|ui|spec|plan|review)';
function approvalAsk(kind) {
  decide('ask', `Approval gate: this records a human approval of the ${kind}. Approve only after reading ${kind}.md yourself; ` +
    `Claude must not approve on its own, even when told to skip the paperwork. (Pre-authorize with SDLC_APPROVER=<name> in the launching shell.)`);
}
const gated = (kind) => !process.env.SDLC_APPROVER && (cfg.approvalGate || []).includes(kind);

// The file as an Edit/MultiEdit/Write would leave it. The gate judges that, not the fragment: replacing `draft` with
// `approved` never says `status:`, and two edits can add up to an approval.
function afterEdit(abs) {
  if (tool === 'Write') return String(ti.content ?? '');
  let text = '';
  try { text = fs.readFileSync(abs, 'utf8').replace(/^﻿/, ''); } catch { /* a new file */ }
  for (const e of tool === 'MultiEdit' ? (ti.edits || []) : [ti]) {
    if (typeof e.old_string !== 'string' || typeof e.new_string !== 'string') continue;
    if (e.old_string === '') text += e.new_string;
    else text = e.replace_all ? text.split(e.old_string).join(e.new_string) : text.replace(e.old_string, () => e.new_string);
  }
  return text;
}

// A shell command that writes a file: a redirect, or a copy/move/edit verb, or an interpreter that says it writes.
const SHELL_WRITES = new RegExp([
  String.raw`\b(?:sed|perl)\s+-\S*i`, String.raw`\btee\b`, String.raw`\b(?:Set|Add)-Content\b`, String.raw`\bOut-File\b`,
  String.raw`\b(?:cp|mv|move|copy|dd|install|ren|rename)\b`, String.raw`\b(?:Copy|Move|Rename)-Item\b`,
  String.raw`>>?\s*\S*\.md`,
  String.raw`\b(?:python3?|node|ruby|perl|php)\b[\s\S]*(?:write|append|\.dump|open\s*\([^)]*,\s*['"][wa])`
].join('|'), 'i');

// `echo ".env" >> .gitignore` names .env without reading it: what echo prints is prose. Keep its redirect targets and
// any $(…) it runs; keep everything when its output is piped on (`echo .env | xargs cat`).
function dropEchoArgs(cmd) {
  const parts = cmd.split(SEGMENT);
  for (let i = 0; i < parts.length; i += 2) {
    if (parts[i + 1] === '|' || !/^\s*(?:echo|printf|write-output|write-host)\b/i.test(parts[i])) continue;
    const keep = [...parts[i].matchAll(/\d*>>?\s*[^\s>|&;]+/g), ...parts[i].matchAll(/\$\([^)]*\)|`[^`]*`/g)].map((m) => m[0]);
    parts[i] = ['echo', ...keep].join(' ');
  }
  return parts.join('');
}

// Patterns handed to find, and `git check-ignore`, are not reads either.
function dropPatternArgs(cmd) {
  return cmd
    .replace(/(\s-(?:i?name|i?path|iwholename|wholename|i?regex)\s+)("[^"]*"|'[^']*'|\S+)/g, '$1PATTERN')
    .replace(/\bgit\s+check-ignore\b[^\n;|&]*/g, 'git check-ignore');
}

// bash $'\x2eenv' → .env
function decodeAnsiC(body) {
  return body.replace(/\\(x[0-9a-fA-F]{1,2}|u[0-9a-fA-F]{1,4}|[0-7]{1,3}|.)/g, (m, c) => {
    if ((c[0] === 'x' || c[0] === 'u') && c.length > 1) return String.fromCharCode(parseInt(c.slice(1), 16));
    if (/^[0-7]+$/.test(c)) return String.fromCharCode(parseInt(c, 8));
    return { n: '\n', t: '\t', r: '\r' }[c] ?? c;
  });
}

// $HOME, %USERPROFILE%, $env:USERPROFILE (also quoted, as in "$HOME"/.aws/credentials) → the home directory; $PWD → cwd
function expandVars(s) {
  return s
    .replace(/["']?(?:\$\{?(?:HOME|USERPROFILE)\}?|%USERPROFILE%|\$env:USERPROFILE|\$env:HOMEDRIVE\$env:HOMEPATH)["']?(?=[\\/])/gi, () => homeDir())
    .replace(/["']?\$\{?PWD\}?["']?(?=[\\/])/g, () => input.cwd || root);
}

// The same command as the shell or PowerShell may read it once quotes, concatenation, escapes, $'…' and
// ${x:-default} are resolved: `.en""v`, `".e"nv`, `".en"+"v"`, `.e\nv`, `$'\x2eenv'` and `${x:-.env}` all name .env.
function scanVariants(cmd) {
  const base = dropPatternArgs(dropEchoArgs(stripProse(cmd)));
  const joined = base.replace(/["']\s*\+\s*["']/g, '');
  const bare = joined.replace(/\$[@*]/g, '').replace(/["']/g, '');
  const defaults = [...base.matchAll(/\$\{([^}\n]{0,200})\}/g)].map((m) => /^[^:=+?-]*:?[-=+?]([\s\S]*)$/.exec(m[1])?.[1]).filter(Boolean);
  return [base, bare, bare.replace(/\\(?=[A-Za-z0-9._-])/g, ''), base.replace(/\$'((?:[^'\\]|\\.)*)'/g, (m, b) => decodeAnsiC(b)), defaults.join(' ')]
    .map(expandVars);
}

// {a,b} → a and b (nested, capped)
function expandBraces(s, limit = 64) {
  const results = [];
  const rec = (str) => {
    if (results.length >= limit) return;
    let depth = 0;
    let start = -1;
    for (let i = 0; i < str.length; i++) {
      if (str[i] === '{') { if (depth++ === 0) start = i; }
      else if (str[i] === '}' && depth > 0 && --depth === 0) {
        const inner = str.slice(start + 1, i);
        const parts = [];
        let d = 0;
        let last = 0;
        for (let k = 0; k < inner.length; k++) {
          if (inner[k] === '{') d++;
          else if (inner[k] === '}') d--;
          else if (inner[k] === ',' && d === 0) { parts.push(inner.slice(last, k)); last = k + 1; }
        }
        parts.push(inner.slice(last));
        if (parts.length > 1) { for (const p of parts) rec(str.slice(0, start) + p + str.slice(i + 1)); return; }
        start = -1; // `{x}` has no comma: a literal
      }
    }
    results.push(str);
  };
  rec(s);
  return results;
}

// ------------------------------------------------------------------- paths -------

const dirCache = new Map();
function listDir(d) {
  if (!dirCache.has(d)) {
    let names = [];
    try { names = fs.readdirSync(d); } catch { /* not a directory */ }
    // a wildcard that cannot see the whole directory could miss the one secret in it, so a huge one asks instead
    if (names.length > MAX_FILES) decide('ask', `A wildcard in this command walks ${names.length} entries in ${d}, too many for the guard to check; review it manually.`);
    dirCache.set(d, names);
  }
  return dirCache.get(d);
}

// Every trailing sub-path of a path (a/b/c → a/b/c, b/c, c): `**/.aws/credentials` and `**/.ssh/**` match under any parent.
// Building them costs more than the path's length squared, so a path nobody writes by hand asks instead of being scanned.
const MAX_SEGMENTS = 64;
function tailsOf(p) {
  let segs = p.normalize('NFC').split(/[\\/]+/).filter(Boolean);
  if (segs.length > MAX_SEGMENTS) {
    // Padding a path must not turn a deny into a prompt: what the last segments name is still checked, and a secret
    // there is denied. Only a path with nothing secret in its tail asks.
    segs = segs.slice(-MAX_SEGMENTS);
    const tails = segs.map((_, i) => segs.slice(i).join('/'));
    if (tails.some((tail) => isSecretPath(cfg, tail))) return tails;
    decide('ask', 'This path is too deep for the guard to check in time; review it manually.');
  }
  return segs.map((_, i) => segs.slice(i).join('/'));
}

// One path segment's wildcards (`*`, `?`, `[class]`) matched without regex backtracking: a file name the agent made up
// (`aaaa…a`) against `*a*a*a*b` must not be able to stall the guard past its timeout.
function segTokens(pat) {
  const out = [];
  for (let i = 0; i < pat.length; i++) {
    const c = pat[i];
    if (c === '*') { if (!out.at(-1)?.star) out.push({ star: true }); }
    else if (c === '?') out.push({ any: true });
    else if (c === '[') {
      let k = i + 1;
      const neg = pat[k] === '!' || pat[k] === '^';
      if (neg) k++;
      const j = pat.indexOf(']', pat[k] === ']' ? k + 1 : k);
      let re = null;
      if (j > k) { try { re = new RegExp(`^[${neg ? '^' : ''}${pat.slice(k, j).replace(/[\\[\]]/g, '\\$&')}]$`, 'i'); } catch { /* literal */ } }
      if (re) { out.push({ re }); i = j; } else out.push({ ch: '[' });
    } else out.push({ ch: c.toLowerCase() });
  }
  return out;
}

function wildMatch(toks, name) {
  const one = (t, ch) => t.any || (t.re ? t.re.test(ch) : t.ch === ch.toLowerCase());
  let ti = 0;
  let si = 0;
  let starTi = -1;
  let starSi = 0;
  while (si < name.length) {
    if (ti < toks.length && toks[ti].star) { starTi = ti++; starSi = si; }
    else if (ti < toks.length && one(toks[ti], name[si])) { ti++; si++; }
    else if (starTi >= 0) { ti = starTi + 1; si = ++starSi; }
    else return false;
  }
  while (ti < toks.length && toks[ti].star) ti++;
  return ti === toks.length;
}

// What a wildcard path names on disk, segment by segment (a wildcard may sit in any segment: `~/.aw*/credentials`).
// `*` does not match a leading dot, as in the shell.
function expandWild(expanded, dirs) {
  const norm = expanded.split('\\').join('/');
  const abs = /^(?:[A-Za-z]:)?\//.exec(norm);
  let cur = abs ? [abs[0]] : dirs.map((d) => path.resolve(d));
  for (const seg of (abs ? norm.slice(abs[0].length) : norm).split('/').filter(Boolean)) {
    slow();
    if (seg === '.') continue;
    if (seg === '..') { cur = cur.map((c) => path.resolve(c, '..')); continue; }
    if (!GLOB_CHARS.test(seg)) { cur = cur.map((c) => path.join(c, seg)); continue; }
    const toks = segTokens(seg);
    const next = [];
    for (const c of cur) {
      for (const n of listDir(c)) {
        if (n[0] === '.' && seg[0] !== '.') continue;
        if (wildMatch(toks, n)) next.push(path.join(c, n));
        if (next.length > MAX_EXPANSION) decide('ask', 'This wildcard matches too many paths for the guard to check; review it manually.');
      }
    }
    cur = next;
  }
  return cur;
}

// A command-line token is a secret access when it names a distinctive secret file (.env, *.pem, id_rsa…), or matches a
// directory-style secret glob (secrets/**, .ssh/**) AND that path exists, or is a wildcard that expands to one.
// "D1/secrets/deploy" in prose matches secrets/** but exists nowhere, so it is allowed.
function secretToken(c, raw, dirs) {
  slow();
  // only a wildcard is expensive to expand; a long plain path (long paths are on in Windows 11) is still checked by name
  if (raw.length > MAX_TOKEN && GLOB_CHARS.test(raw)) decide('ask', 'A wildcard in this command is too long for the guard to check; review it manually.');
  return expandBraces(raw.replace(/^@/, '')).some((t) => secretName(c, t, dirs));
}

function secretName(c, t, dirs, expandedAlready = false) {
  const home = homeDir();
  const expanded = /^~[\\/]/.test(t) ? path.join(home, t.slice(2))
    : t.replace(/^(?:\$\{?(?:HOME|USERPROFILE)\}?|%USERPROFILE%|\$env:USERPROFILE)(?=[\\/])/i, home);
  if (!expandedAlready && GLOB_CHARS.test(expanded)) {
    if ((expanded.match(/\*/g) || []).length > MAX_STARS) decide('ask', 'A wildcard in this command has too many *, so the guard cannot check it in time; review it manually.');
    return expandWild(expanded, dirs).some((p) => secretName(c, p, dirs, true));
  }
  // a relative path means relative to where the shell is, not to the project root
  const abs = path.resolve(input.cwd || root, expanded);
  const rel = toRel(root, abs) ?? t;
  // outside the repo (home dir, absolute paths): the repo-relative globs apply to every trailing sub-path
  const tails = isInside(rel) ? [] : tailsOf(abs);
  // `git show HEAD:.env`, `git cat-file -p :secrets/db.json` name the file after the colon (not a URL)
  const afterRev = !t.includes('://') && /^(?![A-Za-z]:[\\/])[^:\\/]*:/.test(t) ? t.replace(/^[^:\\/]*:/, '') : null;
  const candidates = [rel, t.replace(/^~[\\/]/, ''), ...tails, ...(afterRev ? [afterRev] : [])];
  // The allow-list is tried only on resolved paths. The raw token may reach a secret through a `..` that a glob would read
  // as part of an allowed prefix (`node_modules/../.env` matches `**/node_modules/**`).
  const allowable = [rel, ...tails, ...(afterRev ? [path.posix.normalize(afterRev.split('\\').join('/'))] : [])];
  if (allowable.some((x) => !x.split('/').includes('..') && matchesAny(x, c.secretAllow))) return false;
  const byName = c.secretPaths.filter((g) => !g.includes('/'));
  const byDir = c.secretPaths.filter((g) => g.includes('/'));
  if (candidates.some((x) => matchesAny(x, byName))) return true;
  // a directory of secrets (`cd ~/.aws`, `cd secrets`): what is inside is one `cat` away
  for (const d of dirs) {
    try {
      const p = path.resolve(d, expanded);
      if (fs.statSync(p).isDirectory() && secretDirectory(p)) return true;
    } catch { /* does not exist */ }
  }
  // a committed file need not exist in the working tree
  if (afterRev && matchesAny(afterRev, byDir)) return true;
  if (!/[\\/.]/.test(t)) return false;
  if (!candidates.some((x) => matchesAny(x, byDir))) return false;
  return dirs.some((d) => fs.existsSync(path.resolve(d, expanded)) || fs.existsSync(path.resolve(d, expanded.split('\\').join('/'))));
}

// A Grep `path` that is a directory holding secrets (~/.ssh, ./secrets): test a file inside it with the same rules
// as a file path, including the outside-the-repo tails that make `**/.ssh/**` match under the home directory.
function secretDirectory(p) {
  return ['__grep__', 'credentials'].some((name) => { // credentials: **/.aws/credentials
    const probe = path.join(p, name);
    const r = toRel(root, probe);
    return [r, ...(isInside(r) ? [] : tailsOf(path.resolve(root, probe)))]
      .some((x) => matchesAny(x, cfg.secretPaths) && !matchesAny(x, cfg.secretAllow));
  });
}

// A file the secret globs name. Inside the repo the repo-relative path is tested; outside it (the home directory,
// another drive) every trailing sub-path is, so `**/.aws/credentials` and `**/.ssh/**` match under any parent.
function secretFile(p, { fast = false } = {}) {
  const rel = fast ? path.relative(root, p).split(path.sep).join('/') : toRel(root, p);
  if (isInside(rel)) return isSecretPath(cfg, rel);
  return tailsOf(path.resolve(p)).some((tail) => isSecretPath(cfg, tail));
}

// Files under a directory, bounded in count and depth so a scan cannot outlast the hook's timeout.
function walkFiles(dir, maxDepth = 6) {
  const files = [];
  const stack = [[dir, 0]];
  let truncated = false;
  while (stack.length) {
    slow();
    const [d, depth] = stack.pop();
    let entries = [];
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      if (e.name === 'node_modules' || e.name === '.git') continue;
      const full = path.join(d, e.name);
      if (e.isDirectory()) { if (depth < maxDepth) stack.push([full, depth + 1]); else truncated = true; } else files.push(full);
      if (files.length >= MAX_FILES) return { files, truncated: true };
    }
  }
  return { files, truncated };
}

// Keep the secret files a Grep glob would reach. Only files already known to be secret are tested, and a long name (which
// a regex could be made to chew on) is assumed to match: a missed secret is worse than a prompt.
function globFilter(files, globs) {
  if (!globs || files.length > 50) return files;
  return files.filter((f) => f.length > 100 || matchesAny(f, globs));
}

// Secret files a directory-wide search would print. Inside a git repo that is what git lists under the root: tracked,
// or untracked and not ignored (what ripgrep walks, so a gitignored .env is skipped by it too); `all` also lists
// ignored files, for tools that do not skip them (`grep -r`, `rg -u`, or a Grep `glob`, which overrides .gitignore).
// With no usable git, or outside the repo, walk the tree; a walk that hit its limit without a hit asks.
function secretsUnder(dir, { all = false, glob = null, excludeDirs = [] } = {}) {
  slow();
  const abs = path.resolve(input.cwd || root, dir);
  try { if (!fs.statSync(abs).isDirectory()) return []; } catch { return []; }
  const rel = toRel(root, abs);
  const skip = (f) => excludeDirs.length > 0 && f.split(/[\\/]/).some((s) => excludeDirs.includes(s));
  const globs = glob ? [glob] : null;
  if (rel === '' || isInside(rel)) {
    try {
      const out = execFileSync('git', ['ls-files', '-co', ...(all ? [] : ['--exclude-standard']), '-z', '--', rel || '.'],
        { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
      return globFilter(out.split('\0').filter((f) => f && isSecretPath(cfg, f) && !skip(f)), globs);
    } catch { /* not a git repo, or git is missing: walk it */ }
  }
  const { files, truncated } = walkFiles(abs);
  const hits = globFilter(files.filter((p, i) => (i % 500 === 0 && slow(), secretFile(p, { fast: true })) && !skip(p)), globs);
  if (!hits.length && truncated) decide('ask', 'This directory is too large for the guard to search for secrets in time; review the search manually.');
  return hits;
}

// Grep prints file contents. A glob is judged by what it matches: names a secret file (`.env*`, `*.{env,pem}`,
// `.[e]nv`) without being a catch-all that also matches ordinary source (`*`, `**/*`).
function globNamesSecret(glob) {
  if (!glob || glob.startsWith('!')) return false;
  // a glob can carry several space-separated patterns
  return glob.split(/\s+/).filter(Boolean).some((g) => {
    const hits = (names) => names.some((n) => matchesAny(n, [g]) || matchesAny(`dir/${n}`, [g]));
    return hits(SECRET_PROBES.filter((n) => !matchesAny(n, cfg.secretAllow))) && !hits(ORDINARY_PROBES);
  });
}

// ------------------------------------------------------- searches and the guard's own files ---

// Recursive searches in a command, one per simple command: grep -r (ignores .gitignore), rg/ag/ack/git grep (recursive
// by default; -u / --no-ignore read ignored files too), findstr /s, and Select-String fed by -Recurse.
function recursiveSearches(cmd) {
  const found = [];
  const parts = stripProse(cmd).split(SEGMENT);
  const psRecurse = /-Recurse\b/i.test(cmd) && /\b(?:sls|select-string)\b/i.test(cmd);
  const cwd = input.cwd || root;
  for (let i = 0; i < parts.length; i += 2) {
    const words = parts[i].trim().split(/\s+/).filter(Boolean);
    while (words.length && (/^[A-Za-z_]\w*=/.test(words[0]) || ['sudo', 'command', 'time', 'nice'].includes(words[0]))) words.shift();
    if (!words.length) continue;
    const name = path.basename(words[0].replace(/\\/g, '/')).toLowerCase().replace(/\.exe$/, '');
    const args = words.slice(1);
    const flags = args.filter((a) => a.startsWith('-'));
    let all = false;
    let kind = null;
    if (['grep', 'egrep', 'fgrep', 'rgrep', 'zgrep'].includes(name)) {
      if (flags.some((a) => /^-[A-Za-z]*[rR][A-Za-z]*$/.test(a) || /^--(?:dereference-)?recursive$/.test(a) || a === '--directories=recurse') ||
        args.some((a, k) => a === '-d' && args[k + 1] === 'recurse')) { kind = name; all = true; }
    } else if (['rg', 'ripgrep', 'ag', 'ack', 'ack-grep'].includes(name)) {
      kind = name;
      all = name.startsWith('ack') || flags.some((a) => /^-u+$/.test(a) || /^--(?:no-ignore|unrestricted)/.test(a));
    } else if (name === 'git' && args[0] === 'grep') kind = 'git grep';
    else if (name === 'findstr' && args.some((a) => /^\/s$/i.test(a))) { kind = name; all = true; }
    else if (psRecurse && ['sls', 'select-string', 'gci', 'get-childitem', 'ls', 'dir', 'cat', 'gc', 'get-content'].includes(name)) { kind = name; all = true; }
    if (!kind) continue;
    const excludeDirs = [];
    args.forEach((a, k) => {
      const m = /^--exclude-dir=(.+)$/.exec(a);
      if (m) excludeDirs.push(...m[1].replace(/^\{|\}$/g, '').split(','));
      else if (a === '--exclude-dir' && args[k + 1]) excludeDirs.push(args[k + 1]);
    });
    // operands: the first non-flag word is the pattern (unless -e/-f/--regexp gives it); the rest are paths
    const operands = args.filter((a) => !a.startsWith('-') && !(kind === 'findstr' && a.startsWith('/')));
    const patternGiven = args.some((a) => ['-e', '-f', '--regexp', '--file'].includes(a) || a.startsWith('--regexp='));
    const paths = patternGiven ? operands : operands.slice(1);
    // findstr /s takes file specs (`*`, `*.pem`) and walks the cwd for them, dotfiles included
    const targets = paths.length && kind !== 'findstr' ? [] : [cwd];
    for (const p of kind === 'findstr' ? [] : paths) {
      const clean = expandVars(p.replace(/^["']|["']$/g, ''));
      for (const candidate of GLOB_CHARS.test(clean) ? expandWild(clean, [cwd]) : [path.resolve(cwd, clean)]) {
        try { if (fs.statSync(candidate).isDirectory()) targets.push(candidate); } catch { /* not a directory */ }
      }
    }
    if (targets.length) found.push({ targets, all, excludeDirs });
  }
  return found;
}

// The guard's own config and state: an agent that can rewrite secretPaths has switched the guard off. A shell command
// that writes (or deletes, moves, redirects into, or `cd`s into) .sdlc/config.json or .sdlc/local/ asks a person.
function touchesGuardFiles(cmd) {
  const norm = cmd.replace(/\\/g, '/').replace(/\/(?:\.\/)+/g, '/').replace(/\/{2,}/g, '/');
  if (!/\.sdl(?:c\b|[?*[])/i.test(norm)) return false;
  return [
    /(?:^|[\s;|&(])(?:tee|mv|cp|rm|del|erase|ren|rd|rmdir|move|copy|truncate|dd|install|vim?|nano|code|sc|ni|ri|mi|ac|set-content|add-content|out-file|clear-content|remove-item|move-item|copy-item|rename-item|new-item)\b/i,
    /\b(?:writeFile|appendFile|unlink|rmSync|renameSync|copyFile|cpSync|write_text|dump)\w*\b/,
    /\bopen\s*\([^)]*,\s*['"][wa]/,
    /\b(?:sed|perl)\s+-\S*i/i,
    /\bcurl\b[^\n|;]*\s(?:-o|--output)\b|\bwget\b[^\n|;]*\s(?:-O|--output-document)\b/i,
    />>?\s*\S*\.sdl/i,
    /\b(?:cd|pushd|set-location|sl)\s+\S*\.sdlc/i,
    /\bgit\s+(?:checkout|restore|apply|stash)\b/i
  ].some((re) => re.test(norm));
}

// ===================================================================== main ============

// A guard that crashes exits 1, which Claude Code treats as non-blocking: that would silently switch every
// check off. Unreadable input or an unexpected error pauses for a human instead.
process.on('uncaughtException', (e) => decide('ask', `The guard failed (${e.message}); review this action manually.`));
input = await readStdinJson({ strict: true });
if (input.invalidInput) decide('ask', 'The guard could not parse its input; review this action manually.');
tool = input.tool_name;
ti = input.tool_input || {};
// The session's project (CLAUDE_PROJECT_DIR) anchors the guard even when the shell has `cd`'d into a nested package or
// submodule that has its own .git or .sdlc: the config, state, protected paths and test lock are the session's.
root = findRoot(process.env.CLAUDE_PROJECT_DIR || input.cwd);
cfg = loadConfig(root);
state = loadState(root);
if (isInitialized(root)) heartbeat(root, 'guard');

if (tool === 'Bash' || tool === 'PowerShell') {
  const full = String(ti.command || '');
  // A command too long to scan whole must not become a way to turn a deny into a prompt: its first and last stretches are
  // still checked (a secret in either is denied), and only if they come back clean does it ask.
  const tooLong = full.length > MAX_COMMAND;
  const cmd = tooLong ? `${full.slice(0, MAX_COMMAND / 2)}\n${full.slice(-MAX_COMMAND / 2)}` : full;

  // 1. secrets referenced on the command line
  const dirs = [...new Set([input.cwd, root].filter(Boolean))];
  for (const variant of scanVariants(cmd)) {
    for (const t of tokens(variant)) {
      if (secretToken(cfg, t, dirs)) decide('deny', `"${t}" matches a secret path. Secrets stay out of the session; use an env-injected value or ask the user.`);
    }
  }

  // a recursive search reads every file under the directory it walks, so a .env there is printed
  for (const s of recursiveSearches(cmd)) {
    for (const target of s.targets) {
      const found = secretsUnder(target, { all: s.all, excludeDirs: s.excludeDirs });
      if (found.length) decide('deny', `A recursive search of ${target} would print the contents of "${found[0]}", which matches a secret path. Search a source directory instead.`);
    }
  }

  if (touchesGuardFiles(cmd)) {
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

  // 4b. approval gate — the CLI, or a shell edit of an artifact that mentions approval
  const sans = stripProse(cmd, { keepShell: true });
  const cli = sans.match(new RegExp(`\\bsdlc(?:\\.mjs)?["']?\\s+approve\\s+${STAGE_RE}\\b`, 'i'));
  if (cli && gated(cli[1].toLowerCase())) approvalAsk(cli[1].toLowerCase());
  // (Windows spells the path docs\sdlc\c1\plan.md)
  const art = sans.replace(/\\/g, '/').match(new RegExp(`${cfg.artifactsDir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/[^\\s'"]*?/${STAGE_RE}\\.md`, 'i'));
  // any write to a gated artifact asks, not only one that says "approved": `sed -i s/draft/$s/` builds the word at run time
  if (art && gated(art[1].toLowerCase()) && SHELL_WRITES.test(sans)) approvalAsk(art[1].toLowerCase());

  // 5. production gate
  // prose is not a deploy: a heredoc that edits docs, or a commit message, may say "production" and "deploy"
  const bare = stripProse(cmd, { keepShell: true }).replace(/\b([\w-]+)\.(?:cmd|exe|ps1|bat)\b(?=\s|$)/gi, '$1'); // npm.cmd publish → npm publish
  const prod = [...(cfg.prodPatterns || []), ...(cfg.prodPatternsExtra || [])].find((p) => new RegExp(p, 'i').test(bare));
  if (prod) {
    // an approval covers a release command, not a command too long to have been read (see tooLong below)
    if (process.env.RELEASE_APPROVAL && !tooLong) process.exit(0);
    const why = `Production gate: "${cmd.slice(0, 120)}" crosses the release boundary. A named human must authorize it ` +
      `(set RELEASE_APPROVAL=<ticket or approver> in the launching shell, or approve this prompt). ` +
      `Route: open a PR and let branch protection + the release manager decide.`;
    decide(cfg.prodGate === 'deny' ? 'deny' : 'ask', why);
  }
  if (tooLong) decide('ask', `The command is ${full.length} characters, too long for the guard to scan in time; review it manually.`);
  process.exit(0);
}

if (SEARCH_TOOLS.has(tool)) {
  const glob = String(ti.glob || '');
  if (glob.length > MAX_GLOB || (glob.match(/[{[]/g) || []).length > 8 || (glob.match(/\*/g) || []).length > MAX_STARS) {
    decide('ask', 'The search glob is too long or too intricate for the guard to check in time; review it manually.');
  }
  if (tool === 'Grep' && globNamesSecret(glob)) {
    decide('deny', `Grep glob "${glob}" matches a secret path (secretPaths in .sdlc/config.json). Do not read them; reference the variable name instead.`);
  }
  if (tool === 'Grep' && ti.output_mode === 'content') {
    // a positive glob overrides .gitignore in ripgrep (`-g '*'` searches ignored files), so then ignored files count too
    const positive = glob && !glob.startsWith('!');
    const found = secretsUnder(ti.path || input.cwd || root, { all: Boolean(positive), glob: positive && !/\s/.test(glob) ? glob : null });
    if (found.length) {
      decide('deny', `This search would print the contents of "${found[0]}", which matches a secret path${found.length > 1 ? ` and ${found.length - 1} more secret file(s)` : ''}. ` +
        'Narrow the path or glob to source files, use output_mode files_with_matches, or add the secret file to .gitignore.');
    }
  }
}
const rawPath = ti.file_path || ti.notebook_path || ti.path;
// a search with only a glob has no path, but its glob is still checked below
if (!rawPath && !(SEARCH_TOOLS.has(tool) && ti.glob)) process.exit(0);
if (rawPath && String(rawPath).length > 8192) {
  // too long to resolve, but what its last segments name still counts (the first one may be cut in half, so it is dropped)
  const last = String(rawPath).slice(-1024).split(/[\\/]+/).filter(Boolean).slice(1);
  if (last.some((_, i) => isSecretPath(cfg, last.slice(i).join('/')))) decide('deny', 'The end of this path names a secret file (secretPaths in .sdlc/config.json). Do not read or write it.');
  decide('ask', 'This path is too long for the guard to check; review it manually.');
}
const filePath = rawPath && path.resolve(input.cwd || root, process.platform === 'win32' ? ntfsPath(rawPath) : rawPath);
if (tool === 'Grep' && filePath && secretDirectory(filePath)) {
  decide('deny', `"${filePath}" matches a secret path: it holds secret files (secretPaths in .sdlc/config.json). Do not search it; reference the variable name instead.`);
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
      decide('deny', `"${r}" matches a secret path (secretPaths in .sdlc/config.json). Do not search it; reference the variable name instead.`);
    }
    if (!isInside(r) && secretFile(target)) decide('deny', `"${target}" matches a secret path. Do not search it.`);
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

// 2a. approval gate — a hand-written `status: approved` in a gated artifact
{
  const m = rel.match(new RegExp(`^${cfg.artifactsDir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/[^/]+/${STAGE_RE}\\.md$`, 'i'));
  if (m && gated(m[1].toLowerCase())) {
    const abs = path.resolve(root, rel);
    const already = readDoc(abs)?.meta.status === 'approved';
    if (!already && parseDoc(afterEdit(abs)).meta.status === 'approved') approvalAsk(m[1].toLowerCase());
  }
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
