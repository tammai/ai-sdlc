// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2026-10-06',
  // Tauri serves a static SPA: no SSR, no Nitro server at runtime.
  ssr: false,
  devtools: { enabled: false },
  telemetry: false,
  modules: ['@nuxt/eslint', '@nuxt/ui'],
  css: ['~/assets/css/main.css'],
  // Port must match `devUrl` in src-tauri/tauri.conf.json; the build output must match `frontendDist`.
  devServer: { port: 1420, host: process.env.TAURI_DEV_HOST || 'localhost' },
  vite: {
    // Keep Rust compiler errors visible, expose Tauri env vars, never watch the Rust sources.
    clearScreen: false,
    envPrefix: ['VITE_', 'TAURI_ENV_*'],
    server: { strictPort: true, watch: { ignored: ['**/src-tauri/**'] } }
  },
  ignore: ['**/src-tauri/**'],
  // No remote icon fetching (the CSP blocks it): bundle the icons the app uses from the local lucide set.
  icon: { provider: 'none', clientBundle: { scan: true } },
  eslint: { config: { stylistic: false } }
})
