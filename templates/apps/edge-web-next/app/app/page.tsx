'use client'

import { useQuery } from '@tanstack/react-query'
import { NoteForm } from '@/components/note-form'
import { NotesList } from '@/components/notes-list'
import { listNotes } from '@/lib/api'

export default function Home() {
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['notes'], queryFn: listNotes })

  return (
    <main className="mx-auto max-w-2xl space-y-8 px-4 py-12">
      <header>
        <h1 className="text-2xl font-bold">__APP_TITLE__</h1>
        <p className="text-muted-foreground">Notes stored in Cloudflare D1.</p>
      </header>
      <NoteForm />
      <NotesList notes={data} isLoading={isLoading} error={error} onRetry={() => void refetch()} />
    </main>
  )
}
