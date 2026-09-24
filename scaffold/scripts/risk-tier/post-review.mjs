#!/usr/bin/env node
// `pnpm review:post <review.json>`: post the engineer-reviewer's result on this branch's pull
// request and re-run the merge gate. Run by /ai-sdlc:ship. Engineer-owned.
//
// Refuses a review of any commit other than the one the pull request is on now, so an old
// review can't be reused for newer code.

import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { formatReviewComment, validateReview } from './review-record.mjs'

const run = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
const stop = (msg) => {
  console.error(`✋ ${msg}`)
  process.exit(1)
}

const file = process.argv[2]
if (!file) stop('Usage: pnpm review:post <review.json>')

let review
try {
  review = JSON.parse(readFileSync(file, 'utf8'))
} catch (err) {
  stop(`Couldn't read the review (${err.message}).`)
}
const problems = validateReview(review)
if (problems.length) stop(`The review is incomplete: ${problems.join('; ')}.`)

const local = run('git', ['rev-parse', 'HEAD'])
if (review.sha !== local) {
  stop(`The review is of ${review.sha.slice(0, 7)}, but this branch is at ${local.slice(0, 7)}: something was committed after the review. Review again (/ai-sdlc:ship step 3).`)
}

let pr
try {
  pr = JSON.parse(run('gh', ['pr', 'view', '--json', 'number,headRefOid,url']))
} catch {
  stop('No pull request for this branch yet. Push the reviewed commit and open it first (/ai-sdlc:ship step 4).')
}
if (pr.headRefOid !== review.sha) {
  stop(`The pull request is at ${pr.headRefOid.slice(0, 7)}, not the reviewed ${review.sha.slice(0, 7)}. Push the reviewed commit (git push), then post again.`)
}

const dir = mkdtempSync(join(tmpdir(), 'review-'))
try {
  const body = join(dir, 'body.md')
  writeFileSync(body, formatReviewComment(review))
  run('gh', ['pr', 'comment', String(pr.number), '--body-file', body])
  // The label re-runs the merge gate so it sees the review.
  run('gh', ['pr', 'edit', String(pr.number), '--add-label', 'recheck-risk'])
} finally {
  rmSync(dir, { recursive: true, force: true })
}
console.log(`Posted the engineer review (${review.warnings.length} warning${review.warnings.length === 1 ? '' : 's'}) on ${pr.url}`)
