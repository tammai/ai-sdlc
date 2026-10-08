// An edit to .sdlc/config.json asks only when it would weaken the guard: setup and the stack skills edit this file all the time
// (verify, formatOnEdit, presets), and a prompt on each would break them, in a headless run outright.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { makeRepo, guard } from './helpers.mjs';

const decision = (dir, tool, input) => guard(dir, tool, input).decision;
const CONFIG = '.sdlc/config.json';

describe('edits to .sdlc/config.json', () => {
  const base = {
    verify: [{ name: 'test', cmd: 'npm test' }],
    secretPaths: ['.env', '*.pem', 'vault/**'],
    protectedPaths: ['gen/**'],
    secretAllow: ['.env.example'],
    approvalGate: ['plan'],
    formatOnEdit: null
  };
  const dir = makeRepo({ config: base });
  const file = path.join(dir, CONFIG);
  const write = (patch) => decision(dir, 'Write', { file_path: file, content: JSON.stringify({ ...base, ...patch }, null, 2) });

  test('the everyday edits go through', () => {
    assert.equal(write({ verify: [{ name: 'test', cmd: 'pnpm test' }, { name: 'lint', cmd: 'pnpm lint' }] }), 'allow', 'verify');
    assert.equal(write({ formatOnEdit: 'prettier --write {file}' }), 'allow', 'formatOnEdit');
    assert.equal(write({ secretPaths: [...base.secretPaths, 'keys/**'] }), 'allow', 'a secret path added');
    assert.equal(write({ protectedPaths: [...base.protectedPaths, 'dist/**'] }), 'allow', 'a protected path added');
    assert.equal(write({ secretAllow: [] }), 'allow', 'an allowance removed');
    assert.equal(write({}), 'allow', 'unchanged');
    assert.equal(decision(dir, 'Edit', { file_path: file, old_string: '"npm test"', new_string: '"npm run test"' }), 'allow', 'an Edit of a verify command');
    assert.equal(decision(dir, 'MultiEdit', { file_path: file, edits: [{ old_string: '"npm test"', new_string: '"vitest"' }] }), 'allow');
  });

  test('anything that weakens the guard asks', () => {
    const weakening = {
      'a secret path dropped': { secretPaths: ['.env', '*.pem'] },
      'secretPaths emptied': { secretPaths: [] },
      'a protected path dropped': { protectedPaths: [] },
      'a new allowance': { secretAllow: [...base.secretAllow, '*'] },
      'the approval gate emptied': { approvalGate: [] },
      'the plan gate off': { enforcePlan: false },
      'the stop gate off': { requireVerifyOnStop: false },
      'the artifacts moved': { artifactsDir: 'elsewhere' },
      'a new always-editable path': { alwaysEditable: ['src/**'] },
      'a production pattern dropped': { prodPatterns: ['kubectl\\s+apply'] }
    };
    for (const [what, patch] of Object.entries(weakening)) assert.equal(write(patch), 'ask', what);
  });

  test('an Edit that makes the file unparseable asks (it would silently fall back to the defaults)', () => {
    assert.equal(decision(dir, 'Edit', { file_path: file, old_string: '"verify"', new_string: 'verify' }), 'ask');
    assert.equal(decision(dir, 'Write', { file_path: file, content: '{ not json' }), 'ask');
    assert.equal(decision(dir, 'Write', { file_path: file, content: '[]' }), 'ask');
  });

  test('a Write that drops a secret path the file never named is judged against the defaults', () => {
    const bare = makeRepo({ config: {} });
    const target = path.join(bare, CONFIG);
    assert.equal(decision(bare, 'Write', { file_path: target, content: '{"verify":[]}' }), 'allow', 'defaults unchanged');
    assert.equal(decision(bare, 'Write', { file_path: target, content: '{"secretPaths":[]}' }), 'ask', 'the default list emptied');
    assert.equal(decision(bare, 'Write', { file_path: target, content: '{"secretPaths":[".env"]}' }), 'ask', 'the default list cut down');
  });

  test('the shell and the state file still ask', () => {
    assert.equal(decision(dir, 'Bash', { command: 'echo {} > .sdlc/config.json' }), 'ask');
    assert.equal(decision(dir, 'Write', { file_path: path.join(dir, '.sdlc/local/state.json'), content: '{}' }), 'ask');
  });
});
