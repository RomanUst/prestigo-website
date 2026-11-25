/**
 * Country calling codes for the phone field's country picker.
 *
 * The customer picks a country and types the national number; composePhone()
 * turns the pair into the E.164 string the forms and the server already
 * validate (lib/phone.ts). A national trunk prefix ("07700 ..." in the UK,
 * "8 916 ..." in Russia, "06 30 ..." in Hungary) is dropped, so people can
 * type the number the way they know it.
 *
 * Country names are not stored here: the picker gets them from
 * Intl.DisplayNames in the page's language.
 */

import { normalizePhone } from '@/lib/phone'

/** ISO 3166-1 alpha-2 code -> calling code (digits, no "+"). NANP countries all use "1". */
export const DIAL_CODES: Readonly<Record<string, string>> = {
  AD: '376', AE: '971', AF: '93', AG: '1', AI: '1', AL: '355', AM: '374', AO: '244', AR: '54',
  AS: '1', AT: '43', AU: '61', AW: '297', AZ: '994', BA: '387', BB: '1', BD: '880', BE: '32',
  BF: '226', BG: '359', BH: '973', BI: '257', BJ: '229', BM: '1', BN: '673', BO: '591', BR: '55',
  BS: '1', BT: '975', BW: '267', BY: '375', BZ: '501', CA: '1', CD: '243', CF: '236', CG: '242',
  CH: '41', CI: '225', CK: '682', CL: '56', CM: '237', CN: '86', CO: '57', CR: '506', CU: '53',
  CV: '238', CW: '599', CY: '357', CZ: '420', DE: '49', DJ: '253', DK: '45', DM: '1', DO: '1',
  DZ: '213', EC: '593', EE: '372', EG: '20', ER: '291', ES: '34', ET: '251', FI: '358', FJ: '679',
  FK: '500', FM: '691', FO: '298', FR: '33', GA: '241', GB: '44', GD: '1', GE: '995', GF: '594',
  GG: '44', GH: '233', GI: '350', GL: '299', GM: '220', GN: '224', GP: '590', GQ: '240', GR: '30',
  GT: '502', GU: '1', GW: '245', GY: '592', HK: '852', HN: '504', HR: '385', HT: '509', HU: '36',
  ID: '62', IE: '353', IL: '972', IM: '44', IN: '91', IQ: '964', IR: '98', IS: '354', IT: '39',
  JE: '44', JM: '1', JO: '962', JP: '81', KE: '254', KG: '996', KH: '855', KI: '686', KM: '269',
  KN: '1', KR: '82', KW: '965', KY: '1', KZ: '7', LA: '856', LB: '961', LC: '1', LI: '423',
  LK: '94', LR: '231', LS: '266', LT: '370', LU: '352', LV: '371', LY: '218', MA: '212', MC: '377',
  MD: '373', ME: '382', MG: '261', MH: '692', MK: '389', ML: '223', MM: '95', MN: '976', MO: '853',
  MP: '1', MQ: '596', MR: '222', MS: '1', MT: '356', MU: '230', MV: '960', MW: '265', MX: '52',
  MY: '60', MZ: '258', NA: '264', NC: '687', NE: '227', NG: '234', NI: '505', NL: '31', NO: '47',
  NP: '977', NR: '674', NU: '683', NZ: '64', OM: '968', PA: '507', PE: '51', PF: '689', PG: '675',
  PH: '63', PK: '92', PL: '48', PM: '508', PR: '1', PS: '970', PT: '351', PW: '680', PY: '595',
  QA: '974', RE: '262', RO: '40', RS: '381', RU: '7', RW: '250', SA: '966', SB: '677', SC: '248',
  SD: '249', SE: '46', SG: '65', SH: '290', SI: '386', SK: '421', SL: '232', SM: '378', SN: '221',
  SO: '252', SR: '597', SS: '211', ST: '239', SV: '503', SX: '1', SY: '963', SZ: '268', TC: '1',
  TD: '235', TG: '228', TH: '66', TJ: '992', TL: '670', TM: '993', TN: '216', TO: '676', TR: '90',
  TT: '1', TV: '688', TW: '886', TZ: '255', UA: '380', UG: '256', US: '1', UY: '598', UZ: '998',
  VA: '379', VC: '1', VE: '58', VG: '1', VI: '1', VN: '84', VU: '678', WF: '681', WS: '685',
  XK: '383', YE: '967', ZA: '27', ZM: '260', ZW: '263',
}

