/**
 * lib/locale-date.ts — visible post / card dates in the page locale's own
 * format (Phase 75, Plan 34 — WR-04).
 *
 * - `en` (and any value that is not a site locale) uses the `en-GB` tag, so
 *   EN output stays byte-identical to the historical byline date
 *   ("9 April 2026", lib/authors `formatBylineDate`).
 * - Every other locale uses its BCP-47 tag with the `-u-nu-latn` extension,
 *   which pins Latin digits regardless of the runtime ICU's default numbering
 *   system (ar would otherwise get Arabic-Indic digits) — consistent with the
 *   site-wide DNT digit convention for prices / phones / times (Phase 73).
 *   zh keeps its native Y年M月D日 order.
 *
 * Always formats in UTC so an ISO date never shifts by a day with the
 * server's timezone. Imports only '@/i18n/locales' (no next-intl, no React)
 * so it is safe from server components, tests and plain scripts alike.
 */
import { BCP47_TAG, locales, type AppLocale } from '@/i18n/locales'

const OPTIONS: Intl.DateTimeFormatOptions = {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
}

function tagFor(locale: string): string {
  if (locale === 'en' || !(locales as readonly string[]).includes(locale)) return 'en-GB'
  return `${BCP47_TAG[locale as AppLocale]}-u-nu-latn`
}

/** Format an ISO date (YYYY-MM-DD) as a long, human-readable date for `locale`. */
export function formatLocaleDate(iso: string, locale: string): string {
  const d = new Date(`${iso}T00:00:00Z`)
  return new Intl.DateTimeFormat(tagFor(locale), OPTIONS).format(d)
}

const DATE_TIME_OPTIONS: Intl.DateTimeFormatOptions = {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: 'Europe/Prague',
}

/**
 * The Prague time-zone label, in each site language. It is appended to every date-and-time this module formats, because a
 * deadline such as "free cancellation until 14:30" is read by clients in other time zones (Phase 89 review WR-04).
 * The text lands in the stored cancellation consent too (the string is hashed), so any change to a label must come with
 * a CARD_CONSENT_VERSION bump: tests/payments-consent.test.ts pins this map to the version.
 */
export const PRAGUE_TIME_LABEL: Record<AppLocale, string> = {
  en: 'Prague time',
  ru: 'по пражскому времени',
  es: 'hora de Praga',
  fr: 'heure de Prague',
  ar: 'بتوقيت براغ',
  hi: 'प्राग का समय',
  zh: '布拉格时间',
  'zh-hant': '布拉格時間',
}

function pragueLabelFor(locale: string): string {
  return PRAGUE_TIME_LABEL[(locales as readonly string[]).includes(locale) ? (locale as AppLocale) : 'en']
}

/**
 * Format an instant (epoch ms) as a long date and 24-hour clock time on the Europe/Prague wall clock, in the
 * locale's own format with Latin digits (Phase 89: "free cancellation until ..."), followed by the zone label in the same
 * language: "12 November 2026, 14:30 (Prague time)". An unusable instant gives ''.
 */
export function formatLocaleDateTime(ms: number, locale: string): string {
  if (!Number.isFinite(ms)) return ''
  const formatted = new Intl.DateTimeFormat(tagFor(locale), DATE_TIME_OPTIONS).format(new Date(ms))
  return `${formatted} (${pragueLabelFor(locale)})`
}
