/// <reference types="@cloudflare/workers-types" />
import type { H3Event } from 'h3'

export type AppType = 'prototype' | 'public' | 'internal'

// Mirrors the bindings and vars in wrangler.jsonc.
export interface AppEnv {
  DB: D1Database
  KV: KVNamespace
  APP_TYPE: AppType
  ACCESS_TEAM_DOMAIN: string
  ACCESS_AUD: string
  TURNSTILE_SITE_KEY: string
  TURNSTILE_SECRET_KEY?: string
  // production | preview. Production refuses traffic unless DEPLOYED_FROM is main.
  DEPLOY_ENV: 'production' | 'preview'
  // Set only by scripts/deploy-guard.mjs, never in wrangler.jsonc.
  DEPLOYED_FROM?: string
  DEPLOYED_COMMIT?: string
}

export function useEnv(event: H3Event): AppEnv {
  // Nitro types the bindings as Record<string, unknown>; AppEnv is what wrangler.jsonc provides.
  const env = event.context.cloudflare?.env as unknown as AppEnv | undefined
  if (!env) throw createError({ statusCode: 500, statusMessage: 'Cloudflare bindings are not available' })
  return env
}
