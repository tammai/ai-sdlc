#!/usr/bin/env node
// The behaviour-eval gate. Skills and agents can't be tested in CI (that would need Claude),
// so CI checks this instead: a fingerprint of the instructions Claude follows (skills/, agents/
// and the scaffold's CLAUDE.md, REVIEW.md, POLICIES.md, LEARNED.md and intent template) must
// match the one recorded by the last *passing* full behaviour-eval run (evals/behavior/last-pass.json).
//   node evals/fingerprint.mjs          print the current fingerprint
//   node evals/fingerprint.mjs --check  exit 1 if the instructions changed since the last pass

import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
export const LAST_PASS = join(root, 'evals', 'behavior', 'last-pass.json')

const SKIP = new Set(['node_modules', '.nuxt', '.output', '.wrangler', '.data', 'test-results', 'playwright-report'])
const walk = (d) =>
  readdirSync(d).flatMap((n) => (SKIP.has(n) ? [] : statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [join(d, n)]))
const posix = (p) => p.split('\\').join('/')

// sha256 over files and folders (relative to the plugin root), with line endings normalised.
export function hashPaths(paths) {
  const h = createHash('sha256')
  const files = paths.flatMap((p) => (statSync(join(root, p)).isDirectory() ? walk(join(root, p)) : [join(root, p)]))
  for (const f of files.map((p) => posix(relative(root, p))).sort()) {
    h.update(f + '\0' + readFileSync(join(root, f), 'utf8').replace(/\r\n/g, '\n') + '\0')
  }
  return h.digest('hex')
}

const INSTRUCTIONS = ['skills', 'agents', 'scaffold/CLAUDE.md', 'scaffold/REVIEW.md', 'scaffold/POLICIES.md', 'scaffold/LEARNED.md', 'scaffold/intent/_template.md']
export const fingerprint = () => hashPaths(INSTRUCTIONS)

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const now = fingerprint()
  if (!process.argv.includes('--check')) {
    console.log(now)
  } else {
    const last = existsSync(LAST_PASS) ? JSON.parse(readFileSync(LAST_PASS, 'utf8')) : null
    if (last?.fingerprint === now) {
      console.log(`skills, agents and app instructions match the behaviour evals that passed on ${last.date} (${last.passed} scenarios)`)
    } else {
      console.error('✋ skills, agents or the app instructions (CLAUDE.md, REVIEW.md, POLICIES.md, LEARNED.md) changed since the last passing behaviour-eval run.')
      console.error('   Run `node evals/run-behavior.mjs` (the full suite, on your Claude plan). When it passes,')
      console.error('   it updates evals/behavior/last-pass.json: commit that file with your change.')
      process.exit(1)
    }
  }
}
