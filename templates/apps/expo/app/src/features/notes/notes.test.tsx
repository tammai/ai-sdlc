import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';

import { sessionStore } from '@/api/client';
import { fakeNetwork, json, problem, session } from '@/test/helpers';
import { renderWithProviders } from '@/test/render';

import { NewNoteScreen } from './new-note-screen';
import { NotesScreen } from './notes-screen';

const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn() };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));

const note = (n: number) => ({ id: `n${n}`, title: `Note ${n}`, body: n === 1 ? 'First body' : '', createdAt: '2026-10-01T10:00:00Z' });

beforeEach(async () => {
  jest.clearAllMocks();
  await sessionStore.set(session(1));
});

describe('NotesScreen states', () => {
  it('shows a skeleton while loading (after a short delay), then the notes', async () => {
    jest.useFakeTimers();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    fakeNetwork(async () => {
      await gate;
      return json({ items: [note(1), note(2)] });
    });
    renderWithProviders(<NotesScreen />);

    expect(screen.getByLabelText('Loading notes')).toBeOnTheScreen();
    await act(async () => void jest.advanceTimersByTime(250));
    expect(screen.getByLabelText('Loading notes')).toBeOnTheScreen();

    release();
    jest.useRealTimers();
    expect(await screen.findByText('Note 1')).toBeOnTheScreen();
    expect(screen.getByText('First body')).toBeOnTheScreen();
    expect(screen.getByText('Note 2')).toBeOnTheScreen();
    expect(screen.queryByLabelText('Loading notes')).toBeNull();
  });

  it('shows an empty state with a way forward', async () => {
    fakeNetwork(() => json({ items: [] }));
    renderWithProviders(<NotesScreen />);

    expect(await screen.findByText('No notes yet')).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'New note' }));
    expect(mockRouter.push).toHaveBeenCalledWith('/new');
  });

  it('shows an error with retry, then recovers', async () => {
    let fail = true;
    fakeNetwork(() => (fail ? problem(500, 'Boom') : json({ items: [note(1)] })));
    renderWithProviders(<NotesScreen />);

    expect(await screen.findByText("Couldn't load your notes")).toBeOnTheScreen();
    fail = false;
    fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Note 1')).toBeOnTheScreen();
  });

  it('requests the next page when the API returns a cursor', async () => {
    const net = fakeNetwork((req) => {
      const cursor = new URL(req.url).searchParams.get('cursor');
      return cursor ? json({ items: [note(2)] }) : json({ items: [note(1)], nextCursor: 'c2' });
    });
    renderWithProviders(<NotesScreen />);
    expect(await screen.findByText('Note 1')).toBeOnTheScreen();
    expect(net.calls[0]?.auth).toBe('Bearer access-1');
  });
});

describe('NewNoteScreen', () => {
  it('requires a title and does not call the API', async () => {
    const net = fakeNetwork(() => json(note(9), 201));
    renderWithProviders(<NewNoteScreen />);

    fireEvent.press(screen.getByRole('button', { name: 'Create note' }));

    expect(await screen.findByText('Enter a title.')).toBeOnTheScreen();
    expect(net.count('POST', '/v1/notes')).toBe(0);
  });

  it('rejects a title over 200 characters', async () => {
    fakeNetwork(() => json(note(9), 201));
    renderWithProviders(<NewNoteScreen />);

    fireEvent.changeText(screen.getByLabelText('Title'), 'x'.repeat(201));
    fireEvent(screen.getByLabelText('Title'), 'blur');

    expect(await screen.findByText(/under 200 characters/)).toBeOnTheScreen();
  });

  it('creates the note and goes back', async () => {
    const net = fakeNetwork(() => json(note(9), 201));
    renderWithProviders(<NewNoteScreen />);

    fireEvent.changeText(screen.getByLabelText('Title'), '  Buy milk ');
    fireEvent.changeText(screen.getByLabelText('Body (optional)'), '2 litres');
    fireEvent.press(screen.getByRole('button', { name: 'Create note' }));

    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
    expect(net.calls.find((c) => c.method === 'POST')?.body).toEqual({ title: 'Buy milk', body: '2 litres' });
  });

  it('keeps the input and explains a server failure', async () => {
    fakeNetwork(() => problem(500, 'Boom'));
    renderWithProviders(<NewNoteScreen />);

    fireEvent.changeText(screen.getByLabelText('Title'), 'Buy milk');
    fireEvent.press(screen.getByRole('button', { name: 'Create note' }));

    expect(await screen.findByText(/Couldn't create the note/)).toBeOnTheScreen();
    expect(screen.getByLabelText('Title').props.value).toBe('Buy milk');
    expect(mockRouter.back).not.toHaveBeenCalled();
  });
});
