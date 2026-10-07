import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { here, problem, providers, renderApp, user } from "./helpers";

const guest = { "GET /api/v1/auth/me": problem(401, "Unauthorized") };

describe("register page", () => {
  it("says registration is closed when the API has it off", async () => {
    renderApp("/register", { ...guest, "GET /api/v1/auth/providers": providers.passwordOnly });
    expect(await screen.findByTestId("registration-closed")).toHaveTextContent("Registration is closed");
    expect(screen.queryByLabelText("Password")).not.toBeInTheDocument();
  });

  it("requires a password of at least 12 characters", async () => {
    const { user: u, find } = renderApp("/register", { ...guest, "GET /api/v1/auth/providers": providers.all });
    await u.type(await screen.findByLabelText("Email"), "ada@example.com");
    await u.type(screen.getByLabelText("Password"), "too short");
    await u.click(screen.getByRole("button", { name: "Create account" }));
    expect(await screen.findByText("Use at least 12 characters", { selector: "p[id$=-error]" })).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toHaveFocus();
    expect(find("POST", "/api/v1/auth/register")).toBeUndefined();
  });

  it("creates the account and signs in", async () => {
    const { user: u, find, router } = renderApp("/register", {
      ...guest,
      "GET /api/v1/auth/providers": providers.all,
      "POST /api/v1/auth/register": () => Response.json(user, { status: 201 }),
      "GET /api/v1/notes": { items: [] },
    });
    await u.type(await screen.findByLabelText("Email"), "ada@example.com");
    await u.type(screen.getByLabelText("Password"), "correct horse battery");
    await u.click(screen.getByRole("button", { name: "Create account" }));
    await waitFor(() => expect(here(router)).toBe("/"));
    expect(await find("POST", "/api/v1/auth/register")!.json()).toEqual({ email: "ada@example.com", password: "correct horse battery" });
  });
});

describe("magic-link page", () => {
  const token = "a-valid-one-time-token-123";

  it("posts the token once, signs in and lands on the app", async () => {
    const { router, calls } = renderApp(`/auth/magic?token=${token}`, {
      ...guest,
      "POST /api/v1/auth/magic-link/verify": user,
      "GET /api/v1/notes": { items: [] },
    });
    await waitFor(() => expect(here(router)).toBe("/"));
    const posts = calls.filter((c) => c.method === "POST");
    expect(posts).toHaveLength(1);
    expect(await posts[0]!.json()).toEqual({ token });
    expect(posts[0]!.headers.get("x-requested-with")).toBe("fetch");
  });

  it("explains an expired link and offers a way forward", async () => {
    renderApp(`/auth/magic?token=${token}`, { ...guest, "POST /api/v1/auth/magic-link/verify": problem(401, "Unauthorized") });
    expect(await screen.findByText(/expired or was already used/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Request a new link" })).toBeInTheDocument();
  });

  it("does not post an incomplete link", async () => {
    const { find } = renderApp("/auth/magic?token=abc", guest);
    expect(await screen.findByText(/incomplete/)).toBeInTheDocument();
    expect(find("POST", "/api/v1/auth/magic-link/verify")).toBeUndefined();
  });
});
