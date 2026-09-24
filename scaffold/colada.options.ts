// Pinia Colada settings for every query. Engineer-owned.
import type { PiniaColadaOptions } from '@pinia/colada'

export default {
  queryOptions: {
    // A query that fails during server rendering (e.g. 401/403 for someone not allowed) goes
    // into the page's `error`, so the page shows its own friendly message. Without this the
    // whole page is replaced by an error screen.
    ssrCatchError: true,
  },
} satisfies PiniaColadaOptions
