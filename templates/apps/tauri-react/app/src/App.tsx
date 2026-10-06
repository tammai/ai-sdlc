import { NoteForm } from "@/components/note-form";
import { NotesList } from "@/components/notes-list";
import { useNotes } from "@/hooks/use-notes";

export default function App() {
  const { state, reload, create } = useNotes();

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold tracking-tight">__APP_TITLE__</h1>
      <NoteForm onCreate={create} />
      <section aria-labelledby="notes-heading" className="flex flex-col gap-3">
        <h2 id="notes-heading" className="text-lg font-medium">
          Your notes
        </h2>
        <NotesList state={state} onRetry={reload} />
      </section>
    </main>
  );
}
