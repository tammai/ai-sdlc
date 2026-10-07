import { describe, expect, it, vi } from 'vitest'
import worker, { keyFromPath, type Env, type R2BucketLike, type R2ObjectBodyLike, type R2ObjectLike } from '../../worker/index'

// A bucket in memory: enough of R2's get/head to exercise ranges and conditional requests the way R2 answers them.
function bucket(files: Record<string, { body: string; type?: string; cacheControl?: string }>) {
  const object = (key: string): R2ObjectLike | null => {
    const f = files[key]
    if (!f) return null
    return {
      key,
      size: f.body.length,
      httpEtag: `"etag-${key}"`,
      httpMetadata: { contentType: f.type, cacheControl: f.cacheControl },
      writeHttpMetadata(h: Headers) {
        if (f.type) h.set('content-type', f.type)
        if (f.cacheControl) h.set('cache-control', f.cacheControl)
      }
    }
  }
  const get = vi.fn<R2BucketLike['get']>(async (key, options) => {
    const o = object(key)
    if (!o) return null
    if (options?.onlyIf?.get('if-none-match') === o.httpEtag) return o // condition failed: no body
    const text = files[key]!.body
    const range = /^bytes=(\d+)-(\d*)$/.exec(options?.range?.get('range') ?? '')
    if (range) {
      const offset = Number(range[1])
      const end = range[2] ? Number(range[2]) : text.length - 1
      const body = new Response(text.slice(offset, end + 1)).body!
      return { ...o, range: { offset, length: end - offset + 1 }, body } satisfies R2ObjectBodyLike
    }
    return { ...o, body: new Response(text).body! } satisfies R2ObjectBodyLike
  })
  const head = vi.fn<R2BucketLike['head']>(async (key) => object(key))
  return { get, head } satisfies R2BucketLike
}

const assets = vi.fn(async () => new Response('<html>page</html>', { headers: { 'content-type': 'text/html' } }))
const envWith = (b: R2BucketLike, extra: Partial<Env> = {}): Env => ({ ASSETS: { fetch: assets }, MEDIA: b, ...extra })
const req = (path: string, init?: RequestInit) => new Request(`https://site.test${path}`, init)

const files = {
  'blog/cover.svg': { body: '<svg/>', type: 'image/svg+xml' },
  'video/intro.mp4': { body: '0123456789', type: 'video/mp4' },
  'docs/brochure.pdf': { body: 'PDF', type: 'application/pdf', cacheControl: 'public, max-age=31536000, immutable' }
}

describe('keyFromPath', () => {
  it.each([
    ['/media/a.png', 'a.png'],
    ['/media/blog/cover.svg', 'blog/cover.svg'],
    ['/media/with%20space.png', 'with space.png']
  ])('accepts %s', (path, key) => expect(keyFromPath(path)).toBe(key))

  it.each(['/media/', '/media', '/other/a.png', '/media/..%2F..%2Fsecret', '/media/a%2F..%2Fb', '/media//a.png', '/media/a//b', '/media/%E0%A4%A', '/media/a%5Cb', '/media/a%00b'])(
    'rejects %s',
    (path) => expect(keyFromPath(path)).toBeNull()
  )

  it('rejects an over-long key', () => expect(keyFromPath(`/media/${'a'.repeat(1100)}`)).toBeNull())
})

