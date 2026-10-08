// Shared helpers for the ai-sdlc hooks and CLI. Zero dependencies, Node >= 18.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

export const STAGES = ['intent', 'spec', 'plan'];

// Model routing: subagent complexity follows the change's risk tier (S→simple, M→normal, L→complex).
export const TIERS = {
  simple: { model: 'sonnet', effort: 'low', suffix: '-simple', label: 'SIMPLE tier (risk tier S)' },
  normal: { model: 'sonnet', effort: 'high', suffix: '', label: 'NORMAL tier (risk tier M)' },
  complex: { model: 'opus', effort: 'medium', suffix: '-complex', label: 'COMPLEX tier (risk tier L)' }
};
export const ROLES = {
  implementer: ['simple', 'normal', 'complex'],
  reviewer: ['normal', 'complex'],
  researcher: ['simple', 'normal', 'complex'],
  verifier: ['normal'],
  'architect-reviewer': ['normal', 'complex'],
  'ui-reviewer': ['normal', 'complex']
};
export const TIER_TO_COMPLEXITY = { S: 'simple', M: 'normal', L: 'complex' };

export function routeAgent(role, complexity) {
  const tiers = ROLES[role];
  if (!tiers) return null;
  const order = ['simple', 'normal', 'complex'];
  // nearest available variant, preferring the stronger one
  const pick = tiers.includes(complexity) ? complexity : tiers.find((t) => order.indexOf(t) > order.indexOf(complexity)) || tiers.at(-1);
  return { agent: `ai-sdlc:${role}${TIERS[pick].suffix}`, complexity: pick, model: TIERS[pick].model, effort: TIERS[pick].effort };
}

export const DEFAULT_CONFIG = {
  artifactsDir: 'docs/sdlc',
  enforcePlan: true,
  requireVerifyOnStop: true,
  prodGate: 'ask', // "ask" pauses for a human; "deny" blocks unless RELEASE_APPROVAL is set
  prodPatterns: [
    '\\bdeploy\\b.*\\bprod(uction)?\\b',
    '\\bprod(uction)?\\b.*\\bdeploy\\b',
    '\\bvercel\\b.*--prod\\b',
    '\\bnetlify\\s+deploy\\b.*--prod\\b',
    '\\bwrangler\\s+(deploy|publish)\\b(?!.*--env[ =](dev|staging|preview))',
    '\\bfly(ctl)?\\s+deploy\\b',
    '\\bkubectl\\b.*\\b(apply|delete|rollout)\\b.*\\bprod',
    '\\bhelm\\s+(upgrade|install)\\b.*\\bprod',
    '\\bterraform\\s+(apply|destroy)\\b',
    '\\bnpm\\s+publish\\b',
    '\\bgh\\s+release\\s+create\\b',
    '\\bgit\\s+push\\b.*\\s(--force|-f)\\b',
    '\\bgit\\s+push\\b.*[\\s:](main|master)(\\s|$)'
  ],
  protectedPaths: [],
  alwaysEditable: [],
  secretPaths: ['.env', '.env.*', '*.pem', '*.key', '*.p12', 'id_rsa*', 'id_ed25519*', 'secrets/**', '**/secrets/**', '**/.aws/credentials', '**/.ssh/**'],
  secretAllow: ['.env.example', '.env.sample', '.env.template', '*.example.{json,yaml,yml,toml,txt,md,env}'],
  testGlobs: ['**/*.test.*', '**/*.spec.*', '**/*_test.*', '**/test_*.py', '**/tests/**', '**/test/**', '**/__tests__/**', '**/itest/**'],
  formatOnEdit: null,
  verify: []
};

// Windows editors (Notepad, PowerShell 5.1 Out-File) prepend a BOM, which makes JSON.parse throw and
// the front-matter regex miss; every read of a config, state or artifact file goes through here.
export const stripBom = (text) => (text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text);
export const readText = (file) => stripBom(fs.readFileSync(file, 'utf8'));

const sleepMs = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

// Write to a sibling temp file, then rename over the target, so a hook reading in parallel never sees a
// truncated file. Windows antivirus/indexers can hold the target briefly (EBUSY/EPERM): retry a few times.
export function writeFileAtomic(file, text) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, text);
  for (let i = 0; ; i++) {
    try { fs.renameSync(tmp, file); return; }
    catch (e) {
      if (i >= 5 || !['EBUSY', 'EPERM', 'EACCES'].includes(e.code)) { fs.rmSync(tmp, { force: true }); throw e; }
      sleepMs(20 * (i + 1));
    }
  }
}

