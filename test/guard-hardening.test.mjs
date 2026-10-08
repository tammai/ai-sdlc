// Bypasses found by an adversarial review of scripts/guard.mjs: each case below returned `allow` before the fix.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { makeRepo, guard } from './helpers.mjs';

const f = (dir, rel) => path.join(dir, rel);
const decision = (dir, tool, input, env) => guard(dir, tool, input, env).decision;

// a fake home directory outside the repo, with the files a thief would want
function fakeHome() {
  const home = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'ai-sdlc-home-')));
  for (const rel of ['.aws/credentials', '.ssh/id_ecdsa', '.ssh/config']) {
    fs.mkdirSync(path.dirname(path.join(home, rel)), { recursive: true });
    fs.writeFileSync(path.join(home, rel), 'x');
  }
  return home;
}

describe('the guard cannot be switched off from inside the session', () => {
  const dir = makeRepo({ files: { '.sdlc/stack.json': '{}' } });

  test('editing the guard config or state asks a person', () => {
    for (const rel of ['.sdlc/config.json', '.sdlc/local/state.json']) {
      assert.equal(decision(dir, 'Write', { file_path: f(dir, rel), content: '{"secretPaths":[]}' }), 'ask', rel);
      assert.equal(decision(dir, 'Edit', { file_path: f(dir, rel), old_string: 'a', new_string: 'b' }), 'ask', rel);
    }
    assert.equal(decision(dir, 'Bash', { command: 'echo {"secretPaths":[]} > .sdlc/config.json' }), 'ask');
    assert.equal(decision(dir, 'PowerShell', { command: "Set-Content .sdlc\\config.json '{}'" }), 'ask');
    assert.equal(decision(dir, 'Bash', { command: `node -e "require('fs').writeFileSync('.sdlc/config.json','{}')"` }), 'ask');
  });

  test('reading them, and editing other .sdlc files, is fine', () => {
    assert.equal(decision(dir, 'Read', { file_path: f(dir, '.sdlc/config.json') }), 'allow');
    assert.equal(decision(dir, 'Bash', { command: 'cat .sdlc/config.json' }), 'allow');
    assert.equal(decision(dir, 'Write', { file_path: f(dir, '.sdlc/stack.json'), content: '{}' }), 'allow');
  });
});

describe('shell spellings of a secret file', () => {
  const dir = makeRepo({ files: { '.env': 'K=1', 'src/app.ts': 'x' } });

  test('quotes, escapes, wildcards, braces and defaults that still name .env', () => {
    for (const command of [
      'cat .en""v', 'cat .e*', 'cat .e\\nv', 'cat .env{,}', 'cat ${x:-.env}', 'cat .[e]nv', 'cat .en?',
      'echo -m "$(cat .env)"', 'cat <<EOF\n$(cat .env)\nEOF', 'echo "<<X"\ncat .env\nX'
    ]) assert.equal(decision(dir, 'Bash', { command }), 'deny', command);
    for (const command of ['gc (".en"+"v")', 'gc .en?', 'Write-Output @"\n$(gc .env)\n"@']) {
      assert.equal(decision(dir, 'PowerShell', { command }), 'deny', command);
    }
  });

  test('prose and ordinary commands still pass', () => {
    for (const command of ['cat src/app.ts', 'ls src/*', 'git commit -m "never commit .env"', "cat <<'EOF' > notes.md\nKeep .env out of git\nEOF", 'cat .gitignore*']) {
      assert.equal(decision(dir, 'Bash', { command }), 'allow', command);
    }
  });

  test('git show REV:.env and a recursive grep over a tree holding one', () => {
    assert.equal(decision(dir, 'Bash', { command: 'git show HEAD:.env' }), 'deny');
    assert.equal(decision(dir, 'Bash', { command: 'git show :.env' }), 'deny');
    assert.equal(decision(dir, 'Bash', { command: 'grep -r K .' }), 'deny');
    assert.equal(decision(dir, 'Bash', { command: 'grep -rn K src' }), 'allow');
  });

  test('a directory of secrets and a wildcard into it', () => {
    const d = makeRepo({ files: { 'secrets/db.json': 'x', 'src/a.ts': 'x' } });
    assert.equal(decision(d, 'Bash', { command: 'cat secrets/*' }), 'deny');
    assert.equal(decision(d, 'Bash', { command: 'cat secrets/d?.json' }), 'deny');
    assert.equal(decision(d, 'Bash', { command: 'cd secrets && cat db.json' }), 'deny');
    assert.equal(decision(d, 'Bash', { command: 'cat src/*' }), 'allow');
  });
});

