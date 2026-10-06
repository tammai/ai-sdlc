import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import { defineVitestProject } from '@nuxt/test-utils/config'

export default defineConfig({
  test: {
    projects: [
      {
        // Server routes: real handlers over a local D1 (workerd via wrangler's getPlatformProxy) — offline, no account.
        test: {
          name: 'server',
          environment: 'node',
          include: ['test/server/**/*.test.ts'],
          testTimeout: 30_000,
          hookTimeout: 60_000
        },
        resolve: { alias: { '#shared': fileURLToPath(new URL('./shared', import.meta.url)) } }
      },
      // Components and composables: mounted inside the Nuxt runtime (happy-dom).
      await defineVitestProject({
        test: {
          name: 'nuxt',
          environment: 'nuxt',
          include: ['test/nuxt/**/*.test.ts']
        }
      })
    ]
  }
})
