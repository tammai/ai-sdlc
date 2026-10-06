import createClient from 'openapi-fetch'
import type { components, paths } from './schema'

export type Note = components['schemas']['Note']
export type NewNote = components['schemas']['NewNote']
export type NotePage = components['schemas']['NotePage']
export type Problem = components['schemas']['Problem']

// The BFF exposes the contract's /v1/* operations under /api/* (e.g. /v1/notes -> /api/notes).
// Typing the browser client from the same schema keeps both hops honest.
type BffPaths = {
  '/notes': paths['/v1/notes']
}

// X-Requested-With is the CSRF header checked by server/middleware/csrf.ts.
export const CSRF_HEADERS = { 'X-Requested-With': 'bff' } as const

export const api = createClient<BffPaths>({
  baseUrl: '/api',
  headers: CSRF_HEADERS
})

export function problemMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'title' in error) {
    const p = error as Partial<Problem>
    return p.detail ? `${p.title}: ${p.detail}` : String(p.title)
  }
  return 'Something went wrong'
}
