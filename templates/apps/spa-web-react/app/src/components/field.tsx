import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";

interface FieldProps {
  id: string;
  label: string;
  /** Shown above the control (hints before fields). */
  hint?: string;
  error?: string;
  children: ReactNode;
}

/** Visible label, optional hint above, control, then the error tied to the control via aria-describedby. */
export function Field({ id, label, hint, error, children }: FieldProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {hint ? (
        <p id={`${id}-hint`} className="text-sm text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
