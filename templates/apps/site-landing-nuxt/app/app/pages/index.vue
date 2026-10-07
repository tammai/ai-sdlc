<script setup lang="ts">
import { site } from '~/data/site'

const copy = site.pages.home
// Nuxt UI's defaults leave about 160px above and below the hero and 128px around each section on desktop, which reads as sparse.
const hero = { container: 'py-16 sm:py-20 lg:py-28 gap-12 sm:gap-y-16' }
const section = { container: 'py-12 sm:py-16 lg:py-20' }
const cta = { container: 'px-6 py-10 sm:px-12 sm:py-14 lg:py-16' }
useSeoMeta({ title: site.tagline, ogTitle: site.name, ogDescription: site.description })
</script>

<template>
  <div>
    <UPageHero
      :ui="hero"
      :title="site.name"
      :description="site.tagline"
      :links="[
        { label: copy.primaryAction, to: '/contact', size: 'xl' },
        { label: copy.secondaryAction, to: '/about', color: 'neutral', variant: 'subtle', size: 'xl' }
      ]"
    />

    <UPageSection :ui="section" :title="copy.featuresTitle" :description="copy.featuresDescription" :features="site.features" />

    <UPageSection :ui="section" :title="copy.faqTitle" :description="copy.faqDescription">
      <UAccordion :items="site.faq" class="mx-auto max-w-2xl" data-testid="faq" />
    </UPageSection>

    <!-- UPageCTA is a bare rounded box: inside a container it matches the page width instead of touching the viewport edges.
         `subtle` fills it with the neutral ramp's elevated surface (a visible tint with a tinted ramp) plus a hairline ring. -->
    <UContainer class="pb-12 sm:pb-16 lg:pb-20">
      <UPageCTA variant="subtle" :ui="cta" :title="copy.ctaTitle" :description="copy.ctaDescription" :links="[{ label: copy.ctaAction, to: '/contact' }]" />
    </UContainer>
  </div>
</template>
