<script setup lang="ts">
import type { Note } from '#shared/schemas/note'

defineProps<{
  notes: Note[]
  /** Fetch status from useFetch. */
  status: 'idle' | 'pending' | 'success' | 'error'
  error?: string
}>()

defineEmits<{ retry: [] }>()
</script>

<template>
  <div class="space-y-3">
    <template v-if="status === 'pending' && !notes.length">
      <USkeleton v-for="n in 3" :key="n" data-testid="note-skeleton" class="h-20 w-full" />
    </template>

    <UAlert
      v-else-if="status === 'error'"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      title="Could not load notes"
      :description="error"
      :actions="[{ label: 'Retry', color: 'error', variant: 'outline', onClick: () => $emit('retry') }]"
    />

    <UEmpty
      v-else-if="!notes.length"
      icon="i-lucide-notebook-pen"
      title="No notes yet"
      description="Create your first note with the form above."
    />

    <UCard v-for="note in notes" v-else :key="note.id" data-testid="note">
      <template #header>
        <h3 class="font-semibold">
          {{ note.title }}
        </h3>
      </template>
      <p v-if="note.body" class="whitespace-pre-line text-muted">
        {{ note.body }}
      </p>
      <template #footer>
        <time :datetime="note.createdAt" class="text-xs text-dimmed">{{ new Date(note.createdAt).toLocaleString() }}</time>
      </template>
    </UCard>
  </div>
</template>
