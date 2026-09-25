import { getPathname } from '@/i18n/routing'
import type { AppLocale } from '@/i18n/locales'

/**
 * Locale-aware href wrapper for internal links that are NOT rendered through
 * next-intl's <Link>/useRouter navigation bridge — raw `<a href>` anchors in
 * Server Components, template-literal route links (`/routes/${slug}`), and
 * content-JSON-provided hrefs (`s.href`, `c.href`, `s.bookHref`). Every one
 * of those currently drops the locale prefix because it is a plain string,
 * not routed through next-intl (75-EN-LEAK-AUDIT.md R3).
 *
 * Rule (T-75-23 — never treat a protocol-relative URL as internal):
 * - `href` is treated as an internal, locale-prefixable path ONLY when it
 *   is a string starting with EXACTLY ONE leading slash (`href.startsWith('/')`
 *   and NOT `href.startsWith('//')` — the latter is a protocol-relative URL
 *   and must never be prefixed) AND its last path segment has no file
 *   extension (a dot), which indicates a static asset (image, favicon, etc.)
 *   that next-intl's routing never prefixes.
 * - Everything else — absolute URLs (http/https/wa.me/...), `mailto:`,
 *   `tel:`, hash-only anchors (`#faq`), protocol-relative URLs (`//evil.com`),
 *   static asset paths (`/hero.webp`), and the empty-string/undefined edge
 *   cases — is returned completely unchanged.
 *
 * When the rule matches, the href is resolved through
 * `getPathname({ locale, href })` from `@/i18n/routing` — the single-source
 * locale-aware navigation bridge (I18N-04) — which returns the href
 * unprefixed for the default locale ('en') and prefixed (`/ru/...`) for
 * every other configured locale.
 */
export function localizedHref(
  locale: AppLocale | string,
  href: string | undefined
): string | undefined {
  if (!href) return href
  if (!href.startsWith('/') || href.startsWith('//')) return href

  const lastSegment = href.slice(href.lastIndexOf('/') + 1)
  if (lastSegment.includes('.')) return href

  return getPathname({ locale: locale as AppLocale, href })
}
