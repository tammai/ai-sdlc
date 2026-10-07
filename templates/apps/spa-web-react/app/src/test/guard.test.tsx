import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { here, note, problem, providers, renderApp, user } from "./helpers";

describe("route guard", () => {
  it("sends unauthenticated users (401 from /v1/auth/me) to /login and keeps the intended path", async () => {
    const { router } = renderApp("/?filter=work", { "GET /api/v1/auth/me": problem(401, "Unauthorized"), "GET /api/v1/auth/providers": providers.passwordOnly });
    await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
    expect(router.state.location.search).toEqual({ redirect: "/?filter=work" });
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
  });

  it("lets signed-in users through", async () => {
    const { router } = renderApp("/", { "GET /api/v1/auth/me": user, "GET /api/v1/notes": { items: [note] } });
    expect(await screen.findByText("Buy milk")).toBeInTheDocument();
    expect(here(router)).toBe("/");
    expect(screen.getByText(user.email)).toBeInTheDocument();
  });

  it("bounces signed-in users away from /login to their intended page", async () => {
    const { router } = renderApp("/login?redirect=%2F", { "GET /api/v1/auth/me": user, "GET /api/v1/notes": { items: [] } });
    expect(await screen.findByRole("heading", { name: "Your notes" })).toBeInTheDocument();
    expect(here(router)).toBe("/");
  });

  it("does not ask the API about public pages that are not guest-only", async () => {
    const { calls } = renderApp("/auth/magic", {});
    expect(await screen.findByText("This sign-in link is incomplete. Request a new one.")).toBeInTheDocument();
    expect(calls.some((c) => c.url.includes("/auth/me"))).toBe(false);
  });

  it("shows an error page (not the sign-in page) when the API is unreachable", async () => {
    const { router } = renderApp("/", { "GET /api/v1/auth/me": problem(502, "Bad gateway") });
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't reach the server");
    expect(router.state.location.pathname).toBe("/error");
  });

  it("returns to sign-in, remembering the page, when the session expires mid-use", async () => {
    const { router } = renderApp("/?filter=work", {
      "GET /api/v1/auth/me": user,
      "GET /api/v1/notes": problem(401, "Unauthorized"),
      "GET /api/v1/auth/providers": providers.passwordOnly,
    });
    await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
    expect(router.state.location.search).toEqual({ redirect: "/?filter=work" });
  });

  it("shows a not-found page for unknown routes", async () => {
    renderApp("/no/such/page", { "GET /api/v1/auth/me": user });
    expect(await screen.findByRole("heading", { name: "Page not found" })).toBeInTheDocument();
  });
});
