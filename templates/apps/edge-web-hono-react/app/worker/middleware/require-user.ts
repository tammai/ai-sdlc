import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../env";
import { problem } from "../lib/problem";

/**
 * Auth hook: every non-public route goes behind this middleware, e.g. `notes.use(requireUser)` or `app.use("/api/private/*", requireUser)`.
 *
 * TODO(auth): not implemented on purpose. The intended solution is Better Auth with its Drizzle adapter on D1
 * (`betterAuth({ database: drizzleAdapter(getDb(c.env.DB), { provider: "sqlite" }), secret: c.env.BETTER_AUTH_SECRET })`),
 * mounted at /api/auth/*, with this middleware resolving the session from the request headers, putting the user on the
 * Hono context (add `Variables: { user }` to AppEnv) and rejecting everything else. Sessions need a signing secret
 * (see .dev.vars.example; `wrangler secret put` is a human step).
 *
 * Until then it fails CLOSED: any route you protect answers 401. The notes routes are public only because they are a demo,
 * so they do not use it yet. Replace the body below; do not "make it pass" with a fake user.
 */
export const requireUser = createMiddleware<AppEnv>(async (c) => {
  return problem(c, 401, "Authentication required", { detail: "Session auth is not set up yet (see worker/middleware/require-user.ts)." });
});