describe('worker: /media/*', () => {
  it('streams an object with its content type, etag and a default cache policy', async () => {
    const b = bucket(files)
    const res = await worker.fetch(req('/media/blog/cover.svg'), envWith(b))
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('<svg/>')
    expect(res.headers.get('content-type')).toBe('image/svg+xml')
    expect(res.headers.get('etag')).toBe('"etag-blog/cover.svg"')
    expect(res.headers.get('accept-ranges')).toBe('bytes')
    expect(res.headers.get('cache-control')).toBe('public, max-age=3600, stale-while-revalidate=86400')
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect(b.get).toHaveBeenCalledWith('blog/cover.svg', {})
  })

  it('uses MEDIA_CACHE_CONTROL from the environment, and an object’s own cache-control over it', async () => {
    const b = bucket(files)
    const env = envWith(b, { MEDIA_CACHE_CONTROL: 'public, max-age=60' })
    expect((await worker.fetch(req('/media/blog/cover.svg'), env)).headers.get('cache-control')).toBe('public, max-age=60')
    expect((await worker.fetch(req('/media/docs/brochure.pdf'), env)).headers.get('cache-control')).toBe('public, max-age=31536000, immutable')
  })

  it('sandboxes SVG so opening it directly cannot run script on the site’s origin', async () => {
    const res = await worker.fetch(req('/media/blog/cover.svg'), envWith(bucket(files)))
    expect(res.headers.get('content-security-policy')).toContain('sandbox')
    const pdf = await worker.fetch(req('/media/docs/brochure.pdf'), envWith(bucket(files)))
    expect(pdf.headers.get('content-security-policy')).toBeNull()
  })

  it('answers 404 for a missing key', async () => {
    const res = await worker.fetch(req('/media/nope.png'), envWith(bucket(files)))
    expect(res.status).toBe(404)
  })

  it('answers HEAD with headers and the length but no body, and reads only metadata', async () => {
    const b = bucket(files)
    const res = await worker.fetch(req('/media/video/intro.mp4', { method: 'HEAD' }), envWith(b))
    expect(res.status).toBe(200)
    expect(res.headers.get('content-length')).toBe('10')
    expect(await res.text()).toBe('')
    expect(b.get).not.toHaveBeenCalled()
  })

  it('serves a byte range as 206 with Content-Range (video seeking)', async () => {
    const res = await worker.fetch(req('/media/video/intro.mp4', { headers: { range: 'bytes=2-5' } }), envWith(bucket(files)))
    expect(res.status).toBe(206)
    expect(res.headers.get('content-range')).toBe('bytes 2-5/10')
    expect(await res.text()).toBe('2345')
  })

  it('answers a plain GET with 200 even when R2 reports the whole file as its range (as the local emulator does)', async () => {
    const b = bucket(files)
    const inner = b.get.getMockImplementation()!
    b.get.mockImplementation(async (key, options) => {
      const o = await inner(key, options)
      return o && 'body' in o ? { ...o, range: { offset: 0, length: o.size } } : o
    })
    const res = await worker.fetch(req('/media/blog/cover.svg'), envWith(b))
    expect(res.status).toBe(200)
    expect(res.headers.get('content-range')).toBeNull()
    expect(res.headers.get('content-length')).toBe('6')
  })

  it('answers 304 when If-None-Match matches, with the etag and no body', async () => {
    const res = await worker.fetch(req('/media/blog/cover.svg', { headers: { 'if-none-match': '"etag-blog/cover.svg"' } }), envWith(bucket(files)))
    expect(res.status).toBe(304)
    expect(res.headers.get('etag')).toBe('"etag-blog/cover.svg"')
    expect(await res.text()).toBe('')
  })

  it('refuses other methods with 405 and an Allow header', async () => {
    const b = bucket(files)
    const res = await worker.fetch(req('/media/blog/cover.svg', { method: 'DELETE' }), envWith(b))
    expect(res.status).toBe(405)
    expect(res.headers.get('allow')).toBe('GET, HEAD')
    expect(b.get).not.toHaveBeenCalled()
  })

  it.each(['/media/', '/media/..%2F..%2Fsecret', '/media/a%2F..%2Fb', '/media/a//b'])('answers 400 for %s without reading the bucket', async (path) => {
    const b = bucket(files)
    const res = await worker.fetch(req(path), envWith(b))
    expect(res.status).toBe(400)
    expect(b.get).not.toHaveBeenCalled()
    expect(b.head).not.toHaveBeenCalled()
  })

  it('hands any other path to the static assets', async () => {
    const b = bucket(files)
    const res = await worker.fetch(req('/about'), envWith(b))
    expect(await res.text()).toBe('<html>page</html>')
    expect(b.get).not.toHaveBeenCalled()
  })
})

describe('worker: colo cache', () => {
  const store = new Map<string, Response>()
  const cache = {
    match: vi.fn(async (r: Request) => store.get(r.url)?.clone()),
    put: vi.fn(async (r: Request, res: Response) => void store.set(r.url, res))
  }

  it('stores a plain 200 and serves the next request from the cache without touching R2', async () => {
    vi.stubGlobal('caches', { default: cache })
    try {
      const b = bucket(files)
      const waits: Promise<unknown>[] = []
      const ctx = { waitUntil: (p: Promise<unknown>) => void waits.push(p) }
      const first = await worker.fetch(req('/media/blog/cover.svg'), envWith(b), ctx)
      expect(await first.text()).toBe('<svg/>')
      await Promise.all(waits)
      expect(cache.put).toHaveBeenCalledTimes(1)

      const second = await worker.fetch(req('/media/blog/cover.svg'), envWith(b), ctx)
      expect(await second.text()).toBe('<svg/>')
      expect(b.get).toHaveBeenCalledTimes(1)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('does not cache ranges or 404s', async () => {
    vi.stubGlobal('caches', { default: cache })
    cache.put.mockClear()
    try {
      const b = bucket(files)
      const ctx = { waitUntil: vi.fn() }
      await worker.fetch(req('/media/video/intro.mp4', { headers: { range: 'bytes=0-1' } }), envWith(b), ctx)
      await worker.fetch(req('/media/missing.png'), envWith(b), ctx)
      expect(cache.put).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
