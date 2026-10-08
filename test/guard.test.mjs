// PreToolUse guard (scripts/guard.mjs): secrets, protected paths, test lock, plan gate, production gate.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { makeRepo, guard } from './helpers.mjs';

const f = (dir, rel) => path.join(dir, rel);

describe('secrets', () => {
  const dir = makeRepo({ files: { 'secrets/deploy': 'x' } });

  test('reading or writing a secret file is denied', () => {
    for (const rel of ['.env', '.env.local', 'certs/server.pem', 'id_rsa']) {
      assert.equal(guard(dir, 'Read', { file_path: f(dir, rel) }).decision, 'deny', rel);
    }
    assert.equal(guard(dir, 'Write', { file_path: f(dir, '.env'), content: 'A=1' }).decision, 'deny');
  });

  test('Grep on a secret file, or with a glob naming one, is denied', () => {
    assert.equal(guard(dir, 'Grep', { pattern: 'KEY', path: f(dir, '.env') }).decision, 'deny');
    assert.equal(guard(dir, 'Grep', { pattern: 'KEY', glob: '.env' }).decision, 'deny');
    assert.equal(guard(dir, 'Grep', { pattern: 'KEY', glob: '**/*.pem' }).decision, 'deny');
    assert.equal(guard(dir, 'Grep', { pattern: 'TODO', path: f(dir, 'src') }).decision, 'allow');
    assert.equal(guard(dir, 'Grep', { pattern: 'KEY', path: f(dir, '.env.example') }).decision, 'allow');
  });

  test('Grep over a directory of secrets, or with a glob that matches secret files, is denied', () => {
    const outside = path.join(os.tmpdir(), 'somebody', '.ssh');
    for (const input of [
      { pattern: 'PRIVATE', path: outside },
      { pattern: 'key', path: path.join(os.tmpdir(), 'somebody', '.aws') },
      { pattern: 'x', path: f(dir, 'secrets') },
      { pattern: 'KEY', glob: '.env*' },
      { pattern: 'KEY', glob: '*.{env,pem}' },
      { pattern: 'KEY', glob: '**/.env.local' }
    ]) assert.equal(guard(dir, 'Grep', input).decision, 'deny', JSON.stringify(input));
  });

  test('a directory-wide content Grep is denied while a non-ignored .env sits under it', () => {
    const git = makeRepo({ files: { '.env': 'KEY=1', 'src/app.ts': 'x', 'api/.env.local': 'K=2' } });
    spawnSync('git', ['init', '-q'], { cwd: git });
    const content = (extra) => guard(git, 'Grep', { pattern: 'KEY', output_mode: 'content', ...extra }).decision;
    assert.equal(content({}), 'deny', 'no path = the whole repo');
    assert.equal(content({ path: git }), 'deny');
    assert.equal(content({ path: f(git, 'api') }), 'deny', 'a subdirectory with a secret in it');
    assert.equal(content({ path: f(git, 'src') }), 'allow', 'a directory without one');
    assert.equal(content({ glob: '*.ts' }), 'allow', 'a glob that cannot reach it');
    assert.equal(guard(git, 'Grep', { pattern: 'KEY' }).decision, 'allow', 'files_with_matches prints names only');
    fs.writeFileSync(path.join(git, '.gitignore'), '.env*\n');
    assert.equal(content({}), 'allow', 'gitignored: ripgrep skips it too');
  });

  test('ordinary Grep calls are not blocked', () => {
    for (const input of [
      { pattern: 'x' },
      { pattern: 'x', path: dir },
      { pattern: 'x', path: f(dir, 'src') },
      { pattern: 'x', glob: '*.ts' },
      { pattern: 'x', glob: '**/*' },
      { pattern: 'x', glob: '!*.pem' },
      { pattern: 'x', glob: '.env.example' }
    ]) assert.equal(guard(dir, 'Grep', input).decision, 'allow', JSON.stringify(input));
  });

  test('example env files stay readable', () => {
    for (const rel of ['.env.example', '.env.sample', 'config.example.json']) {
      assert.equal(guard(dir, 'Read', { file_path: f(dir, rel) }).decision, 'allow', rel);
    }
  });

  test('secret-looking content is denied on every edit tool', () => {
    const key = 'AKIA' + 'ABCDEFGHIJKLMNOP';
    assert.equal(guard(dir, 'Write', { file_path: f(dir, 'src/a.js'), content: `const k = "${key}"` }).decision, 'deny');
    assert.equal(guard(dir, 'Edit', { file_path: f(dir, 'src/a.js'), old_string: 'x', new_string: '-----BEGIN RSA PRIVATE KEY-----' }).decision, 'deny');
    assert.equal(guard(dir, 'MultiEdit', { file_path: f(dir, 'src/a.js'), edits: [{ old_string: 'x', new_string: 'sk-ant-' + 'a'.repeat(30) }] }).decision, 'deny');
    assert.equal(guard(dir, 'Write', { file_path: f(dir, 'src/a.js'), content: 'const k = process.env.KEY' }).decision, 'allow');
  });

  test('shell commands that touch a secret file are denied', () => {
    assert.equal(guard(dir, 'Bash', { command: 'cat .env' }).decision, 'deny');
    assert.equal(guard(dir, 'Bash', { command: 'echo A=1 > .env.production' }).decision, 'deny');
    assert.equal(guard(dir, 'PowerShell', { command: 'Get-Content ~/.ssh/id_ed25519' }).decision, 'deny');
    assert.equal(guard(dir, 'Bash', { command: 'cat .env.example' }).decision, 'allow');
  });

  test('a quoted secret path with a space is denied as one path', () => {
    const spaced = makeRepo({ files: { 'secrets/my team/deploy': 'x' } });
    assert.equal(guard(spaced, 'Bash', { command: 'cat "secrets/my team/deploy"' }).decision, 'deny');
    assert.equal(guard(spaced, 'PowerShell', { command: "Get-Content 'secrets\\my team\\deploy'" }).decision, 'deny');
    assert.equal(guard(spaced, 'Bash', { command: 'cat "secrets/my team/other"' }).decision, 'allow');
  });

  test('a directory-style secret path is denied only when it exists', () => {
    assert.equal(guard(dir, 'Bash', { command: 'cat secrets/deploy' }).decision, 'deny');
    assert.equal(guard(dir, 'Bash', { command: 'grep -r token D1/secrets/nothing' }).decision, 'allow');
  });

  test('prose in commit messages and heredoc bodies is not a file access', () => {
    assert.equal(guard(dir, 'Bash', { command: 'git commit -m "never commit .env files"' }).decision, 'allow');
    assert.equal(guard(dir, 'Bash', { command: "cat <<'EOF' > notes.md\nKeep .env out of git\nEOF" }).decision, 'allow');
    // the heredoc header still counts: it holds the redirect
    assert.equal(guard(dir, 'Bash', { command: 'cat <<EOF > .env\nA=1\nEOF' }).decision, 'deny');
  });
});

