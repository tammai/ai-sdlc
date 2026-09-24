import { defineConfig } from 'drizzle-kit'

// `pnpm db:generate` turns changes in server/db/schema.ts into a new SQL file in migrations/.
// Wrangler applies those files: locally in dev, and to the live database only from the pipeline.
export default defineConfig({
  dialect: 'sqlite',
  schema: './server/db/schema.ts',
  out: './migrations',
})
