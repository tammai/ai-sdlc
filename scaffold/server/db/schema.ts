// What the app stores. After changing this file, run `pnpm db:generate` to create the
// matching migration, then `pnpm db:migrate:local` to apply it to your local database.
// Add tables and columns only — never rename or remove them (see CLAUDE.md).
import { sql } from 'drizzle-orm'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

// Problems reported with the "Report a problem" button. Each one is a candidate
// intent/*.md for the next change — this is the app's feedback loop.
export const feedback = sqliteTable('feedback', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  message: text('message').notNull(),
  page: text('page'),
  // Access sign-in of the reporter on internal apps; empty on public apps.
  reportedBy: text('reported_by'),
  status: text('status', { enum: ['new', 'triaged', 'done'] }).notNull().default('new'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
})
