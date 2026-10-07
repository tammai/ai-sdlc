import { defineConfig } from "drizzle-kit";

// `pnpm db:generate` diffs worker/db/schema.ts against the migrations folder and writes new SQL there.
// Apply locally with `pnpm db:migrate:local` (remote apply is a gated production action).
export default defineConfig({
  dialect: "sqlite",
  schema: "./worker/db/schema.ts",
  out: "./worker/db/migrations",
});
