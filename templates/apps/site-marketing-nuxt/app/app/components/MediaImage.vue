<script setup lang="ts">
import { mediaUrl } from '~/utils/media'

// An image stored in R2, by key. `alt` is required: pass an empty string only for a purely decorative image.
// Give width and height so the browser reserves the space (no layout shift).
const props = defineProps<{
  src: string
  alt: string
  width?: number
  height?: number
  priority?: boolean
}>()

const url = computed(() => mediaUrl(props.src))
</script>

<template>
  <img
    :src="url"
    :alt="alt"
    :width="width"
    :height="height"
    :loading="priority ? 'eager' : 'lazy'"
    :fetchpriority="priority ? 'high' : 'auto'"
    decoding="async"
  >
</template>
