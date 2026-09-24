import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { classify, globToRegExp } from '../classify.mjs'

const config = JSON.parse(readFileSync(new URL('../rules.json', import.meta.url), 'utf8'))

const change = (path, added = [], extra = {}) => ({
  path,
  status: 'added',
  added,
  content: added.join('\n'),
  ...extra,
})
const tierOf = (...changes) => classify(changes, config).tier
const rulesOf = (...changes) => classify(changes, config).findings.map((f) => f.rule)

test('globs', () => {
  assert.ok(globToRegExp('server/api/**/*.{post,put}.ts').test('server/api/feedback.post.ts'))
  assert.ok(globToRegExp('server/api/**/*.{post,put}.ts').test('server/api/a/b/x.put.ts'))
  assert.ok(!globToRegExp('server/api/**/*.{post,put}.ts').test('server/api/x.get.ts'))
  assert.ok(globToRegExp('migrations/*.sql').test('migrations/0001_x.sql'))
  assert.ok(!globToRegExp('migrations/*.sql').test('migrations/meta/_journal.json'))
  assert.ok(globToRegExp('**').test('any/where/at.all'))
})

test('green: pages, components, copy', () => {
  assert.equal(tierOf(change('app/pages/index.vue', ['<h1>Hello team</h1>'])), 'green')
  assert.equal(tierOf(change('app/components/Card.vue', ['<img src="https://cdn.example.com/a.png">'])), 'green')
  assert.equal(tierOf(change('content/about.md', ['Contact us at the front desk'])), 'green')
})

test('yellow: new table, new read route, lockfile, config', () => {
  assert.equal(tierOf(change('server/db/schema.ts', ["title: text('title').notNull(),"])), 'yellow')
  assert.equal(tierOf(change('server/api/items.get.ts', ['export default defineEventHandler(() => [])'])), 'yellow')
  assert.equal(tierOf(change('pnpm-lock.yaml', ['  foo: 1.0.0'])), 'yellow')
  assert.equal(tierOf(change('nuxt.config.ts', ['devtools: { enabled: true },'])), 'yellow')
})

test('yellow: editing or deleting an existing check, but not adding one', () => {
  assert.equal(tierOf(change('tests/examples/a.spec.ts', ['test("x")'], { status: 'modified' })), 'yellow')
  assert.equal(tierOf(change('tests/examples/a.spec.ts', [], { status: 'deleted', content: null })), 'yellow')
  assert.equal(tierOf(change('tests/examples/new.spec.ts', ['test("x")'])), 'green')
})

test('red: personal data fields', () => {
  assert.deepEqual(rulesOf(change('server/db/schema.ts', ["salary: integer('salary'),"])), ['personal-data-field', 'database-change'])
  assert.equal(tierOf(change('migrations/0002_x.sql', ['ALTER TABLE `hires` ADD `work_email` text;'])), 'red')
  assert.equal(tierOf(change('server/db/schema.ts', ["dateOfBirth: text('date_of_birth'),"])), 'red')
})

test('red: destructive and rewritten migrations', () => {
  assert.ok(rulesOf(change('migrations/0003.sql', ['DROP TABLE `old`;'])).includes('destructive-migration'))
  assert.ok(rulesOf(change('migrations/0003.sql', ['ALTER TABLE x RENAME TO y;'])).includes('destructive-migration'))
  assert.ok(rulesOf(change('migrations/0003.sql', ['UPDATE feedback SET page = null;'])).includes('destructive-migration'))
  assert.ok(!rulesOf(change('migrations/0003.sql', ['CREATE TABLE `notes` (`id` integer);'])).includes('destructive-migration'))
  assert.ok(rulesOf(change('migrations/0000_init.sql', ['x'], { status: 'modified' })).includes('migration-rewritten'))
})

