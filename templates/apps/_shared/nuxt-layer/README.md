# ui-layer — shared Nuxt layer

Every Nuxt app in this repo (`web/`, `desktop/`) lists this folder in its `nuxt.config.ts` → `extends`, so code here is written once.

| Put here | Keep in each app |
|---|---|
| Theme (`app/app.config.ts`), CSS tokens | Data access: web calls `/api` with the session cookie; desktop calls Rust commands (`invoke`) or the API with a bearer token |
| Components and composables both apps render the same way | App shell differences: Tauri window/menu integration, web-only pages (marketing, sign-up) |
| Identical pages and layouts | `nuxt.config.ts` specifics (SSR off in both, dev ports, build output) |

## Sharing screens that load data
Define a composable **interface** here and an **implementation** in each app with the same name. The app's own file overrides the layer's, so shared pages never know which transport runs:

```ts
// ui-layer/app/composables/useNotesApi.ts — default/fallback, documents the shape
export function useNotesApi(): NotesApi { throw new Error('useNotesApi: implement in the app') }

// web/app/composables/useNotesApi.ts      → fetch('/api/v1/notes')
// desktop/app/composables/useNotesApi.ts  → invoke('list_notes') / invoke('create_note')
```

## Rules
- Changes here affect every app. Run `sdlc verify` (all apps' checks) before reporting done.
- No app-specific code or imports from an app folder. The layer depends on nothing but Nuxt and Nuxt UI, which every app already installs.
- Components here use only what all apps have (Nuxt UI, Tailwind tokens). Gate platform-only behavior behind a composable implemented per app.
