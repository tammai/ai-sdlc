import ui from '@nuxt/ui/vue-plugin'
import { mockIPC } from '@tauri-apps/api/mocks'
import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import App from '@/App.vue'
import { router } from '@/router'

async function mountApp() {
  await router.push('/')
  await router.isReady()
  const wrapper = mount(App, { global: { plugins: [router, ui] }, attachTo: document.body })
  await flushPromises()
  return wrapper
}

describe('notes UI', () => {
  it('shows the empty state, then a created note', async () => {
    const notes: unknown[] = []
    mockIPC((cmd, args) => {
      if (cmd === 'list_notes') return [...notes]
      if (cmd === 'create_note') {
        const { title, body = '' } = (args as { input: { title: string, body?: string } }).input
        const created = { id: 1, title, body, createdAt: '2026-01-01T00:00:00.000Z' }
        notes.unshift(created)
        return created
      }
    })

    const wrapper = await mountApp()
    expect(wrapper.text()).toMatch(/no notes yet/i)

    await wrapper.get('input').setValue('Buy milk')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(wrapper.text()).toContain('Buy milk')
    wrapper.unmount()
  })

  it('shows an error state with retry when loading fails', async () => {
    mockIPC(() => {
      throw { code: 'database', message: 'database error: disk full' }
    })
    const wrapper = await mountApp()
    expect(wrapper.text()).toContain('disk full')
    expect(wrapper.findAll('button').some(b => /try again/i.test(b.text()))).toBe(true)
    wrapper.unmount()
  })

  it('renders the not-found page for unknown routes', async () => {
    mockIPC(() => [])
    await router.push('/does-not-exist')
    const wrapper = mount(App, { global: { plugins: [router, ui] }, attachTo: document.body })
    await flushPromises()
    expect(wrapper.text()).toContain('Page not found')
    expect(document.title).toBe('Not found - __APP_TITLE__')
    wrapper.unmount()
  })

  it('validates before calling Rust', async () => {
    mockIPC(() => [])
    const wrapper = await mountApp()
    expect(wrapper.text()).toMatch(/no notes yet/i)

    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(wrapper.text()).toContain('Title is required')
    wrapper.unmount()
  })
})
