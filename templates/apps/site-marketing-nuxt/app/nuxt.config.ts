import { fileURLToPath } from 'node:url'

// Static site generation: `nuxt generate` prerenders every page to HTML in .output/public, which a Cloudflare
// Worker serves as static assets (see wrangler.jsonc). `ssr: true` here means "render at build time" — there is
// no server rendering at runtime. (The app templates run `ssr: false`; a site needs real HTML for SEO.)
// The only code that runs per request is worker/index.ts, and only for /media/*: it streams files from R2.
export default defineNuxtConfig({
  compatibilityDate: '2026-10-01',
  ssr: true,
  devtools: { enabled: false },
  modules: ['@nuxt/ui', '@nuxt/content', '@nuxtjs/sitemap', '@nuxt/eslint'],
  // Generate styles only for the Nuxt UI components the site renders (224 KB -> 119 KB of CSS for this template).
  // A component chosen at runtime (<component :is>) is invisible to the scan: list it, e.g. ['Modal'].
  // Markdown prose (tables, code, headings) was checked in a real browser to keep its styles with this on; re-check after adding MDC components.
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
  // Syntax highlighting is limited to the languages the content uses, so the build ships no other grammars.
  // The build indexes content in SQLite; `native` is Node's built-in node:sqlite (Node >= 22.5), so there is no native
  // package to compile and install and verify runs without prompts.
  content: {
    experimental: { sqliteConnector: 'native' },
    build: { markdown: { highlight: { theme: { default: 'github-light', dark: 'github-dark' }, langs: ['bash', 'json', 'ts', 'vue'] } } }
  },
  nitro: {
    // Nitro 2.13 matches its `inline` list against Windows paths with backslashes, so on Windows Nuxt's own server runtime stays
    // external in the prerender build and every prerendered route returns 500 ("Either manifest or precomputed data must be provided").
    // A function matcher sees the resolved id; this inlines nuxt/dist on every OS and changes nothing where the string matchers worked.
    externals: { inline: [(id: string) => /\/nuxt\/dist\//.test(id.replaceAll('\\', '/'))] },
    // Links between pages are crawled from the home page; a broken internal link fails the build instead of shipping a 404.
    // /media is served from R2 by the Worker, not prerendered: a link to /media/brochure.pdf must not fail the build.
    prerender: { crawlLinks: true, failOnError: true, routes: ['/', '/404.html'], ignore: ['/media'] }
  },
  // `nuxt dev` has no Worker, so it serves the local media/ folder at /media. Production never sees this (R2 does).
  $development: {
    nitro: { publicAssets: [{ dir: fileURLToPath(new URL('./media', import.meta.url)), baseURL: '/media', maxAge: 0 }] }
  }
})
