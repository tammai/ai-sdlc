import { vi } from 'vitest'

export interface Seen {
  method: string
  url: string
  authorization: string | null
  body: unknown
}

/**
 * Replaces global fetch with a minimal stand-in for the Go API (contracts/openapi.yaml):
 * /v1/notes with bearer auth and problem+json errors. No network involved.
 */
export function stubApi() {
  const seen: Seen[] = []
  const state = { down: false }
  const note = { id: '6f1c0f0e-9f5b-4d0e-8a58-0f6a1f0a0001', title: 'Buy milk', body: '', createdAt: '2026-10-06T08:00:00Z' }

  const respond = (status: number, payload: unknown, type = 'application/json') =>
    new Response(JSON.stringify(payload), { status, headers: { 'content-type': type } })
  const problem = (status: number, title: string, detail: string) =>
    respond(status, { title, status, detail }, 'application/problem+json')

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: Request) => {
      if (state.down) throw new TypeError('fetch failed')
      const url = new URL(input.url)
      const raw = await input.clone().text()
      const body = raw ? JSON.parse(raw) : undefined
      seen.push({ method: input.method, url: url.pathname + url.search, authorization: input.headers.get('authorization'), body })

      if (input.headers.get('authorization') !== 'Bearer good-token') return problem(401, 'Unauthorized', 'invalid token')
      if (url.pathname === '/v1/notes' && input.method === 'GET') return respond(200, { items: [note] })
      if (url.pathname === '/v1/notes' && input.method === 'POST') {
        if (body?.title === 'conflict') return problem(409, 'Conflict', 'duplicate note')
        return respond(201, { ...note, ...body })
      }
      return problem(404, 'Not Found', 'no such route')
    })
  )

  return { seen, state }
}
