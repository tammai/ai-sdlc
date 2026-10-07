import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAfterDelay } from "@/hooks/use-after-delay";
import { useNotes } from "@/hooks/use-notes";
import { messageOf } from "@/lib/api";

export function NotesList() {
  const { data: notes, error, isPending, refetch, isFetching } = useNotes();
  const showSkeleton = useAfterDelay(isPending);

  if (isPending) {
    return (
      <div role="status" aria-busy="true" className="flex flex-col gap-3">
        <span className="sr-only">Loading notes…</span>
        {showSkeleton && (
          <>
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </>
        )}
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Couldn&apos;t load your notes</AlertTitle>
        <AlertDescription>
          <p>{messageOf(error)} Check your connection and try again.</p>
          <Button variant="outline" onClick={() => void refetch()} disabled={isFetching} className="mt-2 h-11 px-4">
            {isFetching ? "Trying again…" : "Try again"}
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (notes.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        No notes yet. Add your first note above and it will show up here.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {notes.map((note) => (
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
