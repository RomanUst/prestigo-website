import { describe, it, expect } from 'vitest'
import { authErrorKey } from '@/lib/auth-error-code'

describe('D-07: authErrorKey maps Supabase AuthError.code to a stable catalog key', () => {
  it.each([
    ['user_already_exists', 'userExists'],
    ['weak_password', 'weakPassword'],
    ['over_email_send_rate_limit', 'emailRateLimited'],
    ['email_address_invalid', 'invalidEmail'],
    ['signup_disabled', 'signupDisabled'],
    ['session_expired', 'sessionExpired'],
    ['refresh_token_not_found', 'sessionExpired'],
  ] as const)('authErrorKey(%s) -> %s', (code, expected) => {
    expect(authErrorKey(code)).toBe(expected)
  })

  it.each([
    [undefined, 'generic'],
    ['', 'generic'],
    ['anything_else', 'generic'],
  ] as const)('authErrorKey(%s) -> generic', (code, expected) => {
    expect(authErrorKey(code)).toBe(expected)
  })
})
