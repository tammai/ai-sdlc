'use client'

import type { Note } from '@/shared/schemas/note'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

interface NotesListProps {
  notes: Note[] | undefined
  isLoading: boolean
  error: Error | null
  onRetry: () => void
}

export function NotesList({ notes, isLoading, error, onRetry }: NotesListProps) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map(n => (
          <Skeleton key={n} data-testid="note-skeleton" className="h-20 w-full" />
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Could not load notes</AlertTitle>
        <AlertDescription>
          <p>{error.message}</p>
          <Button variant="outline" size="sm" className="mt-2" onClick={onRetry}>Retry</Button>
        </AlertDescription>
      </Alert>
    )
  }

  if (!notes?.length) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center">
        <p className="font-medium">No notes yet</p>
        <p className="text-sm text-muted-foreground">Create your first note with the form above.</p>
      </div>
    )
  }

  return (
    <ul className="space-y-3">
      {notes.map(note => (
        <li key={note.id} data-testid="note">
          <Card>
            <CardHeader>
              <CardTitle>{note.title}</CardTitle>
            </CardHeader>
            {note.body && (
              <CardContent>
                <p className="whitespace-pre-line text-muted-foreground">{note.body}</p>
              </CardContent>
            )}
            <CardFooter>
              <time dateTime={note.createdAt} className="text-xs text-muted-foreground">
                {new Date(note.createdAt).toLocaleString()}
              </time>
            </CardFooter>
          </Card>
        </li>
      ))}
    </ul>
  )
}
