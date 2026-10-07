<script setup lang="ts">
import type { NuxtError } from '#app'

const props = defineProps<{ error: NuxtError }>()
const notFound = computed(() => props.error.statusCode === 404)
const retry = () => clearError({ redirect: '/' })
</script>

<template>
  <UApp>
    <main class="mx-auto flex min-h-dvh max-w-md flex-col items-start justify-center gap-4 px-4">
      <h1 class="text-2xl font-semibold text-balance">
        {{ notFound ? 'Page not found' : 'Something went wrong' }}
      </h1>
      <p class="text-muted">
        {{ notFound ? "This page doesn't exist or was moved." : (error.message || 'An unexpected error occurred.') }}
      </p>
      <UButton @click="retry">
        {{ notFound ? 'Go to notes' : 'Try again' }}
      </UButton>
    </main>
  </UApp>
</template>
