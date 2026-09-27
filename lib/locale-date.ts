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
