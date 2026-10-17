/**
 * International phone numbers for bookings and quotes.
 *
 * Customers must give the number with a country code (E.164: "+", country
 * code, 8–15 digits in total). Spaces, dashes, dots and parentheses are
 * allowed while typing and stripped here; a leading "00" is the dialling
 * form of "+". A number without a country code is rejected rather than
 * guessed, so drivers and the CRM never get a wrong prefix.
 */

/** E.164: "+" then 8–15 digits, first digit not 0. */
export const E164_RE = /^\+[1-9]\d{7,14}$/

/**
 * Returns the number in E.164 form, or null when it has no country code or
 * is not a plausible international number.
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null
  let s = raw.trim().replace(/[\s\-.()]/g, '')
  if (s.startsWith('00')) s = `+${s.slice(2)}`
  return E164_RE.test(s) ? s : null
}

export function isValidIntlPhone(raw: string | null | undefined): boolean {
  return normalizePhone(raw) !== null
}

/** Placeholder shown in phone inputs (same in every locale). */
export const PHONE_PLACEHOLDER = '+420 123 456 789'
