<script setup lang="ts">
import { site } from '~/data/site'

const links = [...site.nav, ...site.legal]
</script>

<template>
  <UFooter>
    <template #left>
      <p class="text-sm text-muted">
        © {{ new Date().getFullYear() }} {{ site.name }}
      </p>
    </template>
    <nav aria-label="Footer" class="flex flex-wrap gap-x-4 gap-y-1 text-sm">
      <NuxtLink v-for="l in links" :key="l.to" :to="l.to" class="text-muted hover:text-default">
        {{ l.label }}
      </NuxtLink>
    </nav>
  </UFooter>
</template>
