import { useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useMemo, useRef, useSyncExternalStore, type ReactNode } from 'react';

import { clients, sessionStore } from '@/api/client';

import { createAuthService, type AuthService } from './auth-service';
import type { AuthState, SessionStore } from './session-store';

export interface AuthServices {
  store: SessionStore;
  auth: AuthService;
}

const defaultServices: AuthServices = { store: sessionStore, auth: createAuthService(clients, sessionStore) };

const ServicesContext = createContext<AuthServices>(defaultServices);

export function AuthProvider({ children, services = defaultServices }: { children: ReactNode; services?: AuthServices }) {
  const { store } = services;
  const queryClient = useQueryClient();
  const state = useSyncExternalStore(store.subscribe, store.getState);

  useEffect(() => {
    void store.hydrate();
  }, [store]);

  // Signing out (explicitly, or because a refresh was rejected) must not leave the previous user's data in memory.
  const previous = useRef(state.status);
  useEffect(() => {
    if (previous.current === 'signedIn' && state.status === 'signedOut') queryClient.clear();
    previous.current = state.status;
  }, [state.status, queryClient]);

  return <ServicesContext.Provider value={services}>{children}</ServicesContext.Provider>;
}

export function useAuthService(): AuthService {
  return useContext(ServicesContext).auth;
}

export function useAuthState(): AuthState {
  const { store } = useContext(ServicesContext);
  return useSyncExternalStore(store.subscribe, store.getState);
}

export function useAuth() {
  const auth = useAuthService();
  const state = useAuthState();
  return useMemo(() => ({ ...state, ...auth }), [state, auth]);
}
