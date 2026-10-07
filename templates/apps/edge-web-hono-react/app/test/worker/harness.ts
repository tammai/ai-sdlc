import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getPlatformProxy } from "wrangler";
import { app } from "../../worker/app";
import type { Bindings } from "../../worker/env";

const MIGRATIONS = join(process.cwd(), "worker/db/migrations");

/**
 * Boots the Worker bindings from wrangler.jsonc locally (in-memory D1/KV/R2 on workerd, no Cloudflare account),
 * applies the generated drizzle migrations, and returns a fetch-style client for the real Hono app.
 */
export async function createTestApp() {
  const proxy = await getPlatformProxy<Bindings>({ configPath: "wrangler.jsonc", persist: false });
  const env = proxy.env;

  const files = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of files) {
    for (const statement of readFileSync(join(MIGRATIONS, file), "utf8").split("--> statement-breakpoint")) {
      if (statement.trim()) await env.DB.prepare(statement).run();
    }
  }

  return {
    env,
    request: (path: string, init?: RequestInit) => app.request(path, init, env),
    dispose: () => proxy.dispose(),
  };
}
