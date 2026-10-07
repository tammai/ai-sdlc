import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { sessionStore } from '@/api/client';
import { fakeNetwork, json, problem, tokens, user } from '@/test/helpers';
import { renderWithProviders } from '@/test/render';

import { RegisterScreen } from './register-screen';

const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn() };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));

const open = { password: true, registration: true, magicLink: false, oidc: [] };

function serve(register: () => Response = () => json(user, 201), providers = open) {
  return fakeNetwork((req) => {
    const path = new URL(req.url).pathname;
    if (path === '/v1/auth/providers') return json(providers);
    if (path === '/v1/auth/register') return register();
    if (path === '/v1/auth/token') return json(tokens(1));
    return problem(404, 'Not found');
  });
}

beforeEach(async () => {
  jest.clearAllMocks();
  await sessionStore.clear();
});

describe('RegisterScreen', () => {
  it('registers, then signs in with the password grant', async () => {
    const net = serve();
    renderWithProviders(<RegisterScreen />);

    fireEvent.changeText(await screen.findByLabelText('Email'), ' ada@example.com ');
    fireEvent.changeText(screen.getByLabelText('Password'), 'correct horse battery');
    fireEvent.changeText(screen.getByLabelText('Name (optional)'), 'Ada');
    fireEvent.press(screen.getByRole('button', { name: 'Create account' }));

    await waitFor(() => expect(sessionStore.getState().status).toBe('signedIn'));
    const paths = net.calls.map((c) => `${c.method} ${c.path}`);
    expect(paths.indexOf('POST /v1/auth/register')).toBeLessThan(paths.indexOf('POST /v1/auth/token'));
    expect(net.calls.find((c) => c.path === '/v1/auth/register')?.body).toEqual({
      email: 'ada@example.com',
      password: 'correct horse battery',
      name: 'Ada',
    });
    expect(net.calls.find((c) => c.path === '/v1/auth/token')?.body).toEqual({
      grantType: 'password',
      email: 'ada@example.com',
      password: 'correct horse battery',
    });
  });

  it('requires a password of at least 12 characters before calling the API', async () => {
    const net = serve();
    renderWithProviders(<RegisterScreen />);

    fireEvent.changeText(await screen.findByLabelText('Email'), 'ada@example.com');
    fireEvent.changeText(screen.getByLabelText('Password'), 'short');
    fireEvent.press(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByText(/at least 12 characters \(now 5\)/)).toBeOnTheScreen();
    expect(net.count('POST', '/v1/auth/register')).toBe(0);
  });

  it('explains a duplicate account and keeps the input', async () => {
    serve(() => problem(409, 'Conflict'));
    renderWithProviders(<RegisterScreen />);

    fireEvent.changeText(await screen.findByLabelText('Email'), 'ada@example.com');
    fireEvent.changeText(screen.getByLabelText('Password'), 'correct horse battery');
    fireEvent.press(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByText(/already exists/)).toBeOnTheScreen();
    expect(screen.getByLabelText('Email').props.value).toBe('ada@example.com');
    expect(sessionStore.getState().status).toBe('signedOut');
  });

  it('shows a closed state when registration is disabled', async () => {
    serve(undefined, { ...open, registration: false });
    renderWithProviders(<RegisterScreen />);

    expect(await screen.findByText('Sign-up is closed')).toBeOnTheScreen();
    expect(screen.queryByLabelText('Password')).toBeNull();
  });
});
