import { defineConfig } from 'vitest/config'
import { defineVitestProject } from '@nuxt/test-utils/config'

export default defineConfig({
  test: {
    projects: [
      // Pages and components: mounted inside the Nuxt runtime (happy-dom).
      await defineVitestProject({
        test: { name: 'nuxt', include: ['test/nuxt/**/*.spec.ts'], environment: 'nuxt', hookTimeout: 120_000, testTimeout: 30_000 }
      }),
      // Site data and file checks: plain Node.
      {
        test: { name: 'node', include: ['test/unit/**/*.spec.ts'], environment: 'node' }
      }
    ]
  }
})
