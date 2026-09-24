import { desc } from 'drizzle-orm'
import { feedback } from '../db/schema'

// Staff only, on every app type — reports can contain anything people typed.
export default defineEventHandler(async (event) => {
  await requireUser(event)
  return useDb(event).select().from(feedback).orderBy(desc(feedback.createdAt)).limit(200)
})
