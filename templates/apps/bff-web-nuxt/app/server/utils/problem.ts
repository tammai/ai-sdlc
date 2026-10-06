import type { ZodError } from 'zod'
import type { components } from '../../app/api/schema'

type Problem = components['schemas']['Problem']

/** RFC 9457 problem+json response. Returned (not thrown) so the body is passed through untouched. */
export function problem(status: number, title: string, detail?: string, type?: string): Response {
  const body: Problem = { title, status, ...(detail ? { detail } : {}), ...(type ? { type } : {}) }
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/problem+json' }
  })
}

export function validationProblem(err: ZodError): Response {
  const detail = err.issues.map(i => `${i.path.join('.') || 'body'}: ${i.message}`).join('; ')
  return problem(400, 'Validation failed', detail)
}
