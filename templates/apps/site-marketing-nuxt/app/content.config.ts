import { defineCollection, defineContentConfig, z } from '@nuxt/content'

// Frontmatter is validated at build time: a post without a title, or with a bad date, fails `pnpm build`.
// `image` is an R2 object key (e.g. blog/cover.svg), not a URL: app/utils/media.ts turns it into /media/<key>.
//
// Drafts are files in content/blog/drafts/. They are part of the collection only in `nuxt dev` (preview), and left out of
// production builds entirely. A `draft: true` flag would not do: on static hosting the browser downloads the whole
// collection (/__nuxt_content/blog/sql_dump.txt), so a flagged post would still be readable by anyone. Move a post out of
// drafts/ to publish it.
const preview = process.env.NODE_ENV === 'development'

export default defineContentConfig({
  collections: {
    // content/*.md: about, features, pricing … rendered at /<name> by app/pages/[...slug].vue
    pages: defineCollection({
      type: 'page',
      source: { include: '*.md' },
      schema: z.object({
        title: z.string().min(1),
        description: z.string().min(1)
      })
    }),
    // content/blog/*.md: rendered at /blog/<name> (content/blog/drafts/*.md too, in dev only)
    blog: defineCollection({
      type: 'page',
      source: preview ? [{ include: 'blog/*.md' }, { include: 'blog/drafts/*.md' }] : { include: 'blog/*.md' },
      schema: z.object({
        title: z.string().min(1),
        description: z.string().min(1),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'use YYYY-MM-DD'),
        image: z.string().optional(),
        imageAlt: z.string().optional(),
        author: z.string().optional()
      })
    })
  }
})
