import { z } from 'zod'

/** Body of POST /api/notes. Shared by the form (client) and the route handler (server). */
export const createNoteSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(120, 'Title must be at most 120 characters'),
  body: z.string().trim().max(2000, 'Body must be at most 2000 characters').default('')
})

/** A note as returned by the API. */
export const noteSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  body: z.string(),
  createdAt: z.string()
})

export type CreateNoteInput = z.input<typeof createNoteSchema>
export type Note = z.infer<typeof noteSchema>
