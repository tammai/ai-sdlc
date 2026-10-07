import process from 'node:process'
import { fileURLToPath } from 'node:url'
import ui from '@nuxt/ui/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'
import VueRouter from 'vue-router/vite'

const host = process.env.TAURI_DEV_HOST

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    // File-based routing (built into vue-router 5; successor of unplugin-vue-router). Must come before vue().
    // The generated typed-routes file is committed: never hand-edit it.
    VueRouter({ routesFolder: 'src/pages', dts: 'src/typed-router.d.ts' }),
    vue(),
    // Nuxt UI in plain-Vue mode. Auto-imports are switched off: components and composables are imported explicitly.
    ui({ autoImport: false, components: false, dts: false })
  ],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },

  // Vite options tailored for Tauri
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: 'ws', host, port: 1421 } : undefined,
    // 3. tell Vite to ignore watching `src-tauri`
    watch: { ignored: ['**/src-tauri/**'] }
  },
  test: {
    environment: 'happy-dom',
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.test.ts']
  }
})
