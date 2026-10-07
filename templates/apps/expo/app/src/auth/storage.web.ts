// expo-secure-store has no web implementation. This fallback only exists so `expo export --platform web`
// and the browser preview work during development; a production web client should use the cookie flow instead.
import type { KeyValueStorage } from './storage';

export type { KeyValueStorage };

export const secureStorage: KeyValueStorage = {
  getItem: async (key) => globalThis.sessionStorage?.getItem(key) ?? null,
  setItem: async (key, value) => globalThis.sessionStorage?.setItem(key, value),
  deleteItem: async (key) => globalThis.sessionStorage?.removeItem(key),
};
