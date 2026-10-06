<script setup lang="ts">
useHead({ title: '__APP_TITLE__' })

const { notes, status, error, load, create } = useNotes()
</script>

<template>
  <UApp>
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
  </UApp>
</template>
