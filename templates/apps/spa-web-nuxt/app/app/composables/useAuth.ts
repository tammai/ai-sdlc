import { api } from '~/api/client'
import type { User } from '~/api/client'

export function useAuth() {
  // undefined = not asked yet, null = signed out
  const user = useState<User | null | undefined>('auth:user', () => undefined)

  /** Resolves the signed-in user (cached). 401 means signed out; anything else throws. */
  async function fetchUser(force = false): Promise<User | null> {
    if (user.value !== undefined && !force) return user.value
    const { data, response } = await api.GET('/v1/auth/me')
    if (response.status === 401) return (user.value = null)
    if (!data) throw new Error(`GET /v1/auth/me failed with ${response.status}`)
    return (user.value = data)
  }

  async function signIn(email: string, password: string) {
    const r = await call(() => api.POST('/v1/auth/session', { body: { email, password } }), "Couldn't sign you in. Try again.", {
      401: 'Email or password is incorrect. Check them and try again.'
    })
    if (r.ok) user.value = r.data
    return r
  }

  async function register(body: { email: string, password: string, name?: string }) {
    const r = await call(() => api.POST('/v1/auth/register', { body }), "Couldn't create your account. Try again.", {
      403: 'Registration is closed. Ask an administrator for an account.'
    })
    if (r.ok) user.value = r.data
    return r
  }

  async function verifyMagicLink(token: string) {
    const r = await call(() => api.POST('/v1/auth/magic-link/verify', { body: { token } }), "Couldn't sign you in with this link.", {
      401: 'This sign-in link has expired or was already used.'
    })
    if (r.ok) user.value = r.data
    return r
  }

  function requestMagicLink(email: string) {
    return call(() => api.POST('/v1/auth/magic-link', { body: { email, client: 'web' } }), "Couldn't send the link. Try again.")
  }

  /** The session is gone (explicit sign-out or a 401 mid-session): forget local state. */
  function expire() {
    user.value = null
    // Reset (not clear) so a still-mounted notes page keeps rendering until the redirect lands.
    useState<unknown[]>('notes:items').value = []
    useState<string>('notes:status').value = 'idle'
  }

  async function signOut() {
    const r = await call(() => api.DELETE('/v1/auth/session'), "Couldn't sign you out. Try again.")
    if (r.ok) {
      expire()
      await navigateTo('/login')
    }
    return r
  }

  return { user, fetchUser, signIn, register, verifyMagicLink, requestMagicLink, expire, signOut }
}
