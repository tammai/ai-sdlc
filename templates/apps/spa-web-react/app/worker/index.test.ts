// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import worker, { type Env } from './index'

const ORIGIN = 'https://api.internal.test'
const assets = vi.fn(async () => new Response('<html>spa</html>', { headers: { 'content-type': 'text/html' } }))
const env: Env = { ASSETS: { fetch: assets }, ORIGIN_URL: ORIGIN }

const upstream = vi.fn<(input: URL | string, init?: RequestInit) => Promise<Response>>()

beforeEach(() => {
  assets.mockClear()
  upstream.mockReset()
  upstream.mockImplementation(async () => Response.json({ items: [] }))
  vi.stubGlobal('fetch', upstream)
})
afterEach(() => vi.unstubAllGlobals())

const sent = () => {
  const [url, init] = upstream.mock.calls[0]!
  return { url: new URL(String(url)), init: init!, headers: new Headers(init!.headers) }
}

describe('worker: /api passthrough', () => {
  it('strips the /api prefix and keeps path, query and method', async () => {
    await worker.fetch(new Request('https://app.test/api/v1/notes?limit=5&cursor=a%20b'), env)
    const { url, init } = sent()
    expect(url.origin).toBe(ORIGIN)
    expect(url.pathname).toBe('/v1/notes')
    expect(url.search).toBe('?limit=5&cursor=a%20b')
    expect(init.method).toBe('GET')
    expect(assets).not.toHaveBeenCalled()
  })

  it('maps /api itself to the API root and honours a base path in ORIGIN_URL', async () => {
    await worker.fetch(new Request('https://app.test/api'), { ...env, ORIGIN_URL: `${ORIGIN}/base/` })
    expect(sent().url.pathname).toBe('/base/')
  })

  it('forwards headers and body unchanged and does not follow redirects', async () => {
    const body = JSON.stringify({ title: 'Buy milk' })
    await worker.fetch(
      new Request('https://app.test/api/v1/notes', {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: 'session=abc', 'x-requested-with': 'fetch', authorization: 'Bearer t' },
        body
      }),
      env
    )
    const { headers, init } = sent()
    expect(init.method).toBe('POST')
    expect(init.redirect).toBe('manual')
    expect(headers.get('cookie')).toBe('session=abc')
    expect(headers.get('x-requested-with')).toBe('fetch')
    expect(headers.get('authorization')).toBe('Bearer t')
    expect(headers.get('content-type')).toBe('application/json')
    expect(await new Response(init.body as ReadableStream).text()).toBe(body)
  })

  it('sets X-Forwarded-Host/Proto/For from the request and ignores client-supplied values', async () => {
    await worker.fetch(
      new Request('https://app.example.com/api/v1/auth/me', { headers: { 'cf-connecting-ip': '203.0.113.7', 'x-forwarded-for': '6.6.6.6', 'x-forwarded-host': 'evil.test' } }),
      env
    )
    const { headers } = sent()
    expect(headers.get('x-forwarded-host')).toBe('app.example.com')
    expect(headers.get('x-forwarded-proto')).toBe('https')
    expect(headers.get('x-forwarded-for')).toBe('203.0.113.7')
  })

  it('drops hop-by-hop headers (and anything named by Connection) on the way out', async () => {
    await worker.fetch(
      new Request('https://app.test/api/v1/notes', { headers: { connection: 'keep-alive, x-private', 'keep-alive': 'timeout=5', te: 'trailers', upgrade: 'h2c', 'x-private': '1', 'x-keep': '1' } }),
      env
    )
    const { headers } = sent()
    for (const h of ['connection', 'keep-alive', 'te', 'upgrade', 'x-private']) expect(headers.has(h), h).toBe(false)
    expect(headers.get('x-keep')).toBe('1')
  })

  it('passes status, body and every Set-Cookie back unchanged, minus hop-by-hop headers', async () => {
    const res = new Response('{"id":"1"}', { status: 201, headers: { 'content-type': 'application/json', 'cache-control': 'private', 'keep-alive': 'timeout=5' } })
    res.headers.append('set-cookie', 'session=abc; Path=/; HttpOnly; Secure; SameSite=Lax')
    res.headers.append('set-cookie', 'theme=dark; Path=/')
    upstream.mockResolvedValue(res)
    const out = await worker.fetch(new Request('https://app.test/api/v1/notes', { method: 'POST', body: '{}' }), env)
    expect(out.status).toBe(201)
    expect(await out.text()).toBe('{"id":"1"}')
    expect(out.headers.getSetCookie()).toEqual(['session=abc; Path=/; HttpOnly; Secure; SameSite=Lax', 'theme=dark; Path=/'])
    expect(out.headers.get('cache-control')).toBe('private')
    expect(out.headers.has('keep-alive')).toBe(false)
  })

  it('passes a 302 (OIDC start) through to the browser untouched', async () => {
    upstream.mockResolvedValue(new Response(null, { status: 302, headers: { location: 'https://idp.test/authorize?x=1' } }))
    const out = await worker.fetch(new Request('https://app.test/api/v1/auth/oidc/google/start?redirect=%2Fnotes'), env)
    expect(out.status).toBe(302)
    expect(out.headers.get('location')).toBe('https://idp.test/authorize?x=1')
    expect(sent().url.pathname).toBe('/v1/auth/oidc/google/start')
    expect(sent().url.search).toBe('?redirect=%2Fnotes')
  })

  it('passes API error responses through without reshaping', async () => {
    upstream.mockResolvedValue(new Response('{"title":"Unauthorized","status":401}', { status: 401, headers: { 'content-type': 'application/problem+json' } }))
    const out = await worker.fetch(new Request('https://app.test/api/v1/auth/me'), env)
    expect(out.status).toBe(401)
    expect(await out.json()).toEqual({ title: 'Unauthorized', status: 401 })
  })

  it('answers 502 problem+json when the API is unreachable, and 500 when ORIGIN_URL is missing', async () => {
    upstream.mockRejectedValue(new TypeError('fetch failed'))
    const down = await worker.fetch(new Request('https://app.test/api/v1/notes'), env)
    expect(down.status).toBe(502)
    expect(down.headers.get('content-type')).toContain('application/problem+json')

    const misconfigured = await worker.fetch(new Request('https://app.test/api/v1/notes'), { ...env, ORIGIN_URL: '' })
    expect(misconfigured.status).toBe(500)
  })
})

describe('worker: everything else is the SPA', () => {
  it.each(['/', '/login', '/some/deep/route', '/apiary', '/_nuxt/entry.js'])('does not proxy %s', async (path) => {
    const out = await worker.fetch(new Request(`https://app.test${path}`), env)
    expect(await out.text()).toContain('spa')
    expect(assets).toHaveBeenCalledTimes(1)
    expect(upstream).not.toHaveBeenCalled()
  })
})
