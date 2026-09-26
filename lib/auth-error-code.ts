/**
 * D-07: maps a Supabase GoTrue AuthError.code to a stable catalog key under
 * `Errors.auth` (messages/*.json) so the UI never interpolates the raw
 * English GoTrue error message into a localized page. Unknown, missing, or
 * empty codes fall back to 'generic'.
 *
 * See lib.supabase.com/reference/auth-js AuthError.code and
 * @supabase/auth-js's error-codes.ts for the canonical GoTrue error code
 * vocabulary this maps a subset of.
 */
export type AuthErrorKey =
  | 'userExists'
  | 'weakPassword'
  | 'emailRateLimited'
  | 'invalidEmail'
  | 'signupDisabled'
  | 'sessionExpired'
  | 'generic'

export function authErrorKey(code: string | undefined): AuthErrorKey {
  switch (code) {
    case 'user_already_exists':
      return 'userExists'
    case 'weak_password':
      return 'weakPassword'
    case 'over_email_send_rate_limit':
      return 'emailRateLimited'
    case 'email_address_invalid':
      return 'invalidEmail'
    case 'signup_disabled':
      return 'signupDisabled'
    case 'session_expired':
    case 'refresh_token_not_found':
      return 'sessionExpired'
    default:
      return 'generic'
  }
}
