<script setup lang="ts">
// Words come from content/landing.yml. Nuxt Content's own fetch (useAsyncData + queryCollection)
// is the one exception to "all server data goes through app/queries".
const { data: page } = await useAsyncData('landing', () => queryCollection('landing').first())
if (!page.value) throw createError({ statusCode: 404, statusMessage: 'Page not found', fatal: true })

useSeoMeta({
  title: page.value.seo?.title || page.value.title,
  description: page.value.seo?.description || page.value.description,
})
</script>

<template>
  <div v-if="page">
    <UPageHero :title="page.title" :description="page.description" :links="page.hero.links">
      <template v-if="page.hero.headline" #headline>
        <UBadge :label="page.hero.headline" color="neutral" variant="soft" class="rounded-full" />
      </template>
    </UPageHero>

    <UPageSection id="features" :headline="page.features.headline" :title="page.features.title" :description="page.features.description">
      <UPageGrid>
        <UPageCard
          v-for="item in page.features.items"
          :key="item.title"
          :icon="item.icon"
          :title="item.title"
          :description="item.description"
        />
      </UPageGrid>
    </UPageSection>

    <UPageSection>
      <UPageCTA :title="page.cta.title" :description="page.cta.description" :links="page.cta.links" variant="subtle" />
    </UPageSection>
  </div>
</template>
