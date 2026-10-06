import type { CreateNoteInput, Note } from '#shared/schemas/note'
import type { Problem } from '#shared/schemas/problem'

/** Message to show for a failed /api/* call: the problem+json detail when there is one. */
export function problemMessage(error: unknown): string {
  const data = (error as { data?: Partial<Problem> } | null)?.data
  return data?.errors?.map(e => e.message).join(', ') || data?.detail || data?.title || (error as Error | null)?.message || 'Something went wrong'
}

export function useNotes() {
  const { data, status, error, refresh } = useFetch<Note[]>('/api/notes', { default: () => [] })

  async function create(input: CreateNoteInput) {
    await $fetch<Note>('/api/notes', { method: 'POST', body: input })
    await refresh()
  }

  return { notes: data, status, error, refresh, create }
}
