import { desc, sql } from 'drizzle-orm'
import { defineEventHandler } from 'h3'
import { notes } from '../db/schema'
import { db } from '../utils/db'

export default defineEventHandler(async (event) => {
  // Auth goes here for non-public routes (nuxt-auth-utils): `await requireUserSession(event)`
  const rows = await db(event).select().from(notes).orderBy(desc(sql`rowid`))
  return rows
})
