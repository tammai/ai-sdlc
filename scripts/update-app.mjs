#!/usr/bin/env node
// /ai-sdlc:update-app. Brings an existing app's plugin-owned files up to this plugin version:
//   node update-app.mjs [appDir]
// Only paths listed in scripts/managed.json are written. The app's own work (pages, queries,
// API routes, schema, migrations, intents, content, example tests, config) is never touched.
// Runs on a new branch and adds an intent describing the update (it never edits existing
// intents); the result ships like any change, through /ai-sdlc:ship.

import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { PLUGIN_ROOT, pluginVersion } from './new-app.mjs'

const SCAFFOLD = join(PLUGIN_ROOT, 'scaffold')
const managed = () => JSON.parse(readFileSync(join(PLUGIN_ROOT, 'scripts', 'managed.json'), 'utf8'))

const walk = (dir) =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })
const same = (a, b) => existsSync(b) && readFileSync(a).equals(readFileSync(b))

export function updateApp(appDir, { git = true } = {}) {
  const app = resolve(appDir)
  if (!existsSync(join(app, 'app.registry.json')) || !existsSync(join(app, 'scripts', 'risk-tier'))) {
    throw new Error(`${app} doesn't look like an ai-sdlc app (no app.registry.json or scripts/risk-tier/)`)
  }
  const run = (...args) => execFileSync('git', args, { cwd: app, encoding: 'utf8' }).trim()
  const version = pluginVersion()
  let branch = null
  if (git) {
    if (run('status', '--porcelain')) throw new Error('The app has uncommitted changes. Commit or stash them first.')
    branch = `ai-sdlc-update-${version}`
    run('switch', '-q', '-c', branch)
  }

  const m = managed()
  const changed = []
  const extra = []
  const put = (src, rel) => {
    const dest = join(app, rel)
    if (same(src, dest)) return
    mkdirSync(dirname(dest), { recursive: true })
    cpSync(src, dest)
    changed.push(rel.split('\\').join('/'))
  }

  for (const rel of m.files) put(join(SCAFFOLD, rel), rel)
  for (const dir of m.dirs) {
    const srcFiles = walk(join(SCAFFOLD, dir)).map((p) => relative(SCAFFOLD, p))
    for (const rel of srcFiles) put(join(SCAFFOLD, rel), rel)
    if (existsSync(join(app, dir))) {
      const known = new Set(srcFiles.map((r) => r.split('\\').join('/')))
      for (const p of walk(join(app, dir))) {
        const rel = relative(app, p).split('\\').join('/')
        if (!known.has(rel)) extra.push(rel)
      }
    }
  }

  // Seeds: files the app owns once they exist (policies, lessons). Written only when missing.
  for (const rel of m.seed ?? []) if (!existsSync(join(app, rel))) put(join(SCAFFOLD, rel), rel)

  // Copies of the plugin's skills and reviewer from before the plugin existed: now duplicates.
  for (const rel of m.remove ?? []) {
    if (!existsSync(join(app, rel))) continue
    rmSync(join(app, rel), { recursive: true, force: true })
    changed.push(`removed ${rel}`)
  }

  // package.json: the plugin's script keys follow the scaffold; dependencies are only reported.
  const pkgPath = join(app, 'package.json')
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
  const scaffoldPkg = JSON.parse(readFileSync(join(SCAFFOLD, 'package.json'), 'utf8'))
  let scriptsChanged = false
  for (const key of m.packageScripts) {
    if (scaffoldPkg.scripts[key] !== undefined && pkg.scripts?.[key] !== scaffoldPkg.scripts[key]) {
      pkg.scripts = { ...pkg.scripts, [key]: scaffoldPkg.scripts[key] }
      scriptsChanged = true
    }
  }
  if (scriptsChanged) {
    writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')
    changed.push('package.json (scripts)')
  }
  const depNotes = []
  for (const field of ['dependencies', 'devDependencies']) {
    for (const [dep, want] of Object.entries(scaffoldPkg[field] ?? {})) {
      const have = pkg[field]?.[dep] ?? pkg.dependencies?.[dep] ?? pkg.devDependencies?.[dep]
      if (have !== want) depNotes.push(`${dep}: app has ${have ?? 'nothing'}, plugin expects ${want}`)
    }
  }

  // The UI layer: reinstall the app's current template from the (just refreshed) ui-templates/.
  const layerInfo = join(app, 'layers', 'ui', '.template.json')
  const template = existsSync(layerInfo) ? readJson(layerInfo).name : undefined
  const before = snapshot(join(app, 'layers', 'ui'))
  execFileSync(process.execPath, [join(app, 'scripts', 'ui-template.mjs'), ...(template ? [template] : [])], { cwd: app, stdio: 'ignore' })
  if (snapshot(join(app, 'layers', 'ui')) !== before) changed.push('layers/ui/')

  const stampPath = join(app, '.ai-sdlc.json')
  const from = existsSync(stampPath) ? readJson(stampPath).version : null
  writeFileSync(stampPath, JSON.stringify({ plugin: 'ai-sdlc', version }, null, 2) + '\n')

  // The record of why this change exists, like any other: the engineer review reads it.
  if (changed.length) {
    const today = new Date().toISOString().slice(0, 10)
    const rel = `intent/${today}-ai-sdlc-update-${version.replace(/\./g, '-')}.md`
    if (!existsSync(join(app, rel))) {
      mkdirSync(join(app, 'intent'), { recursive: true })
      writeFileSync(join(app, rel), updateIntent({ version, from, today, changed, extra, depNotes }))
      changed.push(rel)
    }
  }

  if (git && changed.length) {
    run('add', '-A')
    run('commit', '-q', '-m', `Update ai-sdlc managed files to ${version}`)
  }
  return { branch, version, changed, extra, depNotes }
}

