import { defineConfig, devices } from '@playwright/test'

// The "examples" agreed in each intent/*.md run here as real browser checks.
// Every check saves a screenshot to test-results/screens/ so the result can be
// shown to the person who asked for the change.
// EXAMPLES_PORT overrides it (two apps open at once, or another project on 3100).
const PORT = Number(process.env.EXAMPLES_PORT ?? 3100)

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
    // Never reuse a server this run didn't start: it could be another app on the same port,
    // and the checks would pass or fail against the wrong code. A busy port is an error instead.
    reuseExistingServer: false,
    timeout: 180_000,
  },
})
