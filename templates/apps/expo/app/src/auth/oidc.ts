import * as WebBrowser from 'expo-web-browser';

import { ApiError, OidcError } from '@/api/errors';
import { API_URL, OIDC_REDIRECT_URI } from '@/config';

import type { AuthService } from './auth-service';
import { createPkce } from './pkce';

// Minimal query-string reader: custom-scheme URLs (<scheme>://auth/callback?code=…) are not reliably handled by URL on every JS engine.
export function queryParam(url: string, name: string): string | null {
  const query = url.split('#')[0]?.split('?')[1] ?? '';
  for (const pair of query.split('&')) {
    const [k, v = ''] = pair.split('=');
    if (k === name) return decodeURIComponent(v.replace(/\+/g, ' '));
  }
  return null;
}

// Native OIDC with PKCE (RFC 8252): the API runs the provider flow and ends with
// <scheme>://auth/callback?code=<one-time code> (or ?error=<code>). Another app that registers the same
// scheme could intercept that redirect, but cannot redeem the code without the verifier that only lives here.
// Resolves false when the user closed the browser sheet; throws OidcError for ?error= redirects.
export async function signInWithOidc(providerId: string, auth: AuthService): Promise<boolean> {
  const { verifier, challenge } = await createPkce(); // in memory for this attempt only; never stored or logged
  const startUrl =
    `${API_URL}/v1/auth/oidc/${encodeURIComponent(providerId)}/start` +
    `?client=native&codeChallenge=${encodeURIComponent(challenge)}&codeChallengeMethod=S256`;
  const result = await WebBrowser.openAuthSessionAsync(startUrl, OIDC_REDIRECT_URI);
  if (result.type !== 'success') return false;

  const error = queryParam(result.url, 'error');
  if (error) throw new OidcError(error);
  const code = queryParam(result.url, 'code');
  if (!code) throw new ApiError(400, 'Sign-in was not completed', 'The provider did not return a sign-in code.');
  await auth.exchangeAuthorizationCode(code, verifier);
  return true;
}
