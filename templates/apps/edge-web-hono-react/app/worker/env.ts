import type { D1Database, KVNamespace, R2Bucket } from "@cloudflare/workers-types";

/** Bindings declared in wrangler.jsonc. Keep in sync when you add or rename one. */
export interface Bindings {
  DB: D1Database;
  /** Cache / flags only — eventually consistent, never read-after-write for truth. */
  KV: KVNamespace;
  /** Files: stream uploads, store the object key in D1. */
  BUCKET: R2Bucket;
}

/** Hono generics for every route and middleware: `new Hono<AppEnv>()`; bindings are `c.env.DB`, `c.env.KV`, `c.env.BUCKET`. */
export type AppEnv = { Bindings: Bindings };
