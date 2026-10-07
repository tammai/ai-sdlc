import { vi } from 'vitest'

type Handler = (req: Request) => Response | Promise<Response>

/** Stubs globalThis.fetch with a table of "METHOD /path" → response; records every request. No network. */
export function stubApi(routes: Record<string, Handler | Response | object>) {
  const calls: Request[] = []
  const fn = vi.fn(async (input: Request) => {
    const req = input instanceof Request ? input : new Request(input)
    calls.push(req)
    const { pathname } = new URL(req.url)
    const hit = routes[`${req.method} ${pathname}`]
    if (hit === undefined) return Response.json({ title: 'Not found', status: 404 }, { status: 404 })
    if (typeof hit === 'function') return hit(req)
    return hit instanceof Response ? hit.clone() : Response.json(hit)
  })
  vi.stubGlobal('fetch', fn)
  return { calls, fn }
}

export const problem = (status: number, title: string) =>
  new Response(JSON.stringify({ title, status }), { status, headers: { 'content-type': 'application/problem+json' } })

export const user = { id: '0b0e8a58-9f5b-4d0e-8a58-0f6a1f0a0001', email: 'ada@example.com' }
export const note = { id: '6f1c0f0e-9f5b-4d0e-8a58-0f6a1f0a0001', title: 'Buy milk', body: '2 litres', createdAt: '2026-10-06T08:00:00Z' }
