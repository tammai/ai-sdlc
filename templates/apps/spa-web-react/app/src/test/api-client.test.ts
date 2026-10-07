import { describe, expect, it } from "vitest";
import { api, createApi } from "@/api/client";
import { loginSearch, safeRedirect } from "@/lib/redirect";
import { formatCreated } from "@/lib/time";

describe("API client", () => {
  it("calls /api/* on the page origin with X-Requested-With: fetch and same-origin credentials", async () => {
    const calls: Request[] = [];
    const client = createApi(undefined, async (req) => (calls.push(req), Response.json({ id: "1", email: "a@b.c" })));
    await client.GET("/v1/auth/me");
    expect(new URL(calls[0]!.url).pathname).toBe("/api/v1/auth/me");
    expect(new URL(calls[0]!.url).origin).toBe(location.origin);
    expect(calls[0]!.headers.get("x-requested-with")).toBe("fetch");
    expect(calls[0]!.credentials).toBe("same-origin");
  });

  it("sends the CSRF header on state-changing calls too", async () => {
    const calls: Request[] = [];
    const client = createApi("http://app.test/api", async (req) => (calls.push(req), new Response(null, { status: 204 })));
    await client.DELETE("/v1/auth/session");
    await client.POST("/v1/notes", { body: { title: "Buy milk" } });
    expect(calls.map((c) => c.method)).toEqual(["DELETE", "POST"]);
    for (const c of calls) expect(c.headers.get("x-requested-with")).toBe("fetch");
  });

  it("the shared client goes through globalThis.fetch (stubbable)", async () => {
    const seen: string[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = (async (req: Request) => (seen.push(req.headers.get("x-requested-with") ?? ""), Response.json({}))) as typeof fetch;
    try {
      await api.GET("/healthz");
    } finally {
      globalThis.fetch = original;
    }
    expect(seen).toEqual(["fetch"]);
  });
});

describe("redirect helpers", () => {
  it.each([
    ["/notes?x=1", "/notes?x=1"],
    ["//evil.test", "/"],
    ["https://evil.test", "/"],
    ["/\\evil.test", "/"],
    [undefined, "/"],
  ])("safeRedirect(%j) -> %s", (input, expected) => {
    expect(safeRedirect(input)).toBe(expected);
  });

  it("loginSearch keeps the intended path, but not for the home page", () => {
    expect(loginSearch("/notes?page=2")).toEqual({ redirect: "/notes?page=2" });
    expect(loginSearch("/")).toEqual({});
    expect(loginSearch("//evil.test")).toEqual({});
  });
});

describe("formatCreated", () => {
  const now = Date.parse("2026-10-07T12:00:00Z");
  it("is relative for the last week and absolute after", () => {
    expect(formatCreated("2026-10-07T10:00:00Z", now)).toBe("2 hours ago");
    expect(formatCreated("2026-10-07T11:59:50Z", now)).toBe("just now");
    expect(formatCreated("2026-09-01T00:00:00Z", now)).toMatch(/Sep/);
    expect(formatCreated("nope", now)).toBe("—");
  });
});
