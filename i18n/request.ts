/**
 * next-intl request config — Phase 68 stub.
 *
 * Resolves the active locale for each request. `messages` is an empty
 * object because zero useTranslations/getTranslations call sites exist
 * anywhere in the codebase yet — message catalogs start in Phase 69
 * (STR-01). If a component calls a next-intl hook before then it will
 * throw at render; the Phase 68 verification smoke-tests /ru/ to catch
 * this early (RESEARCH.md Assumption A3).
 */
import { getRequestConfig } from 'next-intl/server'
import { hasLocale } from 'next-intl'
import { routing } from './routing'

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale

  return {
    locale,
    messages: {},
  }
})
