import type { Metadata } from 'next'
import Image from 'next/image'
import Nav from '@/components/Nav'
import Footer from '@/components/Footer'

// Static page — regenerate at most once per hour so updates to the fleet
// copy propagate without forcing on-demand SSR on every request.
export const revalidate = 3600

const FLEET_DESCRIPTION = 'Mercedes E-Class, S-Class and V-Class chauffeur cars for executive transfers across Prague and Central Europe. Fully insured, immaculately prepared.'

export const metadata: Metadata = {
  title: 'Our Fleet — Mercedes Chauffeur Cars Prague',
  description: FLEET_DESCRIPTION,
  alternates: { canonical: '/fleet' },
  openGraph: {
    url: 'https://rideprestigo.com/fleet',
    title: 'Our Fleet — Mercedes Chauffeur Cars Prague',
    description: FLEET_DESCRIPTION,
  },
}

const vehicles = [
  {
    model: 'Mercedes E-Class',
    category: 'Business Sedan',
    description: 'The first choice for airport transfers and city rides. Comfortable, discreet, efficient. Capacity: 3 passengers + luggage.',
    features: ['Leather interior', 'Climate control', 'Wi-Fi available', 'Chargers'],
    idealFor: 'Airport, city, solo business travel',
    price: 'From €49',
    photo: '/e-class-photo.png',
    photoAlt: 'Mercedes-Benz E-Class — PRESTIGO chauffeur service Prague',
  },
  {
    model: 'Mercedes S-Class',
    category: 'Executive Sedan',
    description: 'For those who travel at the highest level. Rear massaging seats, ambient lighting, panoramic roof. Silence as standard.',
    features: ['Premium leather', 'Massage seats', 'Ambient lighting', 'Champagne on request'],
    idealFor: 'VIP, diplomatic, extended intercity',
    price: 'From €89',
    photo: '/s-class-photo.png',
    photoAlt: 'Mercedes-Benz S-Class — PRESTIGO chauffeur service Prague',
  },
  {
    model: 'Mercedes V-Class',
    category: 'Executive Van',
    description: 'Up to 6 passengers. Full luggage. Privacy partition available. The choice for families, groups, and multi-bag travellers who refuse to compromise.',
    features: ['6 seats', 'Full luggage capacity', 'Individual captain seats', 'Privacy screen'],
    idealFor: 'Groups, families, conference transfers',
    price: 'From €69',
    photo: '/v-class-photo.png',
    photoAlt: 'Mercedes-Benz V-Class — PRESTIGO chauffeur service Prague',
  },
]

const standards = [
  { title: 'Pre-trip inspection', body: 'Checked before every journey' },
  { title: 'Interior cleaned', body: 'Fresh cabin for every client' },
  { title: 'Climate preset', body: 'Set to your preference' },
  { title: 'Chargers & Wi-Fi', body: 'Stay connected on the move' },
]

const vehicleListSchema = {
  '@context': 'https://schema.org',
  '@type': 'ItemList',
  name: 'PRESTIGO Mercedes Fleet Prague',
  itemListElement: vehicles.map((v, i) => ({
    '@type': 'ListItem',
    position: i + 1,
    item: {
      '@type': 'Product',
      name: v.model,
      description: v.description,
      brand: { '@type': 'Brand', name: 'Mercedes-Benz' },
      offers: {
        '@type': 'Offer',
        price: v.price.replace(/[^0-9]/g, ''),
        priceCurrency: 'EUR',
        seller: { '@type': 'LocalBusiness', '@id': 'https://rideprestigo.com/#business' },
      },
    },
  })),
}

const breadcrumbSchema = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://rideprestigo.com' },
    { '@type': 'ListItem', position: 2, name: 'Fleet', item: 'https://rideprestigo.com/fleet' },
  ],
}

