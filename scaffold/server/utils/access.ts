// Engineer-owned (red tier). Who is signed in, according to Cloudflare Access.
//
// Access sits in front of the app and handles company sign-in, so this app contains
// no login code. Every request that reaches us through Access carries a signed JWT
// (header `cf-access-jwt-assertion`, cookie `CF_Authorization`). We verify it
// against the team's public keys instead of trusting the email header, so a request
// that somehow bypasses Access is still refused.
import { createRemoteJWKSet, jwtVerify } from 'jose'
import type { H3Event } from 'h3'

export interface AppUser {
  email: string
}

const DEV_USER: AppUser = { email: 'dev@localhost' }
const keySets = new Map<string, ReturnType<typeof createRemoteJWKSet>>()

function keysFor(issuer: string) {
  let keys = keySets.get(issuer)
  if (!keys) {
    keys = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`))
    keySets.set(issuer, keys)
  }
  return keys
}

const signInRequired = () => createError({ statusCode: 401, statusMessage: 'Please sign in with your company account.' })

export async function getUser(event: H3Event): Promise<AppUser | null> {
  if (import.meta.dev) return DEV_USER
  const env = useEnv(event)
  const token = getHeader(event, 'cf-access-jwt-assertion') ?? getCookie(event, 'CF_Authorization')
  if (!token || !env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) return null
  const issuer = `https://${env.ACCESS_TEAM_DOMAIN}`
  try {
    const { payload } = await jwtVerify(token, keysFor(issuer), { issuer, audience: env.ACCESS_AUD })
    return typeof payload.email === 'string' && payload.email ? { email: payload.email } : null
  } catch {
    return null
  }
}

// Use in every server route that reads or changes staff-only data.
export async function requireUser(event: H3Event): Promise<AppUser> {
  const user = await getUser(event)
  if (!user) throw signInRequired()
  event.context.user = user
  return user
}
