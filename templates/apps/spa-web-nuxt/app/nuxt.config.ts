// Static SPA: `nuxt generate` writes .output/public, which the Cloudflare Worker in worker/ serves as assets.
// No SSR, no Nitro server routes — the backend is the Go API, reached at /api/* (see worker/index.ts).
export default defineNuxtConfig({
  compatibilityDate: '2026-10-01',
  ssr: false,
  devtools: { enabled: false },
  modules: ['@nuxt/ui', '@nuxt/eslint'],
  css: ['~/assets/css/main.css'],
  app: {
    head: {
      title: '__APP_TITLE__',
      htmlAttrs: { lang: 'en' },
      link: [{ rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }]
    }
  },
  // Dev only: same contract as the Worker — /api/* goes to the Go API with the /api prefix stripped.
  // The API's allowed origins must include http://localhost:3000 (cookie CSRF check).
  nitro: {
    devProxy: {
      '/api': {
        target: process.env.DEV_API_URL || '__API_URL__',
        changeOrigin: true,
        xfwd: true
      }
    }
  }
})
