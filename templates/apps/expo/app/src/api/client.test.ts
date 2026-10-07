import { fakeNetwork, json, problem, session, setup, tokens } from '@/test/helpers';

// A server whose access token "access-1" has expired: only "access-2" is accepted, and
// refresh tokens rotate (refresh-1 works once, then refresh-2).
function expiringServer() {
  let validRefresh = 'refresh-1';
  const net = fakeNetwork(async (req) => {
    const path = new URL(req.url).pathname;
    if (path === '/v1/auth/token') {
      const body = (await req.json()) as { grantType: string; refreshToken?: string };
      if (body.grantType === 'refresh_token' && body.refreshToken === validRefresh) {
        validRefresh = 'refresh-2';
        await new Promise((r) => setTimeout(r, 20)); // keep it in flight so concurrent callers overlap
        return json(tokens(2));
      }
      return problem(401, 'Invalid refresh token');
    }
    if (req.headers.get('Authorization') !== 'Bearer access-2') return problem(401, 'Unauthenticated');
    if (path === '/v1/notes' && req.method === 'POST') return json({ id: 'n1', title: 'x', body: '', createdAt: new Date().toISOString() }, 201);
    return json({ items: [] });
  });
  return net;
}

describe('auth middleware', () => {
  it('attaches the bearer token', async () => {
    const net = fakeNetwork(() => json({ items: [] }));
    const { api } = await setup(session(2));
    await api.GET('/v1/notes');
    expect(net.calls[0]?.auth).toBe('Bearer access-2');
  });

  it('sends no Authorization header when signed out', async () => {
    const net = fakeNetwork(() => json({ items: [] }));
    const { api } = await setup();
    await api.GET('/v1/notes');
    expect(net.calls[0]?.auth).toBeNull();
  });

  it('refreshes once on 401, stores the rotated pair, and retries with the new token', async () => {
    const net = expiringServer();
    const { api, store, storage } = await setup(session(1));

    const { data } = await api.GET('/v1/notes');

    expect(data).toEqual({ items: [] });
    expect(net.count('POST', '/v1/auth/token')).toBe(1);
    expect(net.calls.filter((c) => c.path === '/v1/notes').map((c) => c.auth)).toEqual(['Bearer access-1', 'Bearer access-2']);
    expect(net.calls.find((c) => c.path === '/v1/auth/token')?.body).toEqual({ grantType: 'refresh_token', refreshToken: 'refresh-1' });
    expect(store.getState()).toMatchObject({ status: 'signedIn', session: { accessToken: 'access-2', refreshToken: 'refresh-2' } });
    expect(JSON.parse(storage.data.get('session.v1') ?? '{}')).toMatchObject({ refreshToken: 'refresh-2' });
  });

  it('replays a POST body on the retry', async () => {
    const net = expiringServer();
    const { api } = await setup(session(1));

    const { data } = await api.POST('/v1/notes', { body: { title: 'Buy milk' } });

    expect(data?.id).toBe('n1');
    const posts = net.calls.filter((c) => c.method === 'POST' && c.path === '/v1/notes');
    expect(posts).toHaveLength(2);
    expect(posts.map((c) => c.body)).toEqual([{ title: 'Buy milk' }, { title: 'Buy milk' }]);
  });

  it('is single-flight: concurrent 401s share one refresh and every request is retried', async () => {
    const net = expiringServer();
    const { api, store } = await setup(session(1));

    const results = await Promise.all([api.GET('/v1/notes'), api.GET('/v1/notes'), api.GET('/v1/notes'), api.GET('/v1/auth/me')]);

    expect(results.every((r) => r.response.ok)).toBe(true);
    expect(net.count('POST', '/v1/auth/token')).toBe(1); // a second refresh would spend the already-rotated refresh-1 and sign the user out
    expect(store.getState().status).toBe('signedIn');
    expect(store.getState().session?.refreshToken).toBe('refresh-2');
  });

  it('does not refresh again when another request already rotated the token', async () => {
    const net = expiringServer();
    const { api, clients } = await setup(session(1));
    await clients.refresh(); // someone else refreshed first
    const { response } = await api.GET('/v1/notes'); // uses access-2 from the start
    expect(response.ok).toBe(true);
    expect(net.count('POST', '/v1/auth/token')).toBe(1);
  });

  it('signs out when the refresh is rejected', async () => {
    const net = fakeNetwork((req) => (new URL(req.url).pathname === '/v1/auth/token' ? problem(401, 'Invalid refresh token') : problem(401, 'Unauthenticated')));
    const { api, store, storage } = await setup(session(1));

    const { response } = await api.GET('/v1/notes');

    expect(response.status).toBe(401);
    expect(net.count('POST', '/v1/auth/token')).toBe(1); // no retry loop
    expect(net.count('GET', '/v1/notes')).toBe(1);
    expect(store.getState()).toEqual({ status: 'signedOut', session: null });
    expect(storage.data.has('session.v1')).toBe(false);
  });

  it('keeps the session when the refresh fails for a transient reason', async () => {
    fakeNetwork((req) => (new URL(req.url).pathname === '/v1/auth/token' ? problem(503, 'Unavailable') : problem(401, 'Unauthenticated')));
    const { api, store } = await setup(session(1));

    await expect(api.GET('/v1/notes')).rejects.toMatchObject({ status: 503 });
    expect(store.getState().status).toBe('signedIn');
  });
});
