import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { createHash } from 'node:crypto';
import * as WebBrowser from 'expo-web-browser';

import { sessionStore } from '@/api/client';
import { fakeNetwork, json, problem, tokens } from '@/test/helpers';
import { renderWithProviders } from '@/test/render';

import { SignInScreen } from './sign-in-screen';

const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn() };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));

jest.mock('expo-web-browser', () => ({
  maybeCompleteAuthSession: jest.fn(),
  openAuthSessionAsync: jest.fn(),
}));

type Providers = { password: boolean; registration: boolean; magicLink: boolean; oidc: { id: string; name: string }[] };
const base: Providers = { password: false, registration: false, magicLink: false, oidc: [] };

function serve(providers: Providers) {
  return fakeNetwork((req) => {
    const path = new URL(req.url).pathname;
    if (path === '/v1/auth/providers') return json(providers);
    if (path === '/v1/auth/token') return json(tokens(1));
    if (path === '/v1/auth/magic-link') return new Response(null, { status: 202 });
    return problem(404, 'Not found');
  });
}

beforeEach(async () => {
  await sessionStore.clear();
  jest.clearAllMocks();
});

describe('SignInScreen is driven by /v1/auth/providers', () => {
  it('password only: email + password + Sign in, nothing else', async () => {
    serve({ ...base, password: true });
    renderWithProviders(<SignInScreen />);

    expect(await screen.findByLabelText('Password')).toBeOnTheScreen();
    expect(screen.getByLabelText('Email')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Email me a link' })).toBeNull();
    expect(screen.queryByText(/Continue with/)).toBeNull();
  });

  it('magic link only: no password field', async () => {
    serve({ ...base, magicLink: true });
    renderWithProviders(<SignInScreen />);

    expect(await screen.findByRole('button', { name: 'Email me a link' })).toBeOnTheScreen();
    expect(screen.queryByLabelText('Password')).toBeNull();
  });

  it('renders one button per OIDC provider', async () => {
    serve({ ...base, oidc: [{ id: 'google', name: 'Google' }, { id: 'github', name: 'GitHub' }] });
    renderWithProviders(<SignInScreen />);

    expect(await screen.findByRole('button', { name: 'Continue with Google' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Continue with GitHub' })).toBeOnTheScreen();
    expect(screen.queryByLabelText('Email')).toBeNull();
  });

  it('explains when no method is enabled', async () => {
    serve(base);
    renderWithProviders(<SignInScreen />);
    expect(await screen.findByText('Sign-in is turned off')).toBeOnTheScreen();
  });

  it('shows an error with retry when providers fail to load', async () => {
    let ok = false;
    fakeNetwork(() => (ok ? json({ ...base, password: true }) : problem(503, 'Unavailable')));
    renderWithProviders(<SignInScreen />);

    expect(await screen.findByText("Can't reach the server")).toBeOnTheScreen();
    ok = true;
    fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByLabelText('Password')).toBeOnTheScreen();
  });
});

describe('sign-in actions', () => {
  it('signs in with the password grant and stores the session', async () => {
    const net = serve({ ...base, password: true });
    renderWithProviders(<SignInScreen />);

    fireEvent.changeText(await screen.findByLabelText('Email'), 'ada@example.com');
    fireEvent.changeText(screen.getByLabelText('Password'), 'hunter2hunter2');
    fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => expect(sessionStore.getState().status).toBe('signedIn'));
    expect(net.calls.find((c) => c.path === '/v1/auth/token')?.body).toEqual({ grantType: 'password', email: 'ada@example.com', password: 'hunter2hunter2' });
  });

  it('validates the email before calling the server', async () => {
    const net = serve({ ...base, password: true });
    renderWithProviders(<SignInScreen />);

    fireEvent.changeText(await screen.findByLabelText('Email'), 'nope');
    fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText(/Enter a valid email/)).toBeOnTheScreen();
    expect(net.count('POST', '/v1/auth/token')).toBe(0);
  });

  it('shows a readable error for wrong credentials and keeps the input', async () => {
    fakeNetwork((req) => (new URL(req.url).pathname === '/v1/auth/providers' ? json({ ...base, password: true }) : problem(401, 'Invalid credentials')));
    renderWithProviders(<SignInScreen />);

    fireEvent.changeText(await screen.findByLabelText('Email'), 'ada@example.com');
    fireEvent.changeText(screen.getByLabelText('Password'), 'wrong');
    fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText(/incorrect/)).toBeOnTheScreen();
    expect(screen.getByLabelText('Email').props.value).toBe('ada@example.com');
    expect(sessionStore.getState().status).toBe('signedOut');
  });

  it('requests a magic link with client=native', async () => {
    const net = serve({ ...base, magicLink: true });
    renderWithProviders(<SignInScreen />);

    fireEvent.changeText(await screen.findByLabelText('Email'), 'ada@example.com');
    fireEvent.press(screen.getByRole('button', { name: 'Email me a link' }));

    expect(await screen.findByText(/sign-in link is on its way/)).toBeOnTheScreen();
    expect(net.calls.find((c) => c.path === '/v1/auth/magic-link')?.body).toEqual({ email: 'ada@example.com', client: 'native' });
  });

  it('runs native OIDC with PKCE: S256 challenge to /start, matching verifier on the code exchange', async () => {
    const net = serve({ ...base, oidc: [{ id: 'google', name: 'Google' }] });
    jest.mocked(WebBrowser.openAuthSessionAsync).mockResolvedValue({ type: 'success', url: '__APP_NAME__://auth/callback?code=one-time-123' });
    renderWithProviders(<SignInScreen />);

    fireEvent.press(await screen.findByRole('button', { name: 'Continue with Google' }));

    await waitFor(() => expect(sessionStore.getState().status).toBe('signedIn'));
    const [startUrl, redirect] = jest.mocked(WebBrowser.openAuthSessionAsync).mock.calls[0] ?? [];
    expect(redirect).toMatch(/:\/\/auth\/callback$/);

    const start = new URL(String(startUrl));
    expect(start.origin + start.pathname).toBe('http://api.test/v1/auth/oidc/google/start');
    expect(start.searchParams.get('client')).toBe('native');
    expect(start.searchParams.get('codeChallengeMethod')).toBe('S256');

    const exchange = net.calls.find((c) => c.path === '/v1/auth/token')?.body as { grantType: string; code: string; codeVerifier: string };
    expect(exchange).toMatchObject({ grantType: 'authorization_code', code: 'one-time-123' });
    expect(exchange.codeVerifier).toMatch(/^[A-Za-z0-9_-]{43,128}$/); // RFC 7636 verifier
    // the challenge sent to /start is base64url(SHA-256(verifier)), computed here independently
    const expected = createHash('sha256').update(exchange.codeVerifier).digest('base64url');
    expect(start.searchParams.get('codeChallenge')).toBe(expected);
  });

  it('uses a fresh verifier for every attempt', async () => {
    serve({ ...base, oidc: [{ id: 'google', name: 'Google' }] });
    jest.mocked(WebBrowser.openAuthSessionAsync).mockResolvedValue({ type: 'cancel' as never });
    renderWithProviders(<SignInScreen />);

    fireEvent.press(await screen.findByRole('button', { name: 'Continue with Google' }));
    await waitFor(() => expect(WebBrowser.openAuthSessionAsync).toHaveBeenCalledTimes(1));
    fireEvent.press(await screen.findByRole('button', { name: 'Continue with Google' }));
    await waitFor(() => expect(WebBrowser.openAuthSessionAsync).toHaveBeenCalledTimes(2));

    const challenges = jest.mocked(WebBrowser.openAuthSessionAsync).mock.calls.map(([u]) => new URL(String(u)).searchParams.get('codeChallenge'));
    expect(challenges[0]).not.toBe(challenges[1]);
  });

  it.each([
    ['access_denied', /cancelled/],
    ['server_error', /provider had a problem/],
    ['invalid_request', /not valid/],
  ])('shows a friendly message for an ?error=%s redirect and never calls the token endpoint', async (code, message) => {
    const net = serve({ ...base, oidc: [{ id: 'google', name: 'Google' }] });
    jest.mocked(WebBrowser.openAuthSessionAsync).mockResolvedValue({ type: 'success', url: `__APP_NAME__://auth/callback?error=${code}` });
    renderWithProviders(<SignInScreen />);

    fireEvent.press(await screen.findByRole('button', { name: 'Continue with Google' }));

    expect(await screen.findByText(message)).toBeOnTheScreen();
    expect(net.count('POST', '/v1/auth/token')).toBe(0);
    expect(sessionStore.getState().status).toBe('signedOut');
  });

  it('offers account creation only when registration is open', async () => {
    serve({ ...base, password: true, registration: true });
    const first = renderWithProviders(<SignInScreen />);
    fireEvent.press(await screen.findByRole('button', { name: 'Create an account' }));
    expect(mockRouter.push).toHaveBeenCalledWith('/register');
    first.unmount();

    serve({ ...base, password: true, registration: false });
    renderWithProviders(<SignInScreen />);
    await screen.findByLabelText('Password');
    expect(screen.queryByRole('button', { name: 'Create an account' })).toBeNull();
  });

  it('does nothing when the user dismisses the OIDC browser', async () => {
    const net = serve({ ...base, oidc: [{ id: 'google', name: 'Google' }] });
    jest.mocked(WebBrowser.openAuthSessionAsync).mockResolvedValue({ type: 'cancel' as never });
    renderWithProviders(<SignInScreen />);

    fireEvent.press(await screen.findByRole('button', { name: 'Continue with Google' }));

    await waitFor(() => expect(WebBrowser.openAuthSessionAsync).toHaveBeenCalled());
    expect(net.count('POST', '/v1/auth/token')).toBe(0);
    expect(sessionStore.getState().status).toBe('signedOut');
  });
});
