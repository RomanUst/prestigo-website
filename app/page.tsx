import type { Metadata } from 'next'

export const dynamic = 'force-static'

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

// Canonical and openGraph URL are both set to the exact form the server
// actually returns (no trailing slash, matching next.config behaviour) so
// Search Console sees a single, consistent home URL.
const HOME_URL = 'https://rideprestigo.com'
const HOME_DESCRIPTION = 'Prague chauffeur service with fixed prices, flight tracking and meet & greet. Airport transfers, intercity routes, corporate accounts. Book online in 60 seconds.'

export const metadata: Metadata = {
  title: 'Prague Chauffeur Service | PRESTIGO — Premium Private Transfers',
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
    addressCountry: 'CZ',
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
  foundingDate: '2016',
  slogan: 'The first person in Prague who is already on your side.',
  sameAs: [
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

export default function Home() {
  return (
    <main id="main-content">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(localBusinessSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteSchema) }}
      />
      <Nav />
      <Hero />
      <Divider />
      <BookingSection />
      <Divider />
      <HowItWorks />
      <Divider />
      <Services />
      <Divider />
      <Fleet />
      <Divider />
      <Routes />
      <Divider />
      <Testimonials />
      <Footer />
    </main>
  )
}
