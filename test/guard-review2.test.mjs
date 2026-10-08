// Second adversarial review of scripts/guard.mjs: every case that returned the wrong decision before the fixes.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { makeRepo, guard } from './helpers.mjs';

const decision = (dir, tool, input, env) => guard(dir, tool, input, env).decision;
const bash = (dir, command, env) => decision(dir, 'Bash', { command }, env);
const gitRepo = (opts) => {
  const dir = makeRepo(opts);
  spawnSync('git', ['init', '-q'], { cwd: dir });
  return dir;
};
const timed = (fn) => { const t0 = Date.now(); const r = fn(); return { r, ms: Date.now() - t0 }; };

describe('a nested package does not move the guard', () => {
  const outer = makeRepo({
    config: { protectedPaths: ['gen/**'], secretPaths: ['.env', 'conf/prod.json', 'apps/web/conf/live.json'] },
    state: { testLock: ['tests/a.test.ts'] },
    files: { 'conf/prod.json': 'x', 'apps/web/conf/live.json': 'x', 'apps/web/conf/dev.json': 'x', 'tests/a.test.ts': 'x', 'src/app.ts': 'x' }
  });
  const inner = path.join(outer, 'apps/web');
  fs.mkdirSync(path.join(inner, '.git'), { recursive: true });
  fs.mkdirSync(path.join(inner, '.sdlc'), { recursive: true });
  fs.writeFileSync(path.join(inner, '.sdlc/config.json'), '{}');
  const env = { CLAUDE_PROJECT_DIR: outer };

  test('the session project config, protected paths and test lock still apply from inside it', () => {
    assert.equal(decision(inner, 'Write', { file_path: path.join(outer, '.sdlc/config.json'), content: '{}' }, env), 'ask');
    assert.equal(decision(inner, 'Edit', { file_path: '../../.sdlc/config.json', old_string: 'a', new_string: 'b' }, env), 'ask', 'a relative path means relative to the shell');
    assert.equal(decision(inner, 'Write', { file_path: path.join(outer, 'gen/a.ts'), content: '' }, env), 'deny');
    assert.equal(decision(inner, 'Edit', { file_path: path.join(outer, 'tests/a.test.ts'), old_string: 'a', new_string: 'b' }, env), 'deny');
    assert.equal(bash(inner, 'rm ../../tests/a.test.ts', env), 'deny');
  });

  test('its secretPaths apply too, relative to the session project', () => {
    assert.equal(decision(inner, 'Read', { file_path: path.join(inner, 'conf/live.json') }, env), 'deny');
    assert.equal(decision(inner, 'Read', { file_path: path.join(outer, 'conf/prod.json') }, env), 'deny');
    assert.equal(bash(inner, 'cat ../../conf/prod.json', env), 'deny');
    assert.equal(decision(inner, 'Read', { file_path: path.join(inner, 'conf/dev.json') }, env), 'allow');
  });

  test('started inside the package, the package config alone applies', () => {
    assert.equal(decision(inner, 'Read', { file_path: path.join(inner, 'conf/live.json') }, { CLAUDE_PROJECT_DIR: inner }), 'allow');
  });
});

describe('the guard stays within its time limit', () => {
  test('a ${- pile-up in a long command', () => {
    const { r, ms } = timed(() => bash(makeRepo({ files: { '.env': 'K=1' } }), '# ' + '${-'.repeat(6000) + '\ncat .env'));
    assert.ok(['deny', 'ask'].includes(r), r);
    assert.ok(ms < 5000, `${ms} ms`);
  });

  test('a wildcard with many stars against a file name made of a repeated letter', () => {
    const dir = makeRepo({ files: { ['a'.repeat(200)]: 'x', '.env': 'K=1' } });
    const { r, ms } = timed(() => bash(dir, 'ls *a*a*a*a*a*a*a*b; cat .env'));
    assert.equal(r, 'deny');
    assert.ok(ms < 5000, `${ms} ms`);
    assert.equal(bash(dir, 'ls *a*a*a*a*a*a*a*a*a*b'), 'ask', 'more than 8 stars asks');
  });

  test('many wildcard tokens in a big directory', () => {
    const files = Object.fromEntries(Array.from({ length: 1500 }, (_, i) => [`f${i}.txt`, 'x']));
    const dir = makeRepo({ files: { ...files, '.env': 'K=1' } });
    const { r, ms } = timed(() => bash(dir, 'ls ' + 'f* '.repeat(30) + '; cat ../.env'));
    assert.ok(['allow', 'deny', 'ask'].includes(r));
    assert.ok(ms < 6000, `${ms} ms`);
  });

  test('a recursive search over a few thousand files', () => {
    const files = Object.fromEntries(Array.from({ length: 3000 }, (_, i) => [`src/d${i % 30}/f${i}.ts`, 'x']));
    const dir = makeRepo({ files });
    const { r, ms } = timed(() => bash(dir, 'grep -rn foo .'));
    assert.equal(r, 'allow');
    assert.ok(ms < 6000, `${ms} ms`);
  });
});