export function updateIntent({ version, from, today, changed, extra, depNotes }) {
  const list = (xs) => xs.map((x) => `- \`${x}\``).join('\n')
  return `---
title: Update the ai-sdlc safety files to ${version}
author: Engineering
status: built   # draft → agreed → built → shipped | dropped
tier: red       # engineer-owned files
created: ${today}
reports:
---

# Update the ai-sdlc safety files to ${version}

## The problem
This app's plugin-owned files (risk rules, merge gate, CI, session hook, deploy guard, UI shell, CLAUDE.md, REVIEW.md) are from ${from ? `ai-sdlc ${from}` : 'before the plugin recorded versions'}. The installed plugin is ${version}.

## What should be true afterwards
The app's safety files match ai-sdlc ${version}, and nothing the app's owners built has changed.

## Examples
1. When I run \`pnpm check\`, every existing check passes.
2. When I compare this branch with main, only files listed in the plugin's \`scripts/managed.json\` have changed, plus this intent.

## What will change
${list(changed)}

What changed in the plugin itself: its release notes for ${version} (https://github.com/tammai/ai-sdlc/releases).
${extra.length ? `\nKept as they are (added by an engineer, not from the plugin):\n${list(extra)}\n` : ''}${depNotes.length ? `\nDependencies that differ from the plugin's (not changed):\n${depNotes.map((d) => `- ${d}`).join('\n')}\n` : ''}
## Policy concerns
None.
`
}

function readJson(p) {
  return JSON.parse(readFileSync(p, 'utf8'))
}
function snapshot(dir) {
  if (!existsSync(dir)) return ''
  return walk(dir)
    .map((p) => relative(dir, p) + ':' + readFileSync(p).toString('base64'))
    .sort()
    .join('\n')
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    const r = updateApp(process.argv[2] ?? process.cwd())
    console.log(`ai-sdlc ${r.version} on branch ${r.branch}`)
    console.log(r.changed.length ? `Updated:\n${r.changed.map((c) => `  - ${c}`).join('\n')}` : 'Already up to date.')
    if (r.extra.length) console.log(`Kept (not from the plugin):\n${r.extra.map((c) => `  - ${c}`).join('\n')}`)
    if (r.depNotes.length) console.log(`Dependencies differ (not changed):\n${r.depNotes.map((c) => `  - ${c}`).join('\n')}`)
    console.log('Next: pnpm install && pnpm check, then /ai-sdlc:ship.')
  } catch (err) {
    console.error(`✋ ${err.message}`)
    process.exit(1)
  }
}
