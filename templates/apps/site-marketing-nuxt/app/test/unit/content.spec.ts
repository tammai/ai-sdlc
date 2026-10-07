import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { site } from '../../app/data/site'

const root = path.resolve(__dirname, '../..')
const contentDir = path.join(root, 'content')

function markdownFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? markdownFiles(path.join(dir, e.name)) : e.name.endsWith('.md') ? [path.join(dir, e.name)] : []))
}

const files = markdownFiles(contentDir)
const read = (f: string) => fs.readFileSync(f, 'utf8')
const topLevelPages = new Set(fs.readdirSync(contentDir).filter((f) => f.endsWith('.md')).map((f) => `/${f.replace(/\.md$/, '')}`))

describe('navigation', () => {
  it('only links to the home page, the blog, or a Markdown page that exists', () => {
    for (const l of [...site.nav, ...site.legal]) {
      expect(l.to === '/' || l.to === '/blog' || topLevelPages.has(l.to), `${l.to} has no file in content/`).toBe(true)
    }
  })

  it('does not link to the same page twice', () => {
    const all = [...site.nav, ...site.legal].map((l) => l.to)
    expect(new Set(all).size).toBe(all.length)
  })
})

describe('content files', () => {
  it.each(files.map((f) => [path.relative(root, f), f]))('%s has frontmatter with a title and a description', (_name, file) => {
    const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(read(file))?.[1] ?? ''
    expect(fm, 'missing frontmatter block').not.toBe('')
    expect(fm).toMatch(/^title:\s*\S/m)
    expect(fm).toMatch(/^description:\s*\S/m)
  })

  it('does not use a draft: flag (it would not keep the text private; drafts live in content/blog/drafts/)', () => {
    for (const f of files) expect(read(f), path.relative(root, f)).not.toMatch(/^draft:/m)
  })

  it('has blog posts with a YYYY-MM-DD date', () => {
    for (const f of files.filter((p) => p.includes(`${path.sep}blog${path.sep}`))) {
      expect(read(f), path.relative(root, f)).toMatch(/^date:\s*\d{4}-\d{2}-\d{2}\s*$/m)
    }
  })
})

describe('media references', () => {
  // Real references only: Markdown links and images, `src="/media/…"`, and frontmatter `image:` keys (prose mentions like /media/<key> are skipped).
  const refs = files.flatMap((f) => {
    const text = read(f)
    const keys = [
      ...[...text.matchAll(/\]\(\/media\/([^)\s]+)\)/g)].map((m) => m[1]!),
      ...[...text.matchAll(/src="\/media\/([^"]+)"/g)].map((m) => m[1]!),
      ...[...text.matchAll(/^image:\s*(\S+)\s*$/gm)].map((m) => m[1]!.replace(/^\/?(media\/)?/, ''))
    ]
    return keys.map((key) => ({ file: path.relative(root, f), key }))
  })

  it('scans real files (so this check is not vacuous)', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  it('use keys made of letters, digits and ._~- with / between folders (the keys the Worker serves)', () => {
    for (const { file, key } of refs) expect(key, `${file}: /media/${key}`).toMatch(/^[A-Za-z0-9._~-]+(\/[A-Za-z0-9._~-]+)*$/)
  })

  it('give every Markdown image alt text', () => {
    for (const f of files) {
      for (const m of read(f).matchAll(/!\[([^\]]*)\]\(([^)]+)\)/g)) expect(m[1]!.trim(), `${path.relative(root, f)}: image ${m[2]} has no alt text`).not.toBe('')
    }
  })
})
