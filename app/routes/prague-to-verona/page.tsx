import type { Metadata } from 'next'

export const revalidate = 120

import Nav from '@/components/Nav'
import Footer from '@/components/Footer'
import { getRoutePrice } from '@/lib/route-prices'
import { ROUTE_FALLBACK } from '@/lib/price-fallbacks'

export async function generateMetadata(): Promise<Metadata> {
  const route = await getRoutePrice('prague-to-verona')
  const ePrice = route?.eClassEur ?? ROUTE_FALLBACK.eClassEur
  return {
    title: { absolute: 'Private Transfer Prague to Verona — PRESTIGO Chauffeur' },
    description: `Long-distance private chauffeur transfer from Prague to Verona. 830 km, approx 9 hours. Mercedes E, V, or S-Class. From €${ePrice}.`,
    alternates: {
      canonical: '/routes/prague-to-verona',
      languages: {
        en: 'https://rideprestigo.com/routes/prague-to-verona',
        'x-default': 'https://rideprestigo.com/routes/prague-to-verona',
      },
    },
    robots: { index: false, follow: true },
    openGraph: {
      url: 'https://rideprestigo.com/routes/prague-to-verona',
      title: 'Private Transfer Prague to Verona — PRESTIGO Chauffeur',
      description: 'Long-distance private transfer from Prague to Verona. 830 km door-to-door in Mercedes. Quote on request.',
    },
  }
}

const breadcrumbSchema = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://rideprestigo.com' },
    { '@type': 'ListItem', position: 2, name: 'Routes', item: 'https://rideprestigo.com/routes' },
    { '@type': 'ListItem', position: 3, name: 'Prague to Verona', item: 'https://rideprestigo.com/routes/prague-to-verona' },
  ],
}

export default async function PragueToVeronaPage() {
  const route = await getRoutePrice('prague-to-verona')
  const ePrice = route?.eClassEur ?? ROUTE_FALLBACK.eClassEur
  const sPrice = route?.sClassEur ?? ROUTE_FALLBACK.sClassEur
  const vPrice = route?.vClassEur ?? ROUTE_FALLBACK.vClassEur

  return (
    <main id="main-content">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />
      <Nav />

      {/* Hero */}
      <section className="bg-anthracite pt-32 pb-16 md:pt-40 md:pb-20 border-b border-anthracite-light">
        <div className="max-w-4xl mx-auto px-6 md:px-12">
          <p className="label mb-6">Long-distance transfer · Quote on request</p>
          <span className="copper-line mb-8 block" />
          <h1 className="display text-[36px] md:text-[52px] leading-tight">
            Prague to Verona.<br />
            <span className="display-italic">Private chauffeur.</span>
          </h1>
          <div className="flex flex-wrap gap-8 mt-8">
            <div>
              <p className="label mb-1">Distance</p>
              <p className="font-body font-light text-[14px] text-offwhite">830 km</p>
            </div>
            <div>
              <p className="label mb-1">Duration</p>
              <p className="font-body font-light text-[14px] text-offwhite">approx. 9 hours</p>
            </div>
            <div>
              <p className="label mb-1">From</p>
              <p className="font-body font-light text-[14px]" style={{ color: 'var(--copper-light)' }}>€{ePrice} (E-Class)</p>
            </div>
          </div>
        </div>
      </section>

      {/* Main content */}
      <section className="bg-anthracite py-16 md:py-24">
        <div className="max-w-3xl mx-auto px-6 md:px-12">
          <p className="body-text text-[14px] mb-8" style={{ lineHeight: '1.9' }}>
            A 830-kilometre drive is not the typical PRESTIGO booking — most of our route pages cover destinations within a 5-hour radius of Prague. But our fleet is certified for international travel, our chauffeurs hold EU professional licences, and we run the Prague–Verona route on request throughout the year.
          </p>

          <h2 className="font-display font-light text-[22px] text-offwhite mb-5 mt-10">How this works</h2>
          <p className="body-text text-[13px] mb-6" style={{ lineHeight: '1.9' }}>
            Because 830 km is a 9-hour drive, every booking is priced and confirmed individually. The factors that change the final quote include:
          </p>
          <ul className="flex flex-col gap-4 mb-8">
            {[
              `Vehicle class. Indicative fares: from €${ePrice} in Mercedes E-Class, €${vPrice} in V-Class, or €${sPrice} in S-Class. Your actual quote depends on the specifics below.`,
              'Time of year. Winter routes across the Alps or through high-altitude passes may add 1–2 hours for weather and cost extra for snow tyres.',
              'Overnight requirements. EU driver regulation 561/2006 limits continuous driving to 4.5 hours before a 45-minute break, and 9 hours total in a day. Routes over roughly 700 km typically require an overnight stop for the chauffeur in Verona before returning, which adds one night of accommodation to the quote.',
              'Return or one-way. Same-day return is rarely possible on this distance; most bookings are one-way or multi-day.',
              'Border tolls and vignettes. All foreign tolls, vignettes, and city environmental fees are included in the final quote — nothing is added on arrival.',
            ].map((item) => (
              <li key={item} className="flex items-start gap-3">
                <span className="mt-[9px] w-1 h-1 rounded-full flex-shrink-0" style={{ background: 'var(--copper)' }} />
                <span className="font-body font-light text-[13px] text-warmgrey" style={{ lineHeight: '1.9' }}>{item}</span>
              </li>
            ))}
          </ul>

          <h2 className="font-display font-light text-[22px] text-offwhite mb-5 mt-10">What you get</h2>
          <ul className="flex flex-col gap-4 mb-10">
            {[
              'A black Mercedes with a professional, English-speaking chauffeur.',
              'Fuel, tolls, foreign vignettes, and all driver time included in the quoted price.',
              'Bottled water, phone charger, rear-cabin Wi-Fi.',
              'Child seats on request at no extra charge.',
              'Door-to-door service — exact pickup and drop-off address, not a parking lot.',
            ].map((item) => (
              <li key={item} className="flex items-start gap-3">
                <span className="mt-[9px] w-1 h-1 rounded-full flex-shrink-0" style={{ background: 'var(--copper)' }} />
                <span className="font-body font-light text-[13px] text-warmgrey" style={{ lineHeight: '1.9' }}>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-anthracite-mid py-16 border-t border-anthracite-light">
        <div className="max-w-3xl mx-auto px-6 md:px-12">
          <h2 className="display text-[24px] md:text-[32px] mb-4">
            Get a quote for Prague to <span className="display-italic">Verona.</span>
          </h2>
          <p className="body-text text-[13px] mb-8" style={{ lineHeight: '1.9' }}>
            Tell us your travel dates, the number of passengers, whether the trip is one-way or round-trip, and any specific pickup or drop-off addresses. You will receive a written quote within 2 hours, Monday to Sunday.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <a href="/contact" className="btn-primary">Request a Quote</a>
            <a href="/routes" className="btn-ghost">View all routes</a>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  )
}
