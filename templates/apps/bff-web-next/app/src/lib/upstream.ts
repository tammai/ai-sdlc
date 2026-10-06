import createClient from 'openapi-fetch'
import type { paths } from '@/api/schema'
import { problem } from '@/lib/problem'

const TIMEOUT_MS = 10_000

/** Typed client for the Go API, authenticated as the session user. */
export function upstream(token: string) {
  return createClient<paths>({
    baseUrl: process.env.API_BASE_URL ?? '__API_URL__',
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
export const upstreamUnavailable = () => problem(502, 'Bad gateway', 'The API is unavailable')
