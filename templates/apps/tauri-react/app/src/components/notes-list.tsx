import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { NotesState } from "@/hooks/use-notes";

interface Props {
  state: NotesState;
  onRetry: () => void;
}

export function NotesList({ state, onRetry }: Props) {
  if (state.status === "loading") {
    return (
      <div className="flex flex-col gap-3" role="status" aria-label="Loading notes">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <Alert variant="destructive" role="alert">
        <AlertTitle>Could not load notes</AlertTitle>
        <AlertDescription>
          <p>{state.message}</p>
          <Button variant="outline" onClick={onRetry} className="mt-2 h-11">
            Try again
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (state.notes.length === 0) {
    return (
      <p className="text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm">
        No notes yet. Add your first note above.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {state.notes.map((note) => (
        <li key={note.id}>
          <Card>
            <CardHeader>
              <CardTitle>{note.title}</CardTitle>
              <CardDescription>
                <time dateTime={note.createdAt}>{new Date(note.createdAt).toLocaleString()}</time>
              </CardDescription>
            </CardHeader>
            {note.body && <CardContent className="text-sm whitespace-pre-wrap">{note.body}</CardContent>}
          </Card>
        </li>
      ))}
    </ul>
  );
}
