import type { components } from '@/api/schema';

type Problem = components['schemas']['Problem'];

// RFC 9457 problem details from the API, or a plain failure (unparsable body, bare status).
export class ApiError extends Error {
  readonly status: number;
  readonly detail?: string;

  constructor(status: number, title: string, detail?: string) {
    super(title);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
  }
}

// The native OIDC redirect carried ?error=<code> instead of ?code= (OAuth error codes, or server_error).
export class OidcError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(`OIDC sign-in failed: ${code}`);
    this.name = 'OidcError';
    this.code = code;
  }
}

function isProblem(v: unknown): v is Problem {
  return typeof v === 'object' && v !== null && typeof (v as Problem).title === 'string';
}

export function toApiError(status: number, body: unknown): ApiError {
  if (isProblem(body)) return new ApiError(status, body.title, body.detail);
  return new ApiError(status, `Request failed (${status})`);
}

// User-facing sentence: what happened + what to do. Never a raw status code alone.
export function describeError(error: unknown, fallback: string): string {
  if (error instanceof OidcError) {
    switch (error.code) {
      case 'access_denied':
        return 'Sign-in was cancelled. Try again when you are ready.';
      case 'server_error':
        return 'The sign-in provider had a problem. Try again in a moment.';
      case 'invalid_request':
        return 'The sign-in request was not valid. Try again, or use another sign-in method.';
      default:
        return 'Sign-in did not complete. Try again.';
    }
  }
  if (error instanceof ApiError) {
    if (error.status === 403) return error.detail ?? 'That is not allowed right now.';
    if (error.status === 409) return 'An account with that email already exists. Sign in instead.';
    if (error.status === 401) return 'Your email or password is incorrect, or your session expired.';
    if (error.status === 429) return 'Too many attempts. Wait a minute and try again.';
    if (error.status === 422 && error.detail) return error.detail;
    if (error.status >= 500) return `${fallback} The server had a problem. Try again in a moment.`;
    return error.detail ?? `${fallback} Try again.`;
  }
  return `${fallback} Check your connection and try again.`;
}
