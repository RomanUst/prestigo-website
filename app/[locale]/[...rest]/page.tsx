import type { Metadata } from 'next'
import { hasLocale } from 'next-intl'
import { getTranslations } from 'next-intl/server'
import { notFound } from 'next/navigation'
import { locales } from '@/i18n/locales'

// Phase 75-25 (GAP-4a / WINDOWS #22): catch every unmatched path under a
// locale — and every unmatched EN-root path, which next-intl's as-needed
// routing rewrites to /en/<path> — and hand it to the nearest not-found
// boundary, app/[locale]/not-found.tsx, which renders inside LocaleLayout
// (<html lang dir>) with the localized NotFound catalog copy. Without this
// route such paths fell through to the English root app/not-found.tsx.
//
// Invariants (do not change):
//   - REQUIRED catch-all ([...rest]), never optional — an optional one would
//     shadow the locale home page. Static and more specific routes (every
//     existing page, API route, metadata/static file) always win over it.
//   - No static-params export and nothing awaited before notFound(): the
//     throw must happen before any streaming starts, or the status would be
//     locked at 200 (soft-404).

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; rest?: string[] }>
}): Promise<Metadata> {
  // CR-01: locale comes from the route's own dynamic segment, never a bare
  // getLocale(). A non-locale first segment (e.g. `api`) is rejected by
  // LocaleLayout's own hasLocale guard; return no metadata for it here.
  const { locale } = await params
  if (!hasLocale(locales, locale)) return {}
  const t = await getTranslations({ locale, namespace: 'NotFound' })
  return {
    title: { absolute: t('metaTitle') },
    robots: { index: false, follow: false },
  }
}

export default function LocaleCatchAllNotFound(): never {
  notFound()
}
