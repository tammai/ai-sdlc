// Plugin packaging: skill frontmatter, generated agents in sync with agents-src, manifest version.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { PLUGIN } from './helpers.mjs';
import { readDoc } from '../scripts/lib.mjs';

const lf = (s) => s.replace(/\r\n/g, '\n');

describe('skills', () => {
  const dirs = fs.readdirSync(path.join(PLUGIN, 'skills'), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);

  test('every skill has a SKILL.md whose name matches its directory', () => {
    for (const name of dirs) {
      const doc = readDoc(path.join(PLUGIN, 'skills', name, 'SKILL.md'));
      assert.ok(doc, `skills/${name}/SKILL.md is missing`);
      assert.equal(doc.meta.name, name);
    }
  });

  test('every description says when to use it, within the listing budget', () => {
    for (const name of dirs) {
      const d = readDoc(path.join(PLUGIN, 'skills', name, 'SKILL.md')).meta.description || '';
      assert.ok(d.length >= 80, `${name}: description too thin to trigger on (${d.length} chars)`);
      assert.ok(d.length <= 1024, `${name}: description is ${d.length} chars (max 1024)`);
      assert.match(d, /\b(use (when|for|after|before|to)|required for|available for)\b/i, `${name}: description never says when to use it`);
      assert.ok(d.includes(`/ai-sdlc:${name}`), `${name}: description does not name its slash command /ai-sdlc:${name}`);
    }
  });
});

describe('agents', () => {
  test('agents/ is exactly what build-agents.mjs generates from agents-src/', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-sdlc-agents-'));
    try {
      fs.cpSync(path.join(PLUGIN, 'agents-src'), path.join(tmp, 'agents-src'), { recursive: true });
      fs.mkdirSync(path.join(tmp, 'scripts'));
      for (const f of ['build-agents.mjs', 'lib.mjs']) fs.copyFileSync(path.join(PLUGIN, 'scripts', f), path.join(tmp, 'scripts', f));
      const r = spawnSync(process.execPath, [path.join(tmp, 'scripts/build-agents.mjs')], { encoding: 'utf8' });
      assert.equal(r.status, 0, r.stderr);
      const want = fs.readdirSync(path.join(tmp, 'agents')).sort();
      assert.deepEqual(fs.readdirSync(path.join(PLUGIN, 'agents')).filter((f) => f.endsWith('.md')).sort(), want);
      for (const f of want) {
        assert.equal(lf(fs.readFileSync(path.join(PLUGIN, 'agents', f), 'utf8')), lf(fs.readFileSync(path.join(tmp, 'agents', f), 'utf8')),
          `agents/${f} is stale — run node scripts/build-agents.mjs`);
      }
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('manifest', () => {
  test('plugin.json and marketplace.json agree on the version', () => {
    const plugin = JSON.parse(fs.readFileSync(path.join(PLUGIN, '.claude-plugin/plugin.json'), 'utf8'));
    const market = JSON.parse(fs.readFileSync(path.join(PLUGIN, '.claude-plugin/marketplace.json'), 'utf8'));
    const entry = (market.plugins || []).find((p) => p.name === plugin.name);
    assert.ok(entry, `marketplace.json does not list ${plugin.name}`);
    if (entry.version) assert.equal(entry.version, plugin.version);
  });
});
