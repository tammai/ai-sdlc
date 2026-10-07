import { hc } from "hono/client";
import { problemSchema } from "@shared/schemas/problem";
import type { AppType } from "../../worker/app";

/**
 * Typed client for the Hono API: routes, request bodies and responses are inferred from the Worker's `AppType`
 * (type-only import — no server code reaches the bundle). Same origin in dev and production.
 * `fetch` is resolved per call so tests can stub it.
 */
export const api = hc<AppType>(globalThis.location?.origin ?? "http://localhost", {
  fetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, init),
});

/** An API failure with a message fit for the UI and, for 400 validation problems, the message per field. */
export class ApiError extends Error {
  readonly status: number;
  readonly fieldErrors: Record<string, string>;

  constructor(message: string, status = 0, fieldErrors: Record<string, string> = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
}

/** Turn a non-2xx response (application/problem+json) into an ApiError. */
export async function toApiError(res: { status: number; json(): Promise<unknown> }): Promise<ApiError> {
  const parsed = problemSchema.safeParse(await res.json().catch(() => undefined));
  if (!parsed.success) return new ApiError(`The server answered with an error (${res.status}).`, res.status);
  const fieldErrors: Record<string, string> = {};
  for (const e of parsed.data.errors ?? []) fieldErrors[e.path] ??= e.message;
  const message = parsed.data.status >= 500 ? "The server hit an error." : (parsed.data.detail ?? parsed.data.title);
  return new ApiError(message, res.status, fieldErrors);
}

/** Message for any thrown value: server problems keep their wording, network failures get a plain explanation. */
export function messageOf(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof TypeError) return "The connection dropped or the server could not be reached.";
  return "Something unexpected went wrong.";
}
