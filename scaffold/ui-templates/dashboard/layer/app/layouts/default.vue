<script setup lang="ts">
const { app, navigation } = useAppConfig()
const open = ref(false)
// Close the sidebar on phones after picking a page.
const items = computed(() => navigation.map((item) => ({ ...item, onSelect: () => (open.value = false) })))
</script>

<template>
  <UDashboardGroup unit="rem">
    <UDashboardSidebar
      id="default"
      v-model:open="open"
      collapsible
      resizable
      class="bg-elevated/25"
      :ui="{ footer: 'lg:border-t lg:border-default' }"
    >
      <template #header="{ collapsed }">
        <NuxtLink to="/" class="flex items-center gap-2 truncate font-semibold">
          <UIcon name="i-lucide-layout-grid" class="size-5 shrink-0 text-primary" />
          <span v-if="!collapsed" class="truncate">{{ app.name }}</span>
        </NuxtLink>
      </template>

      <template #default="{ collapsed }">
        <UNavigationMenu :collapsed="collapsed" :items="items" orientation="vertical" tooltip />
      </template>

      <template #footer="{ collapsed }">
        <UserMenu :collapsed="collapsed" />
      </template>
    </UDashboardSidebar>

    <slot />
  </UDashboardGroup>
</template>
