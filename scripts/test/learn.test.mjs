import assert from 'node:assert/strict'
import { test } from 'node:test'
import { areaOf, fromIntent, fromReviewComment, gather } from '../learn.mjs'

const intent = `---
title: rooms
---
## Technical plan
- server/api/rooms.post.ts: not an issue, just the plan

### Plan review warnings
- \`server/api/rooms.post.ts\`: No limit on the length of the note.

### Build log
- Round 2/3: 2 issues
  - app/pages/rooms.vue: Date shown in UTC, not the app's time zone.
  - tests/examples/rooms.spec.ts: Example 2 checks the wrong button.
- Round 3/3: 1 issues
  - app/pages/rooms.vue: Empty state missing.

## Open questions
`

test('fromIntent: verifier issues with their round, and plan-review warnings, nothing from other sections', () => {
  const items = fromIntent('rooms.md', intent)
  assert.deepEqual(items.map((x) => [x.source, x.round ?? null, x.file]), [
    ['verifier', 2, 'app/pages/rooms.vue'],
    ['verifier', 2, 'tests/examples/rooms.spec.ts'],
    ['verifier', 3, 'app/pages/rooms.vue'],
    ['plan-review', null, 'server/api/rooms.post.ts'],
  ])
})

test('fromReviewComment: parses the posted format, ignores other comments', () => {
  const body = '<!-- engineer-review sha=abc warnings=1 -->\n## 🔍 Engineer review (Claude)\n\nOk.\n\n- ⚠️ `server/api/leave.post.ts`: Anyone signed in can approve leave. **Fix:** Check the approver role.'
  assert.deepEqual(fromReviewComment(body, 8), [
    { source: 'review', pr: 8, file: 'server/api/leave.post.ts', problem: 'Anyone signed in can approve leave.', fix: 'Check the approver role.' },
  ])
  assert.deepEqual(fromReviewComment('- ⚠️ `x`: y', 1), [])
})

test('gather: counts by area of the app', () => {
  const g = gather({
    intents: { 'rooms.md': intent },
    comments: [],
    records: [{ sha: 'a'.repeat(40), json: { warnings: [{ file: 'app/pages/leave.vue', problem: 'Date in UTC.', fix: 'Use formatDate.' }] } }],
  })
  assert.equal(g.total, 5)
  assert.equal(g.byArea['app/pages'], 3)
  assert.equal(areaOf('nuxt.config.ts'), 'nuxt.config.ts')
})
