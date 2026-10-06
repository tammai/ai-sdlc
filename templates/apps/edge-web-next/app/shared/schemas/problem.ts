import { z } from 'zod'

/** RFC 9457 problem details, served as application/problem+json for every API error. */
export const problemSchema = z.object({
  type: z.string().default('about:blank'),
  title: z.string(),
  status: z.number().int(),
  detail: z.string().optional(),
  errors: z.array(z.object({ path: z.string(), message: z.string() })).optional()
})

export type Problem = z.infer<typeof problemSchema>
