import { defineConfig, devices } from '@playwright/test'

// The "examples" agreed in each intent/*.md run here as real browser checks.
// Every check saves a screenshot to test-results/screens/ so the result can be
// shown to the person who asked for the change.
const PORT = 3100

export default defineConfig({
  testDir: 'tests/examples',
  timeout: 30_000,
  fullyParallel: false,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `pnpm db:migrate:local && pnpm dev --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})
