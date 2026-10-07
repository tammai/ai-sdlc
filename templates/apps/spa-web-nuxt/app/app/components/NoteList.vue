<script setup lang="ts">
import type { Note } from '~/api/client'

defineProps<{
  notes: Note[]
  loading: boolean
  error: string | null
  hasMore?: boolean
  loadingMore?: boolean
}>()

defineEmits<{ retry: [], more: [] }>()
</script>

<template>
  <div class="space-y-3" aria-live="polite">
    <div v-if="loading" data-testid="notes-loading" class="space-y-3" aria-busy="true">
      <USkeleton v-for="n in 3" :key="n" class="h-20 w-full" />
    </div>

    <UAlert
      v-else-if="error"
      data-testid="notes-error"
      role="alert"
      color="error"
      variant="subtle"
      title="Couldn't load your notes"
      :description="error"
      :actions="[{ label: 'Try again', color: 'neutral', variant: 'outline', onClick: () => $emit('retry') }]"
    />

    <p v-else-if="notes.length === 0" data-testid="notes-empty" class="text-muted">
      No notes yet. Add your first note above.
    </p>

    <template v-else>
      <ul class="space-y-3">
        <li v-for="note in notes" :key="note.id">
          <UCard>
            <h3 class="font-medium">
              {{ note.title }}
            </h3>
            <p v-if="note.body" class="mt-1 text-sm whitespace-pre-wrap text-muted">
              {{ note.body }}
            </p>
            <time class="mt-2 block text-xs text-dimmed" :datetime="note.createdAt" :title="new Date(note.createdAt).toLocaleString()">
              {{ formatCreated(note.createdAt) }}
            </time>
          </UCard>
        </li>
      </ul>
      <UButton v-if="hasMore" color="neutral" variant="outline" :loading="loadingMore" @click="$emit('more')">
        Show more notes
      </UButton>
    </template>
  </div>
</template>
