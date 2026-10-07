import { Redirect } from 'expo-router';

// <scheme>://auth/callback?code=… is consumed by expo-web-browser's openAuthSessionAsync (see src/auth/oidc.ts).
// On Android the same URL can also be delivered as a deep link; this route swallows it instead of showing "unmatched route".
export default function OidcCallback() {
  return <Redirect href="/" />;
}
