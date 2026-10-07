import type { Problem } from "./client";

export const NETWORK_ERROR = "Couldn't reach the server. Check your connection and try again.";

/** An API or network failure, already phrased for a person. `status` is undefined for network errors. */
export class ApiError extends Error {
  readonly status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/** Turns an RFC 9457 problem (or a missing body) into a sentence a person can act on. */
export function problemText(error: unknown, status: number | undefined, fallback: string): string {
  if (status === 429) return "Too many attempts. Wait a minute, then try again.";
  if (error && typeof error === "object" && "title" in error) {
    const p = error as Partial<Problem>;
    return p.detail ? `${p.title}. ${p.detail}` : String(p.title);
  }
  return fallback;
}

/**
 * Runs an openapi-fetch call and returns its data, or throws an ApiError.
 * `byStatus` overrides the message for specific statuses (e.g. 401 on sign-in).
 */
export async function unwrap<T>(
  run: () => Promise<{ data?: T; error?: unknown; response: Response }>,
  fallback: string,
  byStatus: Record<number, string> = {},
): Promise<T> {
  let result;
  try {
    result = await run();
  } catch {
    throw new ApiError(NETWORK_ERROR);
  }
  const { data, error, response } = result;
  if (error !== undefined || !response.ok) {
    throw new ApiError(byStatus[response.status] ?? problemText(error, response.status, fallback), response.status);
  }
  return data as T;
}
