<script setup lang="ts">
const { user, signOut } = useAuth()
const signingOut = ref(false)

async function onSignOut() {
  signingOut.value = true
  const r = await signOut()
  signingOut.value = false
  if (!r.ok) useToast().add({ title: r.message, color: 'error' })
}
</script>

<template>
  <div class="min-h-dvh">
    <header class="border-b border-default">
      <UContainer class="flex h-14 max-w-2xl items-center justify-between">
        <NuxtLink to="/" class="font-semibold">
          __APP_TITLE__
        </NuxtLink>
        <div v-if="user" class="flex items-center gap-3">
          <span class="hidden text-sm text-muted sm:inline">{{ user.email }}</span>
          <UButton variant="ghost" color="neutral" :loading="signingOut" @click="onSignOut">
            Sign out
          </UButton>
        </div>
      </UContainer>
    </header>
    <main>
      <UContainer class="max-w-2xl space-y-8 py-8">
        <slot />
      </UContainer>
    </main>
  </div>
</template>