describe('Grep: a glob overrides .gitignore', () => {
  const dir = gitRepo({ files: { '.gitignore': '.env\n', '.env': 'K=1', 'src/a.ts': 'x' } });
  const content = (extra) => decision(dir, 'Grep', { pattern: 'K', output_mode: 'content', ...extra });

  test('a catch-all or mixed glob reaches the ignored .env', () => {
    for (const glob of ['*', '**/*', '{*.ts,.env}', '*.{ts,env}']) assert.equal(content({ glob }), 'deny', glob);
  });

  test('without a glob, or with one that cannot reach it, ripgrep skips it', () => {
    assert.equal(content({}), 'allow');
    assert.equal(content({ glob: '*.ts' }), 'allow');
    assert.equal(content({ glob: '!*.md' }), 'allow');
  });
});

describe('recursive searches', () => {
  const dir = gitRepo({ files: { '.gitignore': '.env\n', '.env': 'K=1', 'src/a.ts': 'x' } });

  test('every spelling of grep -r, in any simple command', () => {
    for (const c of ['grep -rn K .', 'grep -rl K', 'grep -rE K', 'grep -Rn K', 'grep -ri K', 'grep -nr K .', 'grep --recursive K',
      'grep --directories=recurse K', 'grep -d recurse K .', 'echo hi; grep -r K', 'ack K', 'findstr /s K *']) {
      assert.equal(bash(dir, c), 'deny', c);
    }
  });

  test('rg reads ignored files only when told to', () => {
    for (const c of ['rg -uu K', 'rg -u K', 'rg --no-ignore --hidden K']) assert.equal(bash(dir, c), 'deny', c);
    assert.equal(bash(dir, 'rg K'), 'allow', 'ripgrep skips the ignored .env');
    assert.equal(bash(dir, 'rg K src'), 'allow');
  });

  test('PowerShell', () => {
    assert.equal(decision(dir, 'PowerShell', { command: 'sls K -Path . -Recurse' }), 'deny');
    assert.equal(decision(dir, 'PowerShell', { command: 'gci -Recurse | Select-String K' }), 'deny');
    assert.equal(decision(dir, 'PowerShell', { command: 'Select-String K src\\a.ts' }), 'allow');
  });

  test('a search of another directory, or with it excluded, is fine', () => {
    assert.equal(bash(dir, 'grep -rn K src'), 'allow');
    const nm = makeRepo({ files: { 'node_modules/p/test/cert.pem': 'x', 'node_modules/p/secrets/a.js': 'x', 'src/a.ts': 'x' } });
    assert.equal(bash(nm, 'grep -r foo . --exclude-dir=node_modules'), 'allow');
    assert.equal(bash(nm, 'grep -r foo node_modules'), 'allow', 'dependencies are not the project secrets');
  });
});

describe('wildcards in any segment', () => {
  const dir = makeRepo({ files: { 'secrets/db.json': 'x', 'src/a.ts': 'x' } });
  const home = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'ai-sdlc-home2-')));
  fs.mkdirSync(path.join(home, '.aws'), { recursive: true });
  fs.writeFileSync(path.join(home, '.aws/credentials'), 'x');
  const env = { HOME: home, USERPROFILE: home };

  test('a wildcard, class or brace in the directory part', () => {
    for (const c of ['cat sec*/db.json', 'cat se[c]rets/db.json', 'cat {secrets,x}/db.json', 'cat s?crets/db.json', 'cat */db.json']) {
      assert.equal(bash(dir, c), 'deny', c);
    }
    assert.equal(bash(dir, 'cat ~/.aw*/credentials', env), 'deny');
    assert.equal(bash(dir, 'cat ~/{.aws,x}/credentials', env), 'deny');
  });

  test('* does not match a leading dot, so listing is not a secret access', () => {
    const d = makeRepo({ files: { '.env': 'K=1', 'src/a.ts': 'x', 'README.md': 'x' } });
    for (const c of ['ls *', 'git add *', 'du -sh *', 'ls src/*', 'cat README.m*']) assert.equal(bash(d, c), 'allow', c);
    assert.equal(bash(d, 'ls .*'), 'deny', '.* does name .env');
    assert.equal(bash(d, 'cat .e*'), 'deny');
  });
});

