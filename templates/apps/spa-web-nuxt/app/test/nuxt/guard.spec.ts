import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount } from '@vue/test-utils'
import { problem, stubApi, user } from './helpers'

enableAutoUnmount(afterEach)
beforeEach(() => clearNuxtState())
afterEach(() => vi.unstubAllGlobals())

describe('route guard', () => {
  it('sends unauthenticated users (401 from /v1/auth/me) to /login and keeps the intended path', async () => {
    stubApi({ 'GET /api/v1/auth/me': problem(401, 'Unauthorized') })
    await navigateTo('/some/page')
    const route = useRouter().currentRoute.value
    expect(route.path).toBe('/login')
    expect(route.query.redirect).toBe('/some/page')
  })

  it('lets signed-in users through', async () => {
    stubApi({ 'GET /api/v1/auth/me': user, 'GET /api/v1/notes': { items: [] } })
    await navigateTo('/')
    expect(useRouter().currentRoute.value.path).toBe('/')
    expect(useAuth().user.value).toEqual(user)
  })

  it('does not ask the API about public pages that are not guest-only', async () => {
    const { fn } = stubApi({})
    await navigateTo('/auth/magic')
    expect(useRouter().currentRoute.value.path).toBe('/auth/magic')
    expect(fn).not.toHaveBeenCalledWith(expect.objectContaining({ url: expect.stringContaining('/auth/me') }))
  })

  it('bounces signed-in users away from /login to their intended page', async () => {
    stubApi({ 'GET /api/v1/auth/me': user, 'GET /api/v1/notes': { items: [] } })
    await navigateTo('/login?redirect=%2F')
    expect(useRouter().currentRoute.value.path).toBe('/')
  })
})
