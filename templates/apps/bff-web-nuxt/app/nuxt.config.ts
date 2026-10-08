// SPA (ssr: false) that is also a thin BFF: server/api/* holds the browser session and proxies to the Go API.
export default defineNuxtConfig({
  compatibilityDate: '2026-10-01',
  ssr: false,
  devtools: { enabled: false },
  modules: ['@nuxt/ui', '@nuxt/eslint', 'nuxt-auth-utils'],
  css: ['~/assets/css/main.css'],
  app: {
    head: { title: '__APP_TITLE__' }
  },
  nitro: {
    // Nitro 2.13 matches its `inline` list against Windows paths with backslashes, so on Windows Nuxt's own server runtime stays
    // external in the prerender build and every prerendered route returns 500 ("Either manifest or precomputed data must be provided").
    // A function matcher sees the resolved id; this inlines nuxt/dist on every OS and changes nothing where the string matchers worked.
    externals: { inline: [(id: string) => /\/nuxt\/dist\//.test(id.replaceAll('\\', '/'))] }
  },
  runtimeConfig: {
    // Server-only. Override with NUXT_API_BASE (see .env.example).
    apiBase: '__API_URL__',
    session: {
      // httpOnly + SameSite=Lax sealed cookie (secure is on automatically in production).
      cookie: { sameSite: 'lax' }
    }
  }
})
