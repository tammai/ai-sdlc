import assert from 'node:assert/strict'
import { test } from 'node:test'
import { decide } from '../gate.mjs'

const registry = { reviewers: { yellow: ['Owner', 'teammate'], red: ['eng1', 'eng2'] } }
const HEAD = 'a'.repeat(40)
const review = (login, state, commit_id = HEAD) => ({ user: { login }, state, commit_id })
const run = (tier, reviews, author = 'author', extra = {}) => decide({ tier, reviews, registry, author, headSha: HEAD, ...extra })
const record = (sha = HEAD, warnings = 0) => ({ sha, warnings })

test('green passes with no reviews', () => {
  assert.equal(run('green', []).pass, true)
})

test('yellow and red pass with an engineer review record for this commit, warnings and all', () => {
  for (const tier of ['yellow', 'red']) {
    assert.equal(run(tier, []).pass, false, `${tier} without a record waits`)
    const r = run(tier, [], 'author', { review: record(HEAD, 2) })
    assert.equal(r.pass, true)
    assert.match(r.reason, /2 warnings/)
  }
  assert.match(run('red', [], 'author', { review: record() }).reason, /no warnings/)
})

test('a review record for an older commit does not count', () => {
  assert.equal(run('red', [], 'author', { review: record('b'.repeat(40)) }).pass, false)
})

test('claudeReview false: only people can clear yellow and red', () => {
  const off = { ...registry, claudeReview: false }
  const r = decide({ tier: 'red', reviews: [], registry: off, author: 'author', headSha: HEAD, review: record() })
  assert.equal(r.pass, false)
  assert.doesNotMatch(r.reason, /engineer review/)
})

test('people can still approve: owner or engineer for yellow, engineer for red', () => {
  assert.equal(run('yellow', [review('owner', 'APPROVED')]).pass, true)
  assert.equal(run('yellow', [review('ENG2', 'APPROVED')]).pass, true)
  assert.equal(run('red', [review('owner', 'APPROVED')]).pass, false)
  assert.equal(run('red', [review('eng1', 'APPROVED')]).pass, true)
})

test('an approval on an older commit does not count', () => {
  assert.equal(run('red', [review('eng1', 'APPROVED', 'old999')]).pass, false)
})

test('the latest decision wins', () => {
  assert.equal(run('red', [review('eng1', 'APPROVED'), review('eng1', 'CHANGES_REQUESTED')]).pass, false)
  assert.equal(run('red', [review('eng1', 'APPROVED'), review('eng1', 'DISMISSED')]).pass, false)
  assert.equal(run('red', [review('eng1', 'CHANGES_REQUESTED'), review('eng1', 'APPROVED')]).pass, true)
  assert.equal(run('red', [review('eng1', 'APPROVED'), review('eng1', 'COMMENTED')]).pass, true)
})

test('authors cannot approve their own change, even when listed', () => {
  assert.equal(run('red', [review('eng1', 'APPROVED')], 'eng1').pass, false)
  assert.match(run('red', [], 'eng1').reason, /@eng2/)
})

test('waiting message names the review and the people', () => {
  assert.match(run('red', []).reason, /engineer review \(\/ai-sdlc:ship runs it\) or @eng1 or @eng2/)
})

test('review off and no reviewers configured fails closed with a readable reason', () => {
  const r = decide({ tier: 'red', reviews: [], registry: { claudeReview: false }, author: 'a', headSha: HEAD })
  assert.equal(r.pass, false)
  assert.match(r.reason, /app\.registry\.json/)
})
