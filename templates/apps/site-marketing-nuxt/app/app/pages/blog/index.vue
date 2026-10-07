<script setup lang="ts">
import { mediaUrl } from '~/utils/media'

useSeoMeta({ title: 'Blog', description: 'News and notes.' })

const { data: posts } = await useAsyncData('blog-index', () =>
  queryCollection('blog').order('date', 'DESC').all() // in dev this includes content/blog/drafts, badged below
)
</script>

<template>
  <UContainer class="py-8 sm:py-12">
    <UPage>
      <UPageHeader title="Blog" description="News and notes." />
      <UPageBody>
        <UBlogPosts v-if="posts?.length" data-testid="post-list">
          <UBlogPost
            v-for="p in posts"
            :key="p.path"
            :title="p.title"
            :description="p.description"
            :date="p.date"
            :badge="p.path.startsWith('/blog/drafts/') ? 'Draft' : undefined"
            :image="p.image ? { src: mediaUrl(p.image), alt: p.imageAlt ?? '' } : undefined"
            :to="p.path"
          />
        </UBlogPosts>
        <p v-else class="text-muted" data-testid="no-posts">
          No posts yet. Add a Markdown file to <code>content/blog</code>.
        </p>
      </UPageBody>
    </UPage>
  </UContainer>
</template>
