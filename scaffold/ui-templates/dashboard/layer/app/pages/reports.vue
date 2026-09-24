<script setup lang="ts">
useHead({ title: 'Reported problems' })
</script>

<template>
  <UDashboardPanel id="reports">
    <template #header>
      <UDashboardNavbar title="Reported problems">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <ReportsList />
    </template>
  </UDashboardPanel>
</template>
