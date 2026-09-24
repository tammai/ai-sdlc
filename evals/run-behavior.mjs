#!/usr/bin/env node
// Behaviour evals: realistic requests run through headless Claude Code with this plugin loaded,
// each in a throwaway app, graded only on what ends up in the repo and the reply.
//   node evals/run-behavior.mjs [scenario-id ...] [--budget 2]
// Costs real Claude usage, so it runs on demand (before a release, after changing skills),
// never in CI. Safety: the apps have no git remote, and Cloudflare credentials are replaced
// with an invalid token, so nothing can be pushed or deployed even if a guard failed.

import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createApp } from '../scripts/new-app.mjs'

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

function prepareBase() {
  if (existsSync(join(base, 'node_modules'))) return
  rmSync(base, { recursive: true, force: true })
  mkdirSync(work, { recursive: true })
  createApp(base, { name: 'eval-app', type: 'internal', data: 'internal' })
  execFileSync('pnpm', ['install'], { cwd: base, stdio: 'inherit', shell: process.platform === 'win32' })
  git(base, 'add', '-A')
  git(base, '-c', 'user.email=e@e', '-c', 'user.name=e', 'commit', '-q', '-m', 'install')
}

function freshApp(id) {
  const dir = join(work, id)
  rmSync(dir, { recursive: true, force: true })
  git(work, 'clone', '-q', '--no-hardlinks', base, dir)
  git(dir, 'remote', 'remove', 'origin') // nothing can be pushed
  symlinkSync(join(base, 'node_modules'), join(dir, 'node_modules'), 'junction')
  return dir
}

const walk = (d) => (existsSync(d) ? readdirSync(d, { recursive: true }).map(String) : [])
const globFiles = (dir, glob) => {
  const [folder, pattern] = glob.includes('/') ? [glob.slice(0, glob.lastIndexOf('/')), glob.slice(glob.lastIndexOf('/') + 1)] : ['.', glob]
  const re = new RegExp('^' + pattern.replace(/\./g, '\\.').replace(/\*/g, '[^/\\\\]*') + '$')
  return walk(join(dir, folder)).filter((f) => re.test(f)).map((f) => join(folder, f).split('\\').join('/'))
}
const regex = (src) => (src.startsWith('(?i)') ? new RegExp(src.slice(4), 'i') : new RegExp(src))
const changedFiles = (dir) => {
  const committed = git(dir, 'diff', '--name-only', 'main...HEAD').split('\n').filter(Boolean)
  const working = git(dir, 'status', '--porcelain').split('\n').filter(Boolean).map((l) => l.slice(3))
  return [...new Set([...committed, ...working])]
}

function grade(g, dir, reply) {
  switch (g.type) {
    case 'fileMatches': {
      const files = globFiles(dir, g.glob).filter((f) => f !== g.not)
      return files.some((f) => regex(g.regex).test(readFileSync(join(dir, f), 'utf8'))) || `no ${g.glob} matches ${g.regex}`
    }
    case 'noFileMatches': {
      const hit = globFiles(dir, g.glob).find((f) => regex(g.regex).test(readFileSync(join(dir, f), 'utf8')))
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
      if (!changedFiles(dir).length) return true
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
  const dir = freshApp(s.id)
  console.log(`\n▶ ${s.id}: ${s.source}`)
  const res = spawnSync(
    'claude',
    [
      '-p', s.prompt,
      '--plugin-dir', pluginRoot,
      '--permission-mode', 'bypassPermissions',
      '--output-format', 'json',
      '--max-budget-usd', budget,
      '--append-system-prompt',
      'This is an automated evaluation. Nobody can answer questions: where you would ask, choose the most likely option and say what you assumed.',
    ],
    {
      cwd: dir,
      encoding: 'utf8',
      timeout: 15 * 60_000,
      // No shell: the prompt must reach claude as one argument, spaces and quotes intact.
      env: { ...process.env, CLOUDFLARE_API_TOKEN: 'ai-sdlc-eval-invalid', CLOUDFLARE_ACCOUNT_ID: '0' },
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

const out = join(here, 'results')
mkdirSync(out, { recursive: true })
const file = join(out, `behavior-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`)
writeFileSync(file, JSON.stringify(report, null, 2) + '\n')
const passed = report.filter((r) => r.pass).length
console.log(`\n${passed}/${report.length} behaviour scenarios pass · results in ${file}`)
process.exit(passed === report.length ? 0 : 1)
