import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { NoteForm } from "@/components/note-form";
import { NoteList } from "@/components/note-list";
import { here, note, problem, renderApp, user } from "./helpers";

describe("NoteList states", () => {
  it("shows the loading state", () => {
    render(<NoteList notes={[]} loading error={null} onRetry={() => {}} />);
    expect(screen.getByTestId("notes-loading")).toBeInTheDocument();
    expect(screen.queryByTestId("notes-empty")).not.toBeInTheDocument();
  });

  it("shows the empty state with the next action", () => {
    render(<NoteList notes={[]} loading={false} error={null} onRetry={() => {}} />);
    expect(screen.getByTestId("notes-empty")).toHaveTextContent("No notes yet. Add your first note");
  });

  it("shows the error state with a retry action", async () => {
    const onRetry = vi.fn();
    render(<NoteList notes={[]} loading={false} error="Bad gateway" onRetry={onRetry} />);
    expect(screen.getByTestId("notes-error")).toHaveTextContent("Bad gateway");
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("renders notes", () => {
    render(<NoteList notes={[note]} loading={false} error={null} onRetry={() => {}} />);
    expect(screen.getByText("Buy milk")).toBeInTheDocument();
    expect(screen.getByText("2 litres")).toBeInTheDocument();
  });
});

describe("NoteForm", () => {
  it("blocks submit and shows the error next to the field when the title is empty", async () => {
    const onCreate = vi.fn();
    render(<NoteForm creating={false} error={null} onCreate={onCreate} />);
    await userEvent.click(screen.getByRole("button", { name: "Add note" }));
    const title = screen.getByLabelText("Title");
    expect(await screen.findByText("Enter a title")).toBeInTheDocument();
    expect(title).toHaveAttribute("aria-invalid", "true");
    expect(title).toHaveAccessibleDescription("Enter a title");
    expect(title).toHaveFocus();
    expect(onCreate).not.toHaveBeenCalled();
  });
});

describe("notes page (list + create against the API)", () => {
  const signedIn = { "GET /api/v1/auth/me": user };

  it("shows the loading state while notes load", async () => {
    renderApp("/", { ...signedIn, "GET /api/v1/notes": () => new Promise<Response>(() => {}) });
    expect(await screen.findByTestId("notes-loading")).toBeInTheDocument();
  });

  it("shows the empty state when there are no notes", async () => {
    renderApp("/", { ...signedIn, "GET /api/v1/notes": { items: [] } });
    expect(await screen.findByTestId("notes-empty")).toBeInTheDocument();
  });

  it("shows the error state when loading fails, and recovers on retry", async () => {
    let fail = true;
    const { user: u } = renderApp("/", { ...signedIn, "GET /api/v1/notes": () => (fail ? problem(502, "Bad gateway") : Response.json({ items: [note] })) });
    expect(await screen.findByTestId("notes-error")).toHaveTextContent("Bad gateway");
    fail = false;
    await u.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Buy milk")).toBeInTheDocument();
  });

  it("creates a note (CSRF header on the request), shows it, and clears the form", async () => {
    const created = { ...note, id: "6f1c0f0e-9f5b-4d0e-8a58-0f6a1f0a0002", title: "Call Ada", body: "" };
    let saved = false;
    const { user: u, find } = renderApp("/", {
      ...signedIn,
      "GET /api/v1/notes": () => Response.json({ items: saved ? [created, note] : [note] }),
      "POST /api/v1/notes": () => {
        saved = true;
        return Response.json(created, { status: 201 });
      },
    });
    await screen.findByText("Buy milk");
    await u.type(screen.getByLabelText("Title"), "Call Ada");
    await u.click(screen.getByRole("button", { name: "Add note" }));
    expect(await screen.findByText("Call Ada")).toBeInTheDocument();
    const post = find("POST", "/api/v1/notes")!;
    expect(await post.json()).toEqual({ title: "Call Ada" });
    expect(post.headers.get("x-requested-with")).toBe("fetch");
    expect(screen.getByLabelText("Title")).toHaveValue("");
    expect(screen.getByRole("status")).toHaveTextContent("Note added");
  });

  it("keeps the form content and explains when saving fails", async () => {
    const { user: u } = renderApp("/", { ...signedIn, "GET /api/v1/notes": { items: [] }, "POST /api/v1/notes": problem(422, "Validation failed") });
    await screen.findByTestId("notes-empty");
    await u.type(screen.getByLabelText("Title"), "Call Ada");
    await u.click(screen.getByRole("button", { name: "Add note" }));
    expect(await screen.findByText("Couldn't save the note")).toBeInTheDocument();
    expect(screen.getByLabelText("Title")).toHaveValue("Call Ada");
  });

  it("loads the next page when there are more notes", async () => {
    const second = { ...note, id: "6f1c0f0e-9f5b-4d0e-8a58-0f6a1f0a0003", title: "Older note" };
    const { user: u, calls } = renderApp("/", {
      ...signedIn,
      "GET /api/v1/notes": (req) =>
        new URL(req.url).searchParams.get("cursor") === "c1" ? Response.json({ items: [second] }) : Response.json({ items: [note], nextCursor: "c1" }),
    });
    await u.click(await screen.findByRole("button", { name: "Show more notes" }));
    expect(await screen.findByText("Older note")).toBeInTheDocument();
    expect(calls.filter((c) => c.url.includes("/v1/notes")).length).toBe(2);
  });

  it("signs out and returns to the sign-in page", async () => {
    const { user: u, router } = renderApp("/", {
      ...signedIn,
      "GET /api/v1/notes": { items: [] },
      "DELETE /api/v1/auth/session": new Response(null, { status: 204 }),
      "GET /api/v1/auth/providers": { password: true, registration: false, magicLink: false, oidc: [] },
    });
    await screen.findByTestId("notes-empty");
    await u.click(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(here(router)).toBe("/login"));
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
  });
});
