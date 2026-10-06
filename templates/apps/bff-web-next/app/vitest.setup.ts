import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'

process.env.SESSION_SECRET = 'test-only-not-a-secret-0123456789abcdef'
process.env.API_BASE_URL = 'http://api.test'

// next/headers has no request scope under vitest: serve cookies from an in-memory "browser" jar instead.
vi.mock('next/headers', async () => {
  const { cookieJar } = await import('./src/test/cookie-jar')
  return { cookies: async () => cookieJar }
})
