<script setup lang="ts">
const route = useRoute()

const { data: post } = await useAsyncData(`post-${route.path}`, () => queryCollection('blog').path(route.path).first())
if (!post.value) throw createError({ statusCode: 404, statusMessage: 'Post not found', fatal: true })

useSeoMeta({ title: post.value.title, description: post.value.description, ogType: 'article', articlePublishedTime: post.value.date })
</script>

<template>
  <UContainer v-if="post" class="max-w-3xl py-8 sm:py-12">
    <UPage>
      <UPageHeader :title="post.title" :description="post.description">
        <template #headline>
          <NuxtLink to="/blog" class="hover:underline">
            Blog
          </NuxtLink>
          <span aria-hidden="true"> · </span>
          <time :datetime="post.date">{{ post.date }}</time>
          <template v-if="post.author">
            <span aria-hidden="true"> · </span>
            <span>{{ post.author }}</span>
          </template>
        </template>
      </UPageHeader>
      <UPageBody>
        <MediaImage v-if="post.image" :src="post.image" :alt="post.imageAlt ?? ''" :width="1200" :height="630" priority class="mb-8 h-auto w-full rounded-lg" />
        <ContentRenderer :value="post" />
      </UPageBody>
    </UPage>
  </UContainer>
</template>
