import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getPlatformProxy } from 'wrangler'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { CloudflareEnv } from '@/server/env'

// The route handlers read bindings through getCloudflareContext(); here it returns local emulated ones.
const ctx = vi.hoisted(() => ({ env: undefined as unknown }))
vi.mock('@opennextjs/cloudflare', () => ({ getCloudflareContext: () => ({ env: ctx.env }) }))

import { GET, POST } from '@/app/api/notes/route'

const MIGRATIONS = join(process.cwd(), 'server/db/migrations')
let proxy: Awaited<ReturnType<typeof getPlatformProxy<CloudflareEnv>>>

beforeAll(async () => {
  // In-memory D1/KV/R2 from wrangler.jsonc on workerd — no Cloudflare account needed.
  proxy = await getPlatformProxy<CloudflareEnv>({ configPath: 'wrangler.jsonc', persist: false })
  ctx.env = proxy.env
  for (const file of readdirSync(MIGRATIONS).filter(f => f.endsWith('.sql')).sort()) {
    for (const statement of readFileSync(join(MIGRATIONS, file), 'utf8').split('--> statement-breakpoint')) {
      if (statement.trim()) await proxy.env.DB.prepare(statement).run()
    }
  }
})
afterAll(async () => {
  await proxy.dispose()
})

const post = (body: unknown) =>
  POST(new Request('http://localhost/api/notes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }))

describe('GET /api/notes', () => {
  it('returns an empty list when there are no notes', async () => {
    const res = await GET()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([])
  })
})

describe('POST /api/notes', () => {
  it('creates a note and lists it newest first', async () => {
    const first = await post({ title: '  First  ', body: 'hello' })
    expect(first.status).toBe(201)
    const created = await first.json()
    expect(created).toMatchObject({ title: 'First', body: 'hello' })
    expect(created.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(created.createdAt).toBeTruthy()

    await post({ title: 'Second' })
    const list = await (await GET()).json()
    expect(list.map((n: { title: string }) => n.title)).toEqual(['Second', 'First'])
    expect(list[0].body).toBe('')
  })

  it('rejects an invalid body with a 400 problem+json', async () => {
    const res = await post({ title: '' })
    expect(res.status).toBe(400)
    expect(res.headers.get('content-type')).toContain('application/problem+json')
    const problem = await res.json()
    expect(problem).toMatchObject({ status: 400, title: 'Invalid request' })
    expect(problem.errors[0]).toMatchObject({ path: 'title' })
  })

  it('rejects a missing or malformed body', async () => {
    const res = await POST(new Request('http://localhost/api/notes', { method: 'POST', body: 'not json' }))
    expect(res.status).toBe(400)
    expect(res.headers.get('content-type')).toContain('application/problem+json')
  })
})
