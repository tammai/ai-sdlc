<script setup lang="ts">
// Shared by web and desktop: an empty state with one next action.
// Components in this layer are auto-registered in every app that extends it.
defineProps<{
  title: string
  description?: string
  actionLabel?: string
}>()

defineEmits<{ action: [] }>()
</script>

<template>
  <div class="flex flex-col items-center gap-3 py-12 text-center">
    <p class="text-base font-medium text-highlighted">{{ title }}</p>
    <p v-if="description" class="max-w-prose text-sm text-muted">{{ description }}</p>
    <UButton v-if="actionLabel" @click="$emit('action')">{{ actionLabel }}</UButton>
  </div>
</template>