describe('secrets outside the repository', () => {
  const dir = makeRepo();
  const home = fakeHome();
  const env = { HOME: home, USERPROFILE: home };

  test('file tools match every trailing sub-path, not just the file name', () => {
    for (const rel of ['.aws/credentials', '.ssh/config', '.ssh/id_ecdsa']) {
      assert.equal(decision(dir, 'Read', { file_path: path.join(home, rel) }, env), 'deny', rel);
    }
    assert.equal(decision(dir, 'Write', { file_path: path.join(home, '.ssh/authorized_keys'), content: 'k' }, env), 'deny');
    assert.equal(decision(dir, 'Read', { file_path: path.join(home, 'notes.txt') }, env), 'allow');
  });

  test('a UNC admin share of this machine reaches the same file', { skip: process.platform !== 'win32' }, () => {
    const d = makeRepo({ files: { 'secrets/db.json': 'x' } });
    const unc = `\\\\localhost\\${d[0]}$${d.slice(2)}\\secrets\\db.json`;
    assert.equal(decision(d, 'Read', { file_path: unc }), 'deny');
  });

  test('$HOME written in the command, with or without quotes', () => {
    assert.equal(decision(dir, 'Bash', { command: 'cat "$HOME"/.aws/credentials' }, env), 'deny');
    assert.equal(decision(dir, 'Bash', { command: 'cat ${HOME}/.ssh/id_ecdsa' }, env), 'deny');
    assert.equal(decision(dir, 'Bash', { command: 'cd ~/.aws && cat credentials' }, env), 'deny');
    assert.equal(decision(dir, 'PowerShell', { command: 'gc $env:USERPROFILE\\.aws\\credentials' }, env), 'deny');
  });

  test('a content Grep over the home directory', () => {
    assert.equal(decision(dir, 'Grep', { pattern: 'K', path: home, output_mode: 'content' }, env), 'deny');
    assert.equal(decision(dir, 'Grep', { pattern: 'K', path: home }, env), 'allow', 'names only');
  });
});

describe('the guard stays inside its time limit', () => {
  const dir = makeRepo({ files: { '.env': 'K=1' } });
  const timed = (fn) => { const t0 = Date.now(); const r = fn(); return { r, ms: Date.now() - t0 }; };

  test('a pathological glob or a huge command asks instead of grinding', () => {
    const glob = '{,}'.repeat(26) + '.env';
    const a = timed(() => decision(dir, 'Grep', { pattern: 'K', path: dir, output_mode: 'content', glob }));
    assert.equal(a.r, 'ask');
    assert.ok(a.ms < 5000, `${a.ms} ms`);
    const b = timed(() => decision(dir, 'Bash', { command: '<<A\n'.repeat(40000) + 'cat .env' }));
    assert.equal(b.r, 'ask');
    assert.ok(b.ms < 5000, `${b.ms} ms`);
  });
});

describe('Grep tool corner cases', () => {
  test('a character-class glob and a repo that is not a git repo', () => {
    const dir = makeRepo({ files: { '.env': 'K=1', 'src/a.ts': 'x' } }); // .git is an empty directory: git fails
    for (const glob of ['.e[n]v', '.[e]nv', '.en?']) {
      assert.equal(decision(dir, 'Grep', { pattern: 'K', glob, output_mode: 'content' }), 'deny', glob);
    }
    assert.equal(decision(dir, 'Grep', { pattern: 'K', output_mode: 'content' }), 'deny', 'no git: the tree is walked');
    assert.equal(decision(dir, 'Grep', { pattern: 'K', path: f(dir, 'src'), output_mode: 'content' }), 'allow');
    // a malformed class must not crash the guard (a crash exits non-zero, which Claude Code lets through)
    for (const glob of ['[z-a].env', '[].env', '[!].env', '[\\]x']) {
      assert.doesNotThrow(() => decision(dir, 'Grep', { pattern: 'K', glob, output_mode: 'content' }), glob);
    }
    const git = makeRepo({ files: { '.env': 'K=1' } });
    spawnSync('git', ['init', '-q'], { cwd: git });
    assert.equal(decision(git, 'Grep', { pattern: 'K', glob: '*.ts .env' }), 'deny', 'several patterns in one glob');
  });
});

describe('what the example allow-list lets through', () => {
  const dir = makeRepo();
  test('an .example. file is allowed only for config-like extensions', () => {
    assert.equal(decision(dir, 'Read', { file_path: f(dir, 'config.example.json') }), 'allow');
    assert.equal(decision(dir, 'Read', { file_path: f(dir, '.env.example') }), 'allow');
    for (const rel of ['www.example.com.key', 'api.example.com.pem']) {
      assert.equal(decision(dir, 'Read', { file_path: f(dir, rel) }), 'deny', rel);
    }
    assert.equal(decision(dir, 'Bash', { command: 'cat api.example.com.pem' }), 'deny');
  });
});