export default function FleetPage() {
  return (
    <main id="main-content">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(vehicleListSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />
      <Nav />

      {/* Hero */}
      <section className="relative border-b border-anthracite-light overflow-hidden" style={{ minHeight: '560px' }}>
        <div className="absolute inset-0">
          <img src="/hero-fleet.webp" alt="PRESTIGO Mercedes Fleet — Prague Chauffeur" className="w-full h-full object-cover" style={{ filter: 'brightness(0.38)' }} />
        </div>
        <div className="relative z-10 max-w-7xl mx-auto px-6 md:px-12 pt-40 pb-20">
          <p className="label mb-6">Mercedes Fleet · Prague</p>
          <span className="copper-line mb-8 block" />
          <h1 className="display text-[40px] md:text-[56px] max-w-xl">
            The vehicle is part<br />
            <span className="display-italic">of the experience.</span>
          </h1>
          <p className="body-text text-[13px] mt-6 max-w-lg" style={{ lineHeight: '1.9' }}>
            Every PRESTIGO vehicle is a late-model Mercedes-Benz, maintained to exacting standards, fully insured, and prepared before every journey. The interior is your space to think, work, or simply arrive.
          </p>
        </div>
      </section>

      {/* Vehicle cards */}
      <section className="bg-anthracite py-16 md:py-24">
        <div className="max-w-7xl mx-auto px-6 md:px-12 flex flex-col gap-16">
          {vehicles.map((v, i) => (
            <div
              key={v.model}
              className={`grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-16 pb-16 ${i < vehicles.length - 1 ? 'border-b border-anthracite-light' : ''}`}
            >
              {/* Photo */}
              <div className="relative h-64 md:h-80 overflow-hidden border border-anthracite-light">
                <Image
                  src={v.photo}
                  alt={v.photoAlt}
                  width={600}
                  height={340}
                  className="w-full h-full object-cover hover:scale-105 transition-transform duration-700"
                  sizes="(max-width: 768px) 100vw, 50vw"
                  priority={i === 0}
                />
              </div>

              {/* Info */}
              <div className="flex flex-col justify-center gap-6">
                <div>
                  <p className="label mb-2">{v.category}</p>
                  <h2 className="display text-[28px] md:text-[34px] mb-3">{v.model}</h2>
                  <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>{v.description}</p>
                </div>
                <ul className="flex flex-col gap-2">
                  {v.features.map((f) => (
                    <li key={f} className="flex items-center gap-3">
                      <span className="w-1 h-1 rounded-full flex-shrink-0" style={{ background: 'var(--copper)' }} />
                      <span className="font-body font-light text-[12px] text-warmgrey tracking-wide">{f}</span>
                    </li>
                  ))}
                </ul>
                <div className="flex items-center gap-6">
                  <p className="font-body font-light text-[13px]" style={{ color: 'var(--copper-light)' }}>{v.price}</p>
                  <a href="/book" className="btn-primary" style={{ padding: '10px 24px', fontSize: '9px' }}>
                    Book {v.model.split(' ')[1]}
                  </a>
                </div>
                <p className="font-body font-light text-[11px] text-warmgrey">
                  Ideal for: {v.idealFor}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Standards */}
      <section className="bg-anthracite-mid py-16 md:py-20 border-t border-anthracite-light">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <h2 className="display text-[28px] md:text-[36px] mb-14">Every vehicle, every time</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {standards.map((s) => (
              <div key={s.title}>
                <span className="copper-line mb-5 block" />
                <h3 className="font-body font-medium text-[11px] tracking-[0.15em] uppercase text-offwhite mb-2">{s.title}</h3>
                <p className="body-text text-[12px]">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Why Mercedes-Benz */}
      <section className="bg-anthracite py-16 md:py-24 border-t border-anthracite-light">
        <div className="max-w-7xl mx-auto px-6 md:px-12 grid grid-cols-1 md:grid-cols-2 gap-14 md:gap-24">
          <div>
            <p className="label mb-6">Why Mercedes-Benz exclusively</p>
            <span className="copper-line mb-8 block" />
            <h2 className="display text-[28px] md:text-[36px] mb-8">One marque. Three silhouettes. <span className="display-italic">Zero compromise.</span></h2>
          </div>
          <div className="flex flex-col gap-6">
            <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
              PRESTIGO operates a pure Mercedes-Benz fleet — not because it&rsquo;s the easy choice, but because it&rsquo;s the right one. For executive transport in Central Europe, Mercedes remains the undisputed standard: the E-Class is the default business sedan of every capital from Prague to Warsaw, the S-Class defines the upper tier of ground luxury, and the V-Class is the only premium van our corporate clients recognise on sight.
            </p>
            <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
              A single-marque fleet also means consistency. Every driver already knows the controls, the service intervals, and the quirks of each chassis. Every passenger steps into an interior they already know how to use — the same climate logic, the same seat controls, the same quality of leather and stitching. There are no surprises, and in executive travel, surprises are the enemy.
            </p>
            <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
              We refresh vehicles on a rolling schedule, well before the cosmetic or mechanical standard begins to slip. Our clients travel in a car that feels current — because it is.
            </p>
          </div>
        </div>
      </section>

      {/* Maintenance & safety */}
      <section className="bg-anthracite-mid py-16 md:py-24 border-t border-anthracite-light">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <div className="mb-14">
            <p className="label mb-6">Maintenance &amp; Safety</p>
            <span className="copper-line mb-8 block" />
            <h2 className="display text-[28px] md:text-[36px]">Prepared before<br /><span className="display-italic">every journey.</span></h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
            {[
              {
                title: 'Manufacturer-schedule servicing',
                body: 'Every vehicle is serviced by authorised Mercedes-Benz technicians on the factory-recommended schedule. We keep complete service records and replace consumables (tyres, brake pads, wipers) well before the legal minimum.',
              },
              {
                title: 'Commercial insurance, fully comprehensive',
                body: 'Every journey is covered by commercial passenger liability and fully comprehensive vehicle insurance, underwritten in the EU. Documentation is available on request for corporate compliance teams.',
              },
              {
                title: 'Daily pre-trip inspection',
                body: 'Tyre pressure, fluid levels, lights, and cabin cleanliness are checked before the first assignment of the day — and again between back-to-back executive bookings.',
              },
            ].map((item) => (
              <div key={item.title} className="border border-anthracite-light p-8">
                <span className="copper-line mb-5 block" />
                <h3 className="font-display font-light text-[20px] text-offwhite mb-3">{item.title}</h3>
                <p className="body-text text-[12px]" style={{ lineHeight: '1.9' }}>{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Technology onboard */}
      <section className="bg-anthracite py-16 md:py-24 border-t border-anthracite-light">
        <div className="max-w-7xl mx-auto px-6 md:px-12 grid grid-cols-1 md:grid-cols-2 gap-14 md:gap-24">
          <div>
            <p className="label mb-6">Technology onboard</p>
            <span className="copper-line mb-8 block" />
            <h2 className="display text-[28px] md:text-[36px] mb-6">A rolling office.<br /><span className="display-italic">A quiet sanctuary.</span></h2>
            <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
              Our passengers often arrive at the car with work still to finish — or nerves still to settle after a long flight. The cabin of every PRESTIGO vehicle is prepared for both. Whether you need to take a video call between meetings or simply close your eyes for an hour, the interior adapts to you, not the other way around.
            </p>
          </div>
          <ul className="flex flex-col gap-5">
            {[
              { t: 'Unlimited mobile Wi-Fi', b: 'Enterprise-grade 5G router in every vehicle. Multiple devices, full bandwidth, no data caps.' },
              { t: 'Fast charging for every device', b: 'USB-C and USB-A ports within reach of every seat. Apple and Samsung fast-charge supported.' },
              { t: 'Climate preset on arrival', b: 'Your preferred cabin temperature is set before the car reaches you — noted once, remembered for every future booking.' },
              { t: 'Still and sparkling water', b: 'Complimentary chilled mineral water on every transfer. Tea, coffee and champagne available on request for executive and VIP bookings.' },
              { t: 'Child &amp; booster seats', b: 'Full range of EU-certified child restraints available at no extra charge — just note the age and weight at booking.' },
              { t: 'Discreet privacy', b: 'S-Class and V-Class offer privacy glass and optional rear partitions. What happens in the cabin stays in the cabin.' },
            ].map((item) => (
              <li key={item.t} className="flex items-start gap-4 py-4 border-b border-anthracite-light last:border-0">
                <span className="mt-[9px] w-1 h-1 rounded-full flex-shrink-0" style={{ background: 'var(--copper)' }} />
                <div>
                  <p className="font-body font-medium text-[12px] tracking-[0.1em] uppercase text-offwhite mb-2" dangerouslySetInnerHTML={{ __html: item.t }} />
                  <p className="body-text text-[12px]" style={{ lineHeight: '1.85' }} dangerouslySetInnerHTML={{ __html: item.b }} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Selection criteria */}
      <section className="bg-anthracite-mid py-16 md:py-24 border-t border-anthracite-light">
        <div className="max-w-4xl mx-auto px-6 md:px-12">
          <p className="label mb-6">How we choose a class for your journey</p>
          <span className="copper-line mb-8 block" />
          <h2 className="display text-[28px] md:text-[36px] mb-10">Matching vehicle to <span className="display-italic">occasion.</span></h2>
          <div className="flex flex-col gap-6">
            <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
              The right vehicle depends on the trip, not the price list. A solo executive arriving from London City with a briefcase and a carry-on is best served by an E-Class — efficient, quiet, and perfectly appointed for a ninety-minute airport run. A visiting principal with protocol requirements and an aide will prefer the S-Class, where rear legroom, massage seats, and the near-silent cabin become genuinely useful. A family of five with skis and luggage, or a four-person board arriving for a half-day roadshow, belongs in the V-Class — the only vehicle in the fleet that comfortably seats six adults with full luggage.
            </p>
            <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
              If you&rsquo;re unsure which class fits your booking, note your passenger count, luggage, and journey length in the booking form and our dispatcher will confirm the right pairing within minutes. For recurring corporate travel, we maintain vehicle preferences against your account profile so every trip is matched automatically.
            </p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-anthracite py-20 border-t border-anthracite-light">
        <div className="max-w-7xl mx-auto px-6 md:px-12 text-center">
          <h2 className="display text-[32px] md:text-[42px] mb-4">
            Choose your vehicle.<br />
            <span className="display-italic">Book online.</span>
          </h2>
          <p className="body-text text-[13px] mt-4 mb-10">Select your preferred class at checkout.</p>
          <a href="/book" className="btn-primary">Book a Transfer</a>
        </div>
      </section>

      <Footer />
    </main>
  )
}
