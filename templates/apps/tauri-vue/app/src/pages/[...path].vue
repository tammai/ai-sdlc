<script setup lang="ts">
import UButton from '@nuxt/ui/components/Button.vue'

definePage({ meta: { title: 'Not found' } })
</script>

<template>
  <main class="mx-auto flex max-w-2xl flex-col items-start gap-4 p-6">
    <h1 class="text-2xl font-semibold tracking-tight">
      Page not found
    </h1>
    <p class="text-sm text-muted">
      There is nothing at this address.
    </p>
    <UButton
      :to="{ name: '/' }"
      size="xl"
      class="min-h-11 px-6"
    >
      Back to notes
    </UButton>
  </main>
</template>
