/**
 * International phone numbers for bookings and quotes.
 *
 * Customers must give the number with a country code (E.164: "+", country
 * code, 8–15 digits in total). Spaces, dashes, dots and parentheses are
 * allowed while typing and stripped here; a leading "00" is the dialling
 * form of "+". A number without a country code is rejected rather than
 * guessed, so drivers and the CRM never get a wrong prefix.
 *
 * Input typed on non-Latin keyboards is folded first: Arabic-Indic,
 * Extended Arabic-Indic (Persian/Urdu), Devanagari and fullwidth digits
 * become 0-9, a fullwidth "＋" becomes "+", Unicode dashes and spaces are
 * separators, and invisible bidi/format marks (pasted RTL text) are dropped.
 *
 * National trunk prefix: "(0)" (as in "+44 (0) 20 ...") is dropped, and a
 * single 0 directly after the country code is dropped for countries where 0
 * is a trunk prefix and never part of the number (see TRUNK_ZERO_CODES).
 * Italy (+39) is NOT one of them: Italian numbers keep their leading 0.
 * Czechia and Slovakia have no trunk prefix, so a 0 after +420 / +421 makes
 * the number invalid and it is rejected, not repaired.
 */

/** E.164: "+" then 8–15 digits, first digit not 0. */
export const E164_RE = /^\+[1-9]\d{7,14}$/

/** Zero code point of each supported non-ASCII decimal digit block. */
const DIGIT_BLOCK_ZEROS = [0x0660, 0x06f0, 0x0966, 0xff10]
const NON_ASCII_DIGIT_RE = /[٠-٩۰-۹०-९０-９]/g

/** Invisible format / bidi marks: ZWSP..RLM, LRE..RLO, isolates, ALM, BOM. */
const INVISIBLE_RE = /[​-‏‪-‮⁦-⁩؜﻿]/g

/** Hyphen, non-breaking hyphen, figure/en/em dashes, horizontal bar, minus sign, small/fullwidth hyphen-minus. */
const UNICODE_DASH_RE = /[‐-―−﹘﹣－]/g

/**
 * Country codes whose national numbers are dialled with a trunk "0" that is
 * not part of the international number (+44 020 ... -> +44 20 ...).
 */
const TRUNK_ZERO_CODES = ['44', '49', '43', '41', '31', '32', '33', '36', '48']

/** Country codes with no trunk prefix at all: a 0 after the code is an error. */
const NO_TRUNK_CODES = ['420', '421']

function foldDigit(ch: string): string {
  const cp = ch.codePointAt(0) as number
  const zero = Math.max(...DIGIT_BLOCK_ZEROS.filter((z) => z <= cp))
  return String(cp - zero)
}

/** Folds Unicode digits, plus, dashes and brackets to their ASCII form. */
function foldUnicode(input: string): string {
  return input
    .replace(INVISIBLE_RE, '')
    .replace(NON_ASCII_DIGIT_RE, foldDigit)
    .replace(/＋/g, '+')
    .replace(/（/g, '(')
    .replace(/）/g, ')')
    .replace(/．/g, '.')
    .replace(UNICODE_DASH_RE, '-')
}

/**
 * Returns the number in E.164 form, or null when it has no country code or
 * is not a plausible international number.
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null
  // "(0)" is the optional trunk digit written in brackets; drop it before the
  // brackets themselves are stripped, otherwise the 0 would stay in the number.
  let s = foldUnicode(raw.trim())
    .replace(/\(\s*0\s*\)/g, '')
    .replace(/[\s\-.()]/g, '')
  if (s.startsWith('00')) s = `+${s.slice(2)}`
  if (!s.startsWith('+')) return null

  const digits = s.slice(1)
  if (NO_TRUNK_CODES.some((cc) => digits.startsWith(`${cc}0`))) return null
  const trunkCode = TRUNK_ZERO_CODES.find((cc) => digits.startsWith(`${cc}0`))
  if (trunkCode) s = `+${trunkCode}${digits.slice(trunkCode.length + 1)}`

  return E164_RE.test(s) ? s : null
}

export function isValidIntlPhone(raw: string | null | undefined): boolean {
  return normalizePhone(raw) !== null
}

/** Placeholder shown in phone inputs (same in every locale). */
export const PHONE_PLACEHOLDER = '+420 123 456 789'
