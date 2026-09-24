#!/usr/bin/env node
// /ai-sdlc:learn. Gathers what went wrong while building, for Claude to turn repeated
// problems into one-line lessons in LEARNED.md. Sources, all already recorded:
//   - verifier issues in each intent's ### Build log (the "- <file>: <problem>" lines)
//   - warnings under ### Plan review warnings
//   - engineer review warnings posted on merged PRs (gh)
//   - local review records in .git/ai-sdlc-review/ (these include warnings fixed before push)
//   node learn.mjs [appDir] [--limit 50] [--no-gh]

import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const section = (text, heading) => text.split(new RegExp(`^### ${heading}\\s*$`, 'm'))[1]?.split(/^#{1,3} /m)[0] ?? ''
const item = (line) => {
  const m = line.match(/^\s*-\s+`?([^`:\s][^`:]*?)`?:\s+(.+)$/)
  return m ? { file: m[1].trim(), problem: m[2].trim() } : null
}

// Verifier issues and plan-review warnings from one intent file.
export function fromIntent(name, text) {
  const out = []
  let round = null
  for (const line of section(text, 'Build log').split('\n')) {
    const r = line.match(/Round\s+(\d+)\s*\/\s*\d+/i)
    if (r) round = Number(r[1])
    else if (round && /^\s+-/.test(line) && item(line)) out.push({ source: 'verifier', intent: name, round, ...item(line) })
  }
  for (const line of section(text, 'Plan review warnings').split('\n')) {
    if (item(line)) out.push({ source: 'plan-review', intent: name, ...item(line) })
  }
  return out
}

// Warning lines of a posted engineer review (review-record.mjs formatReviewComment).
export function fromReviewComment(body, pr) {
  if (!/<!-- engineer-review sha=/.test(body ?? '')) return []
  return [...body.matchAll(/^- ⚠️ `([^`]+)`: (.+?)(?: \*\*Fix:\*\* (.+))?$/gm)].map((m) => ({
    source: 'review', pr, file: m[1], problem: m[2].trim(), fix: m[3]?.trim() ?? null,
  }))
}

export function fromReviewRecord(json, sha) {
  return (json.warnings ?? []).map((w) => ({ source: 'review-local', sha: sha.slice(0, 7), file: w.file, problem: w.problem, fix: w.fix ?? null }))
}

// The same area of the app coming up again is the signal worth a lesson.
export function areaOf(file) {
  const p = String(file).replace(/\\/g, '/')
  const m = p.match(/^(server\/api|server\/db|server\/utils|app\/pages|app\/queries|app\/components|app\/stores|migrations|tests\/examples|content)\//)
  return m ? m[1] : p.split('/')[0]
}

export function gather({ intents, comments, records }) {
  const items = [
    ...Object.entries(intents).flatMap(([name, text]) => fromIntent(name, text)),
    ...comments.flatMap(({ pr, body }) => fromReviewComment(body, pr)),
    ...records.flatMap(({ sha, json }) => fromReviewRecord(json, sha)),
  ].map((x) => ({ ...x, area: areaOf(x.file) }))
  const byArea = {}
  for (const x of items) byArea[x.area] = (byArea[x.area] ?? 0) + 1
  return { total: items.length, byArea: Object.fromEntries(Object.entries(byArea).sort((a, b) => b[1] - a[1])), items }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const args = process.argv.slice(2)
  const app = resolve(args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--limit') ?? process.cwd())
  const limit = args.includes('--limit') ? Number(args[args.indexOf('--limit') + 1]) : 50
  const dir = join(app, 'intent')
  const intents = Object.fromEntries(
    (existsSync(dir) ? readdirSync(dir) : []).filter((f) => f.endsWith('.md') && f !== '_template.md').map((f) => [f, readFileSync(join(dir, f), 'utf8')]),
  )
  const comments = []
  if (!args.includes('--no-gh')) {
    const gh = (...a) => JSON.parse(execFileSync('gh', a, { cwd: app, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }))
    const repo = gh('repo', 'view', '--json', 'nameWithOwner').nameWithOwner
    for (const { number } of gh('pr', 'list', '--state', 'merged', '--limit', String(limit), '--json', 'number')) {
      for (const c of gh('api', `repos/${repo}/issues/${number}/comments?per_page=100`)) comments.push({ pr: number, body: c.body })
    }
  }
  const recDir = join(execFileSync('git', ['rev-parse', '--absolute-git-dir'], { cwd: app, encoding: 'utf8' }).trim(), 'ai-sdlc-review')
  const records = (existsSync(recDir) ? readdirSync(recDir) : [])
    .filter((f) => f.endsWith('.json'))
    .flatMap((f) => {
      try {
        return [{ sha: f.replace(/\.json$/, ''), json: JSON.parse(readFileSync(join(recDir, f), 'utf8')) }]
      } catch {
        return []
      }
    })
  console.log(JSON.stringify(gather({ intents, comments, records }), null, 2))
}
