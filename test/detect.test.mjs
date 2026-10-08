import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo } from './helpers.mjs';
import { detectedVerify } from '../scripts/detect.mjs';

test('tauri app: src-tauri is not detected twice, clippy denies warnings', () => {
  const dir = makeRepo({ init: false, files: {
    'package.json': JSON.stringify({ scripts: { build: 'vite build' } }),
    'src-tauri/tauri.conf.json': '{}',
    'src-tauri/Cargo.toml': '[package]\nname = "app"\n',
  } });
  const cmds = detectedVerify(dir).map((v) => v.cmd);
  assert.deepEqual(cmds.filter((c) => c.includes('cargo test')), ['cd src-tauri && cargo test']);
  assert.ok(!cmds.some((c) => c.includes('cargo build')));
  assert.ok(cmds.includes('cd src-tauri && cargo clippy --all-targets -- -D warnings'));
  assert.equal(new Set(cmds).size, cmds.length);
});
