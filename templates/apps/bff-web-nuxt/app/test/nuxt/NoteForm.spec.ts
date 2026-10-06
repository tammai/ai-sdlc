import { describe, expect, it } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import NoteForm from '~/components/NoteForm.vue'

describe('NoteForm', () => {
  it('blocks submit and shows an error when the title is empty', async () => {
    const w = await mountSuspended(NoteForm, { props: { creating: false, error: null } })
    await w.get('form').trigger('submit')
    await flushPromises()
    expect(w.text()).toContain('Title is required')
    expect(w.emitted('create')).toBeUndefined()
  })

  it('emits create with a valid note', async () => {
    const w = await mountSuspended(NoteForm, { props: { creating: false, error: null } })
    await w.get('input').setValue('Buy milk')
    await w.get('form').trigger('submit')
    await flushPromises()
    expect(w.emitted('create')?.[0]).toEqual([{ title: 'Buy milk' }])
  })
})
