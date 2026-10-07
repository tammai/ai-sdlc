// Mirrors RegisterRequest in contracts/openapi.yaml.
export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 1024;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmail(email: string): string | null {
  return EMAIL.test(email.trim()) ? null : 'Enter a valid email address, like name@example.com.';
}

export function validateNewPassword(password: string): string | null {
  if (password.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters (now ${password.length}).`;
  if (password.length > PASSWORD_MAX) return `Use at most ${PASSWORD_MAX} characters.`;
  return null;
}
