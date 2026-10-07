import { defineConfig } from 'vitest/config'
import { defineVitestProject } from '@nuxt/test-utils/config'

export default defineConfig({
  test: {
    projects: [
      // Components: mounted inside the Nuxt runtime (happy-dom).
      await defineVitestProject({
        test: { name: 'nuxt', include: ['test/nuxt/**/*.spec.ts'], environment: 'nuxt', hookTimeout: 120_000, testTimeout: 30_000 }
      }),
      // The media Worker (Requests in, Responses out, a stub bucket), the media key helper, and checks on content/ files: plain Node.
      {
        test: { name: 'node', include: ['test/worker/**/*.spec.ts', 'test/unit/**/*.spec.ts'], environment: 'node' }
      }
    ]
  }
})
