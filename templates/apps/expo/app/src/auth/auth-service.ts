import type { components } from '@/api/schema';
import type { ApiClients } from '@/api/client';
import { toApiError } from '@/api/errors';

import { toSession, type SessionStore } from './session-store';

type TokenRequest = components['schemas']['TokenRequest'];

// Every sign-in path ends the same way: a TokenResponse from POST /v1/auth/token, stored as the session.
export function createAuthService(clients: ApiClients, store: SessionStore) {
  const { plain } = clients;

  async function exchange(body: TokenRequest) {
    const { data, error, response } = await plain.POST('/v1/auth/token', { body });
    if (!data) throw toApiError(response.status, error);
    await store.set(toSession(data));
  }

  return {
    async getProviders() {
      const { data, error, response } = await plain.GET('/v1/auth/providers');
      if (!data) throw toApiError(response.status, error);
      return data;
    },
    signInWithPassword: (email: string, password: string) => exchange({ grantType: 'password', email, password }),
    exchangeMagicToken: (token: string) => exchange({ grantType: 'magic_link', token }),
    exchangeAuthorizationCode: (code: string, codeVerifier: string) => exchange({ grantType: 'authorization_code', code, codeVerifier }),
    // Native sign-up: create the account (the session cookie in the response is ignored), then take tokens via the password grant.
    async register(input: { email: string; password: string; name?: string }) {
      const { error, response } = await plain.POST('/v1/auth/register', { body: input });
      if (!response.ok) throw toApiError(response.status, error);
      await exchange({ grantType: 'password', email: input.email, password: input.password });
    },
    async requestMagicLink(email: string) {
      const { error, response } = await plain.POST('/v1/auth/magic-link', { body: { email, client: 'native' } });
      if (!response.ok) throw toApiError(response.status, error);
    },
    // Revoke server-side first (best effort, idempotent), then always clear local state.
    async signOut() {
      const refreshToken = store.getState().session?.refreshToken;
      try {
        if (refreshToken) await plain.POST('/v1/auth/token/revoke', { body: { refreshToken } });
      } catch {
        // offline: still sign out locally; the server-side session expires on its own
      } finally {
        await store.clear();
      }
    },
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
