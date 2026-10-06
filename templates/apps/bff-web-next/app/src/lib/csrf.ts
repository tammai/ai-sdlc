import { problem } from '@/lib/problem'

/** Header the browser client sends on every request (see src/api/client.ts). */
export const CSRF_HEADER = 'x-requested-with'
export const CSRF_VALUE = 'bff'

/**
 * CSRF protection for mutating BFF routes. The session cookie is SameSite=Lax, and on top of that every
 * mutating request must (1) carry a custom header — browsers cannot send one cross-site without a CORS
 * preflight, and we never answer preflights — and (2) not come from a foreign Origin.
 * Returns a 403 problem response, or null when the request is fine.
 */
export function checkCsrf(request: Request): Response | null {
  const origin = request.headers.get('origin')
  if (origin !== null) {
    const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? new URL(request.url).host
    let sameOrigin = false
    try {
      sameOrigin = origin !== 'null' && new URL(origin).host === host
    } catch {
      /* malformed Origin -> reject */
    }
    if (!sameOrigin) return problem(403, 'Forbidden', 'Cross-origin request rejected')
  }
  if (request.headers.get(CSRF_HEADER) !== CSRF_VALUE) return problem(403, 'Forbidden', 'Missing CSRF header')
  return null
}
