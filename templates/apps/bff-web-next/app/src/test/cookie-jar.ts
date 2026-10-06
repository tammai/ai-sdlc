/** In-memory stand-in for next/headers `cookies()`: persists across requests like a browser cookie jar. */
interface Stored {
  name: string
  value: string
  options?: Record<string, unknown>
}

const jar = new Map<string, Stored>()

export const cookieJar = {
  get: (name: string) => jar.get(name),
  getAll: () => [...jar.values()],
  set: (name: string, value: string, options?: Record<string, unknown>) => {
    // iron-session destroys a session by writing an expired / zero-age cookie.
    if (options?.maxAge === 0 || value === '') jar.delete(name)
    else jar.set(name, { name, value, options })
    return cookieJar
  },
  /** Test helpers */
  clear: () => jar.clear(),
  stored: (name: string) => jar.get(name)
}
