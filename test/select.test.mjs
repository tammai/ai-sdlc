// test/select.mjs: changed paths → eval tags, and that every tag it can emit names a real case.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PLUGIN } from './helpers.mjs';
import { evalTags } from './select.mjs';

const tags = (...files) => { const t = evalTags(files); return t && [...t].sort(); };

test('a skill change runs its trigger case and the negative case', () => {
  assert.deepEqual(tags('skills/fix/SKILL.md'), ['negative', 'skill-fix']);
  assert.deepEqual(tags('skills/stack/profiles.json', 'skills/stack/SKILL.md'), ['negative', 'skill-stack']);
});

test('hook scripts and hooks.json map to the hook cases', () => {
  assert.deepEqual(tags('scripts/guard.mjs'), ['guard']);
  assert.deepEqual(tags('scripts/stop-gate.mjs', 'scripts/post-edit.mjs'), ['post-edit', 'stop-gate']);
  assert.deepEqual(tags('hooks/hooks.json'), ['hooks']);
});

test('an edited eval case runs itself', () => {
  assert.deepEqual(tags('evals/hook-secrets/prompt.md'), ['hook-secrets']);
  assert.deepEqual(tags('evals/results/2026-10-08/report.html'), [], 'run output is not a case');
});

test('docs, templates, tests and agents need no eval run', () => {
  assert.deepEqual(tags('README.md', 'templates/apps/go-api/app/main.go', 'test/guard.test.mjs', 'agents-src/reviewer.md', 'docs/x.md', '.claude/CLAUDE.md'), []);
});

test('shared code, the manifest and unknown paths run everything', () => {
  assert.equal(tags('scripts/lib.mjs'), null);
  assert.equal(tags('scripts/sdlc.mjs'), null);
  assert.equal(tags('.claude-plugin/plugin.json'), null);
  assert.equal(tags('evals/_fixtures/app-repo.sh'), null, 'a shared fixture can move any case that uses it');
  assert.equal(tags('skills/fix/SKILL.md', 'something/new.txt'), null);
});

test('cases that copy a shared fixture still match it', () => {
  // eval cases can't reference files outside their directory, so fixtures are copied in
  const fixtures = path.join(PLUGIN, 'evals/_fixtures');
  const copies = new Map(fs.readdirSync(fixtures).map((f) => [fs.readFileSync(path.join(fixtures, f), 'utf8').replace(/\r\n/g, '\n'), f]));
  for (const d of fs.readdirSync(path.join(PLUGIN, 'evals'))) {
    const file = path.join(PLUGIN, 'evals', d, 'scaffold.sh');
    if (!d.includes('-hard-') || !fs.existsSync(file)) continue;
    assert.ok(copies.has(fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n')), `evals/${d}/scaffold.sh drifted from evals/_fixtures/ — copy it again`);
  }
});

test('every tag the selector can emit is declared by at least one eval case', () => {
  const declared = new Set();
  for (const d of fs.readdirSync(path.join(PLUGIN, 'evals'), { withFileTypes: true })) {
    const file = path.join(PLUGIN, 'evals', d.name, 'prompt.md');
    if (!d.isDirectory() || !fs.existsSync(file)) continue;
    const t = fs.readFileSync(file, 'utf8').match(/^tags:\s*\[(.*)\]\s*$/m)?.[1];
    assert.ok(t, `evals/${d.name}/prompt.md has no tags`);
    const list = t.split(',').map((s) => s.trim());
    assert.ok(list.includes(d.name), `evals/${d.name} must be tagged with its own name`);
    list.forEach((x) => declared.add(x));
  }
  const skills = fs.readdirSync(path.join(PLUGIN, 'skills')).map((s) => `skill-${s}`);
  for (const t of [...skills, 'negative', 'hooks', 'guard', 'stop-gate', 'post-edit', 'session-start']) {
    assert.ok(declared.has(t), `no eval case is tagged "${t}" — a change there would silently run nothing`);
  }
});
