<script setup lang="ts">
import { site } from '~/data/site'

const items = site.nav.map((l) => ({ label: l.label, to: l.to }))
</script>

<template>
  <UHeader :title="site.name" to="/">
    <UNavigationMenu :items="items" data-testid="site-nav" />
    <template #right>
      <UColorModeButton />
    </template>
    <template #body>
      <UNavigationMenu :items="items" orientation="vertical" class="-mx-2.5" />
    </template>
  </UHeader>
</template>
