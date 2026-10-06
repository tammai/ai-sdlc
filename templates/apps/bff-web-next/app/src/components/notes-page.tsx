'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, CSRF_HEADERS, problemMessage, type NewNote } from '@/api/client'
import { LoginForm } from '@/components/login-form'
import { NoteForm } from '@/components/note-form'
import { NoteList } from '@/components/note-list'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

export function NotesPage() {
  const queryClient = useQueryClient()

  const session = useQuery({
    queryKey: ['session'],
    queryFn: async () => {
      const res = await fetch('/api/auth/session')
      return (await res.json()) as { loggedIn: boolean }
    }
  })
  const loggedIn = session.data?.loggedIn === true

  const notes = useQuery({
    queryKey: ['notes'],
    enabled: loggedIn,
    queryFn: async () => {
      const { data, error, response } = await api.GET('/notes')
      if (error) {
        if (response.status === 401) void queryClient.invalidateQueries({ queryKey: ['session'] })
        throw new Error(problemMessage(error))
      }
      return data
    }
  })

  const create = useMutation({
    mutationFn: async (note: NewNote) => {
      const { error } = await api.POST('/notes', { body: note })
      if (error) throw new Error(problemMessage(error))
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notes'] })
  })

  const signOut = useMutation({
    mutationFn: () => fetch('/api/auth/logout', { method: 'POST', headers: CSRF_HEADERS }),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: ['notes'] })
      return queryClient.invalidateQueries({ queryKey: ['session'] })
    }
  })

  return (
    <main className="mx-auto max-w-2xl space-y-8 px-4 py-10">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">__APP_TITLE__</h1>
        {loggedIn ? (
          <Button variant="ghost" onClick={() => signOut.mutate()}>
            Sign out
          </Button>
        ) : null}
      </header>

      {session.isPending ? null : !loggedIn ? (
        <Card>
          <CardContent>
            <LoginForm onDone={() => void queryClient.invalidateQueries({ queryKey: ['session'] })} />
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardContent>
              <NoteForm
                creating={create.isPending}
                error={create.error?.message ?? null}
                onCreate={(note) => create.mutateAsync(note).then(() => true, () => false)}
              />
            </CardContent>
          </Card>
          <NoteList
            notes={notes.data?.items ?? []}
            loading={notes.isPending}
            error={notes.error?.message ?? null}
            onRetry={() => void notes.refetch()}
          />
        </>
      )}
    </main>
  )
}
