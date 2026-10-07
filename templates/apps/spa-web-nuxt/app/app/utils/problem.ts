import type { Problem } from '~/api/client'

export const NETWORK_ERROR = "Couldn't reach the server. Check your connection and try again."

/** Turns an RFC 9457 problem (or a missing body) into a sentence a person can act on. */
export function problemText(error: unknown, status: number | undefined, fallback: string): string {
  if (status === 429) return 'Too many attempts. Wait a minute, then try again.'
  if (error && typeof error === 'object' && 'title' in error) {
    const p = error as Partial<Problem>
    return p.detail ? `${p.title}. ${p.detail}` : String(p.title)
  }
  return fallback
}

export type Result<T = void> = { ok: true, data: T } | { ok: false, status?: number, message: string }

/** Runs an openapi-fetch call, mapping network failures and problem responses to a Result. */
export async function call<T>(
  fn: () => Promise<{ data?: T, error?: unknown, response: Response }>,
  fallback: string,
  byStatus: Record<number, string> = {}
): Promise<Result<T>> {
  try {
    const { data, error, response } = await fn()
    if (error !== undefined || !response.ok) {
      return { ok: false, status: response.status, message: byStatus[response.status] ?? problemText(error, response.status, fallback) }
    }
    return { ok: true, data: data as T }
  } catch {
    return { ok: false, message: NETWORK_ERROR }
  }
}
