// CSRF protection for the BFF: the session cookie is SameSite=Lax, and on top of that every mutating
// /api request must (1) carry a custom header — browsers cannot send one cross-site without a CORS
// preflight, and we never answer preflights — and (2) not come from a foreign Origin.
const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

export default defineEventHandler((event) => {
  if (!MUTATING.has(event.method) || !event.path.startsWith('/api/')) return

  const origin = getRequestHeader(event, 'origin')
  if (origin && origin !== 'null') {
    let sameOrigin = false
    try {
      sameOrigin = new URL(origin).host === getRequestHost(event, { xForwardedHost: true })
    } catch { /* malformed Origin -> reject */ }
    if (!sameOrigin) return problem(403, 'Forbidden', 'Cross-origin request rejected')
  } else if (origin === 'null') {
    return problem(403, 'Forbidden', 'Cross-origin request rejected')
  }

  if (getRequestHeader(event, 'x-requested-with') !== 'bff') {
    return problem(403, 'Forbidden', 'Missing CSRF header')
  }
})
