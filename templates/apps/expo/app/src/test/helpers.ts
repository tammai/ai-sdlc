import { createApi } from '@/api/client';
import type { components } from '@/api/schema';
import { createAuthService } from '@/auth/auth-service';
import { createSessionStore, type Session } from '@/auth/session-store';
import type { KeyValueStorage } from '@/auth/storage';

export const BASE = 'http://api.test';

export const user: components['schemas']['User'] = { id: '6f1c2c3e-0000-4000-8000-000000000001', email: 'ada@example.com' };

export function memoryStorage(): KeyValueStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: async (k) => data.get(k) ?? null,
    setItem: async (k, v) => void data.set(k, v),
    deleteItem: async (k) => void data.delete(k),
  };
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json' },
  });
}

export function problem(status: number, title: string, detail?: string): Response {
  return json({ title, status, detail }, status);
}

export function tokens(n: number): components['schemas']['TokenResponse'] {
  return { accessToken: `access-${n}`, refreshToken: `refresh-${n}`, tokenType: 'Bearer', expiresIn: 900, user };
}

export const session = (n: number): Session => ({ accessToken: `access-${n}`, refreshToken: `refresh-${n}`, user });

export type Handler = (req: Request) => Response | Promise<Response>;

// Installs a fake network: every fetch is recorded (method, path, auth header, parsed body) and answered by `handler`.
export interface Call {
  method: string;
  path: string;
  auth: string | null;
  body: unknown;
}

export function fakeNetwork(handler: Handler) {
  const calls: Call[] = [];
  const impl = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input, init);
    const text = await req.clone().text();
    calls.push({
      method: req.method,
      path: new URL(req.url).pathname,
      auth: req.headers.get('Authorization'),
      body: text ? JSON.parse(text) : undefined,
    });
    return handler(req);
  });
  globalThis.fetch = impl as unknown as typeof fetch;
  return { calls, impl, count: (method: string, path: string) => calls.filter((c) => c.method === method && c.path === path).length };
}

// Fresh store + API clients + auth service on in-memory storage, signed in as `initial` when given.
export async function setup(initial?: Session) {
  const storage = memoryStorage();
  const store = createSessionStore(storage);
  if (initial) await store.set(initial);
  else await store.hydrate();
  const clients = createApi({ baseUrl: BASE, store });
  const auth = createAuthService(clients, store);
  return { storage, store, clients, auth, api: clients.api };
}
