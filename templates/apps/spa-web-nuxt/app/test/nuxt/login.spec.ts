import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises } from '@vue/test-utils'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import LoginPage from '~/pages/login.vue'
import { problem, stubApi, user } from './helpers'

const all = { password: true, registration: true, magicLink: true, oidc: [{ id: 'google', name: 'Google' }, { id: 'github', name: 'GitHub' }] }
const passwordOnly = { password: true, registration: false, magicLink: false, oidc: [] }

async function mountLogin(providers: object, extra: Record<string, unknown> = {}) {
  const api = stubApi({ 'GET /api/v1/auth/providers': providers, ...extra })
  const w = await mountSuspended(LoginPage, { route: '/login?redirect=%2Fnotes%3Fpage%3D2' })
  await flushPromises()
  return { w, api }
}

enableAutoUnmount(afterEach)
beforeEach(() => clearNuxtState())
afterEach(() => vi.unstubAllGlobals())

describe('login page (driven by GET /v1/auth/providers)', () => {
  it('renders every enabled method', async () => {
    const { w } = await mountLogin(all)
    expect(w.find('input[type="password"]').exists()).toBe(true)
    expect(w.text()).toContain('Email me a sign-in link')
    expect(w.text()).toContain('Create an account')
    const google = w.get('[data-testid="oidc-google"]')
    expect(google.text()).toBe('Continue with Google')
    expect(google.attributes('href')).toBe('/api/v1/auth/oidc/google/start?redirect=%2Fnotes%3Fpage%3D2')
    expect(w.get('[data-testid="oidc-github"]').text()).toBe('Continue with GitHub')
  })

  it('renders only password when nothing else is enabled', async () => {
    const { w } = await mountLogin(passwordOnly)
    expect(w.find('input[type="password"]').exists()).toBe(true)
    expect(w.text()).not.toContain('sign-in link')
    expect(w.text()).not.toContain('Create an account')
    expect(w.find('[data-testid^="oidc-"]').exists()).toBe(false)
  })

  it('renders only the OIDC buttons when password sign-in is off', async () => {
    const { w } = await mountLogin({ password: false, registration: false, magicLink: false, oidc: [{ id: 'okta', name: 'Okta' }] })
    expect(w.find('input[type="password"]').exists()).toBe(false)
    expect(w.find('[data-testid="oidc-okta"]').exists()).toBe(true)
  })

  it('says so when no method is enabled', async () => {
    const { w } = await mountLogin({ password: false, registration: false, magicLink: false, oidc: [] })
    expect(w.get('[data-testid="no-methods"]').text()).toContain('No sign-in methods are enabled')
  })

  it('shows an error with a retry when the providers cannot be loaded', async () => {
    const { w } = await mountLogin({}, { 'GET /api/v1/auth/providers': problem(502, 'Bad gateway') })
    expect(w.get('[data-testid="providers-error"]').text()).toContain("Couldn't load the sign-in options")
  })

  it('explains a failed provider sign-in (?error=access_denied from the API)', async () => {
    stubApi({ 'GET /api/v1/auth/providers': all })
    const w = await mountSuspended(LoginPage, { route: '/login?error=access_denied' })
    await flushPromises()
    expect(w.get('[data-testid="provider-error"]').text()).toContain('Access was denied at the provider')
  })

  it('validates the form, focuses the first invalid field and ties the error to it', async () => {
    const { w } = await mountLogin(passwordOnly)
    await w.get('form').trigger('submit')
    await flushPromises()
    const email = w.get('input[type="email"]')
    expect(w.text()).toContain('Enter a valid email address')
    expect(email.attributes('aria-invalid')).toBe('true')
    expect(email.attributes('aria-describedby')).toBeTruthy()
  })

  it('signs in with email and password', async () => {
    const { w, api } = await mountLogin(passwordOnly, { 'POST /api/v1/auth/session': user })
    await w.get('input[type="email"]').setValue('ada@example.com')
    await w.get('input[type="password"]').setValue('correct horse battery')
    await w.get('form').trigger('submit')
    await flushPromises()
    const post = api.calls.find((c) => c.method === 'POST')!
    expect(await post.json()).toEqual({ email: 'ada@example.com', password: 'correct horse battery' })
  })

  it('shows a clear message for wrong credentials and keeps what was typed', async () => {
    const { w } = await mountLogin(passwordOnly, { 'POST /api/v1/auth/session': problem(401, 'Unauthorized') })
    await w.get('input[type="email"]').setValue('ada@example.com')
    await w.get('input[type="password"]').setValue('nope')
    await w.get('form').trigger('submit')
    await flushPromises()
    expect(w.get('[role="alert"]').text()).toContain('Email or password is incorrect')
    expect((w.get('input[type="email"]').element as HTMLInputElement).value).toBe('ada@example.com')
  })
})
