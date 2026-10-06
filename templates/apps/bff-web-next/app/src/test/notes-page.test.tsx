import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NotesPage } from '@/components/notes-page'

// The typed browser client is mocked: these tests cover UI states, not the network.
const { GET, POST } = vi.hoisted(() => ({ GET: vi.fn(), POST: vi.fn() }))
vi.mock('@/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/client')>()),
  api: { GET, POST }
}))

const note = { id: '6f1c0f0e-9f5b-4d0e-8a58-0f6a1f0a0001', title: 'Buy milk', body: '2 litres', createdAt: '2026-10-06T08:00:00Z' }

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <NotesPage />
    </QueryClientProvider>
  )
}

beforeEach(() => {
  GET.mockReset()
  POST.mockReset()
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ loggedIn: true })))
})

describe('NotesPage', () => {
  it('shows a loading state while notes load', async () => {
    GET.mockReturnValue(new Promise(() => {}))
    renderPage()
    expect(await screen.findByTestId('notes-loading')).toBeInTheDocument()
  })

  it('shows the empty state', async () => {
    GET.mockResolvedValue({ data: { items: [] }, response: { status: 200 } })
    renderPage()
    expect(await screen.findByTestId('notes-empty')).toHaveTextContent('No notes yet')
  })

  it('shows the error state and retries', async () => {
    GET.mockResolvedValueOnce({ error: { title: 'Bad gateway', status: 502 }, response: { status: 502 } })
    GET.mockResolvedValueOnce({ data: { items: [note] }, response: { status: 200 } })
    renderPage()
    expect(await screen.findByTestId('notes-error')).toHaveTextContent('Bad gateway')
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText('Buy milk')).toBeInTheDocument()
  })

  it('validates the form, then creates a note and refreshes the list', async () => {
    GET.mockResolvedValueOnce({ data: { items: [] }, response: { status: 200 } })
    GET.mockResolvedValueOnce({ data: { items: [note] }, response: { status: 200 } })
    POST.mockResolvedValue({ data: note, response: { status: 201 } })
    renderPage()
    await screen.findByTestId('notes-empty')

    await userEvent.click(screen.getByRole('button', { name: 'Add note' }))
    expect(await screen.findByText('Title is required')).toBeInTheDocument()
    expect(POST).not.toHaveBeenCalled()

    await userEvent.type(screen.getByLabelText('Title'), 'Buy milk')
    await userEvent.click(screen.getByRole('button', { name: 'Add note' }))
    await waitFor(() => expect(POST).toHaveBeenCalledWith('/notes', { body: { title: 'Buy milk' } }))
    expect(await screen.findByText('2 litres')).toBeInTheDocument()
  })

  it('shows the sign-in form when there is no session', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ loggedIn: false })))
    renderPage()
    expect(await screen.findByLabelText('API token (dev sign-in)')).toBeInTheDocument()
    expect(GET).not.toHaveBeenCalled()
  })
})
