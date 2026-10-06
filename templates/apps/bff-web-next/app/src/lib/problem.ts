import type { ZodError } from 'zod'
import type { components } from '@/api/schema'

type Problem = components['schemas']['Problem']

/** RFC 9457 problem+json response. */
export function problem(status: number, title: string, detail?: string): Response {
  const body: Problem = { title, status, ...(detail ? { detail } : {}) }
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/problem+json' }
  })
}

export function validationProblem(err: ZodError): Response {
  const detail = err.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; ')
  return problem(400, 'Validation failed', detail)
}

export const unauthorized = () => problem(401, 'Unauthorized', 'Sign in required')
