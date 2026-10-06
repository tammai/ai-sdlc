import type { D1Database, KVNamespace, R2Bucket } from '@cloudflare/workers-types'
import type { H3Event } from 'h3'

/** Bindings declared in wrangler.jsonc. Keep in sync when you add or rename one. */
export interface CloudflareEnv {
  DB: D1Database
  KV: KVNamespace
  BUCKET: R2Bucket
}

/** Worker bindings for this request (`event.context.cloudflare.env`, emulated locally by `pnpm dev`). */
export function cfEnv(event: H3Event): CloudflareEnv {
  const env = (event.context as { cloudflare?: { env?: CloudflareEnv } }).cloudflare?.env
  if (!env) throw new Error('Cloudflare bindings are not available on event.context.cloudflare.env')
  return env
}
