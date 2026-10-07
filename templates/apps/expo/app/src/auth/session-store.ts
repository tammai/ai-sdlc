import type { components } from '@/api/schema';
import type { KeyValueStorage } from './storage';

export type User = components['schemas']['User'];
export type TokenResponse = components['schemas']['TokenResponse'];

export interface Session {
  accessToken: string;
  refreshToken: string;
  user: User;
}

export type AuthStatus = 'loading' | 'signedOut' | 'signedIn';

export interface AuthState {
  status: AuthStatus;
  session: Session | null;
}

const KEY = 'session.v1';

export function toSession(t: TokenResponse): Session {
  return { accessToken: t.accessToken, refreshToken: t.refreshToken, user: t.user };
}

function isSession(v: unknown): v is Session {
  const s = v as Session | null;
  return !!s && typeof s.accessToken === 'string' && typeof s.refreshToken === 'string' && typeof s.user?.id === 'string';
}

// In-memory copy of the token pair, persisted through `storage`. Observable so React can follow it
// (useSyncExternalStore) and the API client can read the current token synchronously.
export function createSessionStore(storage: KeyValueStorage) {
  let state: AuthState = { status: 'loading', session: null };
  const listeners = new Set<() => void>();
  const emit = (next: AuthState) => {
    state = next;
    listeners.forEach((l) => l());
  };

  return {
    getState: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async hydrate() {
      try {
        const raw = await storage.getItem(KEY);
        const parsed: unknown = raw ? JSON.parse(raw) : null;
        emit(isSession(parsed) ? { status: 'signedIn', session: parsed } : { status: 'signedOut', session: null });
      } catch {
        emit({ status: 'signedOut', session: null });
      }
    },
    async set(session: Session) {
      emit({ status: 'signedIn', session }); // memory first: the next request must already use the new pair
      await storage.setItem(KEY, JSON.stringify(session));
    },
    async clear() {
      emit({ status: 'signedOut', session: null });
      try {
        await storage.deleteItem(KEY);
      } catch {
        // already signed out in memory; a stale blob is overwritten on the next sign-in
      }
    },
  };
}

export type SessionStore = ReturnType<typeof createSessionStore>;
