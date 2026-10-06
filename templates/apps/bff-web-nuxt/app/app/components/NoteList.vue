<script setup lang="ts">
import type { Note } from '~/api/client'

defineProps<{
  notes: Note[]
  loading: boolean
  error: string | null
}>()

defineEmits<{ retry: [] }>()
</script>

<template>
  <div class="space-y-3">
    <div v-if="loading" data-testid="notes-loading" class="space-y-3">
      <USkeleton v-for="n in 3" :key="n" class="h-16 w-full" />
    </div>

    <UAlert
      v-else-if="error"
      data-testid="notes-error"
      color="error"
      variant="subtle"
      title="Could not load notes"
      :description="error"
      :actions="[{ label: 'Retry', onClick: () => $emit('retry') }]"
    />

    <p v-else-if="notes.length === 0" data-testid="notes-empty" class="text-muted">
      No notes yet. Create your first one above.
    </p>

    <ul v-else class="space-y-3">
      <li v-for="note in notes" :key="note.id">
        <UCard>
          <h3 class="font-medium">{{ note.title }}</h3>
          <p v-if="note.body" class="mt-1 whitespace-pre-wrap text-sm text-muted">{{ note.body }}</p>
          <p class="mt-2 text-xs text-dimmed">{{ new Date(note.createdAt).toLocaleString() }}</p>
        </UCard>
      </li>
    </ul>
  </div>
</template>
