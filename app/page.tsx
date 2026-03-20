import type { Metadata } from 'next'
import Nav from '@/components/Nav'
import Hero from '@/components/Hero'
import BookingSection from '@/components/BookingSection'
import HowItWorks from '@/components/HowItWorks'
import Services from '@/components/Services'
import Fleet from '@/components/Fleet'
import Routes from '@/components/Routes'
import Testimonials from '@/components/Testimonials'
import Footer from '@/components/Footer'

export const metadata: Metadata = {
  title: 'PRESTIGO — Premium Chauffeur Service Prague',
  description:
    'Premium chauffeur service in Prague. Airport transfers, intercity routes, corporate accounts. Fixed prices, flight tracking, meet & greet.',
  alternates: {
    canonical: '/',
  },
  openGraph: {
    url: 'https://prestigo-site.vercel.app',
    title: 'PRESTIGO — Premium Chauffeur Service Prague',
    description:
      'Premium chauffeur service in Prague. Airport transfers, intercity routes, corporate accounts. Fixed prices, flight tracking, meet & greet.',
  },
}

const localBusinessSchema = {
  '@context': 'https://schema.org',
  '@type': ['LocalBusiness', 'TaxiService'],
  '@id': 'https://prestigo-site.vercel.app/#business',
  name: 'PRESTIGO',
  description:
    'Premium chauffeur and private transfer service in Prague, Czech Republic. Executive airport transfers, corporate travel, and luxury city rides.',
  url: 'https://prestigo-site.vercel.app',
  telephone: '+420000000000',
  email: 'info@prestigo.com',
  priceRange: '€€€',
  currenciesAccepted: 'CZK, EUR',
  paymentAccepted: 'Cash, Credit Card',
  areaServed: [
    { '@type': 'City', name: 'Prague', sameAs: 'https://www.wikidata.org/wiki/Q1085' },
    { '@type': 'Country', name: 'Czech Republic', sameAs: 'https://www.wikidata.org/wiki/Q213' },
  ],
  address: {
    '@type': 'PostalAddress',
    addressLocality: 'Prague',
    addressCountry: 'CZ',
  },
  geo: {
    '@type': 'GeoCoordinates',
    latitude: '50.0755',
    longitude: '14.4378',
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
  '@id': 'https://prestigo-site.vercel.app/#website',
  name: 'PRESTIGO',
  url: 'https://prestigo-site.vercel.app',
  inLanguage: 'en',
  publisher: {
    '@type': 'LocalBusiness',
    '@id': 'https://prestigo-site.vercel.app/#business',
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
      <BookingSection />
      <HowItWorks />
      <Services />
      <Fleet />
      <Routes />
      <Testimonials />
      <Footer />
    </main>
  )
}
