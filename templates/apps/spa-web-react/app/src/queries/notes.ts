import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import type { NewNote } from "@/api/client";
import { unwrap } from "@/api/problem";

export const notesKey = ["notes"] as const;

export function useNotes() {
  return useInfiniteQuery({
    queryKey: notesKey,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      unwrap(() => api.GET("/v1/notes", { params: { query: { limit: 20, cursor: pageParam } } }), "Couldn't load your notes."),
    getNextPageParam: (page) => page.nextCursor,
  });
}

export function useCreateNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (note: NewNote) =>
      unwrap(() => api.POST("/v1/notes", { body: note }), "Couldn't save the note. Your text is still here, so try again."),
    // A 401 here means the session expired while the form was open: see createQueryClient.
    meta: { expireOn401: true },
    onSuccess: () => qc.invalidateQueries({ queryKey: notesKey }),
  });
}
