import type { ZodError } from 'zod'
import type { Problem } from '@/shared/schemas/problem'

/** RFC 9457 problem response (application/problem+json). Return it from the route handler. */
export function problem(status: number, title: string, extra: Partial<Problem> = {}): Response {
  const body: Problem = { type: 'about:blank', title, status, ...extra }
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/problem+json' } })
}

/** 400 problem listing every Zod issue. */
export function validationProblem(error: ZodError): Response {
  return problem(400, 'Invalid request', {
    detail: 'The request did not pass validation.',
    errors: error.issues.map(i => ({ path: i.path.join('.'), message: i.message }))
  })
}
