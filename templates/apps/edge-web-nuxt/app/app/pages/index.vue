<script setup lang="ts">
useHead({ title: '__APP_TITLE__' })

const { notes, status, error, refresh, create } = useNotes()
</script>

<template>
  <UContainer class="max-w-2xl space-y-8 py-12">
    <header>
      <h1 class="text-2xl font-bold">
        __APP_TITLE__
      </h1>
      <p class="text-muted">
        Notes stored in Cloudflare D1.
      </p>
    </header>

    <NoteForm :submit="create" />
    <NotesList :notes="notes" :status="status" :error="error ? problemMessage(error) : undefined" @retry="refresh()" />
  </UContainer>
</template>
