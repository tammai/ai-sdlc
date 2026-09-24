// Drives hook.mjs the way Claude Code does: a JSON payload on stdin, a verdict on stdout.
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'

const HOOK = fileURLToPath(new URL('../hook.mjs', import.meta.url))
let dir

function run(mode, tool_name, tool_input, env = {}) {
  const res = spawnSync(process.execPath, [HOOK, mode], {
    input: JSON.stringify({ tool_name, tool_input, cwd: dir }),
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_PROJECT_DIR: dir, RISK_TIER_ROLE: '', ...env },
  })
  assert.equal(res.status, 0, res.stderr)
  return res.stdout ? JSON.parse(res.stdout).hookSpecificOutput : null
}
const denied = (out) => out?.permissionDecision === 'deny'
const git = (...args) => execFileSync('git', args, { cwd: dir, stdio: 'ignore' })

before(() => {
  dir = mkdtempSync(join(tmpdir(), 'risk-tier-'))
  mkdirSync(join(dir, 'migrations'))
  mkdirSync(join(dir, 'app', 'pages'), { recursive: true })
  writeFileSync(join(dir, 'migrations', '0000_init.sql'), 'CREATE TABLE feedback (id integer);\n')
  writeFileSync(join(dir, 'app', 'pages', 'index.vue'), '<template><h1>Hi</h1></template>\n')
  git('init', '-q', '-b', 'main')
  git('-c', 'user.email=t@t', '-c', 'user.name=t', 'add', '.')
  git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '-m', 'init')
  git('checkout', '-q', '-b', 'feature')
})
after(() => rmSync(dir, { recursive: true, force: true }))

test('allows ordinary edits', () => {
  const out = run('pre', 'Edit', {
    file_path: join(dir, 'app', 'pages', 'index.vue'),
    old_string: '<h1>Hi</h1>',
    new_string: '<h1>Welcome</h1>',
  })
  assert.equal(out, null)
})

test('blocks secrets, for engineers too', () => {
  const input = { file_path: join(dir, 'server', 'x.ts'), content: "const token = 'ghp_" + 'a'.repeat(36) + "'\n" }
  assert.ok(denied(run('pre', 'Write', input)))
  assert.ok(denied(run('pre', 'Write', input, { RISK_TIER_ROLE: 'engineer' })))
})

test('blocks destructive SQL and rewriting an existing migration', () => {
  assert.ok(denied(run('pre', 'Write', { file_path: join(dir, 'migrations', '0001_x.sql'), content: 'DROP TABLE feedback;' })))
  assert.ok(
    denied(
      run('pre', 'Edit', {
        file_path: join(dir, 'migrations', '0000_init.sql'),
        old_string: 'id integer',
        new_string: 'id integer, note text',
      }),
    ),
  )
  assert.equal(run('pre', 'Write', { file_path: join(dir, 'migrations', '0001_x.sql'), content: 'CREATE TABLE notes (id integer);' }), null)
})

test('engineer-owned files: denied for everyone else, allowed for engineers', () => {
  const input = { file_path: join(dir, 'wrangler.jsonc'), content: '{}' }
  assert.ok(denied(run('pre', 'Write', input)))
  assert.equal(run('pre', 'Write', input, { RISK_TIER_ROLE: 'engineer' }), null)
})

test('red-but-reviewable changes are allowed in the session (CI gates them)', () => {
  const out = run('pre', 'Write', {
    file_path: join(dir, 'app', 'pages', 'x.vue'),
    content: "<script setup>await $fetch('https://api.example.com')</script>",
  })
  assert.equal(out, null)
})

test('bash: deploys, live data, force push, pushing main, skipping checks', () => {
  for (const command of [
    'npx wrangler deploy',
    'pnpm deploy:production',
    'wrangler secret put TOKEN',
    'wrangler d1 execute DB --remote --command "select 1"',
    'wrangler d1 migrations apply DB --remote',
    'git push --force origin feature',
    'git push origin main',
    'git commit --no-verify -m x',
    'gh pr merge 3 --admin',
    'echo x > .github/workflows/ci.yml',
    "sed -i 's/a/b/' scripts/risk-tier/rules.json",
  ]) {
    assert.ok(denied(run('pre', 'Bash', { command })), command)
  }
  for (const command of ['pnpm dev', 'wrangler d1 migrations apply DB --local', 'git push -u origin feature', 'git status']) {
    assert.equal(run('pre', 'Bash', { command }), null, command)
  }
})

test('bash: plain `git push` while on main is blocked', () => {
  git('checkout', '-q', 'main')
  try {
    assert.ok(denied(run('pre', 'Bash', { command: 'git push' })))
  } finally {
    git('checkout', '-q', 'feature')
  }
})

test('post: reports a tier change once, then stays quiet', () => {
  writeFileSync(join(dir, 'app', 'pages', 'index.vue'), "<script setup>await $fetch('https://api.example.com')</script>\n")
  const first = run('post', 'Write', { file_path: join(dir, 'app', 'pages', 'index.vue') })
  assert.match(first.additionalContext, /now RED \(was green\)/)
  assert.equal(run('post', 'Write', { file_path: join(dir, 'app', 'pages', 'index.vue') }), null)
  writeFileSync(join(dir, 'app', 'pages', 'index.vue'), '<template><h1>Hi</h1></template>\n')
  assert.match(run('post', 'Write', {}).additionalContext, /now GREEN \(was red\)/)
})

test('bash: editing the deploy guard from the shell is blocked', () => {
  assert.ok(denied(run('pre', 'Bash', { command: "sed -i 's/main/dev/' scripts/deploy-guard.mjs" })))
  assert.ok(denied(run('pre', 'Write', { file_path: join(dir, 'scripts', 'deploy-guard.mjs'), content: 'x' })))
})
