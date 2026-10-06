import { z } from 'zod'
import type { components, paths } from '@/api/schema'

type NewNote = components['schemas']['NewNote']
type ListQuery = NonNullable<paths['/v1/notes']['get']['parameters']['query']>

// Mirrors NewNote in contracts/openapi.yaml. `satisfies` makes contract drift a type error after `pnpm gen:api`.
export const newNoteSchema = z.strictObject({
  title: z.string().min(1).max(200),
  body: z.string().max(10000).optional()
}) satisfies z.ZodType<NewNote>

export const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().min(1).optional()
}) satisfies z.ZodType<ListQuery>

export const loginSchema = z.strictObject({
  token: z.string().min(1).max(8192)
})
