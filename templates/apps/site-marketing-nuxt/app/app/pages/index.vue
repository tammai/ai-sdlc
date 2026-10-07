<script setup lang="ts">
import { site } from '~/data/site'
import { mediaUrl } from '~/utils/media'

useSeoMeta({ title: site.tagline, ogTitle: site.name, ogDescription: site.description })

const copy = site.home
// Nuxt UI's defaults leave about 160px above and below the hero and 128px around each section on desktop, which reads as sparse.
const hero = { container: 'py-16 sm:py-20 lg:py-28 gap-12 sm:gap-y-16' }
const section = { container: 'py-12 sm:py-16 lg:py-20' }
const cta = { container: 'px-6 py-10 sm:px-12 sm:py-14 lg:py-16' }

const { data: posts } = await useAsyncData('home-latest-posts', () =>
  // Drafts (content/blog/drafts, present in dev only) never show on the home page.
  queryCollection('blog').where('path', 'NOT LIKE', '/blog/drafts/%').order('date', 'DESC').limit(3).all()
)
</script>

<template>
  <div>
    <UPageHero
      :ui="hero"
      :title="site.name"
      :description="site.tagline"
      :links="[
        { label: copy.primaryAction, to: '/features', size: 'xl' },
        { label: copy.secondaryAction, to: '/blog', color: 'neutral', variant: 'subtle', size: 'xl' }
      ]"
    />

    <UPageSection :ui="section" :title="copy.featuresTitle" :description="copy.featuresDescription" :features="site.features" />

    <UPageSection v-if="posts?.length" :ui="section" :title="copy.postsTitle" :description="copy.postsDescription">
      <UBlogPosts data-testid="latest-posts">
        <UBlogPost
          v-for="p in posts"
          :key="p.path"
          :title="p.title"
          :description="p.description"
          :date="p.date"
          :image="p.image ? { src: mediaUrl(p.image), alt: p.imageAlt ?? '' } : undefined"
          :to="p.path"
        />
      </UBlogPosts>
    </UPageSection>

    <!-- UPageCTA is a bare rounded box: inside a container it matches the page width instead of touching the viewport edges.
         `subtle` fills it with the neutral ramp's elevated surface (a visible tint with a tinted ramp) plus a hairline ring. -->
    <UContainer class="pb-12 sm:pb-16 lg:pb-20">
      <UPageCTA variant="subtle" :ui="cta" :title="copy.ctaTitle" :description="copy.ctaDescription" :links="[{ label: copy.ctaAction, to: `mailto:${site.contactEmail}` }]" />
    </UContainer>
  </div>
</template>
