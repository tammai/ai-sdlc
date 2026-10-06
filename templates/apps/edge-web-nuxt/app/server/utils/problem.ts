import { setResponseHeader, setResponseStatus } from 'h3'
import type { H3Event } from 'h3'
import type { ZodError } from 'zod'
import type { Problem } from '../../shared/schemas/problem'

/** Respond with an RFC 9457 problem (application/problem+json). Return the result from the handler. */
export function problem(event: H3Event, status: number, title: string, extra: Partial<Problem> = {}): Problem {
  setResponseStatus(event, status)
  setResponseHeader(event, 'content-type', 'application/problem+json')
  return { type: 'about:blank', title, status, ...extra }
}

/** 400 problem listing every Zod issue. */
export function validationProblem(event: H3Event, error: ZodError): Problem {
  return problem(event, 400, 'Invalid request', {
    detail: 'The request did not pass validation.',
    errors: error.issues.map(i => ({ path: i.path.join('.'), message: i.message }))
  })
}
