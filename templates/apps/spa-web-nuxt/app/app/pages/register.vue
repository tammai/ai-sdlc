<script setup lang="ts">
import { z } from 'zod'
import type { FormErrorEvent, FormSubmitEvent } from '@nuxt/ui'

definePageMeta({ layout: 'auth', public: true, guestOnly: true })
useHead({ title: 'Create account' })

const route = useRoute()
const redirect = computed(() => safeRedirect(route.query.redirect))
const { register } = useAuth()
const { providers, status, load } = useAuthProviders()
onMounted(load)

// Mirrors RegisterRequest in contracts/openapi.yaml; the API validates again.
const schema = z.object({
  name: z.string().trim().max(200, 'Use 200 characters or fewer').optional(),
  email: z.email('Enter a valid email address, like name@example.com'),
  password: z.string().min(12, 'Use at least 12 characters').max(1024, 'Use 1024 characters or fewer')
})
const state = reactive({ name: '', email: '', password: '' })
const error = ref<string | null>(null)
const busy = ref(false)

function focusFirstInvalid(event: FormErrorEvent) {
  const id = event.errors[0]?.id
  if (id) document.getElementById(id)?.focus()
}

async function onSubmit(event: FormSubmitEvent<z.output<typeof schema>>) {
  busy.value = true
  error.value = null
  const { name, email, password } = event.data
  const r = await register({ email, password, ...(name ? { name } : {}) })
  busy.value = false
  if (r.ok) await navigateTo(redirect.value)
  else error.value = r.message
}
</script>

<template>
  <div class="space-y-6">
    <h1 class="text-2xl font-semibold text-balance">
      Create your account
    </h1>

    <div v-if="status === 'idle' || status === 'loading'" data-testid="providers-loading" class="space-y-3" aria-busy="true">
      <USkeleton class="h-9 w-full" />
      <USkeleton class="h-9 w-full" />
      <USkeleton class="h-9 w-full" />
    </div>

    <UAlert
      v-else-if="status === 'error' || !providers"
      data-testid="providers-error"
      role="alert"
      color="error"
      variant="subtle"
      title="Couldn't load the sign-up options"
      description="The server didn't respond. Check your connection, then try again."
      :actions="[{ label: 'Try again', color: 'neutral', variant: 'outline', onClick: load }]"
    />

    <p v-else-if="!providers.registration" data-testid="registration-closed" class="text-muted">
      Registration is closed. Ask an administrator for an account.
    </p>

    <UForm v-else :schema="schema" :state="state" class="space-y-4" @submit="onSubmit" @error="focusFirstInvalid">
      <UFormField label="Name" name="name" description="Optional.">
        <UInput v-model="state.name" autocomplete="name" class="w-full" />
      </UFormField>
      <UFormField label="Email" name="email" required>
        <UInput v-model="state.email" type="email" autocomplete="email" class="w-full" />
      </UFormField>
      <UFormField label="Password" name="password" description="Use at least 12 characters." required>
        <UInput v-model="state.password" type="password" autocomplete="new-password" class="w-full" />
      </UFormField>
      <UAlert v-if="error" role="alert" color="error" variant="subtle" title="Couldn't create your account" :description="error" />
      <UButton type="submit" block :loading="busy">
        Create account
      </UButton>
    </UForm>

    <p class="text-sm text-muted">
      Already have an account?
      <ULink :to="{ path: '/login', query: route.query }" class="font-medium text-primary">
        Sign in
      </ULink>
    </p>
  </div>
</template>
