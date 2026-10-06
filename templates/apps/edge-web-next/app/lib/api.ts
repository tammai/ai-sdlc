import type { CreateNoteInput, Note } from '@/shared/schemas/note'
import type { Problem } from '@/shared/schemas/problem'

/** A failed /api/* call, carrying the problem+json body when the server sent one. */
export class ApiError extends Error {
  readonly problem?: Problem

  constructor(message: string, problem?: Problem) {
    super(message)
    this.problem = problem
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, headers: { 'content-type': 'application/json', ...init?.headers } })
  if (!res.ok) {
    const body = (await res.json().catch(() => undefined)) as Problem | undefined
    const message = body?.errors?.map(e => e.message).join(', ') || body?.detail || body?.title || `Request failed (${res.status})`
    throw new ApiError(message, body)
  }
  return res.json() as Promise<T>
}

export const listNotes = () => request<Note[]>('/api/notes')
export const createNote = (input: CreateNoteInput) => request<Note>('/api/notes', { method: 'POST', body: JSON.stringify(input) })
