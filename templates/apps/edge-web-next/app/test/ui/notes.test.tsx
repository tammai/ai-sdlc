import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NoteForm } from '@/components/note-form'
import { NotesList } from '@/components/notes-list'

const note = { id: '6f1c1f0e-2f64-4a58-8c5e-1b0f0f5f5a11', title: 'Buy milk', body: 'Two litres', createdAt: '2026-01-01T10:00:00.000Z' }

describe('NotesList', () => {
  it('shows skeletons while loading', () => {
    render(<NotesList notes={undefined} isLoading error={null} onRetry={() => {}} />)
    expect(screen.getAllByTestId('note-skeleton')).toHaveLength(3)
  })

  it('shows the empty state', () => {
    render(<NotesList notes={[]} isLoading={false} error={null} onRetry={() => {}} />)
    expect(screen.getByText('No notes yet')).toBeInTheDocument()
  })

  it('shows the error state and retries', async () => {
    const onRetry = vi.fn()
    render(<NotesList notes={undefined} isLoading={false} error={new Error('Boom')} onRetry={onRetry} />)
    expect(screen.getByText('Could not load notes')).toBeInTheDocument()
    expect(screen.getByText('Boom')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(onRetry).toHaveBeenCalledOnce()
  })

  it('renders notes', () => {
    render(<NotesList notes={[note]} isLoading={false} error={null} onRetry={() => {}} />)
    expect(screen.getAllByTestId('note')).toHaveLength(1)
    expect(screen.getByText('Buy milk')).toBeInTheDocument()
    expect(screen.getByText('Two litres')).toBeInTheDocument()
  })
})

describe('NoteForm', () => {
  afterEach(() => vi.unstubAllGlobals())

  const renderForm = () =>
    render(
      <QueryClientProvider client={new QueryClient()}>
        <NoteForm />
      </QueryClientProvider>
    )

  it('validates before calling the API', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    renderForm()
    await userEvent.click(screen.getByRole('button', { name: 'Add note' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Title is required')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('posts a note and clears the form', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(note, { status: 201 }))
    vi.stubGlobal('fetch', fetchMock)
    renderForm()
    await userEvent.type(screen.getByLabelText('Title'), 'Buy milk')
    await userEvent.click(screen.getByRole('button', { name: 'Add note' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce())
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/notes')
    expect(JSON.parse(fetchMock.mock.calls[0]?.[1].body)).toEqual({ title: 'Buy milk', body: '' })
    await waitFor(() => expect(screen.getByLabelText('Title')).toHaveValue(''))
  })

  it('shows the problem detail when the server rejects the note', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ title: 'Invalid request', status: 400, detail: 'Nope' }, { status: 400 })))
    renderForm()
    await userEvent.type(screen.getByLabelText('Title'), 'x')
    await userEvent.click(screen.getByRole('button', { name: 'Add note' }))
    expect(await screen.findByText('Nope')).toBeInTheDocument()
  })
})
