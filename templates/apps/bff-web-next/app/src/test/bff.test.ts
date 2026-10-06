// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GET as listNotes, POST as createNote } from '@/app/api/notes/route'
import { POST as login } from '@/app/api/auth/login/route'
import { GET as sessionInfo } from '@/app/api/auth/session/route'
import { sessionOptions } from '@/lib/session'
import { cookieJar } from './cookie-jar'
import { stubApi } from './stub-api'

// Route handlers run for real; only the Go API (global fetch) is stubbed.
let api: ReturnType<typeof stubApi>

beforeEach(() => {
  cookieJar.clear()
  api = stubApi()
})
afterEach(() => vi.unstubAllGlobals())

const csrf = { 'x-requested-with': 'bff' }
const jsonHeaders = { ...csrf, 'content-type': 'application/json' }
const post = (url: string, body: unknown, headers: Record<string, string> = jsonHeaders) =>
  new Request(`http://localhost:3000${url}`, { method: 'POST', headers, body: JSON.stringify(body) })
const get = (url: string) => new Request(`http://localhost:3000${url}`)

async function signIn(token = 'good-token') {
  return login(post('/api/auth/login', { token }))
}

describe('auth + CSRF', () => {
  it('rejects unauthenticated reads with problem+json', async () => {
    const res = await listNotes(get('/api/notes'))
    expect(res.status).toBe(401)
    expect(res.headers.get('content-type')).toContain('application/problem+json')
    expect(api.seen).toHaveLength(0)
  })

  it('rejects mutating requests without the CSRF header', async () => {
    const res = await login(post('/api/auth/login', { token: 'good-token' }, { 'content-type': 'application/json' }))
    expect(res.status).toBe(403)
    expect(api.seen).toHaveLength(0)
  })

  it('rejects mutating requests from a foreign Origin', async () => {
    const res = await login(post('/api/auth/login', { token: 'good-token' }, { ...jsonHeaders, origin: 'https://evil.example' }))
    expect(res.status).toBe(403)
  })

  it('accepts a same-origin Origin', async () => {
    const res = await login(post('/api/auth/login', { token: 'good-token' }, { ...jsonHeaders, origin: 'http://localhost:3000', host: 'localhost:3000' }))
    expect(res.status).toBe(200)
  })

  it('passes the API problem through when the token is rejected', async () => {
    const res = await signIn('bad-token')
    expect(res.status).toBe(401)
    expect(res.headers.get('content-type')).toContain('application/problem+json')
    expect(await res.json()).toMatchObject({ title: 'Unauthorized', detail: 'invalid token' })
    expect(cookieJar.stored(sessionOptions().cookieName)).toBeUndefined()
  })

  it('stores the token in an httpOnly SameSite=Lax sealed cookie and never exposes it', async () => {
    expect((await signIn()).status).toBe(200)
    const cookie = cookieJar.stored(sessionOptions().cookieName)
    expect(cookie?.options).toMatchObject({ httpOnly: true, sameSite: 'lax' })
    expect(cookie?.value).not.toContain('good-token') // sealed, not plain text

    const info = await sessionInfo()
    expect(await info.json()).toEqual({ loggedIn: true })
  })
})

describe('GET /api/notes', () => {
  it('forwards the session bearer token and query, returns the API payload', async () => {
    await signIn()
    api.seen.length = 0
    const res = await listNotes(get('/api/notes?limit=5'))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ items: [{ title: 'Buy milk' }] })
    expect(api.seen).toEqual([{ method: 'GET', url: '/v1/notes?limit=5', authorization: 'Bearer good-token', body: undefined }])
  })

  it('validates the query before forwarding', async () => {
    await signIn()
    api.seen.length = 0
    const res = await listNotes(get('/api/notes?limit=1000'))
    expect(res.status).toBe(400)
    expect(res.headers.get('content-type')).toContain('application/problem+json')
    expect(api.seen).toHaveLength(0)
  })

  it('answers 502 problem+json when the API is down', async () => {
    await signIn()
    api.state.down = true
    const res = await listNotes(get('/api/notes'))
    expect(res.status).toBe(502)
    expect(res.headers.get('content-type')).toContain('application/problem+json')
  })
})

describe('POST /api/notes', () => {
  it('forwards a valid note and returns 201', async () => {
    await signIn()
    api.seen.length = 0
    const res = await createNote(post('/api/notes', { title: 'Walk dog' }))
    expect(res.status).toBe(201)
    expect(await res.json()).toMatchObject({ title: 'Walk dog' })
    expect(api.seen).toEqual([{ method: 'POST', url: '/v1/notes', authorization: 'Bearer good-token', body: { title: 'Walk dog' } }])
  })

  it.each([
    ['empty title', { title: '' }],
    ['unknown field', { title: 'x', extra: 1 }],
    ['title too long', { title: 'x'.repeat(201) }]
  ])('rejects invalid input (%s) without calling the API', async (_name, body) => {
    await signIn()
    api.seen.length = 0
    const res = await createNote(post('/api/notes', body))
    expect(res.status).toBe(400)
    expect(res.headers.get('content-type')).toContain('application/problem+json')
    expect(api.seen).toHaveLength(0)
  })

  it('passes API errors through as problem+json', async () => {
    await signIn()
    const res = await createNote(post('/api/notes', { title: 'conflict' }))
    expect(res.status).toBe(409)
    expect(res.headers.get('content-type')).toContain('application/problem+json')
    expect(await res.json()).toMatchObject({ title: 'Conflict', detail: 'duplicate note' })
  })

  it('requires the CSRF header even with a valid session', async () => {
    await signIn()
    const res = await createNote(post('/api/notes', { title: 'x' }, { 'content-type': 'application/json' }))
    expect(res.status).toBe(403)
  })
})
