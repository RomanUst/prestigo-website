import type { Metadata } from 'next'

export const revalidate = 120

import { getCachedAggregateRating } from '@/lib/google-reviews'
import { getPricingConfig } from '@/lib/pricing-config'
import { getAllRoutes } from '@/lib/route-prices'
import { AIRPORT_FALLBACK } from '@/lib/price-fallbacks'
import Nav from '@/components/Nav'
import Hero from '@/components/Hero'
import BookingSection from '@/components/BookingSection'
import HowItWorks from '@/components/HowItWorks'
import Services from '@/components/Services'
import Fleet from '@/components/Fleet'
import Routes from '@/components/Routes'
import Testimonials from '@/components/Testimonials'
import Footer from '@/components/Footer'
import Divider from '@/components/Divider'
import TierLadder from '@/components/pricing/TierLadder'
import HourlyDailyStrip from '@/components/pricing/HourlyDailyStrip'

// Canonical and openGraph URL are both set to the exact form the server
// actually returns (no trailing slash, matching next.config behaviour) so
// Search Console sees a single, consistent home URL.
const HOME_URL = 'https://rideprestigo.com'
const HOME_DESCRIPTION = 'Prague chauffeur service with fixed prices, flight tracking and meet & greet. Airport transfers, intercity routes, corporate accounts. Book online in 60 seconds.'

export const metadata: Metadata = {
  title: { absolute: 'Prague Chauffeur & Airport Transfers | PRESTIGO' },
  description: HOME_DESCRIPTION,
  alternates: {
    canonical: HOME_URL,
    languages: {
      en: HOME_URL,
      'x-default': HOME_URL,
    },
  },
  openGraph: {
    url: HOME_URL,
    title: 'Prague Chauffeur Service | PRESTIGO — Premium Private Transfers',
    description: HOME_DESCRIPTION,
  },
}

const localBusinessSchema = {
  '@context': 'https://schema.org',
  '@type': ['LocalBusiness', 'TaxiService'],
  '@id': 'https://rideprestigo.com/#business',
  name: 'PRESTIGO',
  legalName: 'chelautotrans s.r.o.',
  taxID: '05650801',
  description:
    'Premium chauffeur and private transfer service in Prague, Czech Republic. Executive airport transfers, corporate travel, and luxury city rides.',
  url: 'https://rideprestigo.com',
  telephone: '+420725986855',
  email: 'info@rideprestigo.com',
  priceRange: '€€€',
  currenciesAccepted: 'CZK, EUR',
  paymentAccepted: 'Cash, Credit Card',
  areaServed: [
    { '@type': 'City', name: 'Prague', sameAs: 'https://www.wikidata.org/wiki/Q1085' },
    { '@type': 'Country', name: 'Czech Republic', sameAs: 'https://www.wikidata.org/wiki/Q213' },
  ],
  address: {
    '@type': 'PostalAddress',
    streetAddress: 'Spojovací 685',
    addressLocality: 'Vysoký Újezd',
    postalCode: '252 16',
    addressRegion: 'Central Bohemian Region',
    addressCountry: 'CZ',
  },
  geo: {
    '@type': 'GeoCoordinates',
    latitude: 49.9836,
    longitude: 14.2001,
  },
  image: 'https://rideprestigo.com/photohero.png',
  logo: {
    '@type': 'ImageObject',
    url: 'https://rideprestigo.com/logo.png',
    width: 300,
    height: 60,
  },
  founder: {
    '@type': 'Person',
    '@id': 'https://rideprestigo.com/authors/roman-ustyugov#person',
    name: 'Roman Ustyugov',
    jobTitle: 'Founder & Chief Experience Officer',
    url: 'https://rideprestigo.com/authors/roman-ustyugov',
    image: 'https://rideprestigo.com/roman-ustyugov-founder.jpg',
    worksFor: { '@id': 'https://rideprestigo.com/#business' },
  },
  knowsAbout: [
    'Luxury chauffeur service',
    'Airport transfer Prague',
    'Corporate ground transportation',
    '5-star hotel partner transport',
    'Executive Mercedes-Benz fleet',
  ],
  foundingDate: '2026',
  slogan: 'The first person in Prague who is already on your side.',
  sameAs: [
    'https://share.google/RLjntprJWb5RXWSxL',
    'https://www.instagram.com/rideprestigo/',
    'https://www.facebook.com/profile.php?id=61574283117859',
  ],
  contactPoint: {
    '@type': 'ContactPoint',
    telephone: '+420-725-986-855',
    contactType: 'customer service',
    availableLanguage: ['English', 'Czech'],
    hoursAvailable: {
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
      opens: '00:00',
      closes: '23:59',
    },
  },
  openingHoursSpecification: [
    {
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
      opens: '00:00',
      closes: '23:59',
    },
  ],
}

const websiteSchema = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  '@id': 'https://rideprestigo.com/#website',
  name: 'PRESTIGO',
  url: 'https://rideprestigo.com',
  inLanguage: 'en',
  publisher: {
    '@type': 'LocalBusiness',
    '@id': 'https://rideprestigo.com/#business',
  },
}

export default async function Home() {
  const [aggregateRating, config, allRoutes] = await Promise.all([
    getCachedAggregateRating(),
    getPricingConfig(),
    getAllRoutes('display_order'),
  ])

  const { globals, hourlyRate } = config
  const sClassAirport = AIRPORT_FALLBACK.sClass
  const vClassAirport = AIRPORT_FALLBACK.vClass
  const heroPrice = globals.airportPromoActive
    ? globals.airportPromoPriceEur
    : globals.airportRegularPriceEur
  const cheapestIntercity =
    allRoutes.length > 0
      ? allRoutes.reduce((m, r) => Math.min(m, r.eClassEur), Infinity)
      : AIRPORT_FALLBACK.regular
  const hourlyFrom = hourlyRate['business'] ?? AIRPORT_FALLBACK.regular
  const featuredRoutes = allRoutes.slice(0, 6)

  const schema = aggregateRating
    ? {
        ...localBusinessSchema,
        aggregateRating: {
          '@type': 'AggregateRating',
          ratingValue: aggregateRating.ratingValue.toFixed(1),
          reviewCount: aggregateRating.reviewCount,
          bestRating: '5',
          worstRating: '1',
        },
      }
    : localBusinessSchema

  return (
    <main id="main-content">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteSchema) }}
      />
      <Nav />
      <Hero airportPrice={heroPrice} />
      <Divider />
      <BookingSection />
      <Divider />
      <section className="homepage-tier-ladder" style={{ padding: '4rem 1.5rem', maxWidth: '1200px', margin: '0 auto' }}>
        <h2 className="font-display text-[32px] md:text-[40px]" style={{ textAlign: 'center', marginBottom: '2rem' }}>
          Airport transfers
        </h2>
        <TierLadder config={globals} sClassPrice={sClassAirport} vClassPrice={vClassAirport} />
      </section>
      <Divider />
      <HowItWorks />
      <Divider />
      <Services airportPrice={heroPrice} hourlyFrom={hourlyFrom} cheapestIntercity={cheapestIntercity} />
      <Divider />
      <Fleet />
      <Divider />
      <HourlyDailyStrip hourlyRate={hourlyRate} />
      <Divider />
      <Routes routes={featuredRoutes} />
      <Divider />
      <Testimonials />
      <Footer />
    </main>
  )
}
