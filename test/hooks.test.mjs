// PostToolUse (post-edit.mjs), Stop (stop-gate.mjs), SessionStart (session-start.mjs), and the
// hooks.json wiring that points Claude Code at them.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PLUGIN, makeRepo, hook, state, read } from './helpers.mjs';

describe('hooks.json', () => {
  const cfg = JSON.parse(fs.readFileSync(path.join(PLUGIN, 'hooks/hooks.json'), 'utf8'));
  const commands = Object.values(cfg.hooks).flat().flatMap((m) => m.hooks.map((h) => h.command));

  test('every hook command points at a script that exists', () => {
    assert.ok(commands.length >= 4);
    for (const cmd of commands) {
      const rel = cmd.match(/\$\{CLAUDE_PLUGIN_ROOT\}\/([^"\s]+)/)?.[1];
      assert.ok(rel, `no plugin-relative script in: ${cmd}`);
      assert.ok(fs.existsSync(path.join(PLUGIN, rel)), `${rel} does not exist`);
    }
  });

  test('the guard sees every tool that can read, write or run a command', () => {
    const matcher = cfg.hooks.PreToolUse.find((m) => m.hooks.some((h) => h.command.includes('guard.mjs'))).matcher;
    for (const tool of ['Read', 'Edit', 'Write', 'MultiEdit', 'NotebookEdit', 'Bash', 'PowerShell']) {
      assert.ok(new RegExp(`^(?:${matcher})$`).test(tool), `PreToolUse matcher misses ${tool}`);
    }
  });
});

describe('post-edit', () => {
  const edit = (dir, rel) => hook('post-edit.mjs', dir, { tool_name: 'Edit', tool_input: { file_path: path.join(dir, rel) } });

  test('an implementation edit marks the active change dirty', () => {
    const dir = makeRepo({ active: 'c1' });
    edit(dir, 'src/app.js');
    assert.equal(state(dir).dirty, true);
  });

  test('artifact and .sdlc edits do not', () => {
    const dir = makeRepo({ active: 'c1' });
    edit(dir, 'docs/sdlc/c1/plan.md');
    edit(dir, '.sdlc/config.json');
    assert.notEqual(state(dir).dirty, true);
  });

  test('formatOnEdit runs the matching formatter with the file path', () => {
    const dir = makeRepo({
      active: 'c1',
      config: { formatOnEdit: [{ glob: 'web/**/*.ts', cmd: 'node fmt.mjs {file}' }] },
      files: { 'fmt.mjs': "import fs from 'node:fs';\nfs.writeFileSync('formatted.txt', process.argv[2]);\n" }
    });
    edit(dir, 'api/main.go');
    assert.equal(fs.existsSync(path.join(dir, 'formatted.txt')), false, 'glob did not match, formatter must not run');
    edit(dir, 'web/src/app.ts');
    assert.equal(path.resolve(read(dir, 'formatted.txt')), path.join(dir, 'web/src/app.ts'));
  });
});

describe('stop-gate', () => {
  const stop = (dir, extra = {}) => hook('stop-gate.mjs', dir, { hook_event_name: 'Stop', ...extra }).json;

  test('unverified edits on the active change block the stop once', () => {
    const dir = makeRepo({ active: 'c1', state: { dirty: true } });
    const out = stop(dir);
    assert.equal(out?.decision, 'block');
    assert.match(out.reason, /not been verified/);
    assert.equal(stop(dir, { stop_hook_active: true }), null, 'must never loop');
  });

  test('clean, inactive, uninitialized or opted-out repos stop freely', () => {
    assert.equal(stop(makeRepo({ active: 'c1', state: { dirty: false } })), null);
    assert.equal(stop(makeRepo({ state: { dirty: true } })), null);
    assert.equal(stop(makeRepo({ init: false, active: 'c1', state: { dirty: true } })), null);
    assert.equal(stop(makeRepo({ active: 'c1', state: { dirty: true }, config: { requireVerifyOnStop: false } })), null);
  });
});

describe('session-start', () => {
  const start = (dir) => hook('session-start.mjs', dir, { hook_event_name: 'SessionStart' }).stdout;

  test('silent outside an ai-sdlc repo', () => {
    assert.equal(start(makeRepo({ init: false })), '');
  });

  test('points at the entry skills when nothing is active', () => {
    assert.match(start(makeRepo()), /No active change/);
  });

  test('re-hydrates the active change: next step, unverified edits, locked tests', () => {
    const dir = makeRepo({
      active: 'c1', state: { dirty: true, testLock: ['src/a.test.js'] },
      files: { 'docs/sdlc/c1/intent.md': '---\nstatus: approved\ntier: S\n---\n# Intent\n' }
    });
    const out = start(dir);
    assert.match(out, /Active change: c1 \(tier S\)/);
    assert.match(out, /Next step: plan/);
    assert.match(out, /Unverified edits/);
    assert.match(out, /src\/a\.test\.js/);
  });
});
