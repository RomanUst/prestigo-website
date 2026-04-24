import type { Metadata } from 'next'
import Image from 'next/image'
import Nav from '@/components/Nav'
import Footer from '@/components/Footer'
import Reveal from '@/components/Reveal'
import Divider from '@/components/Divider'

export const revalidate = 120

const FLEET_DESCRIPTION = 'Mercedes E-Class, S-Class and V-Class chauffeur cars for executive transfers across Prague and Central Europe. Fully insured, immaculately prepared.'

export const metadata: Metadata = {
  title: 'Our Fleet — Mercedes Chauffeur Cars Prague',
  description: FLEET_DESCRIPTION,
  alternates: {
    canonical: '/fleet',
    languages: {
      en: 'https://rideprestigo.com/fleet',
      'x-default': 'https://rideprestigo.com/fleet',
    },
  },
  openGraph: {
    url: 'https://rideprestigo.com/fleet',
    title: 'Our Fleet — Mercedes Chauffeur Cars Prague',
    description: FLEET_DESCRIPTION,
    images: [{ url: 'https://rideprestigo.com/hero-fleet.webp', width: 1200, height: 630 }],
  },
}

type VehicleSpec = {
  model: string
  category: string
  description: string
  features: string[]
  idealFor: string
  photo: string
  photoAlt: string
  // Structured spec table for Vehicle schema + on-page display
  specs: {
    seating: number
    luggage: string
    fuelType: 'hybrid' | 'petrol' | 'diesel' | 'electric'
    transmission: 'automatic' | 'manual'
    driveType: 'rwd' | 'awd' | 'fwd'
    modelYearFrom: number
    cylinders?: number
    wheelbase?: string
    cargoVolume?: string
    vehicleConfiguration?: string
  }
}

