// Mirrors NewNote in contracts/openapi.yaml: title 1–200 chars, body ≤ 10000.
export const TITLE_MAX = 200;
export const BODY_MAX = 10000;

export function validateTitle(title: string): string | null {
  const t = title.trim();
  if (t.length < 1) return 'Enter a title.';
  if (t.length > TITLE_MAX) return `Keep the title under ${TITLE_MAX} characters (now ${t.length}).`;
  return null;
}

export function validateBody(body: string): string | null {
  return body.length > BODY_MAX ? `Keep the body under ${BODY_MAX} characters.` : null;
}
