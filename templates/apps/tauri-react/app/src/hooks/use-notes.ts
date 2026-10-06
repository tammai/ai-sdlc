import { useCallback, useEffect, useState } from "react";
import { createNote, listNotes, type NewNote, type Note } from "@/lib/tauri";

export type NotesState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; notes: Note[] };

const messageOf = (e: unknown) => (e instanceof Error ? e.message : "Unexpected error");

export function useNotes() {
  const [state, setState] = useState<NotesState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    listNotes().then(
      (notes) => !cancelled && setState({ status: "ready", notes }),
      (e: unknown) => !cancelled && setState({ status: "error", message: messageOf(e) }),
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const reload = useCallback(async () => {
    setState({ status: "loading" });
    try {
      setState({ status: "ready", notes: await listNotes() });
    } catch (e) {
      setState({ status: "error", message: messageOf(e) });
    }
  }, []);

  /** Resolves with an error message, or null on success. */
  const create = useCallback(async (input: NewNote): Promise<string | null> => {
    try {
      const note = await createNote(input);
      setState((s) => ({ status: "ready", notes: [note, ...(s.status === "ready" ? s.notes : [])] }));
      return null;
    } catch (e) {
      return messageOf(e);
    }
  }, []);

  return { state, reload, create };
}
