// Static site generation: `nuxt generate` prerenders every page to HTML in .output/public, which a Cloudflare
// Worker serves as static assets (see wrangler.jsonc). `ssr: true` here means "render at build time" — there is
// no server at runtime, no Nitro routes, no API. (The app templates run `ssr: false`; a site needs real HTML for SEO.)
export default defineNuxtConfig({
  compatibilityDate: '2026-10-01',
  ssr: true,
  devtools: { enabled: false },
  modules: ['@nuxt/ui', '@nuxtjs/sitemap', '@nuxt/eslint'],
  // Generate styles only for the Nuxt UI components the site renders (187 KB -> 79 KB of CSS for this template).
  // A component chosen at runtime (<component :is>) is invisible to the scan: list it, e.g. ['Modal'].
  ui: { experimental: { componentDetection: true } },
  css: ['~/assets/css/main.css'],
  app: {
    head: {
      htmlAttrs: { lang: 'en' },
      link: [{ rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }]
    }
  },
  // Only the icons the site uses are shipped, never the whole collection: icons rendered at build time are inlined
  // per page as CSS, and `scan` bundles just the ones that first appear in the browser (the mobile menu's close
  // button). The browser never calls the Iconify API. Needs the collection installed locally (@iconify-json/lucide);
  // to use another set, `pnpm add -D @iconify-json/<set>`.
  icon: { fallbackToApi: false, clientBundle: { scan: true } },
  // The canonical origin, used for absolute URLs in the sitemap. Set it per deploy: NUXT_PUBLIC_SITE_URL=https://example.com
  site: { url: process.env.NUXT_PUBLIC_SITE_URL || 'https://example.com' },
  nitro: {
    // Links between pages are crawled from the home page; a broken internal link fails the build instead of shipping a 404.
    prerender: { crawlLinks: true, failOnError: true, routes: ['/', '/404.html'] }
  }
})
