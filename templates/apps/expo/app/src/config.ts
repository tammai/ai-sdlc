// Base URL of the Go API. Set EXPO_PUBLIC_API_URL in .env (see .env.example).
// The Android emulator reaches the host machine at http://10.0.2.2:8080.
export const API_URL: string = (process.env.EXPO_PUBLIC_API_URL ?? '__API_URL__').replace(/\/+$/, '');

// Must match "scheme" in app.json. Deep links: <scheme>://auth/magic?token=… and <scheme>://auth/callback?code=…
export const APP_SCHEME = '__APP_NAME__';
export const OIDC_REDIRECT_URI = `${APP_SCHEME}://auth/callback`;
