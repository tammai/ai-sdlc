// Runs before any test file imports app modules: gives the singleton API client a parseable base URL
// and replaces the native keychain with an in-memory map.
process.env.EXPO_PUBLIC_API_URL = 'http://api.test';

jest.mock('expo-secure-store', () => {
  const mem = new Map<string, string>();
  return {
    getItemAsync: jest.fn(async (k: string) => mem.get(k) ?? null),
    setItemAsync: jest.fn(async (k: string, v: string) => void mem.set(k, v)),
    deleteItemAsync: jest.fn(async (k: string) => void mem.delete(k)),
  };
});

// Real SHA-256 and randomness from Node, so PKCE tests can check the challenge independently.
jest.mock('expo-crypto', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodeCrypto = require('node:crypto') as typeof import('node:crypto');
  return {
    CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
    CryptoEncoding: { BASE64: 'base64', HEX: 'hex' },
    getRandomBytes: (n: number) => new Uint8Array(nodeCrypto.randomBytes(n)),
    digestStringAsync: async (_algorithm: string, data: string, options?: { encoding?: string }) =>
      nodeCrypto.createHash('sha256').update(data, 'utf8').digest(options?.encoding === 'hex' ? 'hex' : 'base64'),
  };
});
