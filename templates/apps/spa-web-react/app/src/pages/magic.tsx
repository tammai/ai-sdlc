import { Link, useNavigate, useRouter, useSearch } from "@tanstack/react-router";
import { LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { safeRedirect } from "@/lib/redirect";
import { useTitle } from "@/lib/use-title";
import { useVerifyMagicLink } from "@/queries/auth";

// Landing page for the emailed link: /auth/magic?token=…  The token is posted to the API, then removed from the URL.
export function MagicLinkPage() {
  useTitle("Signing you in");
  const router = useRouter();
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { token?: string; redirect?: string };
  const verify = useVerifyMagicLink();
  // The token is single-use: post it exactly once, even when React StrictMode re-runs effects in development.
  const started = useRef(false);
  const [token] = useState(() => search.token ?? "");
  const [redirect] = useState(() => safeRedirect(search.redirect));
  const incomplete = token.length < 16;

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void navigate({ to: "/auth/magic", search: {}, replace: true });
    if (incomplete) return;
    verify.mutate(token, { onSuccess: () => router.history.replace(redirect) });
  }, [incomplete, navigate, router, token, redirect, verify]);

  if (incomplete || verify.isError) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold text-balance">Couldn't sign you in</h1>
        <Alert variant="destructive">
          <AlertTitle>This link didn't work</AlertTitle>
          <AlertDescription>{incomplete ? "This sign-in link is incomplete. Request a new one." : verify.error?.message}</AlertDescription>
        </Alert>
        <Button asChild className="w-full">
          <Link to="/login">Request a new link</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-balance">Signing you in</h1>
      <p role="status" data-testid="magic-verifying" className="flex items-center gap-2 text-muted-foreground">
        <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
        Checking your link…
      </p>
    </div>
  );
}
