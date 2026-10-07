import { api } from '~/api/client'
import type { NewNote, Note } from '~/api/client'

export function useNotes() {
  const items = useState<Note[]>('notes:items', () => [])
  const nextCursor = useState<string | undefined>('notes:cursor', () => undefined)
  const status = useState<'idle' | 'loading' | 'ready' | 'error'>('notes:status', () => 'idle')
  const error = useState<string | null>('notes:error', () => null)
  const loadingMore = ref(false)
  const creating = ref(false)
  const createError = ref<string | null>(null)

  // A 401 mid-session means the cookie expired: go to sign-in and come back here afterwards.
  async function onUnauthorized() {
    const back = useRoute().fullPath
    useAuth().expire()
    await navigateTo(loginLocation(back))
  }

  async function load() {
    status.value = 'loading'
    error.value = null
    const r = await call(() => api.GET('/v1/notes', { params: { query: { limit: 20 } } }), "Couldn't load your notes.")
    if (r.ok) {
      items.value = r.data.items
      nextCursor.value = r.data.nextCursor
      status.value = 'ready'
    } else if (r.status === 401) {
      await onUnauthorized()
    } else {
      error.value = r.message
      status.value = 'error'
    }
  }

  async function loadMore() {
    if (!nextCursor.value) return
    loadingMore.value = true
    const r = await call(() => api.GET('/v1/notes', { params: { query: { limit: 20, cursor: nextCursor.value } } }), "Couldn't load more notes.")
    loadingMore.value = false
    if (r.ok) {
      items.value = [...items.value, ...r.data.items]
      nextCursor.value = r.data.nextCursor
    } else if (r.status === 401) {
      await onUnauthorized()
    } else {
      useToast().add({ title: r.message, color: 'error' })
    }
  }

  async function create(note: NewNote): Promise<boolean> {
    creating.value = true
    createError.value = null
    const r = await call(() => api.POST('/v1/notes', { body: note }), "Couldn't save the note. Your text is still here, so try again.")
    creating.value = false
    if (r.ok) {
      items.value = [r.data, ...items.value]
      useToast().add({ title: 'Note added', color: 'success' })
      return true
    }
    if (r.status === 401) await onUnauthorized()
    else createError.value = r.message
    return false
  }

  return { items, status, error, nextCursor, loadingMore, creating, createError, load, loadMore, create }
}