describe('protected paths', () => {
  test('edits to protectedPaths are denied, reads are not', () => {
    const dir = makeRepo({ config: { protectedPaths: ['gen/**'] } });
    assert.equal(guard(dir, 'Write', { file_path: f(dir, 'gen/api.ts'), content: '' }).decision, 'deny');
    assert.equal(guard(dir, 'Read', { file_path: f(dir, 'gen/api.ts') }).decision, 'allow');
    assert.equal(guard(dir, 'Write', { file_path: f(dir, 'src/api.ts'), content: '' }).decision, 'allow');
  });
});

describe('test lock', () => {
  const dir = makeRepo({ state: { testLock: ['src/a.test.js'] } });

  test('editing a locked test is denied', () => {
    const r = guard(dir, 'Edit', { file_path: f(dir, 'src/a.test.js'), old_string: 'a', new_string: 'b' });
    assert.equal(r.decision, 'deny');
    assert.match(r.reason, /locked/);
    assert.equal(guard(dir, 'Edit', { file_path: f(dir, 'src/b.test.js'), old_string: 'a', new_string: 'b' }).decision, 'allow');
  });

  test('destructive shell commands against a locked test are denied', () => {
    assert.equal(guard(dir, 'Bash', { command: 'rm src/a.test.js' }).decision, 'deny');
    assert.equal(guard(dir, 'Bash', { command: 'git checkout -- src/a.test.js' }).decision, 'deny');
    assert.equal(guard(dir, 'PowerShell', { command: 'Remove-Item src\\a.test.js' }).decision, 'deny');
    assert.equal(guard(dir, 'Bash', { command: 'cat src/a.test.js' }).decision, 'allow');
  });
});

