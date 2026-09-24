#!/usr/bin/env node
// Behaviour evals: realistic requests run through headless Claude Code with this plugin loaded,
// each in a throwaway app, graded only on what ends up in the repo and the reply.
//   node evals/run-behavior.mjs [scenario-id ...] [--budget 2]
// Costs real Claude usage, so it runs on demand (before a release, after changing skills),
// never in CI. Safety: each app's origin is a local bare repo, and Cloudflare credentials are
// replaced with an invalid token, so nothing can reach GitHub or be deployed even if a guard failed.

import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createServer } from 'node:net'
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createApp } from '../scripts/new-app.mjs'
import { hashPaths } from './fingerprint.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const pluginRoot = join(here, '..')
const args = process.argv.slice(2)
const budget = args.includes('--budget') ? args[args.indexOf('--budget') + 1] : '2'
const only = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--budget')
const scenarios = JSON.parse(readFileSync(join(here, 'behavior', 'scenarios.json'), 'utf8')).filter((s) => !only.length || only.includes(s.id))

// Short paths: deep folders break pnpm on Windows.
const work = join(homedir(), 'apps', '.ai-sdlc-evals')
const base = join(work, 'base')
const git = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()

// The base app is cached with its node_modules, and rebuilt whenever the scaffold changes, so
// every run tests the scaffold as it is now. node_modules survives the rebuild (fast).
function prepareBase() {
  const stamp = join(work, 'base.scaffold')
  const want = hashPaths(['scaffold', 'scripts/new-app.mjs'])
  if (existsSync(join(base, 'node_modules')) && existsSync(stamp) && readFileSync(stamp, 'utf8') === want) return
  const keep = join(work, 'base-node_modules')
  rmSync(keep, { recursive: true, force: true })
  if (existsSync(join(base, 'node_modules'))) renameSync(join(base, 'node_modules'), keep)
  rmSync(base, { recursive: true, force: true })
  mkdirSync(work, { recursive: true })
  createApp(base, { name: 'eval-app', type: 'internal', data: 'internal' })
  if (existsSync(keep)) renameSync(keep, join(base, 'node_modules'))
  execFileSync('pnpm', ['install'], { cwd: base, stdio: 'inherit', shell: process.platform === 'win32' })
  git(base, 'add', '-A')
  // pnpm install may leave nothing to commit (lockfile already current).
  if (git(base, 'status', '--porcelain')) git(base, '-c', 'user.email=e@e', '-c', 'user.name=e', 'commit', '-q', '-m', 'install')
  writeFileSync(stamp, want)
}

function freshApp(s) {
  const dir = join(work, s.id)
  const remote = join(work, `${s.id}.git`)
  rmSync(dir, { recursive: true, force: true })
  rmSync(remote, { recursive: true, force: true })
  // origin is a local bare repo: origin/main exists for the skills' diffs, and a push can only
  // ever land in this folder on this machine.
  git(work, 'clone', '-q', '--bare', base, remote)
  git(work, 'clone', '-q', '--no-hardlinks', remote, dir)
  symlinkSync(join(base, 'node_modules'), join(dir, 'node_modules'), 'junction')
  // A scenario can start from a prepared state, e.g. an agreed intent on its branch.
  if (s.setup) {
    git(dir, 'switch', '-q', '-c', s.setup.branch)
    for (const [path, content] of Object.entries(s.setup.files ?? {})) {
      mkdirSync(dirname(join(dir, path)), { recursive: true })
      writeFileSync(join(dir, path), content)
    }
    git(dir, 'add', '-A')
    git(dir, '-c', 'user.email=e@e', '-c', 'user.name=e', 'commit', '-q', '-m', s.setup.message ?? 'Setup')
  }
  return dir
}

