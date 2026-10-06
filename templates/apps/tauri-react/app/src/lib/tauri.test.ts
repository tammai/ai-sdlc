import { mockIPC } from "@tauri-apps/api/mocks";
import { describe, expect, it, vi } from "vitest";
import { createNote, listNotes, TauriError } from "./tauri";

const note = { id: 1, title: "Buy milk", body: "", createdAt: "2026-01-01T00:00:00.000Z" };

describe("tauri bridge", () => {
  it("listNotes invokes list_notes", async () => {
    const handler = vi.fn(() => [note]);
    mockIPC(handler);
    await expect(listNotes()).resolves.toEqual([note]);
    expect(handler).toHaveBeenCalledWith("list_notes", {});
  });

  it("createNote wraps the payload as { input }", async () => {
    const handler = vi.fn(() => note);
    mockIPC(handler);
    await createNote({ title: "Buy milk" });
    expect(handler).toHaveBeenCalledWith("create_note", { input: { title: "Buy milk" } });
  });

  it("maps a serialized AppError to TauriError", async () => {
    mockIPC(() => {
      throw { code: "validation", message: "title is required" };
    });
    const err = await createNote({ title: " " }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TauriError);
    expect(err).toMatchObject({ code: "validation", message: "title is required" });
  });
});
