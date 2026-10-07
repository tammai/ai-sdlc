import { afterEach, describe, expect, it } from 'vitest'
import { enableAutoUnmount } from '@vue/test-utils'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { site } from '~/data/site'
import IndexPage from '~/pages/index.vue'
import ContactPage from '~/pages/contact.vue'
import SiteHeader from '~/components/SiteHeader.vue'
import ErrorPage from '~/error.vue'

enableAutoUnmount(afterEach)

describe('home page', () => {
  it('has one h1 with the site name and a link to the contact page', async () => {
    const w = await mountSuspended(IndexPage)
    const h1 = w.findAll('h1')
    expect(h1).toHaveLength(1)
    expect(h1[0]!.text()).toContain(site.name)
    expect(w.findAll('a').some((a) => a.attributes('href') === '/contact')).toBe(true)
  })

  it('renders every feature and every FAQ question', async () => {
    const w = await mountSuspended(IndexPage)
    for (const f of site.features) expect(w.text()).toContain(f.title)
    for (const q of site.faq) expect(w.text()).toContain(q.label)
  })

  it('takes its section text from site.pages.home, not from the page file', async () => {
    const w = await mountSuspended(IndexPage)
    const home = site.pages.home
    for (const text of [home.primaryAction, home.featuresTitle, home.faqTitle, home.ctaTitle]) expect(w.text()).toContain(text)
  })
})

describe('navigation', () => {
  it('lists every page from site.nav', async () => {
    const w = await mountSuspended(SiteHeader)
    const hrefs = w.findAll('a').map((a) => a.attributes('href'))
    for (const l of site.nav) expect(hrefs).toContain(l.to)
  })
})

describe('contact page', () => {
  it('links to the contact address with mailto', async () => {
    const w = await mountSuspended(ContactPage)
    expect(w.get('[data-testid="contact-email"]').attributes('href')).toBe(`mailto:${site.contactEmail}`)
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