export function findRoot(start = process.env.CLAUDE_PROJECT_DIR || process.cwd()) {
  let dir = path.resolve(start);
  for (;;) {
    if (fs.existsSync(path.join(dir, '.sdlc')) || fs.existsSync(path.join(dir, '.git'))) return dir;
    const up = path.dirname(dir);
    if (up === dir) return path.resolve(start);
    dir = up;
  }
}

export function isInitialized(root) {
  return fs.existsSync(path.join(root, '.sdlc', 'config.json'));
}

export function loadConfig(root) {
  const file = path.join(root, '.sdlc', 'config.json');
  let user = {};
  if (fs.existsSync(file)) {
    try { user = JSON.parse(readText(file)); } catch { user = {}; }
  }
  const cfg = { ...DEFAULT_CONFIG, ...user };
  // artifactsDir is compared with '/'-separated relative paths; accept a Windows-style setting
  cfg.artifactsDir = String(cfg.artifactsDir).split('\\').join('/').replace(/\/+$/, '');
  return cfg;
}

const statePath = (root) => path.join(root, '.sdlc', 'local', 'state.json');

export function loadState(root) {
  for (let i = 0; ; i++) {
    try { return { active: null, dirty: false, testLock: [], ...JSON.parse(readText(statePath(root))) }; }
    catch (e) {
      if (e.code === 'ENOENT') break;
      if (i >= 2) break;
      sleepMs(20); // EBUSY/EPERM from a scanner holding the file, or a reader racing a writer
    }
  }
  return { active: null, dirty: false, testLock: [] };
}

export function saveState(root, state) {
  fs.mkdirSync(path.dirname(statePath(root)), { recursive: true });
  writeFileAtomic(statePath(root), JSON.stringify(state, null, 2) + '\n');
}

export function changeDir(root, cfg, id) {
  return path.join(root, cfg.artifactsDir, id);
}

// --- frontmatter (flat key: value only) ---------------------------------
export function readDoc(file) {
  if (!fs.existsSync(file)) return null;
  const text = readText(file);
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  const meta = {};
  if (m) {
    for (const line of m[1].split(/\r?\n/)) {
      const kv = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
      if (kv) meta[kv[1]] = kv[2].trim();
    }
  }
  return { meta, body: m ? text.slice(m[0].length) : text };
}

export function writeMeta(file, patch) {
  const doc = readDoc(file);
  if (!doc) throw new Error(`missing ${file}`);
  const meta = { ...doc.meta, ...patch };
  const fm = Object.entries(meta).map(([k, v]) => `${k}: ${v ?? ''}`).join('\n');
  writeFileAtomic(file, `---\n${fm}\n---\n${doc.body}`);
}

// --- paths & globs -------------------------------------------------------
// realpath of the nearest existing ancestor, plus the not-yet-created tail. Resolves macOS /var → /private/var,
// symlinks and Windows junctions, so a link to a protected path is judged by where it really points.
export function realish(p) {
  let head = path.resolve(p);
  const tail = [];
  for (;;) {
    try { return path.join(fs.realpathSync.native(head), ...tail.reverse()); }
    catch {
      const up = path.dirname(head);
      if (up === head) return path.resolve(p);
      tail.push(path.basename(head));
      head = up;
    }
  }
}

export function toRel(root, p) {
  if (!p) return null;
  return path.relative(realish(root), realish(path.resolve(root, p))).split(path.sep).join('/');
}

// NTFS opens `.env ` and `.env.` as `.env` (the Win32 API drops trailing dots and spaces) and `.env:x` as a stream of
// it. Reduce each name to the one the filesystem will open, so a guard matching `.env` also sees these.
export function ntfsPath(p) {
  // \\localhost\C$\dir is C:\dir (an admin share of this machine)
  p = p.replace(/^[\\/]{2}(?:localhost|127\.0\.0\.1)[\\/]([A-Za-z])\$(?=[\\/])/i, '$1:');
  return p.split(/[\\/]/).map((seg) => {
    if (seg === '' || seg === '.' || seg === '..' || /^[A-Za-z]:$/.test(seg)) return seg;
    const name = seg.replace(/:.*$/, '').replace(/[. ]+$/, '');
    return name || seg;
  }).join('/');
}

// Compare paths the way macOS (APFS: case-insensitive, NFD names) and Windows do.
export const foldPath = (p) => p.normalize('NFC').toLowerCase();

export function isInside(rel) {
  return rel && !rel.startsWith('../') && rel !== '..' && !path.isAbsolute(rel);
}

