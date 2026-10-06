'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { createNote } from '@/lib/api'
import { createNoteSchema } from '@/shared/schemas/note'

export function NoteForm() {
  const queryClient = useQueryClient()
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [fieldError, setFieldError] = useState<string>()

  const mutation = useMutation({
    mutationFn: createNote,
    onSuccess: async () => {
      setTitle('')
      setBody('')
      await queryClient.invalidateQueries({ queryKey: ['notes'] })
    }
  })

  function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    const parsed = createNoteSchema.safeParse({ title, body })
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message)
      return
    }
    setFieldError(undefined)
    mutation.mutate(parsed.data)
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <div className="space-y-2">
        <Label htmlFor="title">Title</Label>
        <Input id="title" value={title} onChange={e => setTitle(e.target.value)} placeholder="Buy milk" aria-invalid={!!fieldError} />
        {fieldError && <p role="alert" className="text-sm text-destructive">{fieldError}</p>}
      </div>
      <div className="space-y-2">
        <Label htmlFor="body">Body</Label>
        <Textarea id="body" value={body} onChange={e => setBody(e.target.value)} placeholder="Optional details" />
      </div>
      {mutation.error && (
        <Alert variant="destructive">
          <AlertTitle>Could not save the note</AlertTitle>
          <AlertDescription>{mutation.error.message}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? 'Saving…' : 'Add note'}</Button>
    </form>
  )
}
