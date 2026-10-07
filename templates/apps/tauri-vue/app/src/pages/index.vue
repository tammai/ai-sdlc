<script setup lang="ts">
import NoteForm from '@/components/NoteForm.vue'
import NotesList from '@/components/NotesList.vue'
import { useNotes } from '@/composables/useNotes'

definePage({ meta: { title: 'Notes' } })

const { notes, status, error, load, create } = useNotes()
</script>

<template>
  <main class="mx-auto flex max-w-2xl flex-col gap-6 p-6">
    <h1 class="text-2xl font-semibold tracking-tight">
      __APP_TITLE__
    </h1>
    <NoteForm :on-create="create" />
    <section
      aria-labelledby="notes-heading"
      class="flex flex-col gap-3"
    >
      <h2
        id="notes-heading"
        class="text-lg font-medium"
      >
        Your notes
      </h2>
      <NotesList
        :status="status"
        :notes="notes"
        :error="error"
        @retry="load"
      />
    </section>
  </main>
</template>
