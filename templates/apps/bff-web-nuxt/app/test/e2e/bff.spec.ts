import { fileURLToPath } from 'node:url'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { fetch, setup } from '@nuxt/test-utils/e2e'
import { startStubApi } from './stub-api'

// The Go API is stubbed on a local port; the BFF is the real, built Nuxt server.
const api = await startStubApi()
process.env.NUXT_API_BASE = api.url
process.env.NUXT_SESSION_PASSWORD = 'test-only-not-a-secret-0123456789abcdef'

await setup({ rootDir: fileURLToPath(new URL('../..', import.meta.url)), server: true })
afterAll(() => api.close())

const csrf = { 'x-requested-with': 'bff' }
const json = { 'content-type': 'application/json' }

async function login(token = 'good-token') {
  const res = await fetch('/api/auth/login', { method: 'POST', headers: { ...csrf, ...json }, body: JSON.stringify({ token }) })
  return { res, cookie: (res.headers.get('set-cookie') ?? '').split(';')[0] ?? '' }
}

beforeEach(() => {
  api.seen.length = 0
  api.state.down = false
})

describe('auth + CSRF', () => {
  it('rejects unauthenticated reads with problem+json', async () => {
    const res = await fetch('/api/notes')
    expect(res.status).toBe(401)
    expect(res.headers.get('content-type')).toContain('application/problem+json')
    expect(api.seen).toHaveLength(0)
  })

  it('rejects mutating requests without the CSRF header', async () => {
    const res = await fetch('/api/auth/login', { method: 'POST', headers: json, body: JSON.stringify({ token: 'good-token' }) })
    expect(res.status).toBe(403)
  })

  it('rejects mutating requests from a foreign Origin', async () => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { ...csrf, ...json, origin: 'https://evil.example' },
      body: JSON.stringify({ token: 'good-token' })
    })
    expect(res.status).toBe(403)
  })

  it('passes the API problem through when the token is rejected', async () => {
    const { res } = await login('bad-token')
    expect(res.status).toBe(401)
    expect(res.headers.get('content-type')).toContain('application/problem+json')
    expect(await res.json()).toMatchObject({ title: 'Unauthorized', detail: 'invalid token' })
  })

  it('sets an httpOnly SameSite=Lax cookie and never exposes the token to the browser', async () => {
    const { res, cookie } = await login()
    expect(res.status).toBe(200)
    const setCookie = res.headers.get('set-cookie') ?? ''
    expect(setCookie).toMatch(/HttpOnly/i)
    expect(setCookie).toMatch(/SameSite=Lax/i)
    const session = await fetch('/api/_auth/session', { headers: { cookie } })
    const text = await session.text()
    expect(text).not.toContain('good-token')
    expect(text).not.toContain('accessToken')
  })
})

describe('GET /api/notes', () => {
  it('forwards the session bearer token and query, returns the API payload', async () => {
    const { cookie } = await login()
    api.seen.length = 0
    const res = await fetch('/api/notes?limit=5', { headers: { cookie } })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ items: [{ title: 'Buy milk' }] })
    expect(api.seen).toEqual([expect.objectContaining({ method: 'GET', url: '/v1/notes?limit=5', authorization: 'Bearer good-token' })])
  })

  it('validates the query before forwarding', async () => {
    const { cookie } = await login()
    api.seen.length = 0
    const res = await fetch('/api/notes?limit=1000', { headers: { cookie } })
    expect(res.status).toBe(400)
    expect(res.headers.get('content-type')).toContain('application/problem+json')
    expect(api.seen).toHaveLength(0)
  })

  it('answers 502 problem+json when the API is down', async () => {
    const { cookie } = await login()
    api.state.down = true
    const res = await fetch('/api/notes', { headers: { cookie } })
    expect(res.status).toBe(502)
    expect(res.headers.get('content-type')).toContain('application/problem+json')
  })
})

describe('POST /api/notes', () => {
  it('forwards a valid note and returns 201', async () => {
    const { cookie } = await login()
    api.seen.length = 0
    const res = await fetch('/api/notes', { method: 'POST', headers: { ...csrf, ...json, cookie }, body: JSON.stringify({ title: 'Walk dog' }) })
    expect(res.status).toBe(201)
    expect(await res.json()).toMatchObject({ title: 'Walk dog' })
    expect(api.seen).toEqual([expect.objectContaining({ method: 'POST', url: '/v1/notes', authorization: 'Bearer good-token', body: { title: 'Walk dog' } })])
  })

  it.each([
    ['empty title', { title: '' }],
    ['unknown field', { title: 'x', extra: 1 }],
    ['title too long', { title: 'x'.repeat(201) }]
  ])('rejects invalid input (%s) without calling the API', async (_name, body) => {
    const { cookie } = await login()
    api.seen.length = 0
    const res = await fetch('/api/notes', { method: 'POST', headers: { ...csrf, ...json, cookie }, body: JSON.stringify(body) })
    expect(res.status).toBe(400)
    expect(res.headers.get('content-type')).toContain('application/problem+json')
    expect(api.seen).toHaveLength(0)
  })

  it('passes API errors through as problem+json', async () => {
    const { cookie } = await login()
    const res = await fetch('/api/notes', { method: 'POST', headers: { ...csrf, ...json, cookie }, body: JSON.stringify({ title: 'conflict' }) })
    expect(res.status).toBe(409)
    expect(res.headers.get('content-type')).toContain('application/problem+json')
    expect(await res.json()).toMatchObject({ title: 'Conflict', detail: 'duplicate note' })
  })

  it('requires the CSRF header even with a valid session', async () => {
    const { cookie } = await login()
    const res = await fetch('/api/notes', { method: 'POST', headers: { ...json, cookie }, body: JSON.stringify({ title: 'x' }) })
    expect(res.status).toBe(403)
  })
})
