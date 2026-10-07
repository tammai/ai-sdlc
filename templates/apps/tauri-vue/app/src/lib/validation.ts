// Mirrors the limits enforced in Rust (src-tauri/src/services/notes.rs). Rust is authoritative; this only gives instant feedback.
export const TITLE_MAX = 120
export const BODY_MAX = 10_000

export function validateNote(title: string, body: string): { name: 'title' | 'body', message: string } | null {
  if (title.trim().length === 0) return { name: 'title', message: 'Title is required' }
  if (title.trim().length > TITLE_MAX) return { name: 'title', message: `Title must be at most ${TITLE_MAX} characters` }
  if (body.trim().length > BODY_MAX) return { name: 'body', message: `Body must be at most ${BODY_MAX} characters` }
  return null
}