const walk = (d) => (existsSync(d) ? readdirSync(d, { recursive: true }).map(String) : [])
const globFiles = (dir, glob) => {
  const [folder, pattern] = glob.includes('/') ? [glob.slice(0, glob.lastIndexOf('/')), glob.slice(glob.lastIndexOf('/') + 1)] : ['.', glob]
  // '**' matches every file below the folder; '*' stays within one folder.
  const re = pattern === '**' ? /./ : new RegExp('^' + pattern.replace(/\./g, '\\.').replace(/\*/g, '[^/\\\\]*') + '$')
  return walk(join(dir, folder)).filter((f) => re.test(f)).map((f) => join(folder, f).split('\\').join('/'))
}
const regex = (src) => (src.startsWith('(?i)') ? new RegExp(src.slice(4), 'i') : new RegExp(src))
const changedFiles = (dir) => {
  const committed = git(dir, 'diff', '--name-only', 'main...HEAD').split('\n').filter(Boolean)
  const working = git(dir, 'status', '--porcelain').split('\n').filter(Boolean).map((l) => l.slice(3))
  return [...new Set([...committed, ...working])]
}

// A free port for each scenario's example checks, so they never hit another app's dev server.
const freePort = () =>
  new Promise((ok, fail) => {
    const srv = createServer().once('error', fail)
    srv.listen(0, () => {
      const { port } = srv.address()
      srv.close(() => ok(port))
    })
  })
let examplesPort = 3100

function grade(g, dir, reply) {
  switch (g.type) {
    case 'fileExists':
      return globFiles(dir, g.glob).length > 0 || `no file matches ${g.glob}`
    case 'commandPasses': {
      // e.g. pnpm typecheck, or the new example checks: run for real in the eval app.
      const r = spawnSync(g.command, { cwd: dir, shell: true, encoding: 'utf8', timeout: 10 * 60_000, env: { ...process.env, EXAMPLES_PORT: String(examplesPort) } })
      return r.status === 0 || `\`${g.command}\` exited ${r.status}: ${(r.stdout + r.stderr).trim().split('\n').slice(-3).join(' | ')}`
    }
    case 'fileMatches': {
      const files = globFiles(dir, g.glob).filter((f) => f !== g.not)
      return files.some((f) => regex(g.regex).test(readFileSync(join(dir, f), 'utf8'))) || `no ${g.glob} matches ${g.regex}`
    }
    case 'noFileMatches': {
      const hit = globFiles(dir, g.glob).filter((f) => f !== g.not).find((f) => regex(g.regex).test(readFileSync(join(dir, f), 'utf8')))
      return !hit || `${hit} matches ${g.regex}`
    }
    case 'branchNot': {
      const b = git(dir, 'rev-parse', '--abbrev-ref', 'HEAD')
      const onMain = git(dir, 'log', '--oneline', 'main', '-1') !== git(base, 'log', '--oneline', '-1')
      return (b !== g.branch && !onMain) || `worked on ${g.branch}`
    }
    case 'onlyChanged': {
      const bad = changedFiles(dir).filter((f) => !g.prefixes.some((p) => f.startsWith(p)))
      return !bad.length || `also changed: ${bad.join(', ')}`
    }
    case 'noCommits': {
      const commits = git(dir, 'rev-list', '--count', 'main..HEAD')
      return (commits === '0' && git(dir, 'rev-parse', 'main') === git(base, 'rev-parse', 'HEAD')) || `made ${commits} commit(s)`
    }
    case 'transcriptMatches':
      return regex(g.regex).test(reply) || `reply doesn't match ${g.regex}`
    case 'riskTierIfChanged': {
      // The intent is the record, not code: an intent-only change (built nothing yet) passes.
      if (!changedFiles(dir).filter((f) => !f.startsWith('intent/')).length) return true
      const out = spawnSync(process.execPath, [join(dir, 'scripts/risk-tier/cli.mjs'), '--json', '--base', 'main'], { cwd: dir, encoding: 'utf8' })
      const r = JSON.parse(out.stdout)
      return (r.tier === g.tier && r.findings.some((f) => f.rule === g.rule)) || `tier ${r.tier} (${r.findings.map((f) => f.rule).join(', ')})`
    }
    default:
      return `unknown grader ${g.type}`
  }
}

