#!/usr/bin/env node
// Local risk check: `pnpm risk` classifies this branch (committed + uncommitted work)
// against where it forked from main. Options: --base <ref>, --json.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { classify } from './classify.mjs'
import { collectChanges, isGitRepo, resolveBase } from './git.mjs'
import { formatReport } from './report.mjs'

const args = process.argv.slice(2)
const opt = (name) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}

const cwd = process.cwd()
if (!isGitRepo(cwd)) {
  console.error('Not a git repository — nothing to compare against.')
  process.exit(2)
}

const config = JSON.parse(readFileSync(new URL('rules.json', import.meta.url), 'utf8'))
let data
try {
  data = JSON.parse(readFileSync(join(cwd, 'app.registry.json'), 'utf8')).data
} catch {}

const base = resolveBase(cwd, opt('--base'))
const result = classify(collectChanges({ cwd, base }), config, { data })

if (args.includes('--json')) console.log(JSON.stringify(result, null, 2))
else console.log(formatReport(result))
