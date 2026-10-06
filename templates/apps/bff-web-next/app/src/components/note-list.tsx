import type { Note } from '@/api/client'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

interface NoteListProps {
  notes: Note[]
  loading: boolean
  error: string | null
  onRetry: () => void
}

export function NoteList({ notes, loading, error, onRetry }: NoteListProps) {
  if (loading) {
    return (
      <div data-testid="notes-loading" className="space-y-3">
        {[0, 1, 2].map((n) => (
          <Skeleton key={n} className="h-16 w-full" />
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <Alert variant="destructive" data-testid="notes-error">
        <AlertTitle>Could not load notes</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
        <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>
          Retry
        </Button>
      </Alert>
    )
  }

  if (notes.length === 0) {
    return (
      <p data-testid="notes-empty" className="text-muted-foreground">
        No notes yet. Create your first one above.
      </p>
    )
  }

  return (
    <ul className="space-y-3">
      {notes.map((note) => (
        <li key={note.id}>
          <Card className="gap-1 py-4">
            <CardContent>
              <h3 className="font-medium">{note.title}</h3>
              {note.body ? <p className="mt-1 text-sm whitespace-pre-wrap text-muted-foreground">{note.body}</p> : null}
              <p className="mt-2 text-xs text-muted-foreground">{new Date(note.createdAt).toLocaleString()}</p>
            </CardContent>
          </Card>
        </li>
      ))}
    </ul>
  )
}
