<script setup lang="ts">
import UAlert from '@nuxt/ui/components/Alert.vue'
import UCard from '@nuxt/ui/components/Card.vue'
import USkeleton from '@nuxt/ui/components/Skeleton.vue'
import type { Note } from '@/lib/tauri'

defineProps<{
  status: 'loading' | 'ready' | 'error'
  notes: Note[]
  error: string | null
}>()

defineEmits<{ retry: [] }>()
</script>

<template>
  <div
    v-if="status === 'loading'"
    class="flex flex-col gap-3"
    role="status"
    aria-label="Loading notes"
  >
    <USkeleton class="h-20 w-full" />
    <USkeleton class="h-20 w-full" />
  </div>

  <UAlert
    v-else-if="status === 'error'"
    color="error"
    variant="subtle"
    title="Could not load notes"
    :description="error ?? undefined"
    :actions="[{ label: 'Try again', color: 'neutral', variant: 'outline', size: 'xl', onClick: () => $emit('retry') }]"
    role="alert"
  />

  <p
    v-else-if="notes.length === 0"
    class="rounded-lg border border-dashed border-default p-8 text-center text-sm text-muted"
  >
    No notes yet. Add your first note above.
  </p>

  <ul
    v-else
    class="flex flex-col gap-3"
  >
    <li
      v-for="note in notes"
      :key="note.id"
    >
      <UCard>
        <h3 class="font-medium">
          {{ note.title }}
        </h3>
        <time
          :datetime="note.createdAt"
          class="text-xs text-muted"
        >{{ new Date(note.createdAt).toLocaleString() }}</time>
        <p
          v-if="note.body"
          class="mt-2 whitespace-pre-wrap text-sm"
        >
          {{ note.body }}
        </p>
      </UCard>
    </li>
  </ul>
</template>
