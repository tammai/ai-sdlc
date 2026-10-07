import createClient from 'openapi-fetch'
import type { components, paths } from './schema'

export type User = components['schemas']['User']
export type AuthProviders = components['schemas']['AuthProviders']
export type Note = components['schemas']['Note']
export type NewNote = components['schemas']['NewNote']
export type Problem = components['schemas']['Problem']

// The Worker (and the dev proxy) forwards /api/* to the Go API with the /api prefix stripped,
// so the browser talks to the API on its own origin and the session cookie stays first-party.
// The contract requires X-Requested-With on every cookie-authenticated request that changes state (CSRF).
export function createApi(baseUrl = '/api', fetchImpl: (request: Request) => Promise<Response> = (request) => globalThis.fetch(request)) {
  return createClient<paths>({
    baseUrl,
    credentials: 'same-origin',
    headers: { 'X-Requested-With': 'fetch' },
    fetch: fetchImpl // looked up per call, so tests can stub globalThis.fetch
  })
}

export const api = createApi()
