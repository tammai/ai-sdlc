# Profile: expo — React Native mobile client (Claude's choice)

**Stack:**
- Expo (current SDK) with expo-router (typed routes) and strict TypeScript.
- TanStack Query for server state.
- An openapi-fetch client typed from `contracts/openapi.yaml` (generated `src/api/schema.d.ts`, committed).
- expo-secure-store for tokens, expo-web-browser for OIDC.

## Rules
- Contract first: change `contracts/openapi.yaml`, then `pnpm gen:api`. Never hand-write API types.
- **Auth:** bearer tokens from `/v1/auth/token`.
  - The refresh token lives in SecureStore. The access token stays in memory (SecureStore if the app must survive restarts offline).
  - On 401, refresh once (single-flight), store the rotated pair, retry. If the refresh fails, sign out.
  - OIDC: `openAuthSessionAsync` to `/v1/auth/oidc/{p}/start?client=native`, then exchange the one-time `code`.
  - Magic link: deep link `<scheme>://auth/magic?token=…`, exchanged with `grant_type=magic_link`.
- **Screens:** loading, error with retry, and empty states; targets of 44pt or more; `accessibilityLabel` on icon buttons; dark mode via `useColorScheme`. No business logic in components; data access goes through hooks over the typed client.
- The API must stay backward compatible for app versions still installed. Use EAS Update for JS-only fixes, a store release for native changes, and a force-update check for breaking API changes.

## Tests & verify
Jest (jest-expo) + Testing Library for React Native: auth client (refresh and rotation), screen states, deep-link handling. Verify: typecheck · lint · test.

## Deploy
EAS Build per profile (development / preview / production). Internal distribution and preview channels are fine for the agent. Store submission and production updates are gated (`eas submit`, `eas update --branch production`).

## Scaffold
`sdlc scaffold-app` copies the `expo` template (with `--choice claude`, or `sdlc scaffold-app expo`).

## CLAUDE.md snippet
- Expo + expo-router + TanStack Query; API types generated from `contracts/openapi.yaml` (`pnpm gen:api`); never edit `src/api/schema.d.ts`.
- Bearer tokens via the auth client (single-flight refresh, rotation); the refresh token lives only in SecureStore; never log tokens.
- Every screen: loading, error with retry, and empty states; targets of 44pt or more; accessibility labels on icon buttons.
