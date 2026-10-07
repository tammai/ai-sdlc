import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises } from '@vue/test-utils'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import NotesPage from '~/pages/index.vue'
import NoteForm from '~/components/NoteForm.vue'
import NoteList from '~/components/NoteList.vue'
import { note, problem, stubApi } from './helpers'

enableAutoUnmount(afterEach)
beforeEach(() => clearNuxtState())
afterEach(() => vi.unstubAllGlobals())

describe('NoteList states', () => {
  it('shows the loading state', async () => {
    const w = await mountSuspended(NoteList, { props: { notes: [], loading: true, error: null } })
    expect(w.find('[data-testid="notes-loading"]').exists()).toBe(true)
    expect(w.find('[data-testid="notes-empty"]').exists()).toBe(false)
  })

  it('shows the empty state with the next action', async () => {
    const w = await mountSuspended(NoteList, { props: { notes: [], loading: false, error: null } })
    expect(w.get('[data-testid="notes-empty"]').text()).toContain('No notes yet. Add your first note')
  })

  it('shows the error state with a retry action', async () => {
    const w = await mountSuspended(NoteList, { props: { notes: [], loading: false, error: 'Bad gateway' } })
    const alert = w.get('[data-testid="notes-error"]')
    expect(alert.text()).toContain('Bad gateway')
    await alert.get('button').trigger('click')
    expect(w.emitted('retry')).toHaveLength(1)
  })

  it('renders notes', async () => {
    const w = await mountSuspended(NoteList, { props: { notes: [note], loading: false, error: null } })
    expect(w.text()).toContain('Buy milk')
    expect(w.text()).toContain('2 litres')
  })
})

describe('NoteForm', () => {
  it('blocks submit and shows the error next to the field when the title is empty', async () => {
    const w = await mountSuspended(NoteForm, { props: { creating: false, error: null } })
    await w.get('form').trigger('submit')
    await flushPromises()
    expect(w.text()).toContain('Enter a title')
    expect(w.get('input').attributes('aria-invalid')).toBe('true')
    expect(w.emitted('create')).toBeUndefined()
  })
})

describe('notes page (list + create against the API)', () => {
  it('lists the notes, then creates one', async () => {
    const created = { ...note, id: '6f1c0f0e-9f5b-4d0e-8a58-0f6a1f0a0002', title: 'Call Ada', body: '' }
    const { calls } = stubApi({ 'GET /api/v1/notes': { items: [note] }, 'POST /api/v1/notes': () => Response.json(created, { status: 201 }) })
    const w = await mountSuspended(NotesPage)
    await flushPromises()
    expect(w.text()).toContain('Buy milk')

    await w.get('input').setValue('Call Ada')
    await w.get('form').trigger('submit')
    await flushPromises()
    const post = calls.find((c) => c.method === 'POST')!
    expect(await post.json()).toEqual({ title: 'Call Ada' })
    expect(w.text()).toContain('Call Ada')
  })

  it('shows the empty state when there are no notes', async () => {
    stubApi({ 'GET /api/v1/notes': { items: [] } })
    const w = await mountSuspended(NotesPage)
    await flushPromises()
    expect(w.find('[data-testid="notes-empty"]').exists()).toBe(true)
  })

  it('shows the error state when loading fails, and recovers on retry', async () => {
    let fail = true
    stubApi({ 'GET /api/v1/notes': () => (fail ? problem(502, 'Bad gateway') : Response.json({ items: [note] })) })
    const w = await mountSuspended(NotesPage)
    await flushPromises()
    expect(w.get('[data-testid="notes-error"]').text()).toContain('Bad gateway')
    fail = false
    await w.get('[data-testid="notes-error"] button').trigger('click')
    await flushPromises()
    expect(w.text()).toContain('Buy milk')
  })

  it('keeps the form content and explains when saving fails', async () => {
    stubApi({ 'GET /api/v1/notes': { items: [] }, 'POST /api/v1/notes': problem(422, 'Validation failed') })
    const w = await mountSuspended(NotesPage)
    await flushPromises()
    await w.get('input').setValue('Call Ada')
    await w.get('form').trigger('submit')
    await flushPromises()
    expect(w.text()).toContain("Couldn't save the note")
    expect((w.get('input').element as HTMLInputElement).value).toBe('Call Ada')
  })
})