export function globToRegExp(glob) {
  let re = '';
  let braces = 0;
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '{') { braces++; re += '(?:'; continue; }
    if (c === '}' && braces) { braces--; re += ')'; continue; }
    if (c === ',' && braces) { re += '|'; continue; }
    if (c === '[') { // a character class, as ripgrep and gitignore read it: `.[e]nv` is `.env`
      const j = glob.indexOf(']', i + 2);
      if (j > 0) {
        const body = glob.slice(i + 1, j).replace(/^!/, '^').replace(/\\/g, '\\\\');
        // an invalid class (`[z-a]`) is matched literally, as a bracket in a file name, rather than throwing
        try { new RegExp(`[${body}]`); re += `[${body}]`; i = j; continue; } catch { /* fall through to the literal */ }
      }
    }
    if (c === '*') {
      if (glob[i + 1] === '*') {
        i++;
        if (glob[i + 1] === '/') { i++; re += '(?:.*/)?'; } else re += '.*';
      } else re += '[^/]*';
    } else if (c === '?') re += '[^/]';
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  // case-insensitive everywhere: Windows and default macOS volumes are, and over-blocking `.ENV` on Linux is harmless
  return new RegExp(`^${re}$`, 'i');
}

// gitignore-ish: a pattern without "/" matches the basename anywhere.
export function matchesAny(rel, globs = []) {
  if (!rel) return false;
  const norm = rel.normalize('NFC').split('\\').join('/');
  const base = norm.split('/').pop();
  return globs.some((g) => {
    const re = globToRegExp(g);
    return g.includes('/') ? re.test(norm) : re.test(base);
  });
}

export function gitUser(root) {
  try { return execFileSync('git', ['config', 'user.name'], { cwd: root, encoding: 'utf8' }).trim() || 'unknown'; }
  catch { return process.env.USER || process.env.USERNAME || 'unknown'; }
}

export function nowIso() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export async function readStdinJson({ strict = false } = {}) {
  let data = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) data += chunk;
  data = stripBom(data);
  try { return JSON.parse(data || '{}'); } catch { return strict ? { invalidInput: true } : {}; }
}

