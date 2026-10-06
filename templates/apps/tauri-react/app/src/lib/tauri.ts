// The ONLY place the frontend talks to Rust. One typed wrapper per command; keep these
// signatures in sync with src-tauri/src/commands/*.rs. Never call fetch() to remote APIs from the UI.
import { invoke } from "@tauri-apps/api/core";

export interface Note {
  id: number;
  title: string;
  body: string;
  createdAt: string;
}

export interface NewNote {
  title: string;
  body?: string;
}

/** Mirrors the serialized Rust `AppError` (`{ code, message }`). */
export interface AppErrorPayload {
  code: "validation" | "database" | "io" | "internal" | "unknown";
  message: string;
}

export class TauriError extends Error {
  readonly code: AppErrorPayload["code"];

  constructor(payload: AppErrorPayload) {
    super(payload.message);
    this.name = "TauriError";
    this.code = payload.code;
  }
}

function toTauriError(e: unknown): TauriError {
  if (e instanceof TauriError) return e;
  if (typeof e === "object" && e !== null && "message" in e) {
    const { code, message } = e as Partial<AppErrorPayload>;
    return new TauriError({ code: code ?? "unknown", message: String(message) });
  }
  return new TauriError({ code: "unknown", message: typeof e === "string" ? e : "Unexpected error" });
}

async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (e) {
    throw toTauriError(e);
  }
}

export const listNotes = () => call<Note[]>("list_notes");
export const createNote = (input: NewNote) => call<Note>("create_note", { input });
