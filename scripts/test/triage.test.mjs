import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { pending, referencedIds, rowsFrom } from '../triage.mjs'

const script = join(dirname(fileURLToPath(import.meta.url)), '..', 'triage.mjs')
const wrangler = JSON.stringify([
  { results: [{ id: 3, message: 'Date is wrong', page: '/leave', created_at: 1790000000 }, { id: 5, message: 'Button hidden', page: '/', created_at: 1790000100 }], success: true },
])

test('referencedIds reads the reports field of every intent', () => {
  const ids = referencedIds(['---\ntitle: a\nreports: 3, 7\n---\n', '---\ntitle: b\n---\n', '---\nreports: 9 # triage\n---\n'])
  assert.deepEqual([...ids].sort(), [3, 7, 9])
})

test('pending drops covered reports and never carries the reporter', () => {
  const rows = rowsFrom(wrangler).map((r) => ({ ...r, reported_by: 'someone@example.com' }))
  const out = pending(rows, new Set([3]))
  assert.deepEqual(out.map((r) => r.id), [5])
  assert.equal(out[0].date, '2026-09-21')
  assert.ok(!JSON.stringify(out).includes('example.com'))
})

test('cli: --from a wrangler export, against the app intents; the live read needs an engineer', () => {
  const app = mkdtempSync(join(tmpdir(), 'aisdlc-tri-'))
  try {
    mkdirSync(join(app, 'intent'))
    writeFileSync(join(app, 'intent', '2026-09-01-dates.md'), '---\ntitle: dates\nreports: 3\n---\n')
    writeFileSync(join(app, 'export.json'), wrangler)
    const r = spawnSync(process.execPath, [script, app, '--from', join(app, 'export.json')], { encoding: 'utf8' })
    assert.equal(r.status, 0, r.stderr)
    const out = JSON.parse(r.stdout)
    assert.deepEqual([out.total, out.alreadyCovered, out.reports.map((x) => x.id)], [2, 1, [5]])
    const live = spawnSync(process.execPath, [script, app], { encoding: 'utf8', env: { ...process.env, RISK_TIER_ROLE: '' } })
    assert.equal(live.status, 2)
    assert.match(live.stderr, /for engineers/)
  } finally {
    rmSync(app, { recursive: true, force: true })
  }
})
