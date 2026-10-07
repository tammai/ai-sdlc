<script setup lang="ts">
import type { NuxtError } from '#app'

const props = defineProps<{ error: NuxtError }>()
const notFound = computed(() => props.error.statusCode === 404)

useSeoMeta({ title: notFound.value ? 'Page not found' : 'Something went wrong', robots: 'noindex' })
</script>

<template>
  <UApp>
    <UMain>
      <UContainer class="flex min-h-[60dvh] flex-col items-start justify-center gap-4">
        <p class="text-sm font-medium text-muted">
          {{ error.statusCode }}
        </p>
        <h1 class="text-3xl font-semibold" data-testid="error-title">
          {{ notFound ? 'Page not found' : 'Something went wrong' }}
        </h1>
        <p class="text-muted">
          {{ notFound ? 'The page you are looking for does not exist or has moved.' : 'Try again in a moment.' }}
        </p>
        <UButton to="/" icon="i-lucide-arrow-left">
          Back to the home page
        </UButton>
      </UContainer>
    </UMain>
  </UApp>
</template>
