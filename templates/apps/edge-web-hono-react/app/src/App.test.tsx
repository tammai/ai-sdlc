import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { json, problemJson, renderApp, stubApi, stubNotesApi } from "./test-utils";

const note = { id: "0b0e7a3c-0000-4000-8000-000000000001", title: "Buy milk", body: "Two litres", createdAt: "2026-01-01T10:00:00.000Z" };

describe("notes page", () => {
  it("shows a skeleton while loading, then the notes", async () => {
    stubApi(async () => {
      await new Promise((r) => setTimeout(r, 400));
      return json([note]);
    });
    renderApp();
    expect(screen.getByText("Loading notes…")).toBeInTheDocument();
    await waitFor(() => expect(document.querySelector('[data-slot="skeleton"]')).not.toBeNull());
    expect(await screen.findByText("Buy milk")).toBeInTheDocument();
    expect(screen.getByText("Two litres")).toBeInTheDocument();
  });

  it("shows the empty state with the next action, then a created note", async () => {
    stubNotesApi();
    renderApp();
    expect(await screen.findByText(/no notes yet/i)).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("Title"), "Buy milk");
    await userEvent.click(screen.getByRole("button", { name: "Add note" }));

    expect(await screen.findByText("Buy milk")).toBeInTheDocument();
    expect(screen.getByText("Note added.")).toBeInTheDocument();
    expect(screen.queryByText(/no notes yet/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Title")).toHaveValue("");
  });

  it("shows an error state with retry when loading fails, then recovers", async () => {
    let fail = true;
    stubApi(() => (fail ? problemJson(500, "Internal server error") : json([note])));
    renderApp();
    expect(await screen.findByText(/couldn.t load your notes/i)).toBeInTheDocument();

    fail = false;
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Buy milk")).toBeInTheDocument();
  });

  it("validates before calling the API, ties the error to the field and focuses it", async () => {
    const fetchMock = stubNotesApi();
    renderApp();
    await screen.findByText(/no notes yet/i);
    fetchMock.mockClear();

    await userEvent.click(screen.getByRole("button", { name: "Add note" }));

    const title = screen.getByLabelText("Title");
    expect(title).toHaveAttribute("aria-invalid", "true");
    expect(title).toHaveAccessibleDescription("Title is required");
    expect(title).toHaveFocus();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps the input and explains what happened when saving fails", async () => {
    stubApi((request) => (request.method === "GET" ? json([]) : problemJson(500, "Internal server error")));
    renderApp();
    await screen.findByText(/no notes yet/i);

    await userEvent.type(screen.getByLabelText("Title"), "Draft idea");
    await userEvent.click(screen.getByRole("button", { name: "Add note" }));

    expect(await screen.findByText(/couldn.t add the note/i)).toBeInTheDocument();
    expect(screen.getByLabelText("Title")).toHaveValue("Draft idea");
  });

  it("shows the server's message on the field for a 400 problem", async () => {
    stubApi((request) =>
      request.method === "GET"
        ? json([])
        : problemJson(400, "Invalid request", { detail: "The request did not pass validation.", errors: [{ path: "title", message: "Title is required" }] }),
    );
    renderApp();
    await screen.findByText(/no notes yet/i);

    await userEvent.type(screen.getByLabelText("Title"), "x");
    await userEvent.click(screen.getByRole("button", { name: "Add note" }));

    expect(await screen.findByText("Title is required")).toBeInTheDocument();
    expect(screen.getByLabelText("Title")).toHaveAttribute("aria-invalid", "true");
  });
});

describe("routing", () => {
  it("renders a not-found page with a way back for unknown paths", async () => {
    stubNotesApi();
    renderApp("/some/deep/link");
    expect(await screen.findByRole("heading", { name: "Page not found" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("link", { name: "Back to your notes" }));
    expect(await screen.findByLabelText("Title")).toBeInTheDocument();
  });
});
