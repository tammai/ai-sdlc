// The sdlc CLI (scripts/sdlc.mjs): chain order, definition-of-ready gate, verify evidence, test lock.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { makeRepo, sdlc, state, read, write, guard } from './helpers.mjs';
import { readDoc } from '../scripts/lib.mjs';

// An initialized repo with one active change; returns [dir, id].
function withChange(tier = 'M', config) {
  const dir = makeRepo({ init: false });
  assert.equal(sdlc(dir, ['init']).code, 0);
  if (config) {
    const file = path.join(dir, '.sdlc/config.json');
    fs.writeFileSync(file, JSON.stringify({ ...JSON.parse(fs.readFileSync(file, 'utf8')), ...config }));
  }
  const r = sdlc(dir, ['new', 'Add export', '--tier', tier]);
  assert.equal(r.code, 0, r.out);
  return [dir, JSON.parse(r.stdout).id];
}

// Replace a section of an artifact (keeps frontmatter and the other sections).
function setSection(dir, id, kind, heading, text) {
  const file = `docs/sdlc/${id}/${kind}.md`;
  const re = new RegExp(`(^##\\s+${heading}[^\\n]*\\n)[\\s\\S]*?(?=^##\\s|(?![\\s\\S]))`, 'm');
  write(dir, file, read(dir, file).replace(re, `$1${text}\n\n`));
}

describe('init and new', () => {
  test('init writes config and the artifact README; new activates the change', () => {
    const [dir, id] = withChange();
    assert.ok(fs.existsSync(path.join(dir, '.sdlc/config.json')));
    assert.ok(fs.existsSync(path.join(dir, 'docs/sdlc/README.md')));
    assert.equal(readDoc(path.join(dir, `docs/sdlc/${id}/intent.md`)).meta.status, 'draft');
    assert.equal(state(dir).active, id);
  });

  test('commands that need init refuse without it', () => {
    const r = sdlc(makeRepo({ init: false }), ['new', 'x']);
    assert.equal(r.code, 1);
    assert.match(r.out, /not initialized/);
  });
});

describe('chain order', () => {
  test('a stage cannot be approved before its prerequisites', () => {
    const [dir] = withChange('M');
    assert.equal(sdlc(dir, ['draft', 'spec']).code, 0);
    const r = sdlc(dir, ['approve', 'spec']);
    assert.equal(r.code, 1);
    assert.match(r.out, /intent not approved yet/);
  });

  test('review needs passed verification', () => {
    const [dir, id] = withChange('S');
    setSection(dir, id, 'intent', 'Open questions', '- None');
    for (const a of [['approve', 'intent'], ['draft', 'plan'], ['approve', 'plan'], ['draft', 'review']]) assert.equal(sdlc(dir, a).code, 0, a.join(' '));
    const r = sdlc(dir, ['approve', 'review']);
    assert.equal(r.code, 1);
    assert.match(r.out, /verification has not passed/);
  });
});

describe('definition-of-ready gate', () => {
  function readyToApproveSpec(config) {
    const [dir, id] = withChange('M', config);
    setSection(dir, id, 'intent', 'Open questions', '- [ ] who owns the export format? — PM');
    assert.equal(sdlc(dir, ['approve', 'intent']).code, 0);
    sdlc(dir, ['draft', 'spec']);
    setSection(dir, id, 'spec', 'Concerns', '- None');
    return [dir, id];
  }

  test('soft (default): open questions block approval', () => {
    const [dir] = readyToApproveSpec();
    const r = sdlc(dir, ['approve', 'spec']);
    assert.equal(r.code, 1);
    assert.match(r.out, /who owns the export format/);
  });

  test('soft: --override approves and records the reason', () => {
    const [dir, id] = readyToApproveSpec();
    assert.equal(sdlc(dir, ['approve', 'spec', '--override', 'PM is out, format agreed in standup']).code, 0);
    const meta = readDoc(path.join(dir, `docs/sdlc/${id}/spec.md`)).meta;
    assert.equal(meta.status, 'approved');
    assert.equal(meta.ready_override, 'PM is out, format agreed in standup');
  });

  test('hard: --override is not accepted; advisory only warns', () => {
    const [hard] = readyToApproveSpec({ gates: { ready: 'hard' } });
    assert.equal(sdlc(hard, ['approve', 'spec', '--override', 'x']).code, 1);
    const [adv] = readyToApproveSpec({ gates: { ready: 'advisory' } });
    assert.equal(sdlc(adv, ['approve', 'spec']).code, 0);
  });
});

describe('verify', () => {
  const ok = { name: 'ok', cmd: 'node -e "process.exit(0)"' };
  const bad = { name: 'bad', cmd: 'node -e "process.exit(3)"' };

  test('green: writes passed evidence and clears the dirty flag', () => {
    const dir = makeRepo({ active: 'c1', state: { dirty: true }, config: { verify: [ok] } });
    assert.equal(sdlc(dir, ['verify']).code, 0);
    assert.equal(readDoc(path.join(dir, 'docs/sdlc/c1/verify.md')).meta.status, 'passed');
    assert.equal(state(dir).dirty, false);
  });

  test('red: exits non-zero, records failed, keeps the change dirty', () => {
    const dir = makeRepo({ active: 'c1', state: { dirty: true }, config: { verify: [ok, bad] } });
    const r = sdlc(dir, ['verify']);
    assert.equal(r.code, 1);
    assert.match(r.out, /FAIL\s+bad/);
    assert.equal(readDoc(path.join(dir, 'docs/sdlc/c1/verify.md')).meta.status, 'failed');
    assert.equal(state(dir).dirty, true);
  });

  test('a known-red baseline check is reported, not enforced', () => {
    const dir = makeRepo({ active: 'c1', config: { verify: [ok, { ...bad, baseline: 'red' }] } });
    const r = sdlc(dir, ['verify']);
    assert.equal(r.code, 0);
    assert.match(r.out, /KNOWN-RED\s+bad/);
  });
});

describe('test lock', () => {
  test('lock-tests protects the test from the guard until unlock-tests', () => {
    const dir = makeRepo({ active: 'c1', plan: 'approved', files: { 'src/a.test.js': 'test()' } });
    const edit = () => guard(dir, 'Edit', { file_path: path.join(dir, 'src/a.test.js'), old_string: 'a', new_string: 'b' }).decision;
    assert.equal(sdlc(dir, ['lock-tests', 'src/a.test.js']).code, 0);
    assert.equal(edit(), 'deny');
    assert.equal(sdlc(dir, ['unlock-tests']).code, 0);
    assert.equal(edit(), 'allow');
  });

  test('a test must exist before it can be locked', () => {
    const r = sdlc(makeRepo(), ['lock-tests', 'src/missing.test.js']);
    assert.equal(r.code, 1);
    assert.match(r.out, /write the failing test first/);
  });
});
