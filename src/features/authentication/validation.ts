/**
 * Sign-in form rules and plain-language error messages. Pure, so they can be unit-tested.
 * Supabase enforces its own limits server-side; these give faster, friendlier feedback.
 */

export const PASSWORD_MIN_LENGTH = 8;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function emailIssue(email: string): string | null {
  if (email.trim() === '') return 'Enter your email address.';
  return EMAIL.test(email.trim()) ? null : 'That doesn’t look like an email address.';
}

export function newPasswordIssue(password: string, confirm: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) return `Use at least ${PASSWORD_MIN_LENGTH} characters.`;
  if (password !== confirm) return 'The two passwords don’t match.';
  return null;
}

/** Turns a Supabase Auth error into a message a player can act on. */
export function authErrorMessage(error: { code?: string | undefined; message?: string; status?: number | undefined } | null | undefined): string {
  if (!error) return 'Something went wrong. Please try again.';
  switch (error.code) {
    case 'invalid_credentials':
      return 'That email and password don’t match an account.';
    case 'email_not_confirmed':
      return 'Please confirm your email first: open the link we sent you, then sign in.';
    case 'user_already_exists':
    case 'email_exists':
      return 'An account with that email already exists. Try signing in instead.';
    case 'weak_password':
      return 'That password is too easy to guess. Try a longer one.';
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit':
      return 'Too many attempts. Please wait a few minutes and try again.';
    case 'email_address_invalid':
      return 'That email address can’t be used. Check it for typos.';
    case 'same_password':
      return 'Choose a password different from your current one.';
    case 'signup_disabled':
      return 'New accounts are not open right now.';
  }
  if (error.status === 0 || /fetch|network/i.test(error.message ?? '')) {
    return 'Couldn’t reach the server. Check your internet connection and try again.';
  }
  return 'Something went wrong. Please try again.';
}
