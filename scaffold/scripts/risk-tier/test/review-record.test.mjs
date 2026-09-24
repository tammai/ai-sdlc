import assert from 'node:assert/strict'
import { test } from 'node:test'
import { findReview, formatReviewComment, validateReview } from '../review-record.mjs'

const HEAD = 'c'.repeat(40)
const good = { sha: HEAD, summary: 'Looks safe.', warnings: [{ file: 'server/api/x.post.ts', problem: 'No length cap.', fix: 'Cap at 500 characters.' }] }

test('validates a review before it is posted', () => {
  assert.deepEqual(validateReview(good), [])
  assert.ok(validateReview({ ...good, sha: 'abc' }).length)
  assert.ok(validateReview({ ...good, summary: ' ' }).length)
  assert.ok(validateReview({ ...good, warnings: [{ file: 'a' }] }).length)
  assert.ok(validateReview(null).length)
})

test('the comment is readable and carries a machine marker for the gate', () => {
  const body = formatReviewComment(good)
  assert.match(body, /^<!-- engineer-review sha=c{40} warnings=1 -->/)
  assert.match(body, /Engineer review \(Claude\)/)
  assert.match(body, /No length cap\. \*\*Fix:\*\* Cap at 500 characters\./)
  assert.match(formatReviewComment({ ...good, warnings: [] }), /No warnings\./)
})

test('the gate finds the newest record for exactly this commit', () => {
  const comments = [
    { body: formatReviewComment({ ...good, sha: 'd'.repeat(40) }), user: { login: 'hr' } },
    { body: 'unrelated' },
    { body: formatReviewComment(good), user: { login: 'hr' }, html_url: 'https://x/1' },
  ]
  assert.deepEqual(findReview(comments, HEAD), { sha: HEAD, warnings: 1, by: 'hr', url: 'https://x/1' })
  assert.equal(findReview(comments, 'e'.repeat(40)), null)
  assert.equal(findReview([{ body: '<!-- engineer-review sha=ccccccc warnings=0 -->' }], HEAD), null, 'short sha never matches')
  assert.equal(findReview(undefined, HEAD), null)
})
