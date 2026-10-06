import { getIronSession, type SessionOptions } from 'iron-session'
import { cookies } from 'next/headers'

export interface SessionData {
  /** Bearer token for the Go API. Server-side only: the browser only ever holds the sealed cookie. */
  accessToken?: string
}

// Non-production fallback so `pnpm dev` works before .env.local exists. Never used in production.
const DEV_SECRET = 'dev-only-not-a-secret-0123456789abcdef'

export function sessionOptions(): SessionOptions {
  const production = process.env.NODE_ENV === 'production'
  const password = process.env.SESSION_SECRET ?? (production ? undefined : DEV_SECRET)
  if (!password || password.length < 32) throw new Error('SESSION_SECRET must be set to a random string of 32+ characters')
  return {
    password,
    cookieName: '__APP_NAME___session',
    cookieOptions: { httpOnly: true, sameSite: 'lax', secure: production, path: '/' }
  }
}

export async function getSession() {
  return getIronSession<SessionData>(await cookies(), sessionOptions())
}
