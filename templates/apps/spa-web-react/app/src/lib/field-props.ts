/** aria wiring for a control inside a <Field>: invalid state and the hint/error ids it is described by. */
export function fieldProps(id: string, { hint, error }: { hint?: string; error?: string }) {
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(" ");
  return { id, "aria-invalid": Boolean(error), "aria-describedby": describedBy || undefined } as const;
}
