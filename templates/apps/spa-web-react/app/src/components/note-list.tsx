import { LoaderCircle } from "lucide-react";
import type { Note } from "@/api/client";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCreated } from "@/lib/time";

interface NoteListProps {
  notes: Note[];
  loading: boolean;
  error: string | null;
  hasMore?: boolean;
  loadingMore?: boolean;
  onRetry: () => void;
  onMore?: () => void;
}

export function NoteList({ notes, loading, error, hasMore, loadingMore, onRetry, onMore }: NoteListProps) {
  if (loading) {
    return (
      <div data-testid="notes-loading" aria-busy="true" className="space-y-3">
        {[0, 1, 2].map((n) => (
          <Skeleton key={n} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive" data-testid="notes-error">
        <AlertTitle>Couldn't load your notes</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
        <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>
          Try again
        </Button>
      </Alert>
    );
  }

  if (notes.length === 0) {
    return (
      <p data-testid="notes-empty" className="text-muted-foreground">
        No notes yet. Add your first note above.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <ul className="space-y-3">
        {notes.map((note) => (
          <li key={note.id}>
            <Card className="gap-1 py-4">
              <CardContent>
                <h3 className="font-medium">{note.title}</h3>
                {note.body ? <p className="mt-1 text-sm whitespace-pre-wrap text-muted-foreground">{note.body}</p> : null}
                <time className="mt-2 block text-xs text-muted-foreground" dateTime={note.createdAt} title={new Date(note.createdAt).toLocaleString()}>
                  {formatCreated(note.createdAt)}
                </time>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
      {hasMore ? (
        <Button variant="outline" onClick={onMore} disabled={loadingMore}>
          {loadingMore ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : null}
          Show more notes
        </Button>
      ) : null}
    </div>
  );
}
