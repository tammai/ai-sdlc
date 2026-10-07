/** Only app-relative paths are allowed as post-login targets (no open redirects). */
export function safeRedirect(value: unknown, fallback = '/'): string {
  const v = Array.isArray(value) ? value[0] : value
  if (typeof v !== 'string' || !v.startsWith('/') || v.startsWith('//') || v.startsWith('/\\')) return fallback
  return v
}

/** Where to send an unauthenticated visitor, remembering where they were going. */
export function loginLocation(intended: string) {
  const target = safeRedirect(intended)
  return target === '/' ? { path: '/login' } : { path: '/login', query: { redirect: target } }
}
