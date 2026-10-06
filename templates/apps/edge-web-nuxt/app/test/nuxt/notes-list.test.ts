import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import NotesList from '../../app/components/NotesList.vue'

const note = { id: '6f1c1f0e-2f64-4a58-8c5e-1b0f0f5f5a11', title: 'Buy milk', body: 'Two litres', createdAt: '2026-01-01T10:00:00.000Z' }

describe('NotesList', () => {
  it('shows skeletons while loading', async () => {
    const wrapper = await mountSuspended(NotesList, { props: { notes: [], status: 'pending' } })
    expect(wrapper.findAll('[data-testid="note-skeleton"]')).toHaveLength(3)
  })

  it('shows the empty state', async () => {
    const wrapper = await mountSuspended(NotesList, { props: { notes: [], status: 'success' } })
    expect(wrapper.text()).toContain('No notes yet')
  })

  it('shows the error state with a message', async () => {
    const wrapper = await mountSuspended(NotesList, { props: { notes: [], status: 'error', error: 'Boom' } })
    expect(wrapper.text()).toContain('Could not load notes')
    expect(wrapper.text()).toContain('Boom')
  })

  it('renders notes', async () => {
    const wrapper = await mountSuspended(NotesList, { props: { notes: [note], status: 'success' } })
    expect(wrapper.findAll('[data-testid="note"]')).toHaveLength(1)
    expect(wrapper.text()).toContain('Buy milk')
    expect(wrapper.text()).toContain('Two litres')
  })
})
