import type { Metadata } from 'next'
import { hasLocale } from 'next-intl'
import { getTranslations } from 'next-intl/server'
import { locales, type AppLocale } from '@/i18n/locales'

/**
 * Site-wide default metadata + locale-aware share-metadata helpers.
 *
 * Deliberately free of next/font, CSS and React imports so it can be
 * imported from generateMetadata functions and plain unit tests without
 * pulling in the SiteChrome font/stylesheet graph (Phase 75, Plan 31).
 *
 * `siteMetadata` is the English static default, moved verbatim from
 * components/SiteChrome.tsx (which re-exports it, so app/(internal)/layout.tsx
 * keeps importing it unchanged — /admin and /driver are English-only).
 */
export const siteMetadata: Metadata = {
  metadataBase: new URL('https://rideprestigo.com'),
  title: {
    default: 'PRESTIGO — Premium Chauffeur Service Prague',
    template: '%s | PRESTIGO',
  },
  description:
    'Premium chauffeur service in Prague. Airport transfers, intercity routes, corporate accounts. Fixed prices, flight tracking, meet & greet.',
  keywords: [
    'chauffeur Prague',
    'airport transfer Prague',
    'private driver Prague',
    'luxury transfer Prague',
    'Prague taxi service',
    'executive transfer Prague',
  ],
  authors: [{ name: 'PRESTIGO' }],
  creator: 'PRESTIGO',
  openGraph: {
    type: 'website',
    locale: 'en_US',
    siteName: 'PRESTIGO',
    title: 'PRESTIGO — Premium Chauffeur Service Prague',
    description:
      'Premium chauffeur service in Prague. Airport transfers, intercity routes, corporate accounts. Fixed prices, flight tracking, meet & greet.',
    images: [
      {
        url: '/og-image.jpg',
        width: 1200,
        height: 630,
        alt: 'PRESTIGO — Premium Chauffeur Service Prague',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'PRESTIGO — Premium Chauffeur Service Prague',
    description:
      'Premium chauffeur service in Prague. Airport transfers, intercity routes, corporate accounts. Fixed prices, flight tracking, meet & greet.',
    images: ['/og-image.jpg'],
  },
  icons: {
    apple: '/apple-touch-icon.png',
  },
  other: {
    'facebook-domain-verification': 'ka67mchks8rv6d7vd0mxut21zt3lc5',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
    },
  },
}

/** og:locale per site locale (Open Graph uses language_TERRITORY). */
export const OG_LOCALE: Record<AppLocale, string> = {
  en: 'en_US',
  ru: 'ru_RU',
  es: 'es_ES',
  fr: 'fr_FR',
  ar: 'ar_AR',
  hi: 'hi_IN',
  zh: 'zh_CN',
}

const OG_IMAGE = { url: '/og-image.jpg', width: 1200, height: 630 } as const

/**
 * The default twitter block carries ONLY card + images — no title and no
 * description. That is the central WR-02 fix: Next.js's postProcessMetadata
 * fills twitter title/description from each page's resolved openGraph when
 * the resolved twitter has none, so twitter:* always mirrors the page's own
 * (localized) og:* on every locale. Images stay so pages whose openGraph has
 * no images still emit twitter:image. No page and no helper may set its own
 * twitter block — this mirroring is the single mechanism.
 */
const DEFAULT_TWITTER: Metadata['twitter'] = {
  card: 'summary_large_image',
  images: ['/og-image.jpg'],
}

/** Any value that is not an exact site locale resolves to 'en' (never throws). */
function toSiteLocale(locale: string): AppLocale {
  return hasLocale(locales, locale) ? locale : 'en'
}

/**
 * Locale-aware root-layout default metadata. The locale must come from the
 * route's own params (CR-01), never from the request scope. EN output is
 * byte-equivalent to `siteMetadata` for title/description/keywords/og; the
 * only difference is the twitter block (see DEFAULT_TWITTER).
 */
export async function getLocaleSiteMetadata(rawLocale: string): Promise<Metadata> {
  const locale = toSiteLocale(rawLocale)
  const t = await getTranslations({ locale, namespace: 'SiteMetadata' })
  const title = t('defaultTitle')
  const description = t('defaultDescription')
  return {
    ...siteMetadata,
    title: { default: title, template: '%s | PRESTIGO' },
    description,
    keywords: t('keywords'),
    openGraph: {
      ...siteMetadata.openGraph,
      locale: OG_LOCALE[locale],
      title,
      description,
      images: [{ ...OG_IMAGE, alt: title }],
    },
    twitter: DEFAULT_TWITTER,
  }
}

/**
 * Localized share metadata for a single page: absolute <title>, description
 * and a full openGraph block. Intentionally has NO twitter key — the locale
 * layout default mirrors og into twitter:* (DEFAULT_TWITTER).
 *
 * Takes only the locale and already-translated strings; never a request path,
 * slug or query value (no reflected content in share cards, T-75-G33).
 */
export function buildShareMetadata(
  rawLocale: string,
  title: string,
  description: string
): Metadata {
  const locale = toSiteLocale(rawLocale)
  return {
    title: { absolute: title },
    description,
    openGraph: {
      type: 'website',
      siteName: 'PRESTIGO',
      locale: OG_LOCALE[locale],
      title,
      description,
      images: [{ ...OG_IMAGE, alt: title }],
    },
  }
}

/**
 * Localized 404 metadata (NotFound.metaTitle / metaDescription) with
 * noindex/nofollow. Shared by every not-found path (wired in plan 75-33).
 * Takes only the locale — never the requested path or slug.
 */
export async function getNotFoundMetadata(rawLocale: string): Promise<Metadata> {
  const locale = toSiteLocale(rawLocale)
  const t = await getTranslations({ locale, namespace: 'NotFound' })
  return {
    ...buildShareMetadata(locale, t('metaTitle'), t('metaDescription')),
    robots: { index: false, follow: false },
  }
}
