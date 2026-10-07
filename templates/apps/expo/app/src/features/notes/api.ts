import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { api } from '@/api/client';
import { toApiError } from '@/api/errors';
import type { components } from '@/api/schema';

export type Note = components['schemas']['Note'];
export type NewNote = components['schemas']['NewNote'];

export const notesKey = ['notes'] as const;
const PAGE_SIZE = 20;

export async function fetchNotes(cursor?: string) {
  const { data, error, response } = await api.GET('/v1/notes', { params: { query: { limit: PAGE_SIZE, cursor } } });
  if (!data) throw toApiError(response.status, error);
  return data;
}

export async function createNote(input: NewNote) {
  const { data, error, response } = await api.POST('/v1/notes', { body: input });
  if (!data) throw toApiError(response.status, error);
  return data;
}

export function useNotes() {
  return useInfiniteQuery({
    queryKey: notesKey,
    queryFn: ({ pageParam }) => fetchNotes(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor,
  });
}

export function useCreateNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createNote,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: notesKey }),
  });
}
