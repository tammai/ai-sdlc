import { mockIPC } from "@tauri-apps/api/mocks";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import App from "./App";

describe("notes UI", () => {
  it("shows the empty state, then a created note", async () => {
    const notes: unknown[] = [];
    mockIPC((cmd, args) => {
      if (cmd === "list_notes") return [...notes];
      if (cmd === "create_note") {
        const { title, body = "" } = (args as { input: { title: string; body?: string } }).input;
        const created = { id: 1, title, body, createdAt: "2026-01-01T00:00:00.000Z" };
        notes.unshift(created);
        return created;
      }
    });

    render(<App />);
    expect(await screen.findByText(/no notes yet/i)).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("Title"), "Buy milk");
    await userEvent.click(screen.getByRole("button", { name: /add note/i }));

    expect(await screen.findByText("Buy milk")).toBeInTheDocument();
  });

  it("shows an error state with retry when loading fails", async () => {
    mockIPC(() => {
      throw { code: "database", message: "database error: disk full" };
    });
    render(<App />);
    expect(await screen.findByText(/disk full/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });

  it("validates before calling Rust", async () => {
    mockIPC(() => []);
    render(<App />);
    await screen.findByText(/no notes yet/i);
    await userEvent.click(screen.getByRole("button", { name: /add note/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Title is required");
  });
});
