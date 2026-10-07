/** Only app-relative paths are allowed as post-login targets (no open redirects). */
export function safeRedirect(value: unknown, fallback = "/"): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  return value;
}

/** Search params for /login that remember where the visitor was going (nothing for the home page). */
export function loginSearch(intended: string): { redirect?: string } {
  const target = safeRedirect(intended);
  return target === "/" ? {} : { redirect: target };
}
