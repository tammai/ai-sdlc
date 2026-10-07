import { Link, Outlet, useRouter } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { LoaderCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useMe, useSignOut } from "@/queries/auth";

/** Signed-in shell: header with the user and Sign out, content column. */
export function AppLayout() {
  const router = useRouter();
  const me = useMe();
  const signOut = useSignOut();

  return (
    <div className="min-h-dvh">
      <header className="border-b">
        <div className="mx-auto flex h-14 max-w-2xl items-center justify-between px-4">
          <Link to="/" className="font-semibold">
            __APP_TITLE__
          </Link>
          {me.data ? (
            <div className="flex items-center gap-3">
              <span className="hidden text-sm text-muted-foreground sm:inline">{me.data.email}</span>
              <Button
                variant="ghost"
                disabled={signOut.isPending}
                onClick={() => signOut.mutate(undefined, { onSuccess: () => router.history.push("/login") })}
              >
                {signOut.isPending ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : null}
                Sign out
              </Button>
            </div>
          ) : null}
        </div>
      </header>
      <main className="mx-auto max-w-2xl space-y-8 px-4 py-8">
        {signOut.error ? (
          <Alert variant="destructive">
            <AlertDescription>{signOut.error.message}</AlertDescription>
          </Alert>
        ) : null}
        <Outlet />
      </main>
    </div>
  );
}

/** Narrow centered shell for sign-in, register and the magic-link landing page. */
export function AuthLayout({ children }: { children?: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-6 px-4 py-8">
      <p className="text-sm font-semibold text-muted-foreground">__APP_TITLE__</p>
      {children ?? <Outlet />}
    </main>
  );
}
