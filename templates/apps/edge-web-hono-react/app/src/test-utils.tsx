import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { vi } from "vitest";
import type { Note } from "@shared/schemas/note";
import App from "./App";

/** Render the whole app at `path` with a fresh query client (no retries, so errors show immediately). */
export function renderApp(path = "/") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

export const json = (data: unknown, status = 200) => Response.json(data, { status });

export const problemJson = (status: number, title: string, extra: Record<string, unknown> = {}) =>
  new Response(JSON.stringify({ type: "about:blank", title, status, ...extra }), {
    status,
    headers: { "content-type": "application/problem+json" },
  });

type Handler = (request: Request) => Response | Promise<Response>;

/** Replace global fetch with `handler`; it receives a normal Request, so the typed Hono client runs unchanged. */
export function stubApi(handler: Handler) {
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => Promise.resolve(handler(new Request(input, init))));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** An in-memory /api/notes: GET lists newest first, POST stores what it is given. */
export function stubNotesApi(initial: Note[] = []) {
  const notes = [...initial];
  return stubApi(async (request) => {
    const { pathname } = new URL(request.url);
    if (pathname !== "/api/notes") return problemJson(404, "Not found");
    if (request.method === "GET") return json(notes);
    const { title, body = "" } = (await request.json()) as { title: string; body?: string };
    const created: Note = { id: crypto.randomUUID(), title, body, createdAt: "2026-01-01T10:00:00.000Z" };
    notes.unshift(created);
    return json(created, 201);
  });
}
