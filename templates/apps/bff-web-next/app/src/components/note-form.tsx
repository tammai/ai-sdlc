'use client'

import { LoaderCircle } from 'lucide-react'
import { useState } from 'react'
import { z } from 'zod'
import type { NewNote } from '@/api/client'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

// Mirrors NewNote in contracts/openapi.yaml; the BFF and the Go API validate again.
const schema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200, 'Max 200 characters'),
  body: z.string().max(10000, 'Max 10000 characters')
})

interface NoteFormProps {
  creating: boolean
  error: string | null
  /** Resolves true when the note was saved (the form then clears itself). */
  onCreate: (note: NewNote) => Promise<boolean>
}

export function NoteForm({ creating, error, onCreate }: NoteFormProps) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [issues, setIssues] = useState<Partial<Record<'title' | 'body', string>>>({})

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    const parsed = schema.safeParse({ title, body })
    if (!parsed.success) {
      const next: typeof issues = {}
      for (const issue of parsed.error.issues) next[issue.path[0] as 'title' | 'body'] ??= issue.message
      setIssues(next)
      return
    }
    setIssues({})
    const note: NewNote = parsed.data.body ? parsed.data : { title: parsed.data.title }
    if (await onCreate(note)) {
      setTitle('')
      setBody('')
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <div className="space-y-2">
        <Label htmlFor="note-title">Title</Label>
        <Input id="note-title" value={title} onChange={(e) => setTitle(e.target.value)} aria-invalid={Boolean(issues.title)} placeholder="Buy milk" />
        {issues.title ? <p className="text-sm text-destructive">{issues.title}</p> : null}
      </div>
      <div className="space-y-2">
        <Label htmlFor="note-body">Body</Label>
        <Textarea id="note-body" value={body} onChange={(e) => setBody(e.target.value)} aria-invalid={Boolean(issues.body)} rows={3} />
        {issues.body ? <p className="text-sm text-destructive">{issues.body}</p> : null}
      </div>
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Could not save note</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <Button type="submit" disabled={creating}>
        {creating ? <LoaderCircle className="animate-spin" /> : null}
        Add note
      </Button>
    </form>
  )
}
