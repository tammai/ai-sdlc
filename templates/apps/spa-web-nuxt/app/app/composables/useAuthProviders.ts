import { api } from '~/api/client'
import type { AuthProviders } from '~/api/client'

/** Which sign-in methods the API has enabled; UIs render only those. */
export function useAuthProviders() {
  const providers = useState<AuthProviders | null>('auth:providers', () => null)
  const status = useState<'idle' | 'loading' | 'ready' | 'error'>('auth:providers:status', () => 'idle')

  async function load() {
    status.value = 'loading'
    const r = await call(() => api.GET('/v1/auth/providers'), "Couldn't load the sign-in options.")
    if (r.ok) {
      providers.value = r.data
      status.value = 'ready'
    } else {
      status.value = 'error'
    }
  }

  return { providers, status, load }
}
