import { createServer } from 'node:http'
import type { IncomingMessage, Server } from 'node:http'
import type { AddressInfo } from 'node:net'

export interface Seen { method: string, url: string, authorization?: string, body?: unknown }

/** Minimal stand-in for the Go API (contracts/openapi.yaml): /v1/notes with bearer auth and problem+json errors. */
export async function startStubApi() {
  const seen: Seen[] = []
  const state = { down: false }
  const note = { id: '6f1c0f0e-9f5b-4d0e-8a58-0f6a1f0a0001', title: 'Buy milk', body: '', createdAt: '2026-10-06T08:00:00Z' }

  const readBody = async (req: IncomingMessage) => {
    const chunks: Buffer[] = []
    for await (const c of req) chunks.push(c as Buffer)
    const raw = Buffer.concat(chunks).toString()
    return raw ? JSON.parse(raw) : undefined
  }

  const server: Server = createServer(async (req, res) => {
    if (state.down) return req.socket.destroy()
    const body = await readBody(req)
    seen.push({ method: req.method ?? '', url: req.url ?? '', authorization: req.headers.authorization, body })
    const send = (status: number, payload: unknown, type = 'application/json') => {
      res.writeHead(status, { 'content-type': type })
      res.end(JSON.stringify(payload))
    }
    if (req.headers.authorization !== 'Bearer good-token') {
      return send(401, { title: 'Unauthorized', status: 401, detail: 'invalid token' }, 'application/problem+json')
    }
    if (req.url?.startsWith('/v1/notes') && req.method === 'GET') return send(200, { items: [note] })
    if (req.url === '/v1/notes' && req.method === 'POST') {
      if (body?.title === 'conflict') return send(409, { title: 'Conflict', status: 409, detail: 'duplicate note' }, 'application/problem+json')
      return send(201, { ...note, ...body })
    }
    send(404, { title: 'Not Found', status: 404 }, 'application/problem+json')
  })

  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  return { url, seen, state, close: () => server.close() }
}