test('red: outside services, but not allow-listed Cloudflare ones', () => {
  assert.equal(tierOf(change('app/pages/x.vue', ["const r = await $fetch('https://api.openai.com/v1/x')"])), 'red')
  assert.equal(tierOf(change('app/app.vue', ['<script src="https://www.googletagmanager.com/gtag/js"></script>'])), 'red')
  assert.equal(tierOf(change('nuxt.config.ts', ["script: [{ src: 'https://connect.facebook.net/en_US/fbevents.js' }]"])), 'red')
  assert.equal(
    tierOf(change('app/components/T.vue', ["useScript('https://challenges.cloudflare.com/turnstile/v0/api.js')"])),
    'green',
  )
  assert.equal(tierOf(change('app/pages/x.vue', ["await $fetch('/api/feedback')"])), 'green')
})

test('red: write endpoint without sign-in or bot protection', () => {
  const open = change('server/api/signup.post.ts', ['export default defineEventHandler(async (e) => readBody(e))'])
  assert.ok(rulesOf(open).includes('unprotected-write'))
  const guarded = change('server/api/signup.post.ts', ['await verifyTurnstile(event, body.token)'])
  assert.ok(!rulesOf(guarded).includes('unprotected-write'))
  const staff = change('server/api/leave.delete.ts', ['const user = await requireUser(event)'])
  assert.ok(!rulesOf(staff).includes('unprotected-write'))
})

test('red: new library, secrets, engineer-owned files', () => {
  assert.equal(tierOf(change('package.json', ['    "left-pad": "^1.3.0",'], { status: 'modified' })), 'red')
  assert.equal(tierOf(change('package.json', ['    "dev": "nuxt dev --host",'], { status: 'modified' })), 'green')
  assert.equal(tierOf(change('.github/workflows/ci.yml', ['on: push'])), 'red')
  assert.equal(tierOf(change('wrangler.jsonc', ['"name": "x"'])), 'red')
  assert.equal(tierOf(change('server/utils/access.ts', ['// x'])), 'red')
  assert.equal(tierOf(change('.dev.vars', ['X=1'])), 'red')
  assert.equal(tierOf(change('.dev.vars.example', ['X='])), 'green')
})

test('secret values are never echoed back', () => {
  const { findings } = classify([change('server/api/x.get.ts', ["const apiKey = 'sk-live-abcdefghijklmnopqrstuvwx'"])], config)
  const secret = findings.find((f) => f.rule === 'secret-in-code')
  assert.ok(secret)
  assert.equal(secret.detail, '(value hidden)')
})

test('personal-data apps escalate yellow to red, but leave green alone', () => {
  const yellow = [change('server/api/items.get.ts', ['x'])]
  assert.equal(classify(yellow, config, { data: 'personal' }).tier, 'red')
  assert.deepEqual(classify(yellow, config, { data: 'personal' }).escalated, { from: 'yellow', to: 'red', data: 'personal' })
  assert.equal(classify(yellow, config, { data: 'internal' }).tier, 'yellow')
  assert.equal(classify([change('app/pages/a.vue', ['x'])], config, { data: 'personal' }).tier, 'green')
})

test('windows paths are normalised', () => {
  assert.equal(tierOf(change('server\\utils\\access.ts', ['x'])), 'red')
})

test('red: script injected by assigning .src', () => {
  assert.equal(tierOf(change('app/components/X.vue', ["s.src = 'https://tracker.example.com/t.js'"])), 'red')
  assert.equal(tierOf(change('app/components/X.vue', ["s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js'"])), 'green')
})

test('red: the deploy guard and build/deploy scripts are engineer-owned', () => {
  assert.equal(tierOf(change('scripts/deploy-guard.mjs', ['x'], { status: 'modified' })), 'red')
  assert.equal(tierOf(change('server/middleware/0.deploy-guard.ts', ['x'], { status: 'modified' })), 'red')
  assert.equal(tierOf(change('package.json', ['    "deploy:production": "wrangler deploy",'], { status: 'modified' })), 'red')
  assert.equal(tierOf(change('package.json', ['    "build": "nuxt build --no-guard",'], { status: 'modified' })), 'red')
  assert.equal(tierOf(change('package.json', ['    "dev": "nuxt dev --host",'], { status: 'modified' })), 'green')
})
