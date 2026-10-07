import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { site } from '../../app/data/site'

const pagesDir = path.resolve(__dirname, '../../app/pages')
const pageFiles = fs.readdirSync(pagesDir).filter((f) => f.endsWith('.vue'))
const routeOf = (file: string) => (file === 'index.vue' ? '/' : `/${file.replace(/\.vue$/, '')}`)

describe('site data', () => {
  it('only links to pages that exist', () => {
    const routes = new Set(pageFiles.map(routeOf))
    for (const l of [...site.nav, ...site.legal]) expect(routes, `${l.to} has no file in app/pages`).toContain(l.to)
  })

  it('does not link to the same page twice', () => {
    const all = [...site.nav, ...site.legal].map((l) => l.to)
    expect(new Set(all).size).toBe(all.length)
  })
})

describe('pages', () => {
  it.each(pageFiles)('%s sets its own title and description', (file) => {
    const src = fs.readFileSync(path.join(pagesDir, file), 'utf8')
    expect(src, `${file} needs useSeoMeta({ title, description })`).toMatch(/useSeoMeta\(\{[^}]*title/s)
  })
})
