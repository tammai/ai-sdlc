#!/usr/bin/env node
// /ai-sdlc:update-app. Brings an existing app's plugin-owned files up to this plugin version:
//   node update-app.mjs [appDir]
// Only paths listed in scripts/managed.json are written. The app's own work (pages, queries,
// API routes, schema, migrations, intents, content, example tests, config) is never touched.
// Runs on a new branch; the result ships like any change, through /ai-sdlc:ship.

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

  writeFileSync(join(app, '.ai-sdlc.json'), JSON.stringify({ plugin: 'ai-sdlc', version }, null, 2) + '\n')

  if (git && changed.length) {
    run('add', '-A')
    run('commit', '-q', '-m', `Update ai-sdlc managed files to ${version}`)
  }
  return { branch, version, changed, extra, depNotes }
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
