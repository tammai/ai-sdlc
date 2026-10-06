<script setup lang="ts">
import { CSRF_HEADERS, problemMessage } from '~/api/client'

// Dev stub: paste a JWT issued for the Go API. Replace with your real sign-in flow
// (nuxt-auth-utils OAuth handlers or your IdP) — keep the token server-side in session.secure.
const emit = defineEmits<{ done: [] }>()

const token = ref('')
const error = ref<string | null>(null)
const busy = ref(false)

async function submit() {
  busy.value = true
  error.value = null
  try {
    await $fetch('/api/auth/login', { method: 'POST', body: { token: token.value }, headers: CSRF_HEADERS })
    emit('done')
  } catch (e) {
    error.value = problemMessage((e as { data?: unknown }).data)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <form class="space-y-4" @submit.prevent="submit">
    <UFormField label="API token (dev sign-in)" required>
      <UInput v-model="token" class="w-full" type="password" autocomplete="off" />
    </UFormField>
    <UAlert v-if="error" color="error" variant="subtle" title="Sign-in failed" :description="error" />
    <UButton type="submit" :loading="busy" :disabled="!token">Sign in</UButton>
  </form>
</template>
