import type { QueryClient } from "@tanstack/react-query";
import type { RouterHistory } from "@tanstack/react-router";
import { loginSearch } from "@/lib/redirect";
import { meKey } from "@/queries/auth";
import { createQueryClient } from "@/query";
import { createAppRouter } from "@/router";

/** Builds the router and query client together. main.tsx mounts them; tests pass a memory history. */
export function createAppInstance(history?: RouterHistory) {
  const queryClient: QueryClient = createQueryClient(() => {
    // The cookie expired mid-session: forget the user and go to sign-in, then come back here.
    queryClient.setQueryData(meKey, null);
    void router.navigate({ to: "/login", search: loginSearch(router.state.location.href) });
  });
  const router = createAppRouter(queryClient, history);
  return { router, queryClient };
}
