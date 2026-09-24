// App-wide data: public settings and who is signed in.

// Settings the browser needs (app type, bot-check site key). Never changes while the app runs.
export function usePublicConfig() {
  const api = useRequestFetch()
  return useQuery({
    key: ['public-config'],
    query: () => api('/api/public-config'),
    staleTime: Infinity,
  })
}

// The signed-in person (Cloudflare Access), or null on a public page nobody signed in to.
export function useCurrentUser() {
  const api = useRequestFetch()
  return useQuery({
    key: ['me'],
    query: () => api('/api/me'),
    staleTime: 5 * 60_000,
  })
}