// A path or command fragment as one POSIX shell word, or a cmd.exe double-quoted word (null when cmd cannot
// quote it safely: %VAR% expands even inside quotes).
export function shellQuote(text, platform = process.platform) {
  if (platform === 'win32') return /[%"\r\n]/.test(text) ? null : `"${text}"`;
  return `'${text.replaceAll("'", `'\\''`)}'`;
}

// On Windows spawnSync's timeout kills only cmd.exe: the grandchild (eslint, cargo) keeps running and holds file
// locks. So a timed command runs under a small node runner that kills the whole tree (taskkill /T) on timeout.
// The runner's stdio is the caller's: the command writes straight into the pipes spawnSync is capturing.
const TREE_RUNNER = `
const { spawn, spawnSync } = require('node:child_process');
let timedOut = false;
const c = spawn(process.env.SDLC_CMD, { shell: true, stdio: 'inherit' });
const t = setTimeout(() => {
  timedOut = true;
  spawnSync('taskkill', ['/T', '/F', '/PID', String(c.pid)], { stdio: 'ignore' });
}, Number(process.env.SDLC_TIMEOUT));
c.on('error', (e) => { console.error(e.message); process.exit(1); });
c.on('close', (code) => {
  clearTimeout(t);
  if (timedOut) { console.error('\\ntimed out after ' + process.env.SDLC_TIMEOUT + ' ms'); process.exit(124); }
  process.exit(code ?? 1);
});`;

// cmd.exe cannot run `./gradlew test` (and a saved verify command is shared by every OS). Where a command starts
// with `./tool`, run `.\tool`, which cmd resolves to tool.bat / tool.cmd / tool.exe in that directory. (A bare
// `tool` would not do: with NoDefaultCurrentDirectoryInExePath set, cmd no longer searches the current directory.)
// Saved `vendor/bin/phpunit` and `bin/rails` entries (older detectors wrote them bare) are PHP/Ruby scripts that
// cmd cannot start by path: run them through their interpreter, as the detector does now.
export function windowsCmd(cmd) {
  return cmd
    .replace(/(^|&&\s*|\|\|\s*)\.\/([^\s&|"']+)/g, (_, lead, tool) => `${lead}.\\${tool.split('/').join('\\')}`)
    .replace(/(^|&&\s*|\|\|\s*)(vendor\/bin\/phpunit|bin\/rails)(?=\s|$)/g, (_, lead, tool) => `${lead}${tool === 'bin/rails' ? 'ruby' : 'php'} ${tool}`);
}

// spawnSync(cmd, { shell: true, ...opts }) whose timeout also kills the command's child processes.
export function spawnShell(cmd, opts = {}) {
  const { timeout, env, ...rest } = opts;
  if (process.platform === 'win32') cmd = windowsCmd(cmd);
  if (process.platform !== 'win32' || !timeout) return spawnSync(cmd, { shell: true, env, timeout, ...rest });
  return spawnSync(process.execPath, ['-e', TREE_RUNNER], {
    ...rest, env: { ...(env || process.env), SDLC_CMD: cmd, SDLC_TIMEOUT: String(timeout) }, timeout: timeout + 15000
  });
}

// Status of the active change's chain: what's approved and what comes next.
export function chainStatus(root, cfg, id) {
  const dir = changeDir(root, cfg, id);
  const docs = {};
  for (const s of [...STAGES, 'design', 'ui', 'verify', 'review']) docs[s] = readDoc(path.join(dir, `${s}.md`));
  const st = (s) => docs[s]?.meta.status || (docs[s] ? 'draft' : 'missing');
  const tier = docs.intent?.meta.tier || 'M';
  const needsSpec = tier !== 'S';
  let next;
  if (st('intent') === 'rejected') next = 'closed (intent rejected)';
  else if (st('intent') !== 'approved') next = 'intent';
  // tier L (or any change that opted in by creating design.md) needs an approved system design before the spec
  else if ((tier === 'L' || docs.design) && st('design') !== 'approved') next = 'design';
  // a change that opted into UI design (ui.md) needs the design direction approved before the spec
  else if (docs.ui && st('ui') !== 'approved') next = 'ui';
  else if (needsSpec && st('spec') !== 'approved') next = 'spec';
  else if (st('plan') !== 'approved') next = 'plan';
  else if (st('verify') !== 'passed') next = 'build';
  else if (tier !== 'S' && st('review') !== 'approved') next = 'review';
  else next = 'ship';
  const open = openItems(docs.intent?.body, 'Open questions').length + openItems(docs.spec?.body, 'Concerns').length;
  return { id, dir, tier, docs, open, status: Object.fromEntries(Object.keys(docs).map((k) => [k, st(k)])), next };
}

export function planApproved(root, cfg, id) {
  const plan = readDoc(path.join(changeDir(root, cfg, id), 'plan.md'));
  return plan?.meta.status === 'approved';
}

// --- gates: advisory → soft → hard ---------------------------------------
// off: skipped · advisory: reported, never blocks · soft: blocks unless `--override "<reason>"`
// (the reason is recorded in the artifact) · hard: blocks, no override.
export const GATE_LEVELS = ['off', 'advisory', 'soft', 'hard'];
export const DEFAULT_GATES = { ready: 'soft', independence: 'soft' };
export function gateLevel(cfg, name) {
  const v = cfg.gates?.[name];
  return GATE_LEVELS.includes(v) ? v : DEFAULT_GATES[name] || 'off';
}

// Cross-model review: for these tiers the reviewer must run on a different model than the implementer.
// `ladder` is the preference order the reviewer's model is picked from.
export function crossModelCfg(cfg) {
  return { tiers: ['L'], ladder: ['opus', 'sonnet'], ...(cfg.crossModelReview || {}) };
}

// --- definition of ready: no open questions at the intent → spec boundary --
// Items under the heading are open until ticked: `- [ ] question — owner` is open,
// `- [x] question → decision (by X)` is resolved. "None" and empty sections are ready.
const NONE_RE = /^(?:\[\s?\]\s*)?(?:none|n\/a|nothing|no (?:open )?(?:questions?|concerns?)|—|-)\.?$/i;
export function openItems(body, heading) {
  const lines = (body || '').replace(/<!--[\s\S]*?-->/g, '').split(/\r?\n/);
  const start = lines.findIndex((l) => new RegExp(`^##\\s+${heading}\\b`, 'i').test(l));
  if (start < 0) return [];
  const open = [];
  for (const line of lines.slice(start + 1)) {
    if (/^##\s/.test(line)) break;
    if (!line.trim() || /^\s/.test(line)) continue; // blank or continuation of a bullet
    const bullet = line.match(/^(?:[-*+]|\d+\.)\s+(.*)$/);
    const text = (bullet ? bullet[1] : line).trim();
    if (/^\[[xX]\]/.test(text) || NONE_RE.test(text)) continue;
    open.push(text.replace(/^\[\s?\]\s*/, ''));
  }
  return open;
}

// What stops `kind` (spec or plan) from being approved: unanswered questions in intent.md and,
// once a spec exists, unresolved Concerns in spec.md.
export function readinessProblems(root, cfg, id, kind) {
  const dir = changeDir(root, cfg, id);
  const intent = readDoc(path.join(dir, 'intent.md'));
  const spec = readDoc(path.join(dir, 'spec.md'));
  const out = openItems(intent?.body, 'Open questions').map((q) => `intent.md open question: ${q}`);
  if (kind === 'plan' && intent?.meta.tier === 'S') return out;
  out.push(...openItems(spec?.body, 'Concerns').map((q) => `spec.md concern: ${q}`));
  return out;
}
