<script setup lang="ts">
useHead({ title: 'Notes' })

const { items, status, error, nextCursor, loadingMore, creating, createError, load, loadMore, create } = useNotes()
onMounted(load)

async function onCreate(note: { title: string, body?: string }, done: (saved: boolean) => void) {
  done(await create(note))
}
</script>

<template>
  <div class="space-y-8">
    <h1 class="text-2xl font-semibold text-balance">
      Your notes
    </h1>
    <UCard>
      <NoteForm :creating="creating" :error="createError" @create="onCreate" />
    </UCard>
    <NoteList
      :notes="items"
      :loading="status === 'idle' || status === 'loading'"
      :error="status === 'error' ? error : null"
      :has-more="!!nextCursor"
      :loading-more="loadingMore"
      @retry="load"
      @more="loadMore"
    />
  </div>
</template>
