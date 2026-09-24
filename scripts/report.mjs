#!/usr/bin/env node
// /ai-sdlc:report. The playbook's per-stage metrics for one app, computed from what the
// workflow already records: merged PRs and their commits (the skills commit with fixed
// prefixes: Idea:, Agree examples:, Plan:, Build:, Ship:), the intents' build logs, the
// engineer review records, and the ci runs. Nothing new to collect.
//   node report.mjs [appDir] [--limit 50] [--json]

import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

// ---- pure helpers (tested) ------------------------------------------------------------------

export const HOURS = 3_600_000
export function median(xs) {
  const v = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b)
  if (!v.length) return null
  const m = Math.floor(v.length / 2)
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2
}

// When each stage's first commit happened on a PR, from the skills' commit prefixes.
const PREFIXES = { idea: /^Idea:/i, agreed: /^Agree examples:/i, plan: /^Plan:/i, build: /^Build:/i, ship: /^Ship:/i }
export function stageTimes(commits) {
  const out = {}
  for (const c of [...commits].sort((a, b) => Date.parse(a.date) - Date.parse(b.date))) {
    for (const [stage, re] of Object.entries(PREFIXES)) if (!out[stage] && re.test(c.message)) out[stage] = Date.parse(c.date)
  }
  // Examples agreed again after the build started = design rework.
  out.rework = out.build ? commits.filter((c) => PREFIXES.agreed.test(c.message) && Date.parse(c.date) > out.build).length : 0
  return out
}

