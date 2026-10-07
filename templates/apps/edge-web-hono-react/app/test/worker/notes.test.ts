import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Note } from "@shared/schemas/note";
import type { Problem } from "@shared/schemas/problem";
import { createTestApp } from "./harness";

let app: Awaited<ReturnType<typeof createTestApp>>;

beforeAll(async () => {
  app = await createTestApp();
});
afterAll(async () => {
  await app.dispose();
});

const post = (body: unknown) =>
  app.request("/api/notes", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

describe("GET /api/notes", () => {
  it("returns an empty list when there are no notes", async () => {
    const res = await app.request("/api/notes");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });
});

describe("POST /api/notes", () => {
  it("creates a note and lists it newest first", async () => {
    const first = await post({ title: "  First  ", body: "hello" });
    expect(first.status).toBe(201);
    const created = (await first.json()) as Note;
    expect(created).toMatchObject({ title: "First", body: "hello" });
    expect(created.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(created.createdAt).toBeTruthy();

    await post({ title: "Second" });
    const list = (await (await app.request("/api/notes")).json()) as Note[];
    expect(list.map((n) => n.title)).toEqual(["Second", "First"]);
    expect(list[0].body).toBe("");
  });

  it("rejects an invalid body with a 400 problem+json", async () => {
    const res = await post({ title: "" });
    expect(res.status).toBe(400);
    expect(res.headers.get("content-type")).toContain("application/problem+json");
    const problem = (await res.json()) as Problem;
    expect(problem).toMatchObject({ status: 400, title: "Invalid request" });
    expect(problem.errors?.[0]).toMatchObject({ path: "title" });
  });

  it("rejects a malformed or non-JSON body with a 400 problem+json", async () => {
    for (const init of [
      { method: "POST", headers: { "content-type": "application/json" }, body: "not json" },
      { method: "POST", body: "title=plain-form" },
    ]) {
      const res = await app.request("/api/notes", init);
      expect(res.status).toBe(400);
      expect(res.headers.get("content-type")).toContain("application/problem+json");
    }
  });
});

describe("errors", () => {
  it("answers an unknown API path with a 404 problem+json, not HTML", async () => {
    const res = await app.request("/api/nope");
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toContain("application/problem+json");
    expect(await res.json()).toMatchObject({ status: 404, title: "Not found" });
  });
});
