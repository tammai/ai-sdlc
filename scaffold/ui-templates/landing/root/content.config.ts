// What content/landing.yml may contain. Engineer-owned: the page reads exactly these fields.
import { defineCollection, z } from '@nuxt/content'

const link = z.object({
  label: z.string().nonempty(),
  to: z.string().nonempty(),
  icon: z.string().optional(),
  color: z.enum(['primary', 'secondary', 'neutral']).optional(),
  variant: z.enum(['solid', 'outline', 'subtle', 'soft', 'ghost', 'link']).optional(),
})

export const collections = {
  landing: defineCollection({
    type: 'page',
    source: 'landing.yml',
    schema: z.object({
      hero: z.object({ headline: z.string().optional(), links: z.array(link) }),
      features: z.object({
        headline: z.string().optional(),
        title: z.string().nonempty(),
        description: z.string().optional(),
        items: z.array(z.object({ icon: z.string(), title: z.string().nonempty(), description: z.string().nonempty() })),
      }),
      cta: z.object({ title: z.string().nonempty(), description: z.string().optional(), links: z.array(link) }),
    }),
  }),
}
