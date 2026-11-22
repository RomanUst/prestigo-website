// Phase 93 (plan 93-11; TRIP-02; D-01, D-14): structured data of a tour page.
// One @graph: the business node, a TouristTrip (inLanguage, itinerary ItemList, provider #business) with one
// Offer per priced car class, FAQPage from the same FAQ items the accordion shows, and a BreadcrumbList.
// Offer prices come only from the tour row the page renders (D-01), never from literals here.
// Deliberately no aggregateRating and no Product: no tour-specific reviews exist (D-14) and Google has no
// rich result for TouristTrip. Pure module: no server imports.

import { getPathname } from '@/i18n/routing'
import { BCP47_TAG, type AppLocale } from '@/i18n/locales'
import { businessNode, futureIsoDate, type JsonLdDocument } from '@/lib/jsonld'
import type { TourRow, TourTranslationRow } from '@/lib/tours/types'

const BASE = 'https://rideprestigo.com'

// Built from char codes so no raw U+2028 / U+2029 ever sits in this source file.
const LINE_SEPARATOR = new RegExp(String.fromCharCode(0x2028), 'g')
const PARAGRAPH_SEPARATOR = new RegExp(String.fromCharCode(0x2029), 'g')

/**
 * JSON.stringify for a <script type="application/ld+json"> body: `<` is escaped so tour text such as
 * "</script><script>..." cannot close the tag, and U+2028 / U+2029 are escaped so the output is also valid
 * as a JavaScript string literal. The result is still valid JSON with identical meaning.
 */
export function safeJsonLd(doc: unknown): string {
  return JSON.stringify(doc)
    .replace(/</g, '\\u003c')
    .replace(LINE_SEPARATOR, '\\u2028')
    .replace(PARAGRAPH_SEPARATOR, '\\u2029')
}

export type TourBreadcrumbLabels = { home: string; services: string; hub: string }

const DEFAULT_LABELS: TourBreadcrumbLabels = {
  home: 'Home',
  services: 'Services',
  hub: 'Day trips from Prague',
}

const CLASS_OFFERS: Array<{ column: 'price_e_eur' | 'price_s_eur' | 'price_v_eur'; name: string; anchor: string }> = [
  { column: 'price_e_eur', name: 'Mercedes E-Class — Business', anchor: 'e-class' },
  { column: 'price_s_eur', name: 'Mercedes S-Class — First Class', anchor: 's-class' },
  { column: 'price_v_eur', name: 'Mercedes V-Class — Business Van', anchor: 'v-class' },
]

function absolute(locale: AppLocale, href: string): string {
  const p = getPathname({ locale, href })
  return BASE + (p === '/' ? '' : p)
}

export function buildTourJsonLd(input: {
  slug: string
  locale: AppLocale
  translation: Pick<
    TourTranslationRow,
    'title' | 'short_description' | 'itinerary' | 'faq'
  >
  tour: Pick<TourRow, 'price_e_eur' | 'price_s_eur' | 'price_v_eur'>
  coverUrl: string | null
  breadcrumb?: TourBreadcrumbLabels
}): JsonLdDocument {
  const { slug, locale, translation, tour, coverUrl } = input
  const labels = input.breadcrumb ?? DEFAULT_LABELS
  const url = absolute(locale, `/services/${slug}`)
  const priceValidUntil = futureIsoDate(365)

  const offers = CLASS_OFFERS.flatMap(({ column, name, anchor }) => {
    const price = tour[column]
    if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) return []
    return [
      {
        '@type': 'Offer',
        name,
        price: String(price),
        priceCurrency: 'EUR',
        availability: 'https://schema.org/InStock',
        priceValidUntil,
        url: `${url}#${anchor}`,
      },
    ]
  })

  const trip: Record<string, unknown> = {
    '@type': 'TouristTrip',
    '@id': `${url}#trip`,
    url,
    inLanguage: BCP47_TAG[locale] ?? locale,
    name: translation.title,
    description: translation.short_description,
    ...(coverUrl ? { image: coverUrl } : {}),
    provider: { '@id': `${BASE}/#business` },
    itinerary: {
      '@type': 'ItemList',
      itemListElement: translation.itinerary.map((step, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: step.title,
      })),
    },
    ...(offers.length > 0 ? { offers } : {}),
  }

  const graph: Array<Record<string, unknown>> = [businessNode(), trip]

  if (translation.faq.length > 0) {
    graph.push({
      '@type': 'FAQPage',
      '@id': `${url}#faq`,
      inLanguage: BCP47_TAG[locale] ?? locale,
      mainEntity: translation.faq.map((f) => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a },
      })),
    })
  }

  graph.push({
    '@type': 'BreadcrumbList',
    '@id': `${url}#breadcrumb`,
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: labels.home, item: absolute(locale, '/') },
      { '@type': 'ListItem', position: 2, name: labels.services, item: absolute(locale, '/services') },
      {
        '@type': 'ListItem',
        position: 3,
        name: labels.hub,
        item: absolute(locale, '/services/day-trips-from-prague'),
      },
      { '@type': 'ListItem', position: 4, name: translation.title, item: url },
    ],
  })

  return { '@context': 'https://schema.org', '@graph': graph }
}
