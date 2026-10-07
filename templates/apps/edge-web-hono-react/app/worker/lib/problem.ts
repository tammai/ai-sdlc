import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { Problem } from "@shared/schemas/problem";

/** Respond with an RFC 9457 problem (application/problem+json). Return the result from the handler. */
export function problem(c: Context, status: ContentfulStatusCode, title: string, extra: Partial<Problem> = {}) {
  const body: Problem = { type: "about:blank", title, status, ...extra };
  return c.newResponse(JSON.stringify(body), status, { "content-type": "application/problem+json" });
}

/** 400 problem listing every Zod issue. */
export function validationProblem(c: Context, error: { issues: readonly { path: readonly PropertyKey[]; message: string }[] }) {
  return problem(c, 400, "Invalid request", {
    detail: "The request did not pass validation.",
    errors: error.issues.map((i) => ({ path: i.path.map(String).join("."), message: i.message })),
  });
}
