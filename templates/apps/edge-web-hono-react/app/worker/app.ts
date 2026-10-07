import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { AppEnv } from "./env";
import { problem } from "./lib/problem";
import { notesRoute } from "./routes/notes";

/**
 * The Hono app, mounted under /api. `AppType` is what the SPA imports (type-only) for end-to-end types via `hc<AppType>`.
 * Add a route file in worker/routes/, then chain `.route("/<name>", <name>Route)` below.
 */
export const app = new Hono<AppEnv>()
  .basePath("/api")
  .route("/notes", notesRoute)
  // Every error leaves as application/problem+json; unexpected ones never leak details.
  .notFound((c) => problem(c, 404, "Not found"))
  .onError((err, c) => {
    if (err instanceof HTTPException) {
      const bad = err.status === 400; // validators throw 400 for malformed JSON
      return problem(c, err.status, bad ? "Invalid request" : err.message || "Request failed", { detail: bad ? err.message : undefined });
    }
    console.error(err);
    return problem(c, 500, "Internal server error");
  });

export type AppType = typeof app;
