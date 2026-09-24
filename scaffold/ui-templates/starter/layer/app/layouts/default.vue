<script setup lang="ts">
const { app, navigation } = useAppConfig()
</script>

<template>
  <UHeader :title="app.name" to="/">
    <UNavigationMenu :items="navigation" />
    <template #right>
      <UColorModeButton />
    </template>
    <template #body>
      <UNavigationMenu :items="navigation" orientation="vertical" class="-mx-2.5" />
    </template>
  </UHeader>

  <UMain>
    <UContainer class="py-8">
      <slot />
    </UContainer>
  </UMain>
</template>
