import { api, problemMessage } from '~/api/client'
import type { NewNote } from '~/api/client'

export function useNotes() {
  const { loggedIn } = useUserSession()
  const { data, status, error, refresh } = useAsyncData(
    'notes',
    async () => {
      if (!loggedIn.value) return { items: [] }
      const { data, error } = await api.GET('/notes')
      if (error) throw new Error(problemMessage(error))
      return data
    },
    { lazy: true, watch: [loggedIn], default: () => ({ items: [] }) }
  )

  const creating = ref(false)
  const createError = ref<string | null>(null)

  async function create(note: NewNote): Promise<boolean> {
    creating.value = true
    createError.value = null
    try {
      const { error } = await api.POST('/notes', { body: note })
      if (error) {
        createError.value = problemMessage(error)
        return false
      }
      await refresh()
      return true
    } finally {
      creating.value = false
    }
  }

  return {
    notes: computed(() => data.value?.items ?? []),
    loading: computed(() => status.value === 'pending'),
    error: computed(() => error.value?.message ?? null),
    refresh,
    create,
    creating,
    createError
  }
}
