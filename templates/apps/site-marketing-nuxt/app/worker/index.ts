// The Worker runs only for /media/* (see "run_worker_first" in wrangler.jsonc): it streams files from the R2 bucket.
// Pages and static assets never reach it. No business logic here: GET/HEAD, ranges and conditional requests, a cache.
export interface R2Range {
  offset?: number
  length?: number
  suffix?: number
}

export interface R2ObjectLike {
  key: string
  size: number
  httpEtag: string
  range?: R2Range
  httpMetadata?: { contentType?: string; cacheControl?: string }
  writeHttpMetadata(headers: Headers): void
}

/** What `bucket.get()` returns when the conditions pass: the object with its body. */
export interface R2ObjectBodyLike extends R2ObjectLike {
  body: ReadableStream
}

export interface R2BucketLike {
  /** With `onlyIf` and a failing condition R2 returns the object without a body. */
  get(key: string, options?: { range?: Headers; onlyIf?: Headers }): Promise<R2ObjectLike | R2ObjectBodyLike | null>
  head(key: string): Promise<R2ObjectLike | null>
}

export interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> }
  MEDIA: R2BucketLike
  /** Cache-Control for media that has none of its own (set per environment in wrangler.jsonc). */
  MEDIA_CACHE_CONTROL?: string
}

const PREFIX = '/media/'
const DEFAULT_CACHE_CONTROL = 'public, max-age=3600, stale-while-revalidate=86400'
const MAX_KEY_LENGTH = 1024

/** The R2 object key for a request path, or null when the path is not a safe key. */
export function keyFromPath(pathname: string): string | null {
  if (!pathname.startsWith(PREFIX)) return null
  let key: string
  try {
    key = decodeURIComponent(pathname.slice(PREFIX.length))
  } catch {
    return null // malformed %-escape
  }
  if (!key || key.length > MAX_KEY_LENGTH || key.includes('\0') || key.includes('\\')) return null
  const segments = key.split('/')
  // No empty, '.' or '..' segments: a key can't climb out of its folder or hide behind a double slash.
  if (segments.some((s) => s === '' || s === '.' || s === '..')) return null
  return key
}

function text(status: number, body: string, extra: Record<string, string> = {}): Response {
  return new Response(body, { status, headers: { 'content-type': 'text/plain; charset=utf-8', ...extra } })
}

function mediaHeaders(object: R2ObjectLike, env: Env): Headers {
  const headers = new Headers()
  object.writeHttpMetadata(headers)
  headers.set('etag', object.httpEtag)
  headers.set('accept-ranges', 'bytes')
  headers.set('x-content-type-options', 'nosniff')
  if (!headers.has('cache-control')) headers.set('cache-control', env.MEDIA_CACHE_CONTROL || DEFAULT_CACHE_CONTROL)
  const type = headers.get('content-type') ?? ''
  // An SVG or HTML file opened directly could run script on the site's origin; sandbox it. <img> and <video> are unaffected.
  if (type.startsWith('image/svg+xml') || type.startsWith('text/html')) {
    headers.set('content-security-policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox")
  }
  return headers
}

/** `bytes start-end/size` for the range R2 actually served. */
function contentRange(range: R2Range, size: number): string {
  let offset = range.offset ?? 0
  let length = range.length ?? size - offset
  if (range.suffix !== undefined) {
    length = Math.min(range.suffix, size)
    offset = size - length
  }
  return `bytes ${offset}-${offset + length - 1}/${size}`
}

async function serve(request: Request, env: Env, key: string): Promise<Response> {
  if (request.method === 'HEAD') {
    const head = await env.MEDIA.head(key)
    if (!head) return text(404, 'Not found')
    const headers = mediaHeaders(head, env)
    headers.set('content-length', String(head.size))
    return new Response(null, { status: 200, headers })
  }

  const ranged = request.headers.has('range')
  const conditional = request.headers.has('if-none-match') || request.headers.has('if-modified-since')
  const object = await env.MEDIA.get(key, {
    ...(ranged ? { range: request.headers } : {}),
    ...(conditional ? { onlyIf: request.headers } : {})
  })
  if (!object) return text(404, 'Not found')

  const headers = mediaHeaders(object, env)
  // R2 answers a failed condition (If-None-Match matched) with the object but no body.
  if (!('body' in object)) return new Response(null, { status: 304, headers })

  // Only a request that asked for a range gets 206: the local R2 emulator reports a range (the whole file) on every object.
  if (ranged && object.range) {
    headers.set('content-range', contentRange(object.range, object.size))
    return new Response(object.body, { status: 206, headers })
  }
  headers.set('content-length', String(object.size))
  return new Response(object.body, { status: 200, headers })
}

export default {
  async fetch(request: Request, env: Env, ctx?: { waitUntil(p: Promise<unknown>): void }): Promise<Response> {
    const url = new URL(request.url)
    const key = keyFromPath(url.pathname)
    if (key === null) {
      // Not a media request: it can only get here if the route config changes; hand it to the static assets.
      if (!url.pathname.startsWith(PREFIX) && url.pathname !== '/media') return env.ASSETS.fetch(request)
      return text(400, 'Bad media path')
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') return text(405, 'Method not allowed', { allow: 'GET, HEAD' })

    // Plain GETs go through the colo cache so a popular image costs neither a Worker's R2 read nor its bandwidth twice.
    // Ranges and conditional requests skip it: they need the object's own answer.
    const cache = typeof caches === 'undefined' ? undefined : (caches as unknown as { default: Cache }).default
    const cacheable = cache && request.method === 'GET' && !request.headers.has('range') && !request.headers.has('if-none-match') && !request.headers.has('if-modified-since')
    const cacheKey = new Request(url.toString(), { method: 'GET' })
    if (cacheable) {
      const hit = await cache.match(cacheKey)
      if (hit) return hit
    }

    const response = await serve(request, env, key)
    if (cacheable && response.status === 200) ctx?.waitUntil(cache.put(cacheKey, response.clone()))
    return response
  }
}
