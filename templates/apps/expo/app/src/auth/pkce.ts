import * as Crypto from 'expo-crypto';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

export function base64url(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = ((bytes[i] ?? 0) << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out += ALPHABET[(n >> 18) & 63]! + ALPHABET[(n >> 12) & 63]!;
    if (i + 1 < bytes.length) out += ALPHABET[(n >> 6) & 63]!;
    if (i + 2 < bytes.length) out += ALPHABET[n & 63]!;
  }
  return out; // no padding
}

export interface Pkce {
  /** Secret: keep in memory for this sign-in attempt only; sent with the code exchange. */
  verifier: string;
  /** base64url(SHA-256(verifier)): sent to /v1/auth/oidc/{id}/start. */
  challenge: string;
}

// RFC 7636 S256. 48 random bytes → a 64-character verifier (allowed range 43–128).
export async function createPkce(): Promise<Pkce> {
  const verifier = base64url(Crypto.getRandomBytes(48));
  // The verifier is ASCII, so hashing the string equals hashing its bytes.
  const hashBase64 = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, verifier, {
    encoding: Crypto.CryptoEncoding.BASE64,
  });
  const challenge = hashBase64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return { verifier, challenge };
}
