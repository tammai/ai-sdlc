import type { D1Database, KVNamespace, R2Bucket } from '@cloudflare/workers-types'
import { getCloudflareContext } from '@opennextjs/cloudflare'

/** Bindings declared in wrangler.jsonc. Keep in sync when you add or rename one. */
export interface CloudflareEnv {
  DB: D1Database
  KV: KVNamespace
  BUCKET: R2Bucket
}

/** Worker bindings for this request. Server code only (route handlers) — never import this in a client component. */
export function cfEnv(): CloudflareEnv {
  return getCloudflareContext().env as unknown as CloudflareEnv
}

export const kv = () => cfEnv().KV // cache / flags only: eventually consistent, never read-after-write truth
export const r2 = () => cfEnv().BUCKET // stream uploads; store the object key in D1
