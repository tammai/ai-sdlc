import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

const alias = { '@': path.resolve(import.meta.dirname) }

export default defineConfig({
  test: {
    projects: [
      {
        // Route handlers: the real code over a local D1 (workerd via wrangler's getPlatformProxy) — offline, no account.
        resolve: { alias },
        test: {
          name: 'server',
          environment: 'node',
          include: ['test/server/**/*.test.ts'],
          testTimeout: 30_000,
          hookTimeout: 60_000
        }
      },
      {
        // Client components: React Testing Library in jsdom.
        plugins: [react()],
        resolve: { alias },
        test: {
          name: 'ui',
          environment: 'jsdom',
          include: ['test/ui/**/*.test.tsx'],
          setupFiles: ['test/ui/setup.ts']
        }
      }
    ]
  }
})
