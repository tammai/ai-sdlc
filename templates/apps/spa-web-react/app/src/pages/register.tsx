import { Link, useRouter, useSearch } from "@tanstack/react-router";
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
import { useProviders, useRegister } from "@/queries/auth";

// Mirrors RegisterRequest in contracts/openapi.yaml; the API validates again.
const schema = z.object({
  name: z.string().trim().max(200, "Use 200 characters or fewer"),
  email: z.email("Enter a valid email address, like name@example.com"),
  password: z.string().min(12, "Use at least 12 characters").max(1024, "Use 1024 characters or fewer"),
});

function RegisterForm({ redirect }: { redirect: string }) {
  const router = useRouter();
  const register = useRegister();
  const form = useZodForm(schema, "register");
  const [values, setValues] = useState({ name: "", email: "", password: "" });

  function change(next: Partial<typeof values>) {
    const merged = { ...values, ...next };
    setValues(merged);
    form.revalidate(merged);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const data = form.validate(values);
    if (!data) return;
    register.mutate(
      { email: data.email, password: data.password, ...(data.name ? { name: data.name } : {}) },
      { onSuccess: () => router.history.push(redirect) },
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <Field id="register-name" label="Name" hint="Optional." error={form.errors.name}>
        <Input
          {...fieldProps("register-name", { hint: "Optional.", error: form.errors.name })}
          autoComplete="name"
          value={values.name}
          onChange={(e) => change({ name: e.target.value })}
        />
      </Field>
      <Field id="register-email" label="Email" error={form.errors.email}>
        <Input
          {...fieldProps("register-email", { error: form.errors.email })}
          type="email"
          autoComplete="email"
          value={values.email}
          onChange={(e) => change({ email: e.target.value })}
        />
      </Field>
      <Field id="register-password" label="Password" hint="Use at least 12 characters." error={form.errors.password}>
        <Input
          {...fieldProps("register-password", { hint: "Use at least 12 characters.", error: form.errors.password })}
          type="password"
          autoComplete="new-password"
          value={values.password}
          onChange={(e) => change({ password: e.target.value })}
        />
      </Field>
      {register.error ? (
        <Alert variant="destructive">
          <AlertTitle>Couldn't create your account</AlertTitle>
          <AlertDescription>{register.error.message}</AlertDescription>
        </Alert>
      ) : null}
      <Button type="submit" className="w-full" disabled={register.isPending}>
        {register.isPending ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : null}
        Create account
      </Button>
    </form>
  );
}

export function RegisterPage() {
  useTitle("Create account");
  const search = useSearch({ strict: false }) as { redirect?: string };
  const redirect = safeRedirect(search.redirect);
  const providers = useProviders();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-balance">Create your account</h1>

      {providers.isPending ? (
        <div data-testid="providers-loading" aria-busy="true" className="space-y-3">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      ) : providers.isError ? (
        <Alert variant="destructive" data-testid="providers-error">
          <AlertTitle>Couldn't load the sign-up options</AlertTitle>
          <AlertDescription>The server didn't respond. Check your connection, then try again.</AlertDescription>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => void providers.refetch()}>
            Try again
          </Button>
        </Alert>
      ) : !providers.data.registration ? (
        <p data-testid="registration-closed" className="text-muted-foreground">
          Registration is closed. Ask an administrator for an account.
        </p>
      ) : (
        <RegisterForm redirect={redirect} />
      )}

      <p className="text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link to="/login" search={search.redirect ? { redirect: search.redirect } : {}} className="font-medium text-primary underline-offset-4 hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
