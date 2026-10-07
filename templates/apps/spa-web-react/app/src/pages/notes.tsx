import { useMemo } from "react";
import { NoteForm } from "@/components/note-form";
import { NoteList } from "@/components/note-list";
import { Card, CardContent } from "@/components/ui/card";
import { useTitle } from "@/lib/use-title";
import { useCreateNote, useNotes } from "@/queries/notes";

export function NotesPage() {
  useTitle("Notes");
  const notes = useNotes();
  const create = useCreateNote();
  const items = useMemo(() => notes.data?.pages.flatMap((p) => p.items) ?? [], [notes.data]);

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold text-balance">Your notes</h1>
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
        notes={items}
        loading={notes.isPending}
        error={notes.isError ? notes.error.message : null}
        hasMore={notes.hasNextPage}
        loadingMore={notes.isFetchingNextPage}
        onRetry={() => void notes.refetch()}
        onMore={() => void notes.fetchNextPage()}
      />
    </div>
  );
}
