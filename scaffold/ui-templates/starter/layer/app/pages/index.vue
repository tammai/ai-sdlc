<script setup lang="ts">
const { app } = useAppConfig()
useHead({ title: 'Home' })
</script>

<template>
  <UPageHeader :title="app.name" description="This app is ready to build. Tell Claude what you want it to do, starting with /idea." />
</template>
