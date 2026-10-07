import { useRef, useState, type FormEvent } from "react";
import { createNoteSchema } from "@shared/schemas/note";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useCreateNote } from "@/hooks/use-notes";
import { ApiError, messageOf } from "@/lib/api";

type Field = "title" | "body";

/** Field -> message, from the same Zod schema the API enforces (the API stays authoritative). */
function validate(title: string, body: string): Partial<Record<Field, string>> {
  const result = createNoteSchema.safeParse({ title, body });
  const errors: Partial<Record<Field, string>> = {};
  if (!result.success) for (const issue of result.error.issues) errors[issue.path[0] as Field] ??= issue.message;
  return errors;
}

export function NoteForm() {
  const create = useCreateNote();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [visited, setVisited] = useState<Partial<Record<Field, boolean>>>({});
  const [serverErrors, setServerErrors] = useState<Partial<Record<Field, string>>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [added, setAdded] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  // Errors appear after a field was left (or on submit) and re-validate live while the user fixes them.
  const local = validate(title, body);
  const errors: Partial<Record<Field, string>> = {
    title: (visited.title && local.title) || serverErrors.title,
    body: (visited.body && local.body) || serverErrors.body,
  };

  const edit = (field: Field, set: (v: string) => void) => (value: string) => {
    set(value);
    setAdded(false);
    setServerErrors((s) => ({ ...s, [field]: undefined }));
  };

  function submit(e: FormEvent) {
    e.preventDefault();
    setVisited({ title: true, body: true });
    setFailure(null);
    setAdded(false);
    if (local.title || local.body) {
      (local.title ? titleRef : bodyRef).current?.focus();
      return;
    }
    create.mutate(
      { title, body },
      {
        onSuccess: () => {
          setTitle("");
          setBody("");
          setVisited({});
          setServerErrors({});
          setAdded(true);
          titleRef.current?.focus();
        },
        onError: (error) => {
          if (error instanceof ApiError && Object.keys(error.fieldErrors).length > 0) {
            setServerErrors({ title: error.fieldErrors.title, body: error.fieldErrors.body });
            (error.fieldErrors.title ? titleRef : bodyRef).current?.focus();
          } else {
            setFailure(messageOf(error));
          }
        },
      },
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2 className="text-base font-medium">New note</h2>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-2">
            <Label htmlFor="note-title">Title</Label>
            <Input
              id="note-title"
              ref={titleRef}
              value={title}
              onChange={(e) => edit("title", setTitle)(e.target.value)}
              onBlur={() => setVisited((v) => ({ ...v, title: true }))}
              aria-required="true"
              aria-invalid={errors.title ? true : undefined}
              aria-describedby={errors.title ? "note-title-error" : undefined}
              autoComplete="off"
              className="h-11"
            />
            {errors.title && (
              <p id="note-title-error" className="text-sm text-destructive">
                {errors.title}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="note-body">Body</Label>
            <p id="note-body-hint" className="text-sm text-muted-foreground">
              Optional. Up to 2,000 characters.
            </p>
            <Textarea
              id="note-body"
              ref={bodyRef}
              value={body}
              onChange={(e) => edit("body", setBody)(e.target.value)}
              onBlur={() => setVisited((v) => ({ ...v, body: true }))}
              rows={3}
              aria-invalid={errors.body ? true : undefined}
              aria-describedby={errors.body ? "note-body-hint note-body-error" : "note-body-hint"}
            />
            {errors.body && (
              <p id="note-body-error" className="text-sm text-destructive">
                {errors.body}
              </p>
            )}
          </div>
          {failure && (
            <Alert variant="destructive">
              <AlertTitle>Couldn&apos;t add the note</AlertTitle>
              <AlertDescription>{failure} Try again — what you typed is kept.</AlertDescription>
            </Alert>
          )}
          <div className="flex items-center gap-4">
            <Button type="submit" disabled={create.isPending} className="h-11 px-6">
              {create.isPending ? "Adding note…" : "Add note"}
            </Button>
            <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
              {added ? "Note added." : ""}
            </p>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
