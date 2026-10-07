<script setup lang="ts">
import { site } from '~/data/site'

const copy = site.pages.contact
useSeoMeta({ title: copy.title, description: copy.seoDescription })
</script>

<template>
  <UContainer class="max-w-3xl py-8 sm:py-12">
    <UPage>
      <UPageHeader :title="copy.title" :description="copy.description" />
      <UPageBody class="space-y-4">
        <!-- A static site has no server to receive a form. Use a mailto link, or link to a booking page or a form service. -->
        <UButton :to="`mailto:${site.contactEmail}`" icon="i-lucide-mail" size="lg" data-testid="contact-email">
          {{ site.contactEmail }}
        </UButton>
        <p class="text-sm text-muted">
          {{ copy.note }}
        </p>
      </UPageBody>
    </UPage>
  </UContainer>
</template>
