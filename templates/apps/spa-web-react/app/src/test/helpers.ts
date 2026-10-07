import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryHistory } from "@tanstack/react-router";
import { createElement } from "react";
import { vi } from "vitest";
import { App } from "@/app";
import { createAppInstance } from "@/instance";

type Handler = (req: Request) => Response | Promise<Response>;
type Routes = Record<string, Handler | Response | object>;

/** Stubs globalThis.fetch with a table of "METHOD /path" -> response; records every request. No network. */
export function stubApi(routes: Routes) {
  const calls: Request[] = [];
  vi.stubGlobal("fetch", async (input: Request) => {
    const req = input instanceof Request ? input : new Request(input);
    calls.push(req);
    const { pathname } = new URL(req.url);
    const hit = routes[`${req.method} ${pathname}`];
    if (hit === undefined) return Response.json({ title: "Not found", status: 404 }, { status: 404 });
    if (typeof hit === "function") return hit(req);
    return hit instanceof Response ? hit.clone() : Response.json(hit);
  });
  return { calls, find: (method: string, path: string) => calls.find((c) => c.method === method && new URL(c.url).pathname === path) };
}

export const problem = (status: number, title: string) =>
  new Response(JSON.stringify({ title, status }), { status, headers: { "content-type": "application/problem+json" } });

export const user = { id: "0b0e8a58-9f5b-4d0e-8a58-0f6a1f0a0001", email: "ada@example.com" };
export const note = { id: "6f1c0f0e-9f5b-4d0e-8a58-0f6a1f0a0001", title: "Buy milk", body: "2 litres", createdAt: "2026-10-06T08:00:00Z" };
export const providers = {
  all: { password: true, registration: true, magicLink: true, oidc: [{ id: "google", name: "Google" }, { id: "github", name: "GitHub" }] },
  passwordOnly: { password: true, registration: false, magicLink: false, oidc: [] },
};

/** Renders the whole app (router, query client) at `path` with an in-memory history. */
export function renderApp(path: string, routes: Routes) {
  const api = stubApi(routes);
  const instance = createAppInstance(createMemoryHistory({ initialEntries: [path] }));
  render(createElement(App, instance));
  return { ...api, ...instance, user: userEvent.setup() };
}

/** Current location as "/path?search" (the router state, not window.location). */
export const here = (router: ReturnType<typeof createAppInstance>["router"]) => router.state.location.href;
