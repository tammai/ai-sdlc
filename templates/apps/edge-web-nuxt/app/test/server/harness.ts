import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createApp, createRouter, toWebHandler } from 'h3'
import { getPlatformProxy } from 'wrangler'
import notesGet from '../../server/api/notes.get'
import notesPost from '../../server/api/notes.post'
import type { CloudflareEnv } from '../../server/utils/env'

const MIGRATIONS = join(process.cwd(), 'server/db/migrations')

/**
 * Boots the Worker bindings from wrangler.jsonc locally (in-memory D1/KV/R2 on workerd, no Cloudflare account),
 * applies the generated drizzle migrations, and returns a fetch-style client for the real route handlers.
 */
export async function createTestApp() {
  const proxy = await getPlatformProxy<CloudflareEnv>({ configPath: 'wrangler.jsonc', persist: false })
  const env = proxy.env

  const files = readdirSync(MIGRATIONS).filter(f => f.endsWith('.sql')).sort()
  for (const file of files) {
    for (const statement of readFileSync(join(MIGRATIONS, file), 'utf8').split('--> statement-breakpoint')) {
      if (statement.trim()) await env.DB.prepare(statement).run()
    }
  }

  const router = createRouter()
  router.get('/api/notes', notesGet)
  router.post('/api/notes', notesPost)
  const app = createApp().use(router)
  const handle = toWebHandler(app)

  return {
    env,
    request: (path: string, init?: RequestInit) => handle(new Request(`http://localhost${path}`, init), { cloudflare: { env } }),
    dispose: () => proxy.dispose()
  }
}
