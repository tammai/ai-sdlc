import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import type { AppEnv } from "../../worker/env";
import { requireUser } from "../../worker/middleware/require-user";

describe("requireUser (auth hook)", () => {
  it("fails closed until real session auth replaces it", async () => {
    const app = new Hono<AppEnv>().use(requireUser).get("/secret", (c) => c.text("secret"));
    const res = await app.request("/secret");
    expect(res.status).toBe(401);
    expect(res.headers.get("content-type")).toContain("application/problem+json");
    expect(await res.text()).not.toContain("secret");
  });
});
