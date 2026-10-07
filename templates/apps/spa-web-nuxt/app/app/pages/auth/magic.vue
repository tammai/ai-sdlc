<script setup lang="ts">
// Landing page for the emailed link: /auth/magic?token=…  The token is posted to the API, never kept in the URL bar.
definePageMeta({ layout: 'auth', public: true })
useHead({ title: 'Signing you in', meta: [{ name: 'referrer', content: 'no-referrer' }] })

const route = useRoute()
const { verifyMagicLink } = useAuth()
const error = ref<string | null>(null)

onMounted(async () => {
  const token = typeof route.query.token === 'string' ? route.query.token : ''
  history.replaceState(history.state, '', route.path)
  if (token.length < 16) {
    error.value = 'This sign-in link is incomplete. Request a new one.'
    return
  }
  const r = await verifyMagicLink(token)
  if (r.ok) await navigateTo(safeRedirect(route.query.redirect), { replace: true })
  else error.value = r.message
})
</script>

<template>
  <div class="space-y-6">
    <template v-if="error">
      <h1 class="text-2xl font-semibold text-balance">
        Couldn't sign you in
      </h1>
      <UAlert role="alert" color="error" variant="subtle" title="This link didn't work" :description="error" />
      <UButton to="/login" block>
        Request a new link
      </UButton>
    </template>
    <template v-else>
      <h1 class="text-2xl font-semibold text-balance">
        Signing you in
      </h1>
      <p role="status" class="flex items-center gap-2 text-muted" data-testid="magic-verifying">
        <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin" aria-hidden="true" />
        Checking your link…
      </p>
    </template>
  </div>
</template>