prepareBase()
const report = []
for (const s of scenarios) {
  const dir = freshApp(s)
  examplesPort = await freePort()
  console.log(`\n▶ ${s.id}: ${s.source}`)
  const res = spawnSync(
    'claude',
    [
      '-p', s.prompt,
      '--plugin-dir', pluginRoot,
      '--permission-mode', 'bypassPermissions',
      '--output-format', 'json',
      '--max-budget-usd', String(s.budget ?? budget),
      '--append-system-prompt',
      'This is an automated evaluation. Nobody can answer questions: where you would ask, choose the most likely option and say what you assumed.',
    ],
    {
      cwd: dir,
      encoding: 'utf8',
      timeout: (s.timeoutMinutes ?? 15) * 60_000,
      // No shell: the prompt must reach claude as one argument, spaces and quotes intact.
      env: { ...process.env, CLOUDFLARE_API_TOKEN: 'ai-sdlc-eval-invalid', CLOUDFLARE_ACCOUNT_ID: '0', EXAMPLES_PORT: String(examplesPort) },
    },
  )
  let reply = ''
  let cost = null
  try {
    const j = JSON.parse(res.stdout)
    reply = j.result ?? ''
    cost = j.total_cost_usd ?? null
  } catch {
    reply = res.stdout ?? ''
  }
  const checks = s.graders.map((g) => ({ why: g.why, result: grade(g, dir, reply) }))
  const pass = checks.every((c) => c.result === true)
  for (const c of checks) console.log(`  ${c.result === true ? '✅' : '❌'} ${c.why}${c.result === true ? '' : ` — ${c.result}`}`)
  report.push({ id: s.id, pass, cost, checks, reply: reply.slice(0, 2000) })
}

const { fingerprint, LAST_PASS } = await import('./fingerprint.mjs')
const fp = fingerprint()
const out = join(here, 'results')
mkdirSync(out, { recursive: true })
const file = join(out, `behavior-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`)
writeFileSync(file, JSON.stringify({ fingerprint: fp, report }, null, 2) + '\n')
const passed = report.filter((r) => r.pass).length
console.log(`\n${passed}/${report.length} behaviour scenarios pass · results in ${file}`)

// The CI gate (evals/fingerprint.mjs --check). A scenario counts once it has passed with the
// current instructions (fingerprint) and its current definition (scenario hash). A failure
// removes it. When every scenario counts, the fingerprint is recorded, so rerunning one
// failed scenario doesn't mean rerunning the whole suite, and nothing unlocks without a pass.
const all = JSON.parse(readFileSync(join(here, 'behavior', 'scenarios.json'), 'utf8'))
const scenarioHash = (s) => createHash('sha256').update(JSON.stringify(s)).digest('hex').slice(0, 16)
const prev = existsSync(LAST_PASS) ? JSON.parse(readFileSync(LAST_PASS, 'utf8')) : {}
const ledger = prev.ledgerFingerprint === fp ? { ...prev.scenarios } : {}
for (const r of report) {
  if (r.pass) ledger[r.id] = { hash: scenarioHash(all.find((s) => s.id === r.id)), date: new Date().toISOString().slice(0, 10), results: file.split(/[\\/]/).pop() }
  else delete ledger[r.id]
}
const missing = all.filter((s) => ledger[s.id]?.hash !== scenarioHash(s)).map((s) => s.id)
const version = JSON.parse(readFileSync(join(pluginRoot, '.claude-plugin', 'plugin.json'), 'utf8')).version
const complete = !missing.length
writeFileSync(
  LAST_PASS,
  JSON.stringify(
    {
      fingerprint: complete ? fp : (prev.fingerprint ?? null),
      date: complete ? new Date().toISOString().slice(0, 10) : prev.date,
      passed: complete ? all.length : prev.passed,
      version: complete ? version : prev.version,
      ledgerFingerprint: fp,
      scenarios: ledger,
    },
    null,
    2,
  ) + '\n',
)
console.log(
  complete
    ? `Every scenario has passed with these instructions: recorded the fingerprint in ${LAST_PASS}. Commit it with the change.`
    : `Still to pass with these instructions: ${missing.join(', ')}`,
)
process.exit(passed === report.length ? 0 : 1)