describe('quote fragments and $-forms', () => {
  const dir = makeRepo({ files: { '.env': 'K=1' } });

  test('a name split by quotes or empty expansions', () => {
    for (const c of ['cat ".e"nv', "cat .e'n'v", 'cat .e$@nv', `cat "$PWD/.e"nv`, "cat $'\\x2eenv'", "cat $'\\056env'"]) {
      assert.equal(bash(dir, c), 'deny', c);
    }
  });
});

describe('git revisions', () => {
  const dir = makeRepo({ files: { 'src/app.ts': 'x' } });

  test('rev:path names a committed file that need not exist on disk', () => {
    for (const c of ['git show HEAD:secrets/db.json', 'git show :secrets/db.json', 'git cat-file -p HEAD:secrets/db.json', 'git show HEAD~1:.env']) {
      assert.equal(bash(dir, c), 'deny', c);
    }
  });

  test('ordinary revisions and URLs are fine', () => {
    for (const c of ['git show HEAD:README.md', 'git log -1', 'curl https://example.com/secrets/foo', 'git show HEAD:src/app.ts']) {
      assert.equal(bash(dir, c), 'allow', c);
    }
  });
});

describe('the guard files through the shell', () => {
  const dir = makeRepo({ files: { '.sdlc/stack.json': '{}' } });

  test('spellings that write, delete, move or enter .sdlc', () => {
    for (const c of ['cd .sdlc && echo {} > config.json', 'echo {} > .sdlc/./config.json', 'echo {} > .sdlc//config.json', 'rm -rf .sdlc', 'mv .sdlc x',
      'dd of=.sdlc/config.json', 'cp /tmp/x .sdl?/config.json', 'curl -o .sdlc/config.json http://x', 'vim .sdlc/config.json', 'install x .sdlc/config.json',
      `python3 -c "open('.sdlc/config.json','w').write('{}')"`]) {
      assert.equal(bash(dir, c), 'ask', c);
    }
    for (const c of ['sc .sdlc\\config.json x', 'Remove-Item .sdlc -Recurse', 'ni .sdlc\\local\\state.json', 'Set-Content .sdlc/config.json {}']) {
      assert.equal(decision(dir, 'PowerShell', { command: c }), 'ask', c);
    }
  });

  test('reading them is not a write', () => {
    for (const c of ['cat .sdlc/config.json 2>/dev/null', 'cat .sdlc/config.json 2>&1 | head', `node -p "require('./.sdlc/config.json').verify"`,
      'jq .verify .sdlc/config.json', `python3 -c "import json;print(json.load(open('.sdlc/config.json')))"`, 'ls .sdlc']) {
      assert.equal(bash(dir, c), 'allow', c);
    }
  });
});

describe('prose that is not a file access', () => {
  const dir = makeRepo({ files: { '.env': 'K=1', 'secrets/db.json': 'x', 'src/a.ts': 'x' } });

  test('echo arguments, find patterns and check-ignore', () => {
    for (const c of ['echo ".env" >> .gitignore', "echo '*.pem' >> .gitignore", 'git check-ignore .env', 'find . -name "*.pem"', 'find . -name ".env*" -print',
      'printf "%s\\n" .env >> .dockerignore']) {
      assert.equal(bash(dir, c), 'allow', c);
    }
  });

  test('but what echo is told to write to, or pipes on, still counts', () => {
    for (const c of ['echo A=1 > .env.production', 'echo .env | xargs cat', 'echo $(cat .env)', 'printf x >> .env']) assert.equal(bash(dir, c), 'deny', c);
  });

  test('dependency folders are not project secrets', () => {
    const nm = makeRepo({ files: { 'node_modules/foo/secrets/a.js': 'x', 'node_modules/p/test/cert.pem': 'x' } });
    assert.equal(decision(nm, 'Read', { file_path: path.join(nm, 'node_modules/foo/secrets/a.js') }), 'allow');
    assert.equal(bash(nm, 'cat node_modules/p/test/cert.pem'), 'allow');
  });
});

describe('the Windows shell cwd', () => {
  test('a relative path is relative to where the shell has cd\'d', () => {
    const dir = makeRepo({ files: { 'api/secrets/db.json': 'x', 'src/a.ts': 'x' } });
    const sub = path.join(dir, 'api');
    assert.equal(decision(sub, 'Read', { file_path: 'secrets/db.json' }, { CLAUDE_PROJECT_DIR: dir }), 'deny');
    assert.equal(bash(sub, 'cat secrets/db.json', { CLAUDE_PROJECT_DIR: dir }), 'deny');
  });
});
