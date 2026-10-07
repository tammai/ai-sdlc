import { describe, expect, it } from 'vitest'
import { createApi } from '../../app/api/client'
import { safeRedirect, loginLocation } from '../../app/utils/redirect'

// Node env: a relative '/api' base only resolves in a browser, so the factory takes an absolute one here.
function clientWithSpy(respond: () => Response = () => Response.json({ id: '1', email: 'ada@example.com' })) {
  const calls: Request[] = []
  const api = createApi('http://app.test/api', async (req) => {
    calls.push(req)
    return respond()
  })
  return { api, calls }
}

describe('API client', () => {
  it('calls /api/* with X-Requested-With: fetch and same-origin credentials', async () => {
    const { api, calls } = clientWithSpy()
    await api.GET('/v1/auth/me')
    expect(new URL(calls[0]!.url).pathname).toBe('/api/v1/auth/me')
    expect(calls[0]!.headers.get('x-requested-with')).toBe('fetch')
    expect(calls[0]!.credentials).toBe('same-origin')
  })

  it('sends the CSRF header on state-changing calls too', async () => {
    const { api, calls } = clientWithSpy(() => new Response(null, { status: 204 }))
    await api.DELETE('/v1/auth/session')
    await api.POST('/v1/notes', { body: { title: 'Buy milk' } })
    expect(calls.map((c) => c.method)).toEqual(['DELETE', 'POST'])
    for (const c of calls) expect(c.headers.get('x-requested-with')).toBe('fetch')
  })
})

describe('redirect helpers', () => {
  it.each([
    ['/notes?x=1', '/notes?x=1'],
    ['//evil.test', '/'],
    ['https://evil.test', '/'],
    ['/\\evil.test', '/'],
    [undefined, '/'],
    [['/a', '/b'], '/a']
  ])('safeRedirect(%j) -> %s', (input, expected) => {
    expect(safeRedirect(input)).toBe(expected)
  })

  it('loginLocation keeps the intended path, but not for the home page', () => {
    expect(loginLocation('/notes?page=2')).toEqual({ path: '/login', query: { redirect: '/notes?page=2' } })
    expect(loginLocation('/')).toEqual({ path: '/login' })
    expect(loginLocation('//evil.test')).toEqual({ path: '/login' })
  })
})
