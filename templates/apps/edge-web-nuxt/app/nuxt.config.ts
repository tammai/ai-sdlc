// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: ['@nuxt/ui', '@nuxt/eslint', 'nuxt-auth-utils'],
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },

  // SPA: the Worker serves static assets + /api/* only; pages render in the browser.
  ssr: false,
  css: ['~/assets/css/main.css'],

  app: {
    head: { title: '__APP_TITLE__' }
  },

  // Cloudflare Workers (module syntax). `nitro dev` emulates the bindings from wrangler.jsonc locally
  // (D1/KV/R2 persisted in .wrangler/state) and exposes them as event.context.cloudflare.env.
  nitro: {
    // Nitro 2.13 matches its `inline` list against Windows paths with backslashes, so on Windows Nuxt's own server runtime stays
    // external in the prerender build and every prerendered route returns 500 ("Either manifest or precomputed data must be provided").
    // A function matcher sees the resolved id; this inlines nuxt/dist on every OS and changes nothing where the string matchers worked.
    externals: { inline: [(id: string) => /\/nuxt\/dist\//.test(id.replaceAll('\\', '/'))] },
    preset: 'cloudflare_module',
    cloudflare: { deployConfig: false }
  }
})
