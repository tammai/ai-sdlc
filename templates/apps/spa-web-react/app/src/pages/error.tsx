import { useRouter, useSearch } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { safeRedirect } from "@/lib/redirect";
import { useTitle } from "@/lib/use-title";

// Shown when the API can't be reached while checking the session (not the same as being signed out).
export function ErrorPage() {
  useTitle("Something went wrong");
  const router = useRouter();
  const search = useSearch({ strict: false }) as { redirect?: string };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-balance">Something went wrong</h1>
      <p role="alert" className="text-muted-foreground">
        Couldn't reach the server. Check your connection, then try again.
      </p>
      <Button onClick={() => router.history.replace(safeRedirect(search.redirect))}>Try again</Button>
    </div>
  );
}
