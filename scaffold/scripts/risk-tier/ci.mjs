#!/usr/bin/env node
// Merge gate, run by .github/workflows/risk-tier.yml under pull_request_target.
// The checkout is the BASE branch: this script, rules.json and app.registry.json all
// come from there, and the PR head is only diffed — never executed.
//
// Env: GITHUB_TOKEN, GITHUB_REPOSITORY, PR_NUMBER, HEAD_SHA, PR_AUTHOR,
//      GITHUB_STEP_SUMMARY (set by Actions).

import { execFileSync } from 'node:child_process'
import { appendFileSync, readFileSync } from 'node:fs'
import { classify } from './classify.mjs'
import { findReview } from './review-record.mjs'
import { decide } from './gate.mjs'
import { collectChanges } from './git.mjs'
import { formatReport } from './report.mjs'

const { GITHUB_TOKEN, GITHUB_REPOSITORY, PR_NUMBER, HEAD_SHA, PR_AUTHOR, GITHUB_STEP_SUMMARY } = process.env
for (const [k, v] of Object.entries({ GITHUB_TOKEN, GITHUB_REPOSITORY, PR_NUMBER, HEAD_SHA, PR_AUTHOR })) {
  if (!v) {
    console.error(`Missing ${k}`)
    process.exit(1)
  }
}

const MARKER = '<!-- risk-tier -->'
const RECHECK = 'recheck-risk'
const cwd = process.cwd()
// The checkout IS the base branch's current tip (see risk-tier.yml). Don't trust the event's
// pull_request.base.sha: GitHub doesn't refresh it when the base branch moves.
const BASE_SHA = execFileSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' }).trim()

async function gh(method, path, body) {
  const res = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      authorization: `Bearer ${GITHUB_TOKEN}`,
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (res.status === 404 && method === 'DELETE') return null
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${await res.text()}`)
  return res.status === 204 ? null : res.json()
}

const repo = `/repos/${GITHUB_REPOSITORY}`

// Diff from where the branch forked, not from the current tip of main.
const forkPoint = execFileSync('git', ['merge-base', BASE_SHA, HEAD_SHA], { cwd, encoding: 'utf8' }).trim()

const config = JSON.parse(readFileSync(new URL('rules.json', import.meta.url), 'utf8'))
let registry
try {
  registry = JSON.parse(readFileSync('app.registry.json', 'utf8'))
} catch (err) {
  console.error(`app.registry.json on the base branch is missing or invalid (${err.message}). Failing closed.`)
  process.exit(1)
}

const changes = collectChanges({ cwd, base: forkPoint, head: HEAD_SHA })
const result = classify(changes, config, { data: registry.data })
const reviews = await gh('GET', `${repo}/pulls/${PR_NUMBER}/reviews?per_page=100`)
const comments = await gh('GET', `${repo}/issues/${PR_NUMBER}/comments?per_page=100`)
const mine = comments.find((c) => c.body?.startsWith(MARKER))

// The engineer review record /ai-sdlc:ship posted for this exact commit, if any (review-record.mjs).
const review = findReview(comments, HEAD_SHA)

const decision = decide({ tier: result.tier, reviews, registry, author: PR_AUTHOR, headSha: HEAD_SHA, review })
const body = `${MARKER}
${formatReport(result, decision, review)}`

// One comment per PR, updated in place.
if (mine) await gh('PATCH', `${repo}/issues/comments/${mine.id}`, { body })
else await gh('POST', `${repo}/issues/${PR_NUMBER}/comments`, { body })

// Exactly one risk:* label, and drop the recheck trigger once it has done its job.
for (const t of ['green', 'yellow', 'red']) {
  if (t !== result.tier) await gh('DELETE', `${repo}/issues/${PR_NUMBER}/labels/${encodeURIComponent('risk:' + t)}`)
}
await gh('DELETE', `${repo}/issues/${PR_NUMBER}/labels/${RECHECK}`)
await gh('POST', `${repo}/issues/${PR_NUMBER}/labels`, { labels: [`risk:${result.tier}`] })

if (GITHUB_STEP_SUMMARY) appendFileSync(GITHUB_STEP_SUMMARY, formatReport(result, decision, review) + '\n')
console.log(`tier=${result.tier} pass=${decision.pass} — ${decision.reason}`)
process.exit(decision.pass ? 0 : 1)
