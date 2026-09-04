/**
 * next-intl request config.
 *
 * Resolves the active locale for each request and loads its message
 * catalog from messages/${locale}.json. Phase 69 (STR-01) ships real
 * catalogs: messages/en.json is the source of truth, and the 6 other
 * configured locales (ru/es/fr/ar/hi/zh) ship as byte-identical EN-copy
 * stub files until Phase 72/73 translate them (RESEARCH.md Open Question
 * #1, Option a). Every resolved `locale` is guaranteed to be one of the 7
 * configured codes (hasLocale falls back to defaultLocale otherwise), so
 * a matching messages/${locale}.json file always exists — no try/catch
 * fallback needed.
 */
import { getRequestConfig } from 'next-intl/server'
import { hasLocale } from 'next-intl'
import { routing } from './routing'

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  }
})
