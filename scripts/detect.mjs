// Existing-project detection: which apps live where, which stack profile (if any) each matches,
// and verify commands built ONLY from what the project already defines, with its own package manager.
import fs from 'node:fs';
import path from 'node:path';

const SKIP = new Set(['node_modules', '.git', '.sdlc', 'docs', 'dist', 'build', 'out', 'target', 'vendor', 'coverage',
  '.nuxt', '.output', '.next', '.open-next', '.dart_tool', '.idea', '.vscode', '.github', '.claude', 'tmp', 'public', 'assets']);

const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } };
const readText = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch { return ''; } };

// The package manager is decided by the nearest lockfile / packageManager field, walking up to the repo root.
export function packageManager(root, dir) {
  for (let d = dir; ; d = path.dirname(d)) {
    const has = (n) => fs.existsSync(path.join(d, n));
    const pkg = readJson(path.join(d, 'package.json'));
    const declared = pkg?.packageManager?.split('@')[0];
    if (declared) return declared;
    if (has('pnpm-lock.yaml') || has('pnpm-workspace.yaml')) return 'pnpm';
    if (has('yarn.lock')) return 'yarn';
    if (has('bun.lockb') || has('bun.lock')) return 'bun';
    if (has('package-lock.json')) return 'npm';
    if (path.resolve(d) === path.resolve(root) || path.dirname(d) === d) return 'npm';
  }
}

function candidateDirs(root) {
  const dirs = ['.'];
  const kids = (rel) => {
    try {
      return fs.readdirSync(path.join(root, rel), { withFileTypes: true })
        .filter((e) => e.isDirectory() && !SKIP.has(e.name) && !e.name.startsWith('.'))
        .map((e) => (rel === '.' ? e.name : `${rel}/${e.name}`));
    } catch { return []; }
  };
  for (const k of kids('.')) {
    dirs.push(k);
    if (['apps', 'packages', 'services', 'clients'].includes(k)) dirs.push(...kids(k));
  }
  return dirs;
}

function classify(root, rel) {
  const abs = path.join(root, rel);
  const has = (n) => fs.existsSync(path.join(abs, n));
  const pkg = has('package.json') ? readJson(path.join(abs, 'package.json')) : null;
  const deps = { ...(pkg?.dependencies || {}), ...(pkg?.devDependencies || {}) };
  const wrangler = has('wrangler.toml') || has('wrangler.jsonc') || has('wrangler.json') || !!deps.wrangler || !!deps['@opennextjs/cloudflare'];

  if (has('src-tauri/tauri.conf.json') || has('src-tauri/Cargo.toml')) {
    return { kind: 'tauri', ui: deps.react ? 'react' : 'vue', profile: 'tauri', framework: deps.nuxt ? 'nuxt' : deps.react ? 'react' : deps.vue ? 'vue' : 'web' };
  }
  if (has('pubspec.yaml')) {
    const flutter = /\bflutter:\s*\n\s*sdk:\s*flutter/.test(readText(path.join(abs, 'pubspec.yaml')));
    return { kind: flutter ? 'flutter' : 'dart', profile: flutter ? 'flutter' : null };
  }
  if (pkg && (deps.nuxt || deps.next)) {
    const framework = deps.nuxt ? 'nuxt' : 'next';
    return { kind: framework, framework, ui: framework === 'nuxt' ? 'vue' : 'react', profile: wrangler ? 'edge-web' : 'bff-web', cloudflare: wrangler };
  }
  if (has('go.mod')) return { kind: 'go', profile: 'go-api' };
  if (pkg && rel !== '.' && !pkg.workspaces) return { kind: 'node', profile: null };
  if (has('Cargo.toml')) return { kind: 'rust', profile: null };
  if (has('pyproject.toml') || has('requirements.txt') || has('manage.py')) return { kind: 'python', profile: null };
  if (has('composer.json')) return { kind: 'php', profile: null };
  if (has('Gemfile')) return { kind: 'ruby', profile: null };
  if (has('pom.xml') || has('build.gradle') || has('build.gradle.kts')) return { kind: 'jvm', profile: null };
  if (pkg && rel === '.' && !pkg.workspaces) return { kind: 'node', profile: null };
  return null;
}

