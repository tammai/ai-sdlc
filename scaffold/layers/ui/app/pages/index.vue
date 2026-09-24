<script setup lang="ts">
const { app } = useAppConfig()
useHead({ title: 'Home' })
</script>

<template>
  <UDashboardPanel id="home">
    <template #header>
      <UDashboardNavbar title="Home">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <UPageCard :title="app.name" description="This app is ready to build. Tell Claude what you want it to do, starting with /idea." icon="i-lucide-sparkles" />
    </template>
  </UDashboardPanel>
</template>
