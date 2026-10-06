<script setup lang="ts">
import { CSRF_HEADERS } from '~/api/client'

const { loggedIn, fetch: refreshSession } = useUserSession()
const { notes, loading, error, refresh, create, creating, createError } = useNotes()
const form = useTemplateRef<{ reset: () => void }>('form')

async function onCreate(note: { title: string, body?: string }) {
  if (await create(note)) form.value?.reset()
}

async function signedIn() {
  await refreshSession()
  await refresh()
}

async function signOut() {
  await $fetch('/api/auth/logout', { method: 'POST', headers: CSRF_HEADERS })
  await refreshSession()
}
</script>

<template>
  <UContainer class="max-w-2xl py-10 space-y-8">
    <header class="flex items-center justify-between">
      <h1 class="text-2xl font-semibold">__APP_TITLE__</h1>
      <UButton v-if="loggedIn" variant="ghost" color="neutral" @click="signOut">Sign out</UButton>
    </header>

    <UCard v-if="!loggedIn">
      <LoginForm @done="signedIn" />
    </UCard>

    <template v-else>
      <UCard>
        <NoteForm ref="form" :creating="creating" :error="createError" @create="onCreate" />
      </UCard>
      <NoteList :notes="notes" :loading="loading" :error="error" @retry="refresh()" />
    </template>
  </UContainer>
</template>
