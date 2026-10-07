// The Worker never contains business logic — that's the Go API.
// It serves the SPA assets and, for /api/* only, passes the request through to the API at ORIGIN_URL:
// strip the /api prefix, forward method/headers/body/query unchanged, stream the response back unchanged
// (Set-Cookie included). No caching, no parsing, no validation, no reshaping.
export interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> }
  /** Go API base URL, e.g. https://api.example.com (set in wrangler.jsonc vars / .dev.vars). */
  ORIGIN_URL: string
}

const HOP_BY_HOP = ['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'proxy-connection', 'te', 'trailer', 'transfer-encoding', 'upgrade']

function dropHopByHop(headers: Headers) {
  // Headers named by `Connection` are hop-by-hop too.
  for (const name of (headers.get('connection') ?? '').split(',')) if (name.trim()) headers.delete(name.trim())
  for (const name of HOP_BY_HOP) headers.delete(name)
}

function problem(status: number, title: string): Response {
  return Response.json({ title, status }, { status, headers: { 'content-type': 'application/problem+json' } })
}

async function passthrough(request: Request, url: URL, env: Env): Promise<Response> {
  if (!env.ORIGIN_URL) return problem(500, 'ORIGIN_URL is not configured')
  const origin = new URL(env.ORIGIN_URL)
  const target = new URL(origin.pathname.replace(/\/$/, '') + (url.pathname.slice('/api'.length) || '/') + url.search, origin)

  const headers = new Headers(request.headers)
  dropHopByHop(headers)
  headers.delete('host')
  headers.set('x-forwarded-host', url.host)
  headers.set('x-forwarded-proto', url.protocol.slice(0, -1))
  const ip = request.headers.get('cf-connecting-ip')
  if (ip) headers.set('x-forwarded-for', ip)
  else headers.delete('x-forwarded-for')

  const hasBody = request.method !== 'GET' && request.method !== 'HEAD'
  let upstream: Response
  try {
    upstream = await fetch(target, {
      method: request.method,
      headers,
      body: hasBody ? request.body : null,
      redirect: 'manual', // 3xx (e.g. OIDC start) belongs to the browser
      duplex: 'half',
      cf: { cacheTtl: -1 } // negative = do not cache at all
    } as RequestInit)
  } catch {
    return problem(502, 'The API is unreachable')
  }

  const out = new Headers(upstream.headers)
  dropHopByHop(out)
  return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: out })
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) return passthrough(request, url, env)
    return env.ASSETS.fetch(request)
  }
}
