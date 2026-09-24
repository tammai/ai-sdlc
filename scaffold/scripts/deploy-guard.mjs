#!/usr/bin/env node
// Production deploy, and the only way to run one: `pnpm deploy:production`, called by
// Cloudflare Workers Builds. It refuses unless the build is of `main`, then applies
// migrations and deploys with DEPLOYED_FROM=main, which the production Worker checks
// at runtime (server/middleware/0.deploy-guard.ts). A version deployed any other way
// (a laptop, a misconfigured build) switches itself off instead of serving traffic.
//
// Engineer-owned (red tier).

import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

// Pure decision, exported for tests. `env` is process.env-shaped.
export function checkProductionDeploy(env, registry) {
  if (env.WORKERS_CI !== '1') {
    return { ok: false, reason: 'Production deploys run only inside Cloudflare Workers Builds, never from a laptop.' }
  }
  if (registry?.type === 'prototype') {
    return { ok: false, reason: 'This app is registered as a prototype. Prototypes live on the preview only.' }
  }
  if (env.WORKERS_CI_BRANCH !== 'main') {
    return {
      ok: false,
      reason: `This build is of "${env.WORKERS_CI_BRANCH ?? 'an unknown branch'}", not "main". Only reviewed, merged code goes to production. Turn off non-production builds on the production Worker (docs/SETUP.md §4).`,
    }
  }
  return { ok: true, commit: env.WORKERS_CI_COMMIT_SHA ?? 'unknown' }
}

// Through pnpm, so it's the project's pinned wrangler. (wrangler's package doesn't export its
// bin file, so resolving it directly fails.) The shell is only needed for pnpm.cmd on Windows.
function wrangler(args) {
  console.log(`$ wrangler ${args.join(' ')}`)
  const res = spawnSync('pnpm', ['exec', 'wrangler', ...args], { stdio: 'inherit', shell: process.platform === 'win32' })
  if (res.status !== 0) process.exit(res.status ?? 1)
}

function main() {
  const registry = JSON.parse(readFileSync('app.registry.json', 'utf8'))
  const verdict = checkProductionDeploy(process.env, registry)
  if (!verdict.ok) {
    console.error(`\n✋ Production deploy refused: ${verdict.reason}\n`)
    process.exit(1)
  }
  console.log(`Deploying main @ ${verdict.commit} to production.`)
  // DEPLOY_GUARD_DRY_RUN=1: prove wrangler starts, deploy nothing (used by the tests).
  if (process.env.DEPLOY_GUARD_DRY_RUN === '1') return wrangler(['--version'])
  wrangler(['d1', 'migrations', 'apply', 'DB', '--remote', '--env='])
  wrangler(['deploy', '--env=', '--var', 'DEPLOYED_FROM:main', '--var', `DEPLOYED_COMMIT:${verdict.commit}`])
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main()
