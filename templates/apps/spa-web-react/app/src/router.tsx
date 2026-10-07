import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, createRoute, createRouter, Outlet, redirect } from "@tanstack/react-router";
import type { RouterHistory } from "@tanstack/react-router";
import { AppLayout, AuthLayout } from "@/layouts";
import { loginSearch, safeRedirect } from "@/lib/redirect";
import { ErrorPage } from "@/pages/error";
import { LoginPage } from "@/pages/login";
import { MagicLinkPage } from "@/pages/magic";
import { NotFoundPage } from "@/pages/not-found";
import { NotesPage } from "@/pages/notes";
import { RegisterPage } from "@/pages/register";
import { fetchMe, meKey } from "@/queries/auth";

// Why TanStack Router (not React Router): typed routes and typed search params (a wrong `to` fails tsc),
// `beforeLoad` guards that can redirect before anything renders, and the same family as TanStack Query
// (the guard reads the cached session straight from the query client). Routes are defined in code, so there is no codegen step.

interface RouterContext {
  queryClient: QueryClient;
}

const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: Outlet,
  notFoundComponent: () => (
    <AuthLayout>
      <NotFoundPage />
    </AuthLayout>
  ),
});

/** The one auth guard: the session comes from GET /v1/auth/me; a 401 means signed out. */
async function currentUser(queryClient: QueryClient, href: string) {
  try {
    return await queryClient.ensureQueryData({ queryKey: meKey, queryFn: fetchMe, staleTime: Infinity });
  } catch {
    // The API could not be reached: that is not the same as being signed out.
    throw redirect({ to: "/error", search: { redirect: href }, replace: true });
  }
}

/** Needs a signed-in user. Unauthenticated visitors (401) go to /login, remembering where they were going. */
const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "app",
  beforeLoad: async ({ context, location }) => {
    const user = await currentUser(context.queryClient, location.href);
    if (!user) throw redirect({ to: "/login", search: loginSearch(location.href) });
  },
  component: AppLayout,
});

/** Sign-in and register: signed-in users are bounced to where they were going. */
const guestRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "guest",
  // `error` is set by the API when an OIDC sign-in fails: /login?error=access_denied
  validateSearch: (search: Record<string, unknown>): { redirect?: string; error?: string } => ({
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
    error: typeof search.error === "string" ? search.error : undefined,
  }),
  beforeLoad: async ({ context, location, search }) => {
    // If the API is unreachable, let the page render its own error state.
    const user = await currentUser(context.queryClient, location.href).catch(() => null);
    if (user) throw redirect({ href: safeRedirect(search.redirect) });
  },
  component: AuthLayout,
});

/** Public pages in the narrow layout (magic-link landing, API-unreachable). */
const publicRoute = createRoute({ getParentRoute: () => rootRoute, id: "public", component: AuthLayout });

const notesRoute = createRoute({ getParentRoute: () => appRoute, path: "/", component: NotesPage });
const loginRoute = createRoute({ getParentRoute: () => guestRoute, path: "/login", component: LoginPage });
const registerRoute = createRoute({ getParentRoute: () => guestRoute, path: "/register", component: RegisterPage });
const magicRoute = createRoute({
  getParentRoute: () => publicRoute,
  path: "/auth/magic",
  validateSearch: (search: Record<string, unknown>): { token?: string; redirect?: string } => ({
    token: typeof search.token === "string" ? search.token : undefined,
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
  }),
  component: MagicLinkPage,
});
const errorRoute = createRoute({
  getParentRoute: () => publicRoute,
  path: "/error",
  validateSearch: (search: Record<string, unknown>): { redirect?: string } => ({
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
  }),
  component: ErrorPage,
});

const routeTree = rootRoute.addChildren([
  appRoute.addChildren([notesRoute]),
  guestRoute.addChildren([loginRoute, registerRoute]),
  publicRoute.addChildren([magicRoute, errorRoute]),
]);

export function createAppRouter(queryClient: QueryClient, history?: RouterHistory) {
  return createRouter({ routeTree, history, context: { queryClient } });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
