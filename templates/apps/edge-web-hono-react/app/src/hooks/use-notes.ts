import { QueryClient, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateNoteInput, Note } from "@shared/schemas/note";
import { api, toApiError } from "@/lib/api";

export const notesKey = ["notes"] as const;

export const createQueryClient = () => new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } });

async function listNotes(): Promise<Note[]> {
  const res = await api.api.notes.$get();
  if (!res.ok) throw await toApiError(res);
  return res.json();
}

async function createNote(input: CreateNoteInput): Promise<Note> {
  const res = await api.api.notes.$post({ json: input });
  if (!res.ok) throw await toApiError(res);
  return res.json();
}

/** Newest-first list of notes. */
export const useNotes = () => useQuery({ queryKey: notesKey, queryFn: listNotes });

/** Creates a note and puts it at the top of the cached list. */
export function useCreateNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createNote,
    onSuccess: (note) => queryClient.setQueryData<Note[]>(notesKey, (notes) => [note, ...(notes ?? [])]),
  });
}
