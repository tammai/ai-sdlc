import type { H3Event } from 'h3'
import createClient from 'openapi-fetch'
import type { paths } from '../../app/api/schema'
import { problem } from './problem'

const TIMEOUT_MS = 10_000

/** Bearer token of the signed-in user, or null. The token lives in the sealed cookie's `secure` part only. */
export async function sessionToken(event: H3Event): Promise<string | null> {
  const session = await getUserSession(event)
  return session.secure?.accessToken ?? null
}

/** Typed client for the Go API, authenticated as the session user. */
export function upstream(event: H3Event, token: string) {
  const { apiBase } = useRuntimeConfig(event)
  return createClient<paths>({
    baseUrl: apiBase,
    headers: { Authorization: `Bearer ${token}` }
  })
}

export const upstreamSignal = () => AbortSignal.timeout(TIMEOUT_MS)

/** Turn a failed upstream call into a problem+json response, preserving the API's own problem body when it sent one. */
export function upstreamFailure(response: Response, error: unknown): Response {
  if (error && typeof error === 'object' && 'title' in error && 'status' in error) {
    return new Response(JSON.stringify(error), {
      status: response.status,
      headers: { 'content-type': 'application/problem+json' }
    })
  }
  return problem(response.status, response.statusText || 'Upstream error')
}

/** The Go API could not be reached or timed out. */
export function upstreamUnavailable(): Response {
  return problem(502, 'Bad gateway', 'The API is unavailable')
}

export const unauthorized = () => problem(401, 'Unauthorized', 'Sign in required')
