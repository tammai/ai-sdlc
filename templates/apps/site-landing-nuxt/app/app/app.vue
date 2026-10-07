<script setup lang="ts">
import { site } from '~/data/site'

useHead({ titleTemplate: (title) => (title ? `${title} · ${site.name}` : site.name) })
useSeoMeta({ description: site.description, ogSiteName: site.name, ogType: 'website' })
</script>

<template>
  <UApp>
    <SiteHeader />
    <UMain>
      <NuxtPage />
    </UMain>
    <SiteFooter />
  </UApp>
</template>
