<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import { createNoteSchema } from '#shared/schemas/note'
import type { CreateNoteInput } from '#shared/schemas/note'

const emit = defineEmits<{ submit: [input: CreateNoteInput] }>()
const props = defineProps<{ submit: (input: CreateNoteInput) => Promise<void> }>()

const state = reactive({ title: '', body: '' })
const saving = ref(false)
const failure = ref('')

async function onSubmit(event: FormSubmitEvent<CreateNoteInput>) {
  saving.value = true
  failure.value = ''
  try {
    await props.submit(event.data)
    emit('submit', event.data)
    state.title = ''
    state.body = ''
  }
  catch (e) {
    failure.value = problemMessage(e)
  }
  finally {
    saving.value = false
  }
}
</script>

<template>
  <UForm :schema="createNoteSchema" :state="state" class="space-y-4" @submit="onSubmit">
    <UFormField label="Title" name="title" required>
      <UInput v-model="state.title" placeholder="Buy milk" class="w-full" />
    </UFormField>
    <UFormField label="Body" name="body">
      <UTextarea v-model="state.body" placeholder="Optional details" class="w-full" />
    </UFormField>
    <UAlert v-if="failure" color="error" variant="subtle" title="Could not save the note" :description="failure" />
    <UButton type="submit" :loading="saving">
      Add note
    </UButton>
  </UForm>
</template>
