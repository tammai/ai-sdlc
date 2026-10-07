import { act, renderRouter, screen } from 'expo-router/testing-library';

import { sessionStore } from '@/api/client';
import { fakeNetwork, json, problem, tokens } from '@/test/helpers';

// Real route tree (./), opened through the deep link <scheme>://auth/magic?token=…
const MAGIC = '/auth/magic?token=0123456789abcdef0123456789abcdef';

beforeEach(async () => {
  await sessionStore.clear();
});

describe('magic link deep link', () => {
  it('exchanges the token (grant magic_link), signs in and lands on the notes list', async () => {
    const net = fakeNetwork((req) => {
      const path = new URL(req.url).pathname;
      if (path === '/v1/auth/token') return json(tokens(1));
      if (path === '/v1/notes') return json({ items: [] });
      return problem(404, 'Not found');
    });

    const view = renderRouter('./src/app', { initialUrl: MAGIC });

    expect(await screen.findByText('No notes yet')).toBeOnTheScreen();
    expect(net.calls.find((c) => c.path === '/v1/auth/token')?.body).toEqual({
      grantType: 'magic_link',
      token: '0123456789abcdef0123456789abcdef',
    });
    expect(net.count('POST', '/v1/auth/token')).toBe(1); // single-use token is exchanged once
    expect(view.getPathname()).toBe('/');
    expect(sessionStore.getState()).toMatchObject({ status: 'signedIn', session: { accessToken: 'access-1' } });
    await act(async () => {});
  });

  it('explains an expired or used link and offers a way back', async () => {
    fakeNetwork((req) => {
      const path = new URL(req.url).pathname;
      if (path === '/v1/auth/token') return problem(401, 'Invalid or expired token');
      if (path === '/v1/auth/providers') return json({ password: true, registration: false, magicLink: true, oidc: [] });
      return problem(404, 'Not found');
    });

    renderRouter('./src/app', { initialUrl: MAGIC });

    expect(await screen.findByText("Link didn't work")).toBeOnTheScreen();
    expect(sessionStore.getState().status).toBe('signedOut');
    expect(screen.getByRole('button', { name: 'Back to sign in' })).toBeOnTheScreen();
  });
});
