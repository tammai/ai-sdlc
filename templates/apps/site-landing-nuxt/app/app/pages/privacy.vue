<script setup lang="ts">
import { site } from '~/data/site'

const copy = site.pages.privacy
useSeoMeta({ title: copy.title, description: copy.description })
</script>

<template>
  <UContainer class="max-w-3xl py-8 sm:py-12">
    <UPage>
      <UPageHeader :title="copy.title" :description="copy.description" />
      <UPageBody class="space-y-4 text-lg leading-8">
        <p v-for="p in copy.paragraphs" :key="p">
          {{ p }}
        </p>
        <p>
          {{ copy.dataQuestions }} <a :href="`mailto:${site.contactEmail}`" class="underline">{{ site.contactEmail }}</a>.
        </p>
      </UPageBody>
    </UPage>
  </UContainer>
</template>
