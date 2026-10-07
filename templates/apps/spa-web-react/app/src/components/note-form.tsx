import { LoaderCircle } from "lucide-react";
import { useState } from "react";
import { z } from "zod";
import type { NewNote } from "@/api/client";
import { Field } from "@/components/field";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { fieldProps } from "@/lib/field-props";
import { useZodForm } from "@/lib/use-zod-form";

// Mirrors NewNote in contracts/openapi.yaml; the API validates again.
const schema = z.object({
  title: z.string().trim().min(1, "Enter a title").max(200, "Use 200 characters or fewer"),
  body: z.string().max(10000, "Use 10,000 characters or fewer"),
});

interface NoteFormProps {
  creating: boolean;
  error: string | null;
  /** Resolves true when the note was saved (the form then clears itself; it never clears on error). */
  onCreate: (note: NewNote) => Promise<boolean>;
}

export function NoteForm({ creating, error, onCreate }: NoteFormProps) {
  const [values, setValues] = useState({ title: "", body: "" });
  const [saved, setSaved] = useState(false);
  const form = useZodForm(schema, "note");

  function change(next: Partial<typeof values>) {
    const merged = { ...values, ...next };
    setValues(merged);
    setSaved(false);
    form.revalidate(merged);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const data = form.validate(values);
    if (!data) return;
    const note: NewNote = data.body ? data : { title: data.title };
    if (await onCreate(note)) {
      setValues({ title: "", body: "" });
      setSaved(true);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <Field id="note-title" label="Title" error={form.errors.title}>
        <Input
          {...fieldProps("note-title", { error: form.errors.title })}
          value={values.title}
          onChange={(e) => change({ title: e.target.value })}
          placeholder="Buy milk"
        />
      </Field>
      <Field id="note-body" label="Body" error={form.errors.body}>
        <Textarea
          {...fieldProps("note-body", { error: form.errors.body })}
          value={values.body}
          onChange={(e) => change({ body: e.target.value })}
          rows={3}
        />
      </Field>
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Couldn't save the note</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={creating}>
          {creating ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : null}
          Add note
        </Button>
        <p role="status" className="text-sm text-muted-foreground">
          {saved ? "Note added" : ""}
        </p>
      </div>
    </form>
  );
}
