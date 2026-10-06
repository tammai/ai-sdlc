'use client'

import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { CSRF_HEADERS, problemMessage } from '@/api/client'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

// Dev stub: paste a JWT issued for the Go API. Replace with your real sign-in flow
// (your IdP / OAuth) — keep the token server-side in the sealed session cookie.
export function LoginForm({ onDone }: { onDone: () => void }) {
  const [token, setToken] = useState('')
  const login = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { ...CSRF_HEADERS, 'content-type': 'application/json' },
        body: JSON.stringify({ token })
      })
      if (!res.ok) throw new Error(problemMessage(await res.json().catch(() => undefined)))
    },
    onSuccess: onDone
  })

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        login.mutate()
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="login-token">API token (dev sign-in)</Label>
        <Input id="login-token" type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} />
      </div>
      {login.error ? (
        <Alert variant="destructive">
          <AlertTitle>Sign-in failed</AlertTitle>
          <AlertDescription>{login.error.message}</AlertDescription>
        </Alert>
      ) : null}
      <Button type="submit" disabled={!token || login.isPending}>
        Sign in
      </Button>
    </form>
  )
}
