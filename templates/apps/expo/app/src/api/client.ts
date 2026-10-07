import createClient, { type Client, type Middleware } from 'openapi-fetch';

import type { paths } from '@/api/schema';
import { createSessionStore, toSession, type SessionStore } from '@/auth/session-store';
import { secureStorage } from '@/auth/storage';
import { API_URL } from '@/config';

import { toApiError } from './errors';

export interface ApiOptions {
  baseUrl: string;
  store: SessionStore;
  /** Override for tests. Resolved at call time so jest can swap globalThis.fetch. */
  fetchImpl?: typeof fetch;
}

// Statuses from POST /v1/auth/token that mean "this refresh token is dead" (vs. a transient failure).
const REFRESH_REJECTED = new Set([400, 401, 403, 422]);

export function createApi({ baseUrl, store, fetchImpl }: ApiOptions) {
  const doFetch: typeof fetch = (input, init) => (fetchImpl ?? globalThis.fetch)(input, init);

  // Native clients authenticate with bearer tokens only (credentials: omit ignores the web session cookie the API may also set).
  // Plain client: no auth middleware. Used for /v1/auth/* (public endpoints) and for the refresh call itself,
  // so a failing refresh can never recurse into another refresh.
  const plain: Client<paths> = createClient<paths>({ baseUrl, fetch: doFetch, credentials: 'omit' });

  let inflight: Promise<string | null> | null = null;

  /**
   * Single-flight token refresh. Concurrent callers share one request, so a rotating refresh token is
   * never spent twice. Resolves to the new access token, or null when the session is gone (signed out).
   * `usedAccessToken` is the token the failed request carried: if the stored token already moved on,
   * another request refreshed in the meantime and we just reuse it.
   */
  function refresh(usedAccessToken?: string): Promise<string | null> {
    const current = store.getState().session;
    if (!current) return Promise.resolve(null);
    if (usedAccessToken && current.accessToken !== usedAccessToken) return Promise.resolve(current.accessToken);
    inflight ??= (async () => {
      try {
        const { data, response } = await plain.POST('/v1/auth/token', {
          body: { grantType: 'refresh_token', refreshToken: current.refreshToken },
        });
        if (data) {
          await store.set(toSession(data)); // rotated pair: the old refresh token is now invalid
          return data.accessToken;
        }
        if (REFRESH_REJECTED.has(response.status)) {
          await store.clear(); // refresh rejected → signed out
          return null;
        }
        throw toApiError(response.status, undefined); // 5xx/429: keep tokens, fail this call, retry on the next 401
      } finally {
        inflight = null;
      }
    })();
    return inflight;
  }

  // The request body is consumed by the first attempt, so keep a clone to replay after a refresh.
  const pending = new Map<string, { replay: Request; token: string }>();

  const authMiddleware: Middleware = {
    onRequest({ request, id }) {
      const token = store.getState().session?.accessToken;
      if (!token) return undefined;
      request.headers.set('Authorization', `Bearer ${token}`);
      pending.set(id, { replay: request.clone(), token });
      return request;
    },
    async onResponse({ response, id }) {
      const entry = pending.get(id);
      pending.delete(id);
      if (response.status !== 401 || !entry) return undefined;
      const token = await refresh(entry.token);
      if (!token) return undefined; // signed out: surface the 401
      entry.replay.headers.set('Authorization', `Bearer ${token}`);
      return doFetch(entry.replay); // retried exactly once, outside the middleware
    },
    onError({ id }) {
      pending.delete(id);
      return undefined;
    },
  };

  const api: Client<paths> = createClient<paths>({ baseUrl, fetch: doFetch, credentials: 'omit' });
  api.use(authMiddleware);

  return { api, plain, refresh };
}

export type ApiClients = ReturnType<typeof createApi>;

export const sessionStore = createSessionStore(secureStorage);
export const clients = createApi({ baseUrl: API_URL, store: sessionStore });
export const api = clients.api;
