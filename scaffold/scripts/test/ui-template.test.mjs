import assert from 'node:assert/strict'
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { installTemplate, TEMPLATE_FOR_TYPE } from '../ui-template.mjs'

const repo = fileURLToPath(new URL('../../', import.meta.url))
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'))

function sandbox(type = 'internal') {
  const dir = mkdtempSync(join(tmpdir(), 'ui-template-'))
  cpSync(join(repo, 'ui-templates'), join(dir, 'ui-templates'), { recursive: true })
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ dependencies: { nuxt: '^4', '@nuxt/ui': '^4' } }))
  writeFileSync(join(dir, 'app.registry.json'), JSON.stringify({ type }))
  return dir
}

const files = (dir) =>
  readdirSync(dir, { recursive: true })
    .map(String)
    .filter((p) => statSync(join(dir, p)).isFile())
    .sort()

test('every template has a manifest pinned to a commit and a layer', () => {
  for (const name of Object.values(TEMPLATE_FOR_TYPE)) {
    const m = readJson(join(repo, 'ui-templates', name, 'manifest.json'))
    assert.equal(m.name, name)
    assert.match(m.source.commit, /^[0-9a-f]{40}$/)
    assert.ok(existsSync(join(repo, 'ui-templates', name, 'layer', 'app', 'layouts', 'default.vue')))
  }
})

test('picks the template from the app type and replaces the layer wholesale', () => {
  const dir = sandbox('internal')
  try {
    assert.equal(installTemplate(dir).name, 'dashboard')
    assert.ok(existsSync(join(dir, 'layers/ui/app/components/UserMenu.vue')))
    installTemplate(dir, 'starter')
    assert.ok(!existsSync(join(dir, 'layers/ui/app/components/UserMenu.vue')), 'nothing lingers from the previous template')
    assert.equal(readJson(join(dir, 'layers/ui/.template.json')).name, 'starter')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('landing adds @nuxt/content and its content; switching away removes the dependency but keeps edited content', () => {
  const dir = sandbox('public')
  try {
    const r = installTemplate(dir)
    assert.equal(r.name, 'landing')
    assert.ok(readJson(join(dir, 'package.json')).dependencies['@nuxt/content'])
    writeFileSync(join(dir, 'content/landing.yml'), 'title: Edited by marketing\n')
    assert.deepEqual(installTemplate(dir, 'landing').kept.sort(), ['content.config.ts', join('content', 'landing.yml')].sort())
    assert.equal(readFileSync(join(dir, 'content/landing.yml'), 'utf8'), 'title: Edited by marketing\n')
    installTemplate(dir, 'dashboard')
    assert.equal(readJson(join(dir, 'package.json')).dependencies['@nuxt/content'], undefined)
    assert.equal(readJson(join(dir, 'package.json')).dependencies.nuxt, '^4')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('refuses an unknown template', () => {
  const dir = sandbox()
  try {
    assert.throws(() => installTemplate(dir, 'saas'), /Unknown template/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('the installed layers/ui matches its template exactly (no hand edits)', () => {
  const installed = readJson(join(repo, 'layers/ui/.template.json')).name
  const src = join(repo, 'ui-templates', installed, 'layer')
  const dst = join(repo, 'layers/ui')
  const expected = files(src)
  assert.deepEqual(files(dst).filter((f) => f !== '.template.json'), expected)
  for (const f of expected) {
    assert.equal(readFileSync(join(dst, f), 'utf8'), readFileSync(join(src, f), 'utf8'), `${relative(repo, join(dst, f))} was edited by hand`)
  }
})
