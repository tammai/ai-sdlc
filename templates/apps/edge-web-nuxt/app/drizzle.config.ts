import { defineConfig } from 'drizzle-kit'

// `pnpm db:generate` diffs server/db/schema.ts against the migrations folder and writes new SQL there.
// Apply locally with `pnpm exec wrangler d1 migrations apply DB --local` (remote apply is a gated production action).
export default defineConfig({
  dialect: 'sqlite',
  schema: './server/db/schema.ts',
  out: './server/db/migrations'
})
