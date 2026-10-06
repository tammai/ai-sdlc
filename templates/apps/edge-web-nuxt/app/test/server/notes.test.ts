import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestApp } from './harness'

let app: Awaited<ReturnType<typeof createTestApp>>

beforeAll(async () => {
  app = await createTestApp()
})
afterAll(async () => {
  await app.dispose()
})

const post = (body: unknown) =>
  app.request('/api/notes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

describe('GET /api/notes', () => {
  it('returns an empty list when there are no notes', async () => {
    const res = await app.request('/api/notes')
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
    const list = await (await app.request('/api/notes')).json()
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
    const res = await app.request('/api/notes', { method: 'POST', body: 'not json' })
    expect(res.status).toBe(400)
    expect(res.headers.get('content-type')).toContain('application/problem+json')
  })
})
