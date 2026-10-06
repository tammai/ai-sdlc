import { defineEventHandler, readBody, setResponseStatus } from 'h3'
import { createNoteSchema } from '../../shared/schemas/note'
import { notes } from '../db/schema'
import { db } from '../utils/db'
import { validationProblem } from '../utils/problem'

export default defineEventHandler(async (event) => {
  // Auth goes here: `const { user } = await requireUserSession(event)` (nuxt-auth-utils), then store user.id on the row.
  const parsed = createNoteSchema.safeParse(await readBody(event).catch(() => undefined))
  if (!parsed.success) return validationProblem(event, parsed.error)

  const [note] = await db(event)
    .insert(notes)
    .values({ id: crypto.randomUUID(), ...parsed.data })
    .returning()
  setResponseStatus(event, 201)
  return note
})
