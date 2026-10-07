import { afterEach, describe, expect, it } from 'vitest'
import { enableAutoUnmount } from '@vue/test-utils'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { site } from '~/data/site'
import MediaImage from '~/components/MediaImage.vue'
import SiteHeader from '~/components/SiteHeader.vue'
import ErrorPage from '~/error.vue'

enableAutoUnmount(afterEach)

describe('MediaImage', () => {
  it('points at /media/<key>, lazy by default, with the alt text', async () => {
    const w = await mountSuspended(MediaImage, { props: { src: 'blog/r2-cover.svg', alt: 'A site and its bucket', width: 1200, height: 630 } })
    const img = w.get('img')
    expect(img.attributes('src')).toBe('/media/blog/r2-cover.svg')
    expect(img.attributes('alt')).toBe('A site and its bucket')
    expect(img.attributes('loading')).toBe('lazy')
    expect(img.attributes('width')).toBe('1200')
  })

  it('loads eagerly with high priority when it is the first thing on the page', async () => {
    const w = await mountSuspended(MediaImage, { props: { src: 'hero.webp', alt: '', priority: true } })
    expect(w.get('img').attributes('loading')).toBe('eager')
    expect(w.get('img').attributes('fetchpriority')).toBe('high')
  })

  it('refuses a key that is not a safe media key', async () => {
    await expect(mountSuspended(MediaImage, { props: { src: '../secret', alt: '' } })).rejects.toThrow(/Invalid media key/)
  })
})

describe('navigation', () => {
  it('lists every page from site.nav', async () => {
    const w = await mountSuspended(SiteHeader)
    const hrefs = w.findAll('a').map((a) => a.attributes('href'))
    for (const l of site.nav) expect(hrefs).toContain(l.to)
  })
})

describe('error page', () => {
  it('explains a 404 and offers a way back', async () => {
    const error = createError({ statusCode: 404, statusMessage: 'Not found' })
    const w = await mountSuspended(ErrorPage, { props: { error } })
    expect(w.get('[data-testid="error-title"]').text()).toBe('Page not found')
    expect(w.findAll('a').some((a) => a.attributes('href') === '/')).toBe(true)
  })
})
