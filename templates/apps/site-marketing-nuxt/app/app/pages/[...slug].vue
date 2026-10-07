<script setup lang="ts">
// Any Markdown file at the top level of content/ (about.md, features.md, pricing.md, privacy.md) renders at /<name>.
const route = useRoute()

const { data: page } = await useAsyncData(`page-${route.path}`, () => queryCollection('pages').path(route.path).first())
if (!page.value) throw createError({ statusCode: 404, statusMessage: 'Page not found', fatal: true })

useSeoMeta({ title: page.value.title, description: page.value.description })
</script>

<template>
  <UContainer v-if="page" class="max-w-3xl py-8 sm:py-12">
    <UPage>
      <UPageHeader :title="page.title" :description="page.description" />
      <UPageBody>
        <ContentRenderer :value="page" />
      </UPageBody>
    </UPage>
  </UContainer>
</template>
