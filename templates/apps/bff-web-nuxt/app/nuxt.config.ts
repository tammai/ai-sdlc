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
  runtimeConfig: {
    // Server-only. Override with NUXT_API_BASE (see .env.example).
    apiBase: '__API_URL__',
    session: {
      // httpOnly + SameSite=Lax sealed cookie (secure is on automatically in production).
      cookie: { sameSite: 'lax' }
    }
  }
})
