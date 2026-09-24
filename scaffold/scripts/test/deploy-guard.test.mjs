import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { checkProductionDeploy } from '../deploy-guard.mjs'

const ci = (branch, extra = {}) => ({ WORKERS_CI: '1', WORKERS_CI_BRANCH: branch, WORKERS_CI_COMMIT_SHA: 'abc123', ...extra })
const app = { type: 'internal' }

test('deploys a Workers Builds build of main', () => {
  assert.deepEqual(checkProductionDeploy(ci('main'), app), { ok: true, commit: 'abc123' })
})

test('refuses any other branch, naming it', () => {
  const v = checkProductionDeploy(ci('feature/leave-tracker'), app)
  assert.equal(v.ok, false)
  assert.match(v.reason, /feature\/leave-tracker/)
})

test('refuses outside Workers Builds, even on main', () => {
  assert.equal(checkProductionDeploy({ WORKERS_CI_BRANCH: 'main' }, app).ok, false)
  assert.equal(checkProductionDeploy({}, app).ok, false)
})

test('refuses when the branch is unknown', () => {
  assert.equal(checkProductionDeploy({ WORKERS_CI: '1' }, app).ok, false)
})

test('prototypes never deploy to production', () => {
  const v = checkProductionDeploy(ci('main'), { type: 'prototype' })
  assert.equal(v.ok, false)
  assert.match(v.reason, /prototype/)
})

test('the deploy step can actually start wrangler (dry run, deploys nothing)', () => {
  const script = fileURLToPath(new URL('../deploy-guard.mjs', import.meta.url))
  const run = (env) =>
    spawnSync(process.execPath, [script], { encoding: 'utf8', env: { ...process.env, WORKERS_CI: '', WORKERS_CI_BRANCH: '', ...env } })
  const refused = run({})
  assert.equal(refused.status, 1)
  assert.match(refused.stderr, /refused/)
  const ok = run({ WORKERS_CI: '1', WORKERS_CI_BRANCH: 'main', WORKERS_CI_COMMIT_SHA: 'abc123', DEPLOY_GUARD_DRY_RUN: '1' })
  assert.equal(ok.status, 0, ok.stderr)
  assert.match(ok.stdout, /Deploying main @ abc123/)
  assert.match(ok.stdout, /\d+\.\d+\.\d+/) // wrangler printed its version
})