// "Round 2/3: …" lines in an intent's ### Build log. 0 means the first verification passed.
export function verifierRounds(intentText) {
  const log = intentText.split(/^### Build log\s*$/m)[1]?.split(/^#{1,3} /m)[0] ?? ''
  const rounds = [...log.matchAll(/Round\s+(\d+)\s*\/\s*\d+/gi)].map((m) => Number(m[1]))
  return rounds.length ? Math.max(...rounds) : 0
}

export function frontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---/)
  const out = {}
  for (const line of m?.[1].split('\n') ?? []) {
    const kv = line.match(/^(\w+):\s*(.*?)\s*(#.*)?$/)
    if (kv) out[kv[1]] = kv[2]
  }
  return out
}

// Engineer review records on a PR: warnings on the first and the last review.
export function reviewWarnings(comments) {
  const counts = comments
    .map((c) => c.body?.match(/<!-- engineer-review sha=[0-9a-f]+ warnings=(\d+) -->/))
    .filter(Boolean)
    .map((m) => Number(m[1]))
  return counts.length ? { first: counts[0], last: counts.at(-1), reviews: counts.length } : null
}

const pct = (n, d) => (d ? `${Math.round((100 * n) / d)}%` : 'n/a')
const hrs = (ms) => (ms == null ? 'n/a' : ms < HOURS ? `${Math.round(ms / 60_000)} min` : `${(ms / HOURS).toFixed(1)} h`)

export function summarise(prs) {
  const s = (f) => prs.map(f).filter((x) => x != null)
  const withStages = prs.filter((p) => p.stages.idea)
  const reviewed = prs.filter((p) => p.review)
  const ciKnown = prs.filter((p) => p.firstCi)
  const intentsBuilt = prs.filter((p) => p.intent)
  const weeks = prs.length ? Math.max(1, (Math.max(...s((p) => p.mergedAt)) - Math.min(...s((p) => p.createdAt))) / (7 * 24 * HOURS)) : 1
  return [
    { stage: '1 Plan', metric: 'idea → examples agreed (median)', value: hrs(median(s((p) => (p.stages.agreed && p.stages.idea ? p.stages.agreed - p.stages.idea : null)))), n: withStages.length },
    { stage: '2 Design', metric: 'changes whose examples were reworked after the build started', value: pct(prs.filter((p) => p.stages.rework > 0).length, withStages.length), n: withStages.length },
    { stage: '3 Build', metric: 'verification passed first time (no verifier round)', value: pct(intentsBuilt.filter((p) => p.rounds === 0).length, intentsBuilt.length), n: intentsBuilt.length },
    { stage: '3 Build', metric: 'plan → built (median)', value: hrs(median(s((p) => (p.stages.build && p.stages.plan ? p.stages.build - p.stages.plan : null)))), n: prs.filter((p) => p.stages.plan).length },
    { stage: '4 Test', metric: 'first ci run passed', value: pct(ciKnown.filter((p) => p.firstCi === 'success').length, ciKnown.length), n: ciKnown.length },
    { stage: '5 Deploy', metric: 'pull request open → merged (median)', value: hrs(median(s((p) => p.mergedAt - p.createdAt))), n: prs.length },
    { stage: '5 Deploy', metric: 'reviews with warnings', value: pct(reviewed.filter((p) => p.review.first > 0).length, reviewed.length), n: reviewed.length },
    // Review happens before push, so fixes land before the record is posted: what's left on
    // the last record is what shipped as it was.
    { stage: '5 Deploy', metric: 'warnings shipped as they were (last review, total)', value: String(s((p) => p.review?.last ?? null).reduce((a, b) => a + b, 0)), n: reviewed.length },
    { stage: '5 Deploy', metric: 'merges to main per week (deploys)', value: (prs.length / weeks).toFixed(1), n: prs.length },
    { stage: '6 Maintain', metric: 'changes that came from a problem report', value: pct(prs.filter((p) => p.fromReport).length, intentsBuilt.length), n: intentsBuilt.length },
  ]
}

// ---- collecting (git + gh) ------------------------------------------------------------------

function collect(app, limit) {
  const gh = (...a) => JSON.parse(execFileSync('gh', a, { cwd: app, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }))
  const repo = gh('repo', 'view', '--json', 'nameWithOwner').nameWithOwner
  // Commits and files per PR: asking for them in the list query exceeds GitHub's node limit.
  const merged = gh('pr', 'list', '--state', 'merged', '--limit', String(limit), '--json', 'number,title,createdAt,mergedAt,headRefName').map(
    (pr) => ({ ...pr, ...gh('pr', 'view', String(pr.number), '--json', 'commits,files') }),
  )
  const intents = Object.fromEntries(
    (existsSync(join(app, 'intent')) ? readdirSync(join(app, 'intent')) : [])
      .filter((f) => f.endsWith('.md') && f !== '_template.md')
      .map((f) => [`intent/${f}`, readFileSync(join(app, 'intent', f), 'utf8')]),
  )
  return merged.map((pr) => {
    const commits = pr.commits.map((c) => ({ message: c.messageHeadline, date: c.committedDate }))
    const intentPath = pr.files.map((f) => f.path).find((p) => p in intents)
    const text = intentPath ? intents[intentPath] : null
    const comments = gh('api', `repos/${repo}/issues/${pr.number}/comments?per_page=100`)
    const runs = gh('run', 'list', '--workflow', 'ci', '--branch', pr.headRefName, '--limit', '30', '--json', 'conclusion,createdAt')
    const firstRun = runs.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))[0]
    return {
      number: pr.number,
      title: pr.title,
      createdAt: Date.parse(pr.createdAt),
      mergedAt: Date.parse(pr.mergedAt),
      stages: stageTimes(commits),
      intent: intentPath ?? null,
      rounds: text ? verifierRounds(text) : null,
      fromReport: text ? Boolean(frontmatter(text).reports) : false,
      review: reviewWarnings(comments),
      firstCi: firstRun?.conclusion ?? null,
    }
  })
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const args = process.argv.slice(2)
  const app = resolve(args.find((a) => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--limit') ?? process.cwd())
  const limit = args.includes('--limit') ? Number(args[args.indexOf('--limit') + 1]) : 50
  const prs = collect(app, limit)
  const rows = summarise(prs)
  if (args.includes('--json')) {
    console.log(JSON.stringify({ prs, rows }, null, 2))
  } else {
    console.log(`| Stage | Metric | Value | Based on |\n| --- | --- | --- | --- |`)
    for (const r of rows) console.log(`| ${r.stage} | ${r.metric} | ${r.value} | ${r.n} PR${r.n === 1 ? '' : 's'} |`)
    console.log(`\n${prs.length} merged pull requests. Stages come from the skills' commit prefixes; older work made before the skills existed has no stage times.`)
  }
}
