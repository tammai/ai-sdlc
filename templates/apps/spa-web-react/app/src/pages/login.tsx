import { useRouter, useSearch, Link } from "@tanstack/react-router";
import { LoaderCircle } from "lucide-react";
import { useState } from "react";
import { z } from "zod";
import { Field } from "@/components/field";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { fieldProps } from "@/lib/field-props";
import { safeRedirect } from "@/lib/redirect";
import { useTitle } from "@/lib/use-title";
import { useZodForm } from "@/lib/use-zod-form";
import { useProviders, useRequestMagicLink, useSignIn } from "@/queries/auth";

const emailMessage = "Enter a valid email address, like name@example.com";
const passwordSchema = z.object({ email: z.email(emailMessage), password: z.string().min(1, "Enter your password") });
// The API redirects here with ?error=<code> when an OIDC sign-in fails.
function providerErrorText(code: string) {
  return code === "access_denied"
    ? "Access was denied at the provider. Try again, or use another sign-in method."
    : "Something went wrong while signing in with your provider. Try again, or use another sign-in method.";
}

const linkSchema = z.object({ email: z.email(emailMessage) });

function PasswordForm({ redirect }: { redirect: string }) {
  const router = useRouter();
  const signIn = useSignIn();
  const form = useZodForm(passwordSchema, "login");
  const [values, setValues] = useState({ email: "", password: "" });

  function change(next: Partial<typeof values>) {
    const merged = { ...values, ...next };
    setValues(merged);
    form.revalidate(merged);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const data = form.validate(values);
    if (data) signIn.mutate(data, { onSuccess: () => router.history.push(redirect) });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <Field id="login-email" label="Email" error={form.errors.email}>
        <Input
          {...fieldProps("login-email", { error: form.errors.email })}
          type="email"
          autoComplete="email"
          value={values.email}
          onChange={(e) => change({ email: e.target.value })}
        />
      </Field>
      <Field id="login-password" label="Password" error={form.errors.password}>
        <Input
          {...fieldProps("login-password", { error: form.errors.password })}
          type="password"
          autoComplete="current-password"
          value={values.password}
          onChange={(e) => change({ password: e.target.value })}
        />
      </Field>
      {signIn.error ? (
        <Alert variant="destructive">
          <AlertTitle>Couldn't sign you in</AlertTitle>
          <AlertDescription>{signIn.error.message}</AlertDescription>
        </Alert>
      ) : null}
      <Button type="submit" className="w-full" disabled={signIn.isPending}>
        {signIn.isPending ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : null}
        Sign in
      </Button>
    </form>
  );
}

function MagicLinkForm() {
  const request = useRequestMagicLink();
  const form = useZodForm(linkSchema, "link");
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);

  if (sentTo) {
    return (
      <Alert data-testid="magic-sent" role="status">
        <AlertTitle>Check your inbox</AlertTitle>
        <AlertDescription>If an account exists for {sentTo}, a sign-in link is on its way. It works once and expires soon.</AlertDescription>
      </Alert>
    );
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const data = form.validate({ email });
    if (data) request.mutate(data.email, { onSuccess: () => setSentTo(data.email) });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <Field id="link-email" label="Email me a sign-in link" hint="No password needed." error={form.errors.email}>
        <Input
          {...fieldProps("link-email", { hint: "No password needed.", error: form.errors.email })}
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            form.revalidate({ email: e.target.value });
          }}
        />
      </Field>
      {request.error ? (
        <Alert variant="destructive">
          <AlertTitle>Couldn't send the link</AlertTitle>
          <AlertDescription>{request.error.message}</AlertDescription>
        </Alert>
      ) : null}
      <Button type="submit" variant="outline" className="w-full" disabled={request.isPending}>
        {request.isPending ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : null}
        Send sign-in link
      </Button>
    </form>
  );
}

export function LoginPage() {
  useTitle("Sign in");
  const search = useSearch({ strict: false }) as { redirect?: string; error?: string };
  const redirect = safeRedirect(search.redirect);
  const providers = useProviders();

  // Where the OIDC flow lands afterwards; the API validates it is an app-relative path.
  const oidcHref = (id: string) => `/api/v1/auth/oidc/${encodeURIComponent(id)}/start?redirect=${encodeURIComponent(redirect)}`;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-balance">Sign in</h1>

      {search.error ? (
        <Alert variant="destructive" data-testid="provider-error">
          <AlertTitle>Couldn't sign you in</AlertTitle>
          <AlertDescription>{providerErrorText(search.error)}</AlertDescription>
        </Alert>
      ) : null}

      {providers.isPending ? (
        <div data-testid="providers-loading" aria-busy="true" className="space-y-3">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      ) : providers.isError ? (
        <Alert variant="destructive" data-testid="providers-error">
          <AlertTitle>Couldn't load the sign-in options</AlertTitle>
          <AlertDescription>The server didn't respond. Check your connection, then try again.</AlertDescription>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => void providers.refetch()}>
            Try again
          </Button>
        </Alert>
      ) : (
        <>
          {providers.data.password ? <PasswordForm redirect={redirect} /> : null}

          {providers.data.password && (providers.data.magicLink || providers.data.oidc.length > 0) ? (
            <p className="text-center text-sm text-muted-foreground">or</p>
          ) : null}

          {providers.data.oidc.length > 0 ? (
            <div className="space-y-3">
              {providers.data.oidc.map((p) => (
                <Button key={p.id} asChild variant="outline" className="w-full" data-testid={`oidc-${p.id}`}>
                  <a href={oidcHref(p.id)}>Continue with {p.name}</a>
                </Button>
              ))}
            </div>
          ) : null}

          {providers.data.magicLink ? <MagicLinkForm /> : null}

          {!providers.data.password && !providers.data.magicLink && providers.data.oidc.length === 0 ? (
            <p data-testid="no-methods" className="text-muted-foreground">
              No sign-in methods are enabled for this app. Ask an administrator to turn one on.
            </p>
          ) : null}

          {providers.data.registration ? (
            <p className="text-sm text-muted-foreground">
              New here?{" "}
              <Link to="/register" search={search.redirect ? { redirect: search.redirect } : {}} className="font-medium text-primary underline-offset-4 hover:underline">
                Create an account
              </Link>
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
