import { useState, type FormEvent } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { BODY_MAX, TITLE_MAX, validateNote } from "@/lib/validation";

interface Props {
  onCreate: (input: { title: string; body: string }) => Promise<string | null>;
}

export function NoteForm({ onCreate }: Props) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const invalid = validateNote(title, body);
    if (invalid) return setError(invalid);
    setSaving(true);
    const failure = await onCreate({ title, body });
    setSaving(false);
    setError(failure);
    if (!failure) {
      setTitle("");
      setBody("");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>New note</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-2">
            <Label htmlFor="note-title">Title</Label>
            <Input
              id="note-title"
              value={title}
              maxLength={TITLE_MAX}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What do you want to remember?"
              aria-invalid={error !== null}
              className="h-11"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="note-body">Body</Label>
            <Textarea id="note-body" value={body} maxLength={BODY_MAX} onChange={(e) => setBody(e.target.value)} rows={3} />
          </div>
          {error && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Button type="submit" disabled={saving} className="h-11 self-start px-6">
            {saving ? "Saving…" : "Add note"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
