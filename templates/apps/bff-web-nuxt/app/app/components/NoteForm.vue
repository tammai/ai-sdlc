<script setup lang="ts">
import { z } from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'

// Mirrors NewNote in contracts/openapi.yaml; the BFF and the Go API validate again.
const schema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200, 'Max 200 characters'),
  body: z.string().max(10000, 'Max 10000 characters').optional()
})
type Schema = z.output<typeof schema>

const props = defineProps<{ creating: boolean, error: string | null }>()
const emit = defineEmits<{ create: [note: Schema] }>()

const state = reactive<Partial<Schema>>({ title: '', body: '' })

function onSubmit(event: FormSubmitEvent<Schema>) {
  emit('create', { title: event.data.title, ...(event.data.body ? { body: event.data.body } : {}) })
}

defineExpose({ reset: () => Object.assign(state, { title: '', body: '' }) })
</script>

<template>
  <UForm :schema="schema" :state="state" class="space-y-4" @submit="onSubmit">
    <UFormField label="Title" name="title" required>
      <UInput v-model="state.title" class="w-full" placeholder="Buy milk" />
    </UFormField>
    <UFormField label="Body" name="body">
      <UTextarea v-model="state.body" class="w-full" :rows="3" />
    </UFormField>
    <UAlert v-if="props.error" color="error" variant="subtle" title="Could not save note" :description="props.error" />
    <UButton type="submit" :loading="props.creating">Add note</UButton>
  </UForm>
</template>
