<script setup lang="ts">
import { z } from 'zod'
import type { FormErrorEvent, FormSubmitEvent } from '@nuxt/ui'

// Mirrors NewNote in contracts/openapi.yaml; the API validates again.
const schema = z.object({
  title: z.string().trim().min(1, 'Enter a title').max(200, 'Use 200 characters or fewer'),
  body: z.string().max(10000, 'Use 10,000 characters or fewer').optional()
})
type Schema = z.output<typeof schema>

const props = defineProps<{ creating: boolean, error: string | null }>()
// The parent resolves true when saved; the form then clears itself (it never clears on error).
const emit = defineEmits<{ create: [note: { title: string, body?: string }, done: (saved: boolean) => void] }>()

const state = reactive({ title: '', body: '' })

function focusFirstInvalid(event: FormErrorEvent) {
  const id = event.errors[0]?.id
  if (id) document.getElementById(id)?.focus()
}

function onSubmit(event: FormSubmitEvent<Schema>) {
  const { title, body } = event.data
  emit('create', { title, ...(body ? { body } : {}) }, (saved) => {
    if (saved) Object.assign(state, { title: '', body: '' })
  })
}
</script>

<template>
  <UForm :schema="schema" :state="state" class="space-y-4" @submit="onSubmit" @error="focusFirstInvalid">
    <UFormField label="Title" name="title" required>
      <UInput v-model="state.title" class="w-full" placeholder="Buy milk" />
    </UFormField>
    <UFormField label="Body" name="body">
      <UTextarea v-model="state.body" class="w-full" :rows="3" />
    </UFormField>
    <UAlert v-if="props.error" role="alert" color="error" variant="subtle" title="Couldn't save the note" :description="props.error" />
    <UButton type="submit" :loading="props.creating">
      Add note
    </UButton>
  </UForm>
</template>
