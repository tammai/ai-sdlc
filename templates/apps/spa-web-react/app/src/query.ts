import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { ApiError } from "@/api/problem";

declare module "@tanstack/react-query" {
  interface Register {
    mutationMeta: { expireOn401?: boolean };
  }
}

/**
 * `onUnauthorized` runs when a query (or a mutation marked `meta.expireOn401`) gets a 401:
 * the cookie expired mid-session. Sign-in/register mutations are not marked, so a wrong password stays on the form.
 */
export function createQueryClient(onUnauthorized: () => void) {
  const is401 = (e: unknown) => e instanceof ApiError && e.status === 401;
  return new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
    queryCache: new QueryCache({ onError: (e) => is401(e) && onUnauthorized() }),
    mutationCache: new MutationCache({
      onError: (e, _vars, _ctx, mutation) => mutation.meta?.expireOn401 && is401(e) && onUnauthorized(),
    }),
  });
}
