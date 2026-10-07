import { useState } from "react";
import type { z } from "zod";

/**
 * Minimal form validation: validate on submit (focusing the first invalid field), then re-validate on every
 * change once something was invalid. Error messages come from the zod schema. Field ids are `${prefix}-${key}`.
 */
export function useZodForm<S extends z.ZodType>(schema: S, prefix: string) {
  const [errors, setErrors] = useState<Record<string, string>>({});

  function run(values: unknown, focus: boolean): z.output<S> | null {
    const result = schema.safeParse(values);
    if (result.success) {
      setErrors({});
      return result.data;
    }
    const next: Record<string, string> = {};
    for (const issue of result.error.issues) next[String(issue.path[0])] ??= issue.message;
    setErrors(next);
    const first = Object.keys(next)[0];
    if (focus && first) document.getElementById(`${prefix}-${first}`)?.focus();
    return null;
  }

  return {
    errors,
    /** On submit: returns parsed data, or null after showing errors and focusing the first invalid field. */
    validate: (values: unknown) => run(values, true),
    /** On change: re-checks only while errors are showing, so typing never nags before a first submit. */
    revalidate: (values: unknown) => {
      if (Object.keys(errors).length) run(values, false);
    },
  };
}
