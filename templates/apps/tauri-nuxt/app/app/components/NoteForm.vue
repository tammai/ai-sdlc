<script setup lang="ts">
import type { FormError } from '@nuxt/ui'
import { BODY_MAX, TITLE_MAX, validateNote } from '~/lib/validation'

const props = defineProps<{ onCreate: (input: { title: string, body: string }) => Promise<string | null> }>()

const state = reactive({ title: '', body: '' })
const failure = ref<string | null>(null)
const saving = ref(false)

function validate(s: typeof state): FormError[] {
  const invalid = validateNote(s.title, s.body)
  return invalid ? [invalid] : []
}

async function onSubmit() {
  saving.value = true
  failure.value = await props.onCreate({ title: state.title, body: state.body })
  saving.value = false
  if (!failure.value) {
    state.title = ''
    state.body = ''
  }
}
</script>

<template>
  <UCard>
    <template #header>
      <h2 class="font-medium">
        New note
      </h2>
    </template>
    <UForm
      :state="state"
      :validate="validate"
      class="flex flex-col gap-4"
      @submit="onSubmit"
    >
      <UFormField
        label="Title"
        name="title"
      >
        <UInput
          v-model="state.title"
          :maxlength="TITLE_MAX"
          placeholder="What do you want to remember?"
          size="xl"
          class="w-full"
        />
      </UFormField>
      <UFormField
        label="Body"
        name="body"
      >
        <UTextarea
          v-model="state.body"
          :maxlength="BODY_MAX"
          :rows="3"
          class="w-full"
        />
      </UFormField>
      <UAlert
        v-if="failure"
        color="error"
        variant="subtle"
        :description="failure"
        role="alert"
      />
      <UButton
        type="submit"
        size="xl"
        class="min-h-11 self-start px-6"
        :loading="saving"
      >
        Add note
      </UButton>
    </UForm>
  </UCard>
</template>