/** The country a shared calling code stands for when only the number is known. */
const PRIMARY_BY_DIAL: Readonly<Record<string, string>> = {
  '1': 'US', '7': 'RU', '44': 'GB', '590': 'GP', '599': 'CW',
}

/** Shown first in the picker: Czechia and the countries most of our guests come from. */
export const POPULAR_COUNTRIES = ['CZ', 'GB', 'US', 'DE', 'AT', 'FR', 'IT', 'ES', 'NL', 'IL', 'AE', 'IN', 'CN'] as const

export const DEFAULT_COUNTRY = 'CZ'

/** Countries where the leading 0 is part of the international number and must be kept. */
const KEEP_LEADING_ZERO = new Set(['IT', 'SM', 'VA', 'CI'])

/** Longest calling codes first, so "+420" is not read as "+42…". */
const DIALS_LONGEST_FIRST = [...new Set(Object.values(DIAL_CODES))].sort((a, b) => b.length - a.length)

export function isKnownCountry(iso: string | null | undefined): iso is string {
  return typeof iso === 'string' && iso in DIAL_CODES
}

/** Regional-indicator flag emoji for an ISO code ("GB" -> 🇬🇧). */
export function flagEmoji(iso: string): string {
  return String.fromCodePoint(...[...iso.toUpperCase()].map((c) => 0x1f1a5 + c.charCodeAt(0)))
}

/** Digits only (ASCII); keeps nothing else. */
function digitsOf(s: string): string {
  return s.replace(/\D/g, '')
}

/**
 * Drops the national trunk prefix the way people write their own number at
 * home: a leading 0 almost everywhere, "8" before an 11-digit Russian or
 * Kazakh number, "06" in Hungary, "80" in Belarus.
 */
function stripTrunk(iso: string, digits: string): string {
  if (iso === 'RU' || iso === 'KZ') {
    if (digits.length === 11 && digits.startsWith('8')) return digits.slice(1)
    if (digits.length === 11 && digits.startsWith('7')) return digits.slice(1)
  }
  if (iso === 'HU' && digits.startsWith('06')) return digits.slice(2)
  if (iso === 'BY' && digits.startsWith('80')) return digits.slice(2)
  if (KEEP_LEADING_ZERO.has(iso)) return digits
  return digits.replace(/^0+/, '')
}

/**
 * The value the form stores for a country + national number: E.164 when it
 * forms a plausible number, otherwise "+<code><digits>" (which the form's
 * validation then rejects), or "" when nothing was typed.
 */
export function composePhone(iso: string, national: string): string {
  const dial = DIAL_CODES[iso] ?? DIAL_CODES[DEFAULT_COUNTRY]
  const digits = stripTrunk(iso, digitsOf(national))
  if (!digits) return ''
  const raw = `+${dial}${digits}`
  return normalizePhone(raw) ?? raw
}

/**
 * Splits a full international number ("+44 7700 900123", "0044…") into a
 * country and the national part. `preferred` keeps the customer's choice when
 * several countries share the code (Jersey and the UK, Canada and the US).
 * Returns null when the value has no country code.
 */
export function splitPhone(value: string, preferred?: string): { iso: string; national: string } | null {
  let s = value.trim().replace(/[\s\-.()]/g, '')
  if (s.startsWith('00')) s = `+${s.slice(2)}`
  if (!s.startsWith('+')) return null
  const digits = digitsOf(s)
  const dial = DIALS_LONGEST_FIRST.find((d) => digits.startsWith(d))
  if (!dial) return null
  const iso =
    preferred && DIAL_CODES[preferred] === dial
      ? preferred
      : PRIMARY_BY_DIAL[dial] ?? Object.keys(DIAL_CODES).find((k) => DIAL_CODES[k] === dial)!
  return { iso, national: digits.slice(dial.length) }
}

/** Country from the browser's languages ("en-GB" -> "GB"), or null. */
export function guessCountry(languages: readonly string[] | undefined): string | null {
  for (const tag of languages ?? []) {
    const region = tag.split('-').find((part, i) => i > 0 && /^[A-Za-z]{2}$/.test(part))?.toUpperCase()
    if (isKnownCountry(region)) return region
  }
  return null
}
