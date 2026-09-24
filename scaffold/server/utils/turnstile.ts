// Engineer-owned (red tier). Bot protection for public forms, via Cloudflare Turnstile.
// The browser gets a token from the Turnstile widget; we check it with Cloudflare
// before saving anything.
import type { H3Event } from 'h3'

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

export async function verifyTurnstile(event: H3Event, token: unknown): Promise<void> {
  if (import.meta.dev) return
  const env = useEnv(event)
  if (!env.TURNSTILE_SECRET_KEY) {
    throw createError({ statusCode: 500, statusMessage: 'Bot protection is not set up for this app yet.' })
  }
  if (typeof token !== 'string' || !token) {
    throw createError({ statusCode: 400, statusMessage: 'Please complete the “I am human” check.' })
  }
  const form = new FormData()
  form.append('secret', env.TURNSTILE_SECRET_KEY)
  form.append('response', token)
  const ip = getHeader(event, 'cf-connecting-ip')
  if (ip) form.append('remoteip', ip)
  const res = await fetch(VERIFY_URL, { method: 'POST', body: form })
  const result = (await res.json()) as { success?: boolean }
  if (!result.success) {
    throw createError({ statusCode: 403, statusMessage: 'The “I am human” check failed. Please try again.' })
  }
}