describe('plan gate', () => {
  const edit = (dir, rel) => guard(dir, 'Write', { file_path: f(dir, rel), content: 'x' });

  test('no approved plan: implementation edits are denied', () => {
    const dir = makeRepo({ active: 'c1', plan: 'draft' });
    const r = edit(dir, 'src/app.js');
    assert.equal(r.decision, 'deny');
    assert.match(r.reason, /No approved plan/);
    assert.equal(edit(makeRepo({ active: 'c1' }), 'src/app.js').decision, 'deny', 'no plan.md at all');
  });

  test('the artifact chain and .sdlc stay editable without a plan', () => {
    const dir = makeRepo({ active: 'c1' });
    assert.equal(edit(dir, 'docs/sdlc/c1/plan.md').decision, 'allow');
    assert.equal(edit(dir, '.sdlc/stack.json').decision, 'allow');
    assert.equal(edit(dir, '.sdlc/config.json').decision, 'ask', 'the guard config needs a person');
  });

  test('alwaysEditable and the fix-mode reproducing test are exempt', () => {
    assert.equal(edit(makeRepo({ active: 'c1', config: { alwaysEditable: ['README.md'] } }), 'README.md').decision, 'allow');
    const fix = makeRepo({ active: 'c1', state: { fixMode: true } });
    assert.equal(edit(fix, 'src/app.test.js').decision, 'allow');
    assert.equal(edit(fix, 'src/app.js').decision, 'deny');
  });

  test('an approved plan opens the gate', () => {
    assert.equal(edit(makeRepo({ active: 'c1', plan: 'approved' }), 'src/app.js').decision, 'allow');
  });

  test('the gate is off without an active change, an initialized repo, or enforcePlan', () => {
    assert.equal(edit(makeRepo(), 'src/app.js').decision, 'allow');
    assert.equal(edit(makeRepo({ init: false, active: 'c1' }), 'src/app.js').decision, 'allow');
    assert.equal(edit(makeRepo({ active: 'c1', config: { enforcePlan: false } }), 'src/app.js').decision, 'allow');
  });
});

describe('production gate', () => {
  const dir = makeRepo();
  const bash = (d, command, env) => guard(d, 'Bash', { command }, env).decision;

  test('release-boundary commands ask for a human', () => {
    for (const cmd of ['npx wrangler deploy', 'git push origin main', 'git push -f origin feat', 'npm publish', 'terraform apply']) {
      assert.equal(bash(dir, cmd), 'ask', cmd);
    }
  });

  test('non-production commands pass', () => {
    for (const cmd of ['npx wrangler deploy --env staging', 'git push origin feat/x', 'npm test', 'terraform plan']) {
      assert.equal(bash(dir, cmd), 'allow', cmd);
    }
  });

  test('prodGate "deny" blocks, RELEASE_APPROVAL lets it through', () => {
    const strict = makeRepo({ config: { prodGate: 'deny' } });
    assert.equal(bash(strict, 'npm publish'), 'deny');
    assert.equal(bash(strict, 'npm publish', { RELEASE_APPROVAL: 'REL-42 by Tam' }), 'allow');
  });

  test('stack profile patterns (prodPatternsExtra) are enforced', () => {
    // regression: v0.6.0 Expo patterns were JSON-mangled and never matched (5a9f55e)
    const expo = makeRepo({ config: { prodPatternsExtra: ['\\beas\\s+submit\\b', '\\beas\\s+build\\b.*--auto-submit'] } });
    assert.equal(bash(expo, 'npx eas submit -p ios'), 'ask');
    assert.equal(bash(expo, 'eas build --platform all --auto-submit'), 'ask');
    assert.equal(bash(expo, 'eas build --platform ios'), 'allow');
  });
});
