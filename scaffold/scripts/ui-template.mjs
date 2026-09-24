#!/usr/bin/env node
// Installs a UI template: `pnpm ui:template [starter|dashboard|landing]`. Engineer-owned (red tier).
//
// Templates live in ui-templates/<name>/, curated from github.com/nuxt-ui-templates at the commit
// named in each manifest.json:
//   layer/  → becomes layers/ui/, a Nuxt layer (layout, shell components, starting pages)
//   root/   → copied into the project root, but never over a file that already exists (e.g. content/)
//   manifest.json "dependencies" → added to package.json. Other templates' dependencies are removed.
//
// With no argument it installs the template that matches app.registry.json "type":
// internal → dashboard, public → landing, prototype → starter.

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'

export const TEMPLATE_FOR_TYPE = { internal: 'dashboard', public: 'landing', prototype: 'starter' }

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'))
const writeJson = (p, v) => writeFileSync(p, JSON.stringify(v, null, 2) + '\n')

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })
}

export function installTemplate(root, requested) {
  const templatesDir = join(root, 'ui-templates')
  const available = readdirSync(templatesDir).filter((n) => existsSync(join(templatesDir, n, 'manifest.json')))
  const registry = existsSync(join(root, 'app.registry.json')) ? readJson(join(root, 'app.registry.json')) : {}
  const name = requested ?? TEMPLATE_FOR_TYPE[registry.type]
  if (!name || !available.includes(name)) {
    throw new Error(`Unknown template "${name}". Choose one of: ${available.join(', ')}`)
  }
  const manifests = Object.fromEntries(available.map((n) => [n, readJson(join(templatesDir, n, 'manifest.json'))]))
  const manifest = manifests[name]

  // 1. The layer: replaced wholesale, so nothing from the previous template lingers.
  const layer = join(root, 'layers', 'ui')
  rmSync(layer, { recursive: true, force: true })
  mkdirSync(dirname(layer), { recursive: true })
  cpSync(join(templatesDir, name, 'layer'), layer, { recursive: true })
  writeJson(join(layer, '.template.json'), { name, source: manifest.source })

  // 2. Root files (content, its schema): added once, never overwritten, because people edit them.
  const added = []
  const kept = []
  const rootSrc = join(templatesDir, name, 'root')
  if (existsSync(rootSrc)) {
    for (const src of walk(rootSrc)) {
      const rel = relative(rootSrc, src)
      const dest = join(root, rel)
      if (existsSync(dest)) {
        kept.push(rel)
        continue
      }
      mkdirSync(dirname(dest), { recursive: true })
      cpSync(src, dest)
      added.push(rel)
    }
  }

  // 3. Dependencies: this template's in, every other template's out.
  const pkgPath = join(root, 'package.json')
  const pkg = readJson(pkgPath)
  const others = new Set(
    Object.entries(manifests)
      .filter(([n]) => n !== name)
      .flatMap(([, m]) => Object.keys(m.dependencies ?? {})),
  )
  for (const dep of others) if (!(dep in (manifest.dependencies ?? {}))) delete pkg.dependencies[dep]
  Object.assign(pkg.dependencies, manifest.dependencies ?? {})
  pkg.dependencies = Object.fromEntries(Object.entries(pkg.dependencies).sort(([a], [b]) => a.localeCompare(b)))
  writeJson(pkgPath, pkg)

  return { name, added, kept, dependencies: Object.keys(manifest.dependencies ?? {}) }
}

function main() {
  const result = installTemplate(process.cwd(), process.argv[2])
  console.log(`Installed the "${result.name}" UI template into layers/ui/.`)
  if (result.added.length) console.log(`Added: ${result.added.join(', ')}`)
  if (result.kept.length) console.log(`Kept existing (not overwritten): ${result.kept.join(', ')}`)
  console.log('Next: pnpm install && pnpm check')
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    main()
  } catch (err) {
    console.error(`✋ ${err.message}`)
    process.exit(1)
  }
}
