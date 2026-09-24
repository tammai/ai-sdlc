<script setup lang="ts">
const { app, navigation } = useAppConfig()
</script>

<template>
  <UHeader :title="app.name" to="/">
    <UNavigationMenu :items="navigation" variant="link" />
    <template #right>
      <UColorModeButton />
    </template>
    <template #body>
      <UNavigationMenu :items="navigation" orientation="vertical" class="-mx-2.5" />
    </template>
  </UHeader>

  <UMain>
    <slot />
  </UMain>

  <UFooter>
    <template #left>
      <p class="text-sm text-muted">© {{ new Date().getFullYear() }} {{ app.name }}</p>
    </template>
  </UFooter>
</template>
