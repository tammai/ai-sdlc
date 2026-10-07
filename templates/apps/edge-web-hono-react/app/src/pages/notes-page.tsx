import { NoteForm } from "@/components/note-form";
import { NotesList } from "@/components/notes-list";

export default function NotesPage() {
  return (
    <div className="flex flex-col gap-6">
      <NoteForm />
      <section aria-labelledby="notes-heading" className="flex flex-col gap-3">
        <h2 id="notes-heading" className="text-lg font-medium">
          Your notes
        </h2>
        <NotesList />
      </section>
    </div>
  );
}
