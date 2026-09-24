// Locked stack: Nuxt full-stack on Cloudflare Workers.
//   UI:    Nuxt UI (components + the installed template shell in layers/ui/)
//   State: Pinia for client-only state, Pinia Colada for everything fetched from the server
//   Data:  D1 (database) and KV (settings/cache). Bindings live in wrangler.jsonc, which an engineer owns.
export default defineNuxtConfig({
  compatibilityDate: '2026-08-01',
  devtools: { enabled: false },
  modules: [
    '@nuxt/ui',
    '@pinia/nuxt',
    '@pinia/colada-nuxt',
    // Gives `nuxt dev` the same DB/KV bindings as production, backed by local files in .wrangler/.
    'nitro-cloudflare-dev',
  ],
  css: ['~/assets/css/main.css'],
  // app/queries/: one Pinia Colada composable file per kind of server data (auto-imported).
  imports: { dirs: ['queries'] },
  icon: {
    // Icons come from the installed @iconify-json sets, bundled into the app.
    // Never fetched from the Iconify API at runtime: no third-party calls from the browser.
    serverBundle: 'local',
    clientBundle: { scan: true },
    fallbackToApi: false,
  },
  nitro: {
    preset: 'cloudflare_module',
    cloudflare: {
      // wrangler.jsonc is the single source of truth — don't let the build write another one.
      deployConfig: false,
      nodeCompat: true,
    },
  },
  typescript: {
    strict: true,
  },
})
