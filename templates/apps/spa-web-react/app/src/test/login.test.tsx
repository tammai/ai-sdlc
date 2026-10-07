import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { here, problem, providers, renderApp, user } from "./helpers";

const guest = { "GET /api/v1/auth/me": problem(401, "Unauthorized") };
const login = (extra: Record<string, unknown>, path = "/login?redirect=%2Fnotes%3Fpage%3D2") => renderApp(path, { ...guest, ...extra });

describe("login page (driven by GET /v1/auth/providers)", () => {
  it("renders every enabled method", async () => {
    login({ "GET /api/v1/auth/providers": providers.all });
    const google = await screen.findByRole("link", { name: "Continue with Google" });
    expect(google).toHaveAttribute("href", "/api/v1/auth/oidc/google/start?redirect=%2Fnotes%3Fpage%3D2");
    expect(screen.getByRole("link", { name: "Continue with GitHub" })).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expect(screen.getByLabelText("Email me a sign-in link")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Create an account" })).toBeInTheDocument();
  });

  it("renders only password when nothing else is enabled", async () => {
    login({ "GET /api/v1/auth/providers": providers.passwordOnly });
    expect(await screen.findByLabelText("Password")).toBeInTheDocument();
    expect(screen.queryByText("Email me a sign-in link")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Create an account" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Continue with/ })).not.toBeInTheDocument();
  });

  it("renders only the OIDC buttons when password sign-in is off", async () => {
    login({ "GET /api/v1/auth/providers": { password: false, registration: false, magicLink: false, oidc: [{ id: "okta", name: "Okta" }] } });
    expect(await screen.findByRole("link", { name: "Continue with Okta" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Password")).not.toBeInTheDocument();
  });

  it("says so when no method is enabled", async () => {
    login({ "GET /api/v1/auth/providers": { password: false, registration: false, magicLink: false, oidc: [] } });
    expect(await screen.findByTestId("no-methods")).toHaveTextContent("No sign-in methods are enabled");
  });

  it("shows an error with a retry when the providers cannot be loaded", async () => {
    const { user: u } = login({ "GET /api/v1/auth/providers": problem(502, "Bad gateway") });
    expect(await screen.findByTestId("providers-error")).toHaveTextContent("Couldn't load the sign-in options");
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    void u;
  });

  it("explains a failed provider sign-in (?error=access_denied from the API)", async () => {
    login({ "GET /api/v1/auth/providers": providers.all }, "/login?error=access_denied");
    expect(await screen.findByTestId("provider-error")).toHaveTextContent("Access was denied at the provider");
    expect(await screen.findByRole("link", { name: "Continue with Google" })).toBeInTheDocument();
  });

  it("validates the form, ties the error to the field and focuses it", async () => {
    const { user: u } = login({ "GET /api/v1/auth/providers": providers.passwordOnly });
    await u.click(await screen.findByRole("button", { name: "Sign in" }));
    const email = screen.getByLabelText("Email");
    expect(await screen.findByText("Enter a valid email address, like name@example.com")).toBeInTheDocument();
    expect(email).toHaveAttribute("aria-invalid", "true");
    expect(email).toHaveAccessibleDescription("Enter a valid email address, like name@example.com");
    expect(email).toHaveFocus();
  });

  it("signs in with email and password (CSRF header on the request) and lands on the intended page", async () => {
    const { user: u, find, router } = login(
      { "GET /api/v1/auth/providers": providers.passwordOnly, "POST /api/v1/auth/session": user, "GET /api/v1/notes": { items: [] } },
      "/login?redirect=%2F",
    );
    await u.type(await screen.findByLabelText("Email"), "ada@example.com");
    await u.type(screen.getByLabelText("Password"), "correct horse battery");
    await u.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(here(router)).toBe("/"));
    const post = find("POST", "/api/v1/auth/session")!;
    expect(await post.json()).toEqual({ email: "ada@example.com", password: "correct horse battery" });
    expect(post.headers.get("x-requested-with")).toBe("fetch");
    expect(await screen.findByRole("heading", { name: "Your notes" })).toBeInTheDocument();
  });

  it("shows a clear message for wrong credentials and keeps what was typed", async () => {
    const { user: u, router } = login({ "GET /api/v1/auth/providers": providers.passwordOnly, "POST /api/v1/auth/session": problem(401, "Unauthorized") });
    await u.type(await screen.findByLabelText("Email"), "ada@example.com");
    await u.type(screen.getByLabelText("Password"), "nope");
    await u.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Email or password is incorrect");
    expect(screen.getByLabelText("Email")).toHaveValue("ada@example.com");
    expect(here(router)).toContain("/login"); // a 401 here is not "session expired"
  });

  it("emails a sign-in link and confirms without revealing whether the account exists", async () => {
    const { user: u, find } = login({ "GET /api/v1/auth/providers": providers.all, "POST /api/v1/auth/magic-link": new Response(null, { status: 202 }) });
    await u.type(await screen.findByLabelText("Email me a sign-in link"), "ada@example.com");
    await u.click(screen.getByRole("button", { name: "Send sign-in link" }));
    expect(await screen.findByTestId("magic-sent")).toHaveTextContent("Check your inbox");
    expect(await find("POST", "/api/v1/auth/magic-link")!.json()).toEqual({ email: "ada@example.com", client: "web" });
  });
});
