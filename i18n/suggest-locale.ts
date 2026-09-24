import { locales, type AppLocale } from './locales'

/** Base subtag before any hyphen, lowercased — zh-Hans/zh-CN/en-US -> zh/zh/en. */
function baseSubtag(tag: string | undefined | null): string {
  if (!tag) return ''
  return tag.split('-')[0]?.toLowerCase() ?? ''
}

/**
 * Client-only language suggestion (UX-02) from the browser's preference.
 *
 * Deterministic, top-preference-only match: only navigator.languages[0]
 * (falling back to navigator.language, then to no suggestion at all) is
 * ever considered — never a scan through the whole preference list.
 * Returns null when the top preference is the current locale, is not a
 * supported locale, or is unavailable (SSR / missing navigator).
 *
 * Reads navigator only — never headers()/cookies() — so it must be called
 * after hydration (inside useEffect) to keep server HTML identical for
 * every Accept-Language (D-04).
 */
export function detectSuggestedLocale(currentLocale: string): AppLocale | null {
  let top: string | undefined
  if (typeof navigator !== 'undefined') {
    if (Array.isArray(navigator.languages) && navigator.languages.length > 0) {
      top = navigator.languages[0]
    } else if (navigator.language) {
      top = navigator.language
    }
  }

  const base = baseSubtag(top)
  if (!base || base === currentLocale) return null
  if (!(locales as readonly string[]).includes(base)) return null
  return base as AppLocale
}
