#!/usr/bin/env node
// Scenario evals: realistic changes and commands, many from real incidents, run against the
// scaffold's own risk rules and session hook exactly as they ship to apps.
//   node evals/run-scenarios.mjs [--json]
// Deterministic and free: run on every change to the plugin (CI does). Every scenario must pass.

import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const riskTier = join(here, '..', 'scaffold', 'scripts', 'risk-tier')
const { classify } = await import(pathToFileURL(join(riskTier, 'classify.mjs')).href)
const rules = JSON.parse(readFileSync(join(riskTier, 'rules.json'), 'utf8'))
const load = (name) => JSON.parse(readFileSync(join(here, 'scenarios', name), 'utf8'))

const results = []
const record = (kind, s, problems) => results.push({ kind, id: s.id, source: s.source, pass: problems.length === 0, problems })

// ---- tiers: the classifier -----------------------------------------------------------------
for (const s of load('tiers.json')) {
  const changes = s.changes.map((c) => ({ status: 'added', ...c, content: c.content ?? c.added.join('\n') }))
  const r = classify(changes, rules, { data: s.app?.data })
  const ids = r.findings.map((f) => f.rule)
  const problems = []
  if (r.tier !== s.expect.tier) problems.push(`tier ${r.tier}, expected ${s.expect.tier}`)
  for (const rule of s.expect.rules ?? []) if (!ids.includes(rule)) problems.push(`missing rule ${rule} (got: ${ids.join(', ') || 'none'})`)
  for (const rule of s.expect.notRules ?? []) if (ids.includes(rule)) problems.push(`unexpected rule ${rule}`)
  if (s.expect.escalated && !r.escalated) problems.push('expected escalation for this app\'s data class')
  if (s.expect.hiddenDetail && r.findings.some((f) => f.detail && f.detail !== '(value hidden)' && f.rule === 'secret-in-code')) {
    problems.push('the secret value was echoed back')
  }
  record('tier', s, problems)
}

// ---- hook: the session guard ---------------------------------------------------------------
// Each scenario gets its own repo: main, plus a branch idea/eval with any setup files committed
// (and, with reviewHead, the engineer review saved for that commit).
function makeRepo(setup) {
  const repo = mkdtempSync(join(tmpdir(), 'aisdlc-eval-'))
  const git = (...a) => execFileSync('git', a, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  const cfg = ['-c', 'user.email=e@e', '-c', 'user.name=e']
  git('init', '-q', '-b', 'main')
  git(...cfg, 'commit', '-q', '--allow-empty', '-m', 'base')
  git('switch', '-q', '-c', 'idea/eval')
  if (setup?.files) {
    for (const [path, content] of Object.entries(setup.files)) {
      mkdirSync(dirname(join(repo, path)), { recursive: true })
      writeFileSync(join(repo, path), content)
    }
    git('add', '-A')
    git(...cfg, 'commit', '-q', '-m', 'setup')
  }
  if (setup?.reviewHead) {
    mkdirSync(join(repo, '.git', 'ai-sdlc-review'), { recursive: true })
    const sha = git('rev-parse', 'HEAD')
    writeFileSync(join(repo, '.git', 'ai-sdlc-review', `${sha}.json`), JSON.stringify({ sha, summary: 'Reviewed.', warnings: [] }))
  }
  return repo
}

for (const s of load('hook.json')) {
  const repo = makeRepo(s.setup)
  try {
    const input = { ...s.input }
    if (input.file_path) input.file_path = join(repo, input.file_path)
    const res = spawnSync(process.execPath, [join(riskTier, 'hook.mjs'), 'pre'], {
      input: JSON.stringify({ tool_name: s.tool, tool_input: input, cwd: repo }),
      encoding: 'utf8',
      env: { ...process.env, CLAUDE_PROJECT_DIR: repo, RISK_TIER_ROLE: s.role === 'engineer' ? 'engineer' : '' },
    })
    const out = res.stdout ? JSON.parse(res.stdout).hookSpecificOutput : null
    const blocked = out?.permissionDecision === 'deny'
    const problems = []
    if (res.status !== 0) problems.push(`hook exited ${res.status}: ${res.stderr.trim()}`)
    if (blocked !== s.expect.blocked) problems.push(blocked ? `blocked, expected allowed: ${out.permissionDecisionReason}` : 'allowed, expected blocked')
    record('hook', s, problems)
  } finally {
    rmSync(repo, { recursive: true, force: true })
  }
}

// ---- report --------------------------------------------------------------------------------
const failed = results.filter((r) => !r.pass)
if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ total: results.length, passed: results.length - failed.length, results }, null, 2))
} else {
  for (const r of results) console.log(`${r.pass ? '✅' : '❌'} ${r.kind.padEnd(4)} ${r.id.padEnd(30)} ${r.pass ? '' : r.problems.join('; ')}`)
  console.log(`\n${results.length - failed.length}/${results.length} scenarios pass`)
}
process.exit(failed.length ? 1 : 0)
