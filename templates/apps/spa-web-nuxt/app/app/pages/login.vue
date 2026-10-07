<script setup lang="ts">
import { z } from 'zod'
import type { FormErrorEvent, FormSubmitEvent } from '@nuxt/ui'

definePageMeta({ layout: 'auth', public: true, guestOnly: true })
useHead({ title: 'Sign in' })

const route = useRoute()
const redirect = computed(() => safeRedirect(route.query.redirect))
const { signIn, requestMagicLink } = useAuth()
const { providers, status, load } = useAuthProviders()
onMounted(load)

// The API redirects here with ?error=<code> when an OIDC sign-in fails.
const providerError = computed(() => {
  const code = Array.isArray(route.query.error) ? route.query.error[0] : route.query.error
  if (!code) return null
  return code === 'access_denied'
    ? 'Access was denied at the provider. Try again, or use another sign-in method.'
    : 'Something went wrong while signing in with your provider. Try again, or use another sign-in method.'
})

// Where the OIDC flow lands afterwards; the API validates it is an app-relative path.
const oidcHref = (id: string) => `/api/v1/auth/oidc/${encodeURIComponent(id)}/start?redirect=${encodeURIComponent(redirect.value)}`

const hasOtherMethods = computed(() => !!providers.value && (providers.value.magicLink || providers.value.oidc.length > 0))

function focusFirstInvalid(event: FormErrorEvent) {
  const id = event.errors[0]?.id
  if (id) document.getElementById(id)?.focus()
}

// Email + password
const passwordSchema = z.object({
  email: z.email('Enter a valid email address, like name@example.com'),
  password: z.string().min(1, 'Enter your password')
})
const credentials = reactive({ email: '', password: '' })
const signInError = ref<string | null>(null)
const signingIn = ref(false)

async function onSignIn(event: FormSubmitEvent<z.output<typeof passwordSchema>>) {
  signingIn.value = true
  signInError.value = null
  const r = await signIn(event.data.email, event.data.password)
  signingIn.value = false
  if (r.ok) await navigateTo(redirect.value)
  else signInError.value = r.message
}

// Magic link
const linkSchema = z.object({ email: z.email('Enter a valid email address, like name@example.com') })
const link = reactive({ email: '' })
const linkError = ref<string | null>(null)
const linkSentTo = ref<string | null>(null)
const sendingLink = ref(false)

async function onSendLink(event: FormSubmitEvent<z.output<typeof linkSchema>>) {
  sendingLink.value = true
  linkError.value = null
  const r = await requestMagicLink(event.data.email)
  sendingLink.value = false
  if (r.ok) linkSentTo.value = event.data.email
  else linkError.value = r.message
}
</script>

<template>
  <div class="space-y-6">
    <h1 class="text-2xl font-semibold text-balance">
      Sign in
    </h1>

    <UAlert
      v-if="providerError"
      data-testid="provider-error"
      role="alert"
      color="error"
      variant="subtle"
      title="Couldn't sign you in"
      :description="providerError"
    />

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
      title="Couldn't load the sign-in options"
      description="The server didn't respond. Check your connection, then try again."
      :actions="[{ label: 'Try again', color: 'neutral', variant: 'outline', onClick: load }]"
    />

    <template v-else>
      <UForm
        v-if="providers.password"
        :schema="passwordSchema"
        :state="credentials"
        class="space-y-4"
        @submit="onSignIn"
        @error="focusFirstInvalid"
      >
        <UFormField label="Email" name="email" required>
          <UInput v-model="credentials.email" type="email" autocomplete="email" class="w-full" />
        </UFormField>
        <UFormField label="Password" name="password" required>
          <UInput v-model="credentials.password" type="password" autocomplete="current-password" class="w-full" />
        </UFormField>
        <UAlert v-if="signInError" role="alert" color="error" variant="subtle" title="Couldn't sign you in" :description="signInError" />
        <UButton type="submit" block :loading="signingIn">
          Sign in
        </UButton>
      </UForm>

      <USeparator v-if="providers.password && hasOtherMethods" label="or" />

      <div v-if="providers.oidc.length" class="space-y-3">
        <UButton
          v-for="p in providers.oidc"
          :key="p.id"
          :to="oidcHref(p.id)"
          external
          block
          color="neutral"
          variant="outline"
          :data-testid="`oidc-${p.id}`"
        >
          Continue with {{ p.name }}
        </UButton>
      </div>

      <div v-if="providers.magicLink">
        <UAlert
          v-if="linkSentTo"
          data-testid="magic-sent"
          role="status"
          color="success"
          variant="subtle"
          title="Check your inbox"
          :description="`If an account exists for ${linkSentTo}, a sign-in link is on its way. It works once and expires soon.`"
        />
        <UForm v-else :schema="linkSchema" :state="link" class="space-y-4" @submit="onSendLink" @error="focusFirstInvalid">
          <UFormField label="Email me a sign-in link" description="No password needed." name="email" required>
            <UInput v-model="link.email" type="email" autocomplete="email" class="w-full" />
          </UFormField>
          <UAlert v-if="linkError" role="alert" color="error" variant="subtle" title="Couldn't send the link" :description="linkError" />
          <UButton type="submit" block color="neutral" variant="outline" :loading="sendingLink">
            Send sign-in link
          </UButton>
        </UForm>
      </div>

      <p v-if="!providers.password && !hasOtherMethods" data-testid="no-methods" class="text-muted">
        No sign-in methods are enabled for this app. Ask an administrator to turn one on.
      </p>

      <p v-if="providers.registration" class="text-sm text-muted">
        New here?
        <ULink :to="{ path: '/register', query: route.query }" class="font-medium text-primary">
          Create an account
        </ULink>
      </p>
    </template>
  </div>
</template>
