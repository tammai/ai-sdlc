import assert from 'node:assert/strict'
import { test } from 'node:test'
import { frontmatter, median, reviewWarnings, stageTimes, summarise, verifierRounds } from '../report.mjs'

const at = (h) => new Date(Date.UTC(2026, 8, 1, h)).toISOString()

test('stageTimes: first commit per prefix, and examples re-agreed after the build count as rework', () => {
  const t = stageTimes([
    { message: 'Build: rooms', date: at(3) },
    { message: 'Idea: rooms', date: at(0) },
    { message: 'Agree examples: rooms', date: at(1) },
    { message: 'Plan: rooms', date: at(2) },
    { message: 'Agree examples: rooms (changed)', date: at(4) },
  ])
  assert.equal(t.idea, Date.parse(at(0)))
  assert.equal(t.agreed, Date.parse(at(1)))
  assert.equal(t.build, Date.parse(at(3)))
  assert.equal(t.rework, 1)
})

test('verifierRounds: highest round in the build log only', () => {
  const text = '## Examples\nRound 9/9 elsewhere\n### Build log\n- Round 1/3: missing check\n- Round 2/3: date wrong\n## Next\n'
  assert.equal(verifierRounds(text), 2)
  assert.equal(verifierRounds('### Build log\n- Verified first time\n'), 0)
})

test('frontmatter and review records', () => {
  assert.equal(frontmatter('---\nstatus: shipped\nreports: 3, 4  # from triage\n---\n').reports, '3, 4')
  assert.deepEqual(
    reviewWarnings([{ body: '<!-- engineer-review sha=abc1 warnings=3 -->' }, { body: 'hi' }, { body: '<!-- engineer-review sha=abc2 warnings=1 -->' }]),
    { first: 3, last: 1, reviews: 2 },
  )
  assert.equal(reviewWarnings([{ body: 'lgtm' }]), null)
})

test('summarise: medians and shares from the PRs', () => {
  assert.equal(median([3, 1, 2]), 2)
  assert.equal(median([]), null)
  const pr = (o) => ({ createdAt: Date.parse(at(0)), mergedAt: Date.parse(at(2)), stages: {}, intent: 'intent/a.md', rounds: 0, fromReport: false, review: null, firstCi: 'success', ...o })
  const rows = summarise([pr({ rounds: 1, firstCi: 'failure' }), pr({ fromReport: true, review: { first: 2, last: 1, reviews: 1 } })])
  const v = (m) => rows.find((r) => r.metric.startsWith(m)).value
  assert.equal(v('verification passed first time'), '50%')
  assert.equal(v('first ci run passed'), '50%')
  assert.equal(v('pull request open'), '2.0 h')
  assert.equal(v('warnings shipped'), '1')
  assert.equal(v('changes that came from a problem report'), '50%')
})
