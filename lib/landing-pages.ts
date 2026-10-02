/**
 * Keyword-variant landing pages (competitor-analysis 2026-10-01, item 3):
 * service variants under /services/<slug> and the FAQ topic cluster under
 * /faq/<slug>. Structural, locale-invariant config lives here; every word of
 * copy lives in content/pages/<locale>/<section>/<slug>.json (LandingContent).
 *
 * Copy may use the price tokens produced by getLandingPrices():
 *   {businessPrice} {vClassAirport} {sClassAirport} — airport transfer fares
 *   {hourlyFrom} {hourlyV} {hourlyS}               — hourly hire rates
 */

import { getPricingConfig } from '@/lib/pricing-config'
import { AIRPORT_FALLBACK, HOURLY_FALLBACK } from '@/lib/price-fallbacks'

export type LandingSection = 'services' | 'faq'

export type LandingPageConfig = {
  slug: string
  section: LandingSection
  /** Hero background; omitted → plain dark hero (FAQ topics). */
  heroImage?: string
  /** Primary CTA target (locale-resolved by the template). */
  ctaHref: string
}

export const LANDING_PAGES: LandingPageConfig[] = [
  { slug: 'airport-meet-and-greet', section: 'services', heroImage: '/journey-03-arrive.jpg', ctaHref: '/book' },
  { slug: 'prague-airport-taxi', section: 'services', heroImage: '/photohero.jpg', ctaHref: '/book' },
  { slug: 'private-driver-prague', section: 'services', heroImage: '/hero-city-rides.png', ctaHref: '/book' },
  { slug: 'child-seats', section: 'faq', ctaHref: '/book' },
  { slug: 'flight-delays', section: 'faq', ctaHref: '/book' },
  { slug: 'tipping-in-prague', section: 'faq', ctaHref: '/book' },
]

export function landingPagesFor(section: LandingSection): LandingPageConfig[] {
  return LANDING_PAGES.filter((p) => p.section === section)
}

export function findLandingPage(section: LandingSection, slug: string): LandingPageConfig | undefined {
  return LANDING_PAGES.find((p) => p.section === section && p.slug === slug)
}

export type LandingContent = {
  metadata: { title: string; description: string; ogTitle: string }
  breadcrumbName: string
  hero: {
    label: string
    headlineLine1: string
    headlineItalic: string
    intro: string
    ctaPrimary: string
    ctaSecondary: string
    imageAlt: string
  }
  glance: { label: string; items: { label: string; value: string }[] }
  intro: { headingLine1: string; headingItalic: string; paragraphs: string[] }
  features: { label: string; headingLine1: string; headingItalic: string; items: { title: string; body: string }[] }
  steps: { label: string; heading: string; items: { title: string; body: string }[] }
  editorial: { label: string; headingLine1: string; headingItalic: string; paragraphs: string[] }
  faqsHeading: string
  faqs: { q: string; a: string }[]
  related: { label: string; heading: string; links: { href: string; title: string; body: string }[] }
  cta: { headingLine1: string; headingItalic: string; buttonText: string }
}

export async function getLandingPrices(): Promise<Record<string, number>> {
  const { globals, hourlyRate } = await getPricingConfig()
  return {
    businessPrice: globals.airportPromoActive ? globals.airportPromoPriceEur : globals.airportRegularPriceEur,
    vClassAirport: AIRPORT_FALLBACK.vClass,
    sClassAirport: AIRPORT_FALLBACK.sClass,
    hourlyFrom: hourlyRate['business'] ?? HOURLY_FALLBACK.business,
    hourlyV: hourlyRate['business_van'] ?? HOURLY_FALLBACK.business_van,
    hourlyS: hourlyRate['first_class'] ?? HOURLY_FALLBACK.first_class,
  }
}
