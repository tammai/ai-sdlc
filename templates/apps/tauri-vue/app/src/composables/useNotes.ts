import { onMounted, ref } from 'vue'
import { createNote, listNotes, type NewNote, type Note } from '@/lib/tauri'

const messageOf = (e: unknown) => (e instanceof Error ? e.message : 'Unexpected error')

export function useNotes() {
  const notes = ref<Note[]>([])
  const status = ref<'loading' | 'ready' | 'error'>('loading')
  const error = ref<string | null>(null)

  async function load() {
    status.value = 'loading'
    try {
      notes.value = await listNotes()
      status.value = 'ready'
    } catch (e) {
      error.value = messageOf(e)
      status.value = 'error'
    }
  }

  /** Resolves with an error message, or null on success. */
  async function create(input: NewNote): Promise<string | null> {
    try {
      notes.value = [await createNote(input), ...notes.value]
      return null
    } catch (e) {
      return messageOf(e)
    }
  }

  onMounted(load)

  return { notes, status, error, load, create }
}
