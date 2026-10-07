import { defineConfig } from 'vitest/config'
import { defineVitestProject } from '@nuxt/test-utils/config'

export default defineConfig({
  test: {
    projects: [
      // Pages, components, composables, route guard: Nuxt runtime environment (happy-dom), fetch stubbed.
      await defineVitestProject({
        test: { name: 'nuxt', include: ['test/nuxt/**/*.spec.ts'], environment: 'nuxt', hookTimeout: 120_000, testTimeout: 30_000 }
      }),
      // Worker and API client: plain Node, called with Request objects and a stubbed fetch.
      {
        test: { name: 'node', include: ['test/worker/**/*.spec.ts', 'test/unit/**/*.spec.ts'], environment: 'node' }
      }
    ]
  }
})