// Verify commands from the component's own definitions. Never invents a script that isn't there.
export function verifyFor(root, rel, kind, prefix) {
  const abs = path.join(root, rel);
  const has = (n) => fs.existsSync(path.join(abs, n));
  const cd = rel === '.' ? '' : `cd ${rel} && `;
  const name = (n) => (prefix ? `${prefix}-${n}` : n);
  const out = [];
  const mk = has('Makefile') ? readText(path.join(abs, 'Makefile')) : '';
  const makeTargets = ['typecheck', 'lint', 'build', 'test'].filter((t) => new RegExp(`^${t}\\s*:`, 'm').test(mk));
  if (makeTargets.length) return makeTargets.map((t) => ({ name: name(t), cmd: `${cd}make ${t}` }));

  if (has('package.json')) {
    const pkg = readJson(path.join(abs, 'package.json')) || {};
    const pm = packageManager(root, abs);
    const scripts = pkg.scripts || {};
    const pick = (...alts) => alts.find((s) => scripts[s] && !/no test specified/.test(scripts[s]));
    const run = (s) => (pm === 'npm' ? (s === 'test' ? 'npm test' : `npm run ${s}`) : `${pm} run ${s}`);
    const typecheck = pick('typecheck', 'type-check', 'check-types', 'tsc');
    const lint = pick('lint');
    const test = pick('test:unit', 'test');
    const build = pick('build');
    if (typecheck) out.push({ name: name('typecheck'), cmd: cd + run(typecheck) });
    if (lint) out.push({ name: name('lint'), cmd: cd + run(lint) });
    if (test) out.push({ name: name('test'), cmd: cd + (test === 'test' ? run('test') : run(test)) });
    if (build) out.push({ name: name('build'), cmd: cd + run(build) });
  }
  if (kind === 'tauri' && has('src-tauri/Cargo.toml')) {
    out.push({ name: name('clippy'), cmd: `cd ${rel === '.' ? '' : rel + '/'}src-tauri && cargo clippy --all-targets` });
    out.push({ name: name('rust-test'), cmd: `cd ${rel === '.' ? '' : rel + '/'}src-tauri && cargo test` });
  }
  if (kind === 'go') {
    out.push({ name: name('build'), cmd: `${cd}go build ./...` }, { name: name('vet'), cmd: `${cd}go vet ./...` });
    if (['.golangci.yml', '.golangci.yaml', '.golangci.toml', '.golangci.json'].some(has)) out.push({ name: name('lint'), cmd: `${cd}golangci-lint run` });
    out.push({ name: name('test'), cmd: `${cd}go test ./...` });
  }
  if (kind === 'flutter' || kind === 'dart') {
    const tool = kind === 'flutter' ? 'flutter' : 'dart';
    out.push({ name: name('analyze'), cmd: `${cd}${tool} analyze` });
    if (has('test')) out.push({ name: name('test'), cmd: `${cd}${tool} test` });
  }
  if (kind === 'rust') out.push({ name: name('build'), cmd: `${cd}cargo build` }, { name: name('test'), cmd: `${cd}cargo test` });
  if (kind === 'python') {
    const py = readText(path.join(abs, 'pyproject.toml'));
    if (/\[tool\.ruff/.test(py) || has('ruff.toml') || has('.ruff.toml')) out.push({ name: name('lint'), cmd: `${cd}ruff check .` });
    if (/\[tool\.mypy/.test(py) || has('mypy.ini')) out.push({ name: name('typecheck'), cmd: `${cd}mypy .` });
    if (has('manage.py')) out.push({ name: name('test'), cmd: `${cd}python manage.py test` });
    else if (has('tests') || has('test') || /pytest/.test(py)) out.push({ name: name('test'), cmd: `${cd}pytest -q` });
  }
  if (kind === 'php' && has('vendor/bin/phpunit')) out.push({ name: name('test'), cmd: `${cd}vendor/bin/phpunit` });
  if (kind === 'ruby') {
    if (has('bin/rails')) out.push({ name: name('test'), cmd: `${cd}bin/rails test` });
    else if (has('spec')) out.push({ name: name('test'), cmd: `${cd}bundle exec rspec` });
  }
  if (kind === 'jvm') out.push({ name: name('test'), cmd: has('gradlew') ? `${cd}./gradlew test` : has('mvnw') ? `${cd}./mvnw test` : `${cd}mvn test` });
  return out;
}

// Code present at all (beyond docs/config)? Used to tell "new app" from "existing project".
export function detectProject(root) {
  const apps = [];
  for (const rel of candidateDirs(root)) {
    const c = classify(root, rel);
    if (c) apps.push({ dir: rel, ...c });
  }
  // a plain root package.json is a workspace shell when sub-apps were found
  const filtered = apps.length > 1 ? apps.filter((a) => !(a.dir === '.' && a.kind === 'node')) : apps;
  const multi = filtered.length > 1;
  for (const a of filtered) {
    a.verify = verifyFor(root, a.dir, a.kind, multi ? (a.dir === '.' ? a.kind : path.basename(a.dir)) : null);
  }
  // root Makefile orchestrating everything wins over per-app commands
  const rootMake = verifyFor(root, '.', 'make', null).filter((v) => /make /.test(v.cmd));
  return { existing: filtered.length > 0, apps: filtered, rootMake };
}

export function detectedVerify(root) {
  const d = detectProject(root);
  if (d.rootMake.length) return d.rootMake;
  const seen = new Set();
  return d.apps.flatMap((a) => a.verify).filter((v) => (seen.has(v.name) ? false : seen.add(v.name)));
}

// Static prefix of a glob ("web/.nuxt/**" → "web/.nuxt"); "" when it starts with a wildcard.
export function globExists(root, glob) {
  const prefix = glob.split(/[*?{[]/)[0].replace(/\/$/, '');
  if (!prefix) return true; // suffix patterns like **/*.g.dart only ever match generated files
  return fs.existsSync(path.join(root, prefix));
}