const vehicles: VehicleSpec[] = [
  {
    model: 'Mercedes-Benz E-Class',
    category: 'Business Sedan',
    description: 'The first choice for airport transfers and city rides. Comfortable, discreet, efficient. Capacity: 3 passengers + luggage.',
    features: ['Leather interior', 'Dual-zone climate control', 'Onboard Wi-Fi', 'USB-C fast charging', 'Bottled water'],
    idealFor: 'Airport, city, solo business travel',
    photo: '/e-class-photo.webp',
    photoAlt: 'Mercedes-Benz E-Class — PRESTIGO chauffeur service Prague',
    specs: {
      seating: 3,
      luggage: '2 large cases + 2 cabin bags',
      fuelType: 'hybrid',
      transmission: 'automatic',
      driveType: 'rwd',
      modelYearFrom: 2022,
      cylinders: 4,
      wheelbase: '2,961 mm',
      cargoVolume: '540 L',
      vehicleConfiguration: 'E 220 d / E 300 de Hybrid',
    },
  },
  {
    model: 'Mercedes-Benz S-Class',
    category: 'Executive Sedan',
    description: 'For those who travel at the highest level. Rear massaging seats, ambient lighting, panoramic roof. Silence as standard.',
    features: ['Premium Nappa leather', 'Rear massage seats', 'Ambient lighting', 'Executive rear package', 'Champagne on request'],
    idealFor: 'VIP, diplomatic, extended intercity',
    photo: '/s-class-photo.webp',
    photoAlt: 'Mercedes-Benz S-Class — PRESTIGO chauffeur service Prague',
    specs: {
      seating: 3,
      luggage: '2 large cases + 2 cabin bags',
      fuelType: 'hybrid',
      transmission: 'automatic',
      driveType: 'awd',
      modelYearFrom: 2022,
      cylinders: 6,
      wheelbase: '3,216 mm',
      cargoVolume: '550 L',
      vehicleConfiguration: 'S 450 4MATIC / S 580 e Hybrid',
    },
  },
  {
    model: 'Mercedes-Benz V-Class',
    category: 'Executive Van',
    description: 'Up to 6 passengers. Full luggage. Privacy partition available. The choice for families, groups, and multi-bag travellers who refuse to compromise.',
    features: ['6 captain seats', 'Full luggage capacity', 'Rear privacy glass', 'Fold-out table', 'Individual reading lights'],
    idealFor: 'Groups, families, conference transfers',
    photo: '/v-class-photo.webp',
    photoAlt: 'Mercedes-Benz V-Class — PRESTIGO chauffeur service Prague',
    specs: {
      seating: 6,
      luggage: '6 large cases + 6 cabin bags',
      fuelType: 'diesel',
      transmission: 'automatic',
      driveType: 'rwd',
      modelYearFrom: 2022,
      cylinders: 4,
      wheelbase: '3,200 mm',
      cargoVolume: '1,410 L',
      vehicleConfiguration: 'V 300 d Extralong AVANTGARDE',
    },
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
  '@id': 'https://rideprestigo.com/fleet#vehicles',
  name: 'PRESTIGO Mercedes Fleet Prague',
  itemListElement: vehicles.map((v, i) => ({
    '@type': 'ListItem',
    position: i + 1,
    item: {
      '@type': 'Vehicle',
      '@id': `https://rideprestigo.com/fleet#${v.model.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      name: v.model,
      description: v.description,
      image: `https://rideprestigo.com${v.photo}`,
      brand: { '@type': 'Brand', name: 'Mercedes-Benz' },
      manufacturer: { '@type': 'Organization', name: 'Mercedes-Benz Group AG' },
      vehicleModelDate: String(v.specs.modelYearFrom),
      vehicleConfiguration: v.specs.vehicleConfiguration,
      bodyType: v.category,
      fuelType: v.specs.fuelType,
      vehicleTransmission: v.specs.transmission,
      driveWheelConfiguration: v.specs.driveType === 'rwd'
        ? 'https://schema.org/RearWheelDriveConfiguration'
        : v.specs.driveType === 'awd'
          ? 'https://schema.org/AllWheelDriveConfiguration'
          : 'https://schema.org/FrontWheelDriveConfiguration',
      vehicleSeatingCapacity: {
        '@type': 'QuantitativeValue',
        value: v.specs.seating,
        unitText: 'passengers',
      },
      cargoVolume: v.specs.cargoVolume
        ? { '@type': 'QuantitativeValue', value: parseInt(v.specs.cargoVolume.replace(/,/g, '')), unitText: 'L' }
        : undefined,
      wheelbase: v.specs.wheelbase,
      numberOfAxles: 2,
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

const fleetFaqs = [
  {
    q: 'Which Mercedes-Benz models does PRESTIGO operate?',
    a: 'PRESTIGO runs a three-class Mercedes-Benz fleet in Prague: the E-Class (E 220 d or E 300 de Hybrid) as our business sedan, the S-Class (S 450 4MATIC or S 580 e Hybrid) as our executive sedan, and the V-Class (V 300 d Extralong AVANTGARDE) as our six-passenger van. Every vehicle is 2022 model year or newer, 9-speed automatic transmission, and configured in black exterior with black leather or Nappa interior. Each chassis is serviced on the factory-recommended schedule by authorised Mercedes-Benz Prague technicians, and we refresh the fleet on a rolling cycle so no car remains in service long enough for its cosmetic or mechanical standard to slip. We deliberately run one marque and three silhouettes — it means every driver knows the controls, every passenger recognises the interior, and there are no surprises.',
  },
  {
    q: 'How many passengers and how much luggage fit in each class?',
    a: 'The Mercedes E-Class seats up to 3 passengers and carries 2 large suitcases plus 2 cabin bags comfortably in its 540-litre boot — the right choice for a solo traveller or couple with full airport luggage. The S-Class has the same 3-passenger limit but adds executive-package rear legroom and massage seats; the boot is 550 litres, so luggage capacity is effectively identical to the E-Class. The V-Class seats up to 6 passengers in individual captain chairs and takes 6 large cases plus 6 cabin bags without compromise thanks to its 1,410-litre cargo area — the only fleet choice for families, board transfers, and multi-bag intercity trips. If you are carrying skis, golf bags, or oversized items, book the V-Class and tell us at booking.',
  },
  {
    q: 'Are the vehicles insured and licensed for international travel?',
    a: 'Yes. Every PRESTIGO vehicle is fully registered in the Czech Republic, carries commercial passenger-liability insurance and comprehensive vehicle cover underwritten by an EU insurer, and holds the Czech passenger-transport licence (koncese) required for commercial chauffeur operation. For intercity routes we carry the Czech dálniční známka, the Austrian and Slovak vignettes, and we pay every German motorway toll and every bridge or tunnel charge along the way — all included in the quoted fare. Drivers hold valid international professional driver qualifications (ŘPZD), background checks, and fluent English at minimum B2. We are happy to provide insurance certificates and vehicle documentation in advance for corporate procurement teams or diplomatic security requirements — email info@rideprestigo.com and we will send the dossier within one business day.',
  },
  {
    q: 'Can I request a specific vehicle, colour, or interior configuration?',
    a: 'Vehicle class (E, S, or V) is always your choice and is guaranteed at booking. Within a class, every PRESTIGO car is black exterior with black leather or Nappa interior and the same specification set, so requesting a specific chassis is rarely necessary — the experience is consistent across the fleet. If you have a genuine preference (for example, a client who has travelled with a specific driver before and would like the same vehicle), note it in the booking form and we will honour the request when scheduling allows. For VIP, diplomatic, or multi-vehicle event bookings we can coordinate matching cars, pre-position them at a specific arrival time, and provide a single point of dispatch contact. Child seats, phone chargers, and bottled water are standard in every car.',
  },
  {
    q: 'How often is the fleet serviced and replaced?',
    a: 'PRESTIGO vehicles are serviced by authorised Mercedes-Benz technicians on the manufacturer-recommended schedule — typically every 25,000 km or 12 months, whichever comes first, for E-Class and S-Class, and every 20,000 km or 12 months for V-Class. Between scheduled services we run daily pre-trip inspections covering tyre pressure and tread, fluid levels, lighting, brake response, and cabin cleanliness. Consumables (tyres, brake pads, wipers, cabin filters) are replaced well before the legal minimum. We retire and replace vehicles on a rolling 3–4 year cycle so no car in service is ever old enough to look or feel dated. If a vehicle needs unscheduled repair mid-assignment, dispatch swaps it for a matching class car immediately — you should never notice, and in practice our clients rarely do.',
  },
  {
    q: 'Is Wi-Fi, phone charging, and child seats really included in every car?',
    a: 'Yes, included at no extra cost in every PRESTIGO vehicle. Wi-Fi runs on an enterprise 5G mobile router with unlimited data — bandwidth is good enough to take a video call from Prague to Vienna without dropping. USB-C and USB-A fast-charging ports are within reach of every seat, and Apple and Samsung fast-charge protocols are supported. We carry a full range of EU-certified (R129/i-Size) child and booster seats — rear-facing infant, forward-facing toddler, and booster — and install the right one before pickup as long as you confirm the child&rsquo;s age and weight at booking. Bottled still and sparkling water are standard; coffee, tea, and champagne are available on request for executive and VIP bookings. If you need an adapter or a specific amenity, just ask at booking.',
  },
]

const fleetSchemaGraph = {
  '@context': 'https://schema.org',
  '@graph': [
    vehicleListSchema,
    breadcrumbSchema,
    {
      '@type': 'FAQPage',
      '@id': 'https://rideprestigo.com/fleet#faq',
      mainEntity: fleetFaqs.map((f) => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a },
      })),
    },
  ],
}

export default function FleetPage() {
  return (
    <main id="main-content">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(fleetSchemaGraph) }} />
      <Nav />

      {/* Hero */}
      <section className="relative overflow-hidden" style={{ minHeight: '560px' }}>
        <div className="absolute inset-0">
          <Image src="/hero-fleet.webp" alt="PRESTIGO Mercedes Fleet — Prague Chauffeur" fill style={{ objectFit: 'cover', filter: 'brightness(0.38)' }} />
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
            <Reveal key={v.model} variant="up" delay={i * 150}>
            <div
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

                {/* Spec table */}
                <dl className="border-t border-anthracite-light pt-5 grid grid-cols-2 gap-x-6 gap-y-3 text-[11px]">
                  {[
                    ['Seats', `${v.specs.seating} passengers`],
                    ['Luggage', v.specs.luggage],
                  ].map(([label, val]) => (
                    <div key={String(label)} className="flex flex-col">
                      <dt className="font-body font-medium uppercase tracking-[0.12em] text-warmgrey/80" style={{ fontSize: '9px' }}>{label}</dt>
                      <dd className="font-body font-light text-offwhite mt-1">{val}</dd>
                    </div>
                  ))}
                </dl>

                <div className="flex items-center gap-6">
                  <a href="/services/airport-transfer" className="tier-cta" style={{ display: 'inline-block', marginTop: '0.5rem' }}>See pricing →</a>
                  <a href="/book" className="btn-primary" style={{ padding: '10px 24px', fontSize: '9px' }}>
                    Book {v.model.split(' ').pop()}
                  </a>
                </div>
                <p className="font-body font-light text-[11px] text-warmgrey">
                  Ideal for: {v.idealFor}
                </p>
              </div>
            </div>
            </Reveal>
          ))}
        </div>
      </section>

      <Divider />

      {/* Standards */}
      <section className="bg-anthracite-mid py-16 md:py-20">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <Reveal variant="up" className="mb-14">
            <h2 className="display text-[28px] md:text-[36px]">Every vehicle, every time</h2>
          </Reveal>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {standards.map((s, i) => (
              <Reveal key={s.title} variant="up" delay={i * 100}>
              <div>
                <span className="copper-line mb-5 block" />
                <h3 className="font-body font-medium text-[11px] tracking-[0.15em] uppercase text-offwhite mb-2">{s.title}</h3>
                <p className="body-text text-[12px]">{s.body}</p>
              </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <Divider />

      {/* Why Mercedes-Benz */}
      <section className="bg-anthracite py-16 md:py-24">
        <div className="max-w-7xl mx-auto px-6 md:px-12 grid grid-cols-1 md:grid-cols-2 gap-14 md:gap-24">
          <Reveal variant="up">
          <div>
            <p className="label mb-6">Why Mercedes-Benz exclusively</p>
            <span className="copper-line mb-8 block" />
            <h2 className="display text-[28px] md:text-[36px] mb-8">One marque. Three silhouettes. <span className="display-italic">Zero compromise.</span></h2>
          </div>
          </Reveal>
          <Reveal variant="up" delay={150}>
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
          </Reveal>
        </div>
      </section>

      <Divider />

      {/* Maintenance & safety */}
      <section className="bg-anthracite-mid py-16 md:py-24">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <Reveal variant="up">
          <div className="mb-14">
            <p className="label mb-6">Maintenance &amp; Safety</p>
            <span className="copper-line mb-8 block" />
            <h2 className="display text-[28px] md:text-[36px]">Prepared before<br /><span className="display-italic">every journey.</span></h2>
          </div>
          </Reveal>
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
            ].map((item, i) => (
              <Reveal key={item.title} variant="up" delay={i * 120}>
              <div className="border border-anthracite-light p-8">
                <span className="copper-line mb-5 block" />
                <h3 className="font-display font-light text-[20px] text-offwhite mb-3">{item.title}</h3>
                <p className="body-text text-[12px]" style={{ lineHeight: '1.9' }}>{item.body}</p>
              </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <Divider />

      {/* Technology onboard */}
      <section className="bg-anthracite py-16 md:py-24">
        <div className="max-w-7xl mx-auto px-6 md:px-12 grid grid-cols-1 md:grid-cols-2 gap-14 md:gap-24">
          <Reveal variant="up">
          <div>
            <p className="label mb-6">Technology onboard</p>
            <span className="copper-line mb-8 block" />
            <h2 className="display text-[28px] md:text-[36px] mb-6">A rolling office.<br /><span className="display-italic">A quiet sanctuary.</span></h2>
            <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
              Our passengers often arrive at the car with work still to finish — or nerves still to settle after a long flight. The cabin of every PRESTIGO vehicle is prepared for both. Whether you need to take a video call between meetings or simply close your eyes for an hour, the interior adapts to you, not the other way around.
            </p>
          </div>
          </Reveal>
          <Reveal variant="up" delay={150}>
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
          </Reveal>
        </div>
      </section>

      <Divider />

      {/* Selection criteria */}
      <section className="bg-anthracite-mid py-16 md:py-24">
        <div className="max-w-4xl mx-auto px-6 md:px-12">
          <Reveal variant="up">
          <p className="label mb-6">How we choose a class for your journey</p>
          <span className="copper-line mb-8 block" />
          <h2 className="display text-[28px] md:text-[36px] mb-10">Matching vehicle to <span className="display-italic">occasion.</span></h2>
          </Reveal>
          <Reveal variant="fade" delay={100}>
          <div className="flex flex-col gap-6">
            <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
              The right vehicle depends on the trip, not the price list. A solo executive arriving from London City with a briefcase and a carry-on is best served by an E-Class — efficient, quiet, and perfectly appointed for a ninety-minute airport run. A visiting principal with protocol requirements and an aide will prefer the S-Class, where rear legroom, massage seats, and the near-silent cabin become genuinely useful. A family of five with skis and luggage, or a four-person board arriving for a half-day roadshow, belongs in the V-Class — the only vehicle in the fleet that comfortably seats six adults with full luggage.
            </p>
            <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
              If you&rsquo;re unsure which class fits your booking, note your passenger count, luggage, and journey length in the booking form and our dispatcher will confirm the right pairing within minutes. For recurring corporate travel, we maintain vehicle preferences against your account profile so every trip is matched automatically.
            </p>
          </div>
          </Reveal>
        </div>
      </section>

      <Divider />

      {/* FAQ */}
      <section className="bg-anthracite-mid py-16 md:py-24">
        <div className="max-w-3xl mx-auto px-6 md:px-12">
          <Reveal variant="up">
          <p className="label mb-6">Fleet questions</p>
          <span className="copper-line mb-8 block" />
          <h2 className="display text-[28px] md:text-[36px] mb-12">About the vehicles.</h2>
          </Reveal>
          <div className="flex flex-col gap-0">
            {fleetFaqs.map((faq, i) => (
              <Reveal key={faq.q} variant="up" delay={i * 80}>
              <div className={`py-7 border-b border-anthracite-light ${i === 0 ? 'border-t' : ''}`}>
                <h3 className="font-body font-medium text-[12px] tracking-[0.1em] uppercase text-offwhite mb-3">{faq.q}</h3>
                <p className="body-text text-[12px]" style={{ lineHeight: '1.9' }}>{faq.a}</p>
              </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <Divider />

      {/* CTA */}
      <section className="bg-anthracite py-20">
        <div className="max-w-7xl mx-auto px-6 md:px-12 text-center">
          <Reveal variant="up">
          <h2 className="display text-[32px] md:text-[42px] mb-4">
            Choose your vehicle.<br />
            <span className="display-italic">Book online.</span>
          </h2>
          <p className="body-text text-[13px] mt-4 mb-10">Select your preferred class at checkout.</p>
          </Reveal>
          <Reveal variant="fade" delay={150}>
          <a href="/book" className="btn-primary">Book a Transfer</a>
          </Reveal>
        </div>
      </section>

      <Footer />
    </main>
  )
}
