import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import NoteList from '~/components/NoteList.vue'

const note = { id: '6f1c0f0e-9f5b-4d0e-8a58-0f6a1f0a0001', title: 'Buy milk', body: '2 litres', createdAt: '2026-10-06T08:00:00Z' }

describe('NoteList', () => {
  it('shows the loading state', async () => {
    const w = await mountSuspended(NoteList, { props: { notes: [], loading: true, error: null } })
    expect(w.find('[data-testid="notes-loading"]').exists()).toBe(true)
    expect(w.find('[data-testid="notes-empty"]').exists()).toBe(false)
  })

  it('shows the empty state', async () => {
    const w = await mountSuspended(NoteList, { props: { notes: [], loading: false, error: null } })
    expect(w.get('[data-testid="notes-empty"]').text()).toContain('No notes yet')
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
