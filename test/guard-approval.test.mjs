// The approval gate (guard.mjs 2a / 4b): plan approval is a human act. It judges the file an edit would leave, not the
// edit's own text, and any shell write to a gated artifact asks.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { makeRepo, guard } from './helpers.mjs';

const decision = (dir, tool, input, env) => guard(dir, tool, input, env).decision;
const PLAN = 'docs/sdlc/c1/plan.md';

describe('file tools: the resulting file decides', () => {
  const dir = makeRepo({ active: 'c1', plan: 'draft' });
  const plan = path.join(dir, PLAN);

  test('a fragment that never says "status:" can still approve', () => {
    assert.equal(decision(dir, 'Edit', { file_path: plan, old_string: 'draft', new_string: 'approved' }), 'ask');
    assert.equal(decision(dir, 'Edit', { file_path: plan, old_string: 'status: draft', new_string: 'status: approved' }), 'ask');
    assert.equal(decision(dir, 'Edit', { file_path: plan, old_string: 'dra', new_string: 'approved-', replace_all: true }), 'allow', 'not the word approved');
  });

  test('two edits that add up to an approval', () => {
    const edits = [{ old_string: 'draft', new_string: 'appro' }, { old_string: 'appro', new_string: 'approved' }];
    assert.equal(decision(dir, 'MultiEdit', { file_path: plan, edits }), 'ask');
  });

  test('a Write of the whole file', () => {
    assert.equal(decision(dir, 'Write', { file_path: plan, content: '---\nstatus: approved\n---\n# Plan\n' }), 'ask');
    assert.equal(decision(dir, 'Write', { file_path: plan, content: '---\nstatus: draft\n---\n# Plan, revised\n' }), 'allow');
  });

  test('editing the body of a draft, or of an already approved plan, is not an approval', () => {
    assert.equal(decision(dir, 'Edit', { file_path: plan, old_string: '# Plan', new_string: '# Plan (v2)' }), 'allow');
    const approved = makeRepo({ active: 'c1', plan: 'approved' });
    assert.equal(decision(approved, 'Edit', { file_path: path.join(approved, PLAN), old_string: '# Plan', new_string: '# Plan (v2)' }), 'allow');
  });

  test('a person who set SDLC_APPROVER in the launching shell has approved; other stages are not gated by default', () => {
    assert.equal(decision(dir, 'Edit', { file_path: plan, old_string: 'draft', new_string: 'approved' }, { SDLC_APPROVER: 'tam' }), 'allow');
    const spec = path.join(dir, 'docs/sdlc/c1/spec.md');
    assert.equal(decision(dir, 'Write', { file_path: spec, content: '---\nstatus: approved\n---\n# Spec\n' }), 'allow');
  });
});

describe('the shell: any write to a gated artifact asks', () => {
  const dir = makeRepo({ active: 'c1', plan: 'draft' });
  const bash = (command) => decision(dir, 'Bash', { command });

  test('writers, whether or not the command says "approved"', () => {
    for (const c of ['sed -i s/draft/$s/ docs/sdlc/c1/plan.md', 'cp /tmp/x docs/sdlc/c1/plan.md', 'mv /tmp/x docs/sdlc/c1/plan.md',
      'echo x >> docs/sdlc/c1/plan.md', 'tee docs/sdlc/c1/plan.md < /tmp/x', `python3 -c "open('docs/sdlc/c1/plan.md','w').write('x')"`,
      `node -e "require('fs').writeFileSync('docs/sdlc/c1/plan.md','x')"`]) {
      assert.equal(bash(c), 'ask', c);
    }
    assert.equal(decision(dir, 'PowerShell', { command: "Set-Content docs\\sdlc\\c1\\plan.md 'x'" }), 'ask');
  });

  test('reading a plan is fine', () => {
    for (const c of ['cat docs/sdlc/c1/plan.md', 'grep -n Plan docs/sdlc/c1/plan.md', `node -e "console.log(require('fs').readFileSync('docs/sdlc/c1/plan.md','utf8'))"`,
      `python3 -c "print(open('docs/sdlc/c1/plan.md').read())"`]) {
      assert.equal(bash(c), 'allow', c);
    }
  });

  test('the CLI approval asks too', () => {
    assert.equal(bash('node scripts/sdlc.mjs approve plan'), 'ask');
    assert.equal(decision(dir, 'Bash', { command: 'node scripts/sdlc.mjs approve plan' }, { SDLC_APPROVER: 'tam' }), 'allow');
  });
});
