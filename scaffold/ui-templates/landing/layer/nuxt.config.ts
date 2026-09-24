// UI template layer: landing. Installed by `pnpm ui:template landing`. Engineer-owned.
// To change a page, copy it into app/pages/ (app/ overrides this layer) and edit the copy.
// Page words live in content/landing.yml (safe to edit), described by content.config.ts.
export default defineNuxtConfig({
  modules: ['@nuxt/content'],
  content: {
    // Live: Nuxt Content keeps its own _content_* tables in the app's D1 (binding DB).
    // Local dev: a SQLite file under .data/, via Node's built-in sqlite.
    database: { type: 'd1', bindingName: 'DB' },
    experimental: { sqliteConnector: 'native' },
  },
})
