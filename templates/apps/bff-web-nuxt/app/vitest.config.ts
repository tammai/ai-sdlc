import { defineConfig } from 'vitest/config'
import { defineVitestProject } from '@nuxt/test-utils/config'

export default defineConfig({
  test: {
    projects: [
      // Components and composables: Nuxt runtime environment (happy-dom).
      await defineVitestProject({
        test: { name: 'nuxt', include: ['test/nuxt/**/*.spec.ts'], environment: 'nuxt' }
      }),
      // BFF: builds the app once and calls the real server routes against a stubbed Go API (offline).
      {
        test: {
          name: 'e2e',
          include: ['test/e2e/**/*.spec.ts'],
          environment: 'node',
          testTimeout: 60_000,
          hookTimeout: 300_000
        }
      }
    ]
  }
})
