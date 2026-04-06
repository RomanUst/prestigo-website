import type { Metadata } from 'next'
import Nav from '@/components/Nav'
import Footer from '@/components/Footer'

export const metadata: Metadata = {
  title: 'Prague to Kutná Hora Private Transfer — From €115',
  description: 'Book a private chauffeur from Prague to Kutná Hora. 70 km door-to-door in a Mercedes-Benz. Fixed price from €115, UNESCO old town, Sedlec Ossuary.',
  alternates: { canonical: '/routes/prague-kutna-hora' },
  openGraph: {
    url: 'https://rideprestigo.com/routes/prague-kutna-hora',
    title: 'Prague to Kutná Hora Private Transfer — From €115',
    description: 'Book a private chauffeur from Prague to Kutná Hora. 70 km door-to-door in a Mercedes-Benz. Fixed price from €115, UNESCO old town, Sedlec Ossuary.',
  },
}

const highlights = [
  { label: 'Distance', value: '~70 km' },
  { label: 'Duration', value: '~1 hour' },
  { label: 'Vehicles', value: ['Business Class', 'First Class', 'Business Van'] },
  { label: 'Price from', value: '€115', copper: true },
]

const vehicles = [
  { name: 'Mercedes-Benz E-Class', category: 'Business Class', capacity: '1–3 passengers', bags: '3 bags', price: 'From €115', photo: '/e-class-photo.png' },
  { name: 'Mercedes-Benz S-Class', category: 'Executive Class', capacity: '1–3 passengers', bags: '3 bags', price: 'From €170', photo: '/s-class-photo.png' },
  { name: 'Mercedes-Benz V-Class', category: 'Business Van', capacity: '1–6 passengers', bags: '6 bags', price: 'From €135', photo: '/v-class-photo.png' },
]

const inclusions = [
  'Door-to-door service from any Prague address',
  'Fixed price — no surge, no meter running',
  'Complimentary still water on board',
  'Meet & greet with name board at hotel or address',
  'Return same day — driver waits or returns at agreed time',
  'Sedlec Ossuary and Cathedral of St. Barbara on request',
  'Free cancellation up to 2 hours before departure',
  "Need an hour or more at a stop? Waiting time is simply added to the final price — your driver is always there when you're ready.",
]

const faqs = [
  { q: 'How long does the Prague to Kutná Hora transfer take?', a: 'Approximately 1 hour each way. The route heads east from Prague on the D11 motorway, then regional road into the historic town. Traffic is generally light outside peak summer weekends.' },
  { q: 'Can I visit the Sedlec Ossuary as part of the transfer?', a: 'Yes. The Sedlec Ossuary (Bone Church) is a 10-minute walk from the town centre. PRESTIGO drivers can drop you at the entrance and wait or return at an agreed time.' },
  { q: 'Is a same-day return available?', a: 'Yes. Your driver can wait in Kutná Hora while you explore, or return to pick you up at an agreed time. Both options are bookable at the same fixed rate.' },
  { q: 'What is included in the fixed price?', a: 'All tolls, fuel, and driver waiting time up to 60 minutes. For day trips with extended waiting, waiting time beyond the included allowance is added at €60/hour for E-Class.' },
  { q: 'Is the V-Class suitable for a family day trip?', a: 'Yes. The Mercedes V-Class accommodates up to 6 passengers and is ideal for family groups visiting Kutná Hora. Plenty of space for luggage and shopping.' },
  { q: 'Can I combine Kutná Hora with Pardubice or Hradec Králové?', a: 'Yes. PRESTIGO can arrange a multi-stop day itinerary covering Kutná Hora and nearby East Bohemian towns. Contact us for custom route pricing.' },
]


const faqSchema = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: faqs.map(f => ({
    '@type': 'Question',
    name: f.q,
    acceptedAnswer: { '@type': 'Answer', text: f.a },
  })),
}

const breadcrumbSchema = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://rideprestigo.com' },
    { '@type': 'ListItem', position: 2, name: 'Routes', item: 'https://rideprestigo.com/routes' },
    { '@type': 'ListItem', position: 3, name: 'Prague to Kutná Hora', item: 'https://rideprestigo.com/routes/prague-kutna-hora' },
  ],
}

export default function PragueKutnaHoraPage() {
  return (
    <main id="main-content">
      <Nav />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />

      {/* Hero */}
      <section className="relative border-b border-anthracite-light overflow-hidden" style={{ minHeight: '560px' }}>
        <div className="absolute inset-0">
          <img src="/photohero.png" alt="Kutná Hora" className="w-full h-full object-cover" style={{ filter: 'brightness(0.38)' }} />
        </div>
        <div className="relative z-10 max-w-7xl mx-auto px-6 md:px-12 pt-40 pb-20">
          <p className="label mb-6">Prague → Kutná Hora</p>
          <span className="copper-line mb-8 block" />
          <h1 className="display text-[40px] md:text-[56px] max-w-2xl">
            Prague to Kutná Hora,<br />
            <span className="display-italic">the silver city.</span>
          </h1>
          <p className="body-text text-[13px] mt-6 max-w-lg" style={{ lineHeight: '1.9' }}>
            70 km east of Prague, the medieval silver-mining capital of Bohemia awaits. UNESCO old town, the haunting Sedlec Ossuary, and the Cathedral of St. Barbara. One hour, one vehicle, one fixed price.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row gap-4">
            <a href="/book" className="btn-primary">Book this Route</a>
            <a href="/contact" className="btn-ghost">Ask a Question</a>
          </div>
        </div>
      </section>

      {/* Route stats */}
      <section className="bg-anthracite-mid py-12 border-b border-anthracite-light">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {highlights.map((h) => (
              <div key={h.label}>
                <p className="font-body font-light text-[9px] tracking-[0.2em] uppercase mb-2" style={{ color: 'var(--copper)' }}>{h.label}</p>
                {Array.isArray(h.value) ? (
                  <div>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {h.value.map((tag) => (
                        <span key={tag} className="font-body font-light text-[9px] tracking-[0.15em] uppercase px-3 py-1.5 border border-anthracite-light text-offwhite">{tag}</span>
                      ))}
                    </div>
                    <p className="font-body font-light text-[10px] text-warmgrey mt-3" style={{ letterSpacing: '0.03em' }}>Available on this route</p>
                  </div>
                ) : (
                  <p className="font-body font-light text-[22px]" style={{ color: (h as { copper?: boolean }).copper ? 'var(--copper-light)' : 'var(--offwhite)' }}>{h.value}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* What's included */}
      <section className="bg-anthracite py-16 md:py-24 border-b border-anthracite-light">
        <div className="max-w-7xl mx-auto px-6 md:px-12 grid grid-cols-1 md:grid-cols-2 gap-16">
          <div>
            <p className="label mb-6">The Service</p>
            <h2 className="display text-[28px] md:text-[38px] mb-6">
              Everything included,<br />
              <span className="display-italic">nothing to arrange.</span>
            </h2>
            <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>
              PRESTIGO's Prague–Kutná Hora transfer covers the full journey in comfort. No bus timetables, no taxi queues at the historic centre. Your driver meets you at the door and waits while you explore.
            </p>
          </div>
          <div className="flex flex-col gap-4 justify-center">
            {inclusions.map((item) => (
              <div key={item} className="flex items-start gap-4">
                <span className="mt-[7px] w-1 h-1 rounded-full flex-shrink-0" style={{ background: 'var(--copper)' }} />
                <span className="font-body font-light text-[13px] text-warmgrey" style={{ lineHeight: '1.8' }}>{item}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Vehicles */}
      <section className="bg-anthracite-mid py-16 md:py-24 border-b border-anthracite-light">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <p className="label mb-6">Fleet</p>
          <h2 className="display text-[28px] md:text-[38px] mb-14">Choose your vehicle</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {vehicles.map((v) => (
              <div key={v.name} className="border border-anthracite-light flex flex-col">
                <div className="w-full overflow-hidden" style={{ aspectRatio: '16/9' }}>
                  <img src={v.photo} alt={v.name} className="w-full h-full object-cover" style={{ filter: 'brightness(0.92)' }} />
                </div>
                <div className="p-8 flex flex-col gap-6 flex-1">
                  <div>
                    <p className="font-body font-light text-[9px] tracking-[0.2em] uppercase mb-3" style={{ color: 'var(--copper)' }}>{v.category}</p>
                    <h3 className="font-display font-light text-[24px] text-offwhite mb-2">{v.name}</h3>
                  </div>
                  <div className="flex flex-col gap-2">
                    <div className="flex justify-between">
                      <span className="font-body font-light text-[11px] text-warmgrey tracking-[0.05em]">Passengers</span>
                      <span className="font-body font-light text-[11px] text-offwhite">{v.capacity}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-body font-light text-[11px] text-warmgrey tracking-[0.05em]">Luggage</span>
                      <span className="font-body font-light text-[11px] text-offwhite">{v.bags}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-body font-light text-[11px] text-warmgrey tracking-[0.05em]">Transfer price</span>
                      <span className="font-body font-light text-[11px]" style={{ color: 'var(--copper-light)' }}>{v.price}</span>
                    </div>
                  </div>
                  <a href="/book" className="btn-primary self-center mt-auto" style={{ padding: '10px 24px', fontSize: '9px' }}>Book Online</a>
                </div>
              </div>
            ))}
          </div>
          <p className="body-text text-[11px] mt-8" style={{ lineHeight: '1.8' }}>
            All vehicles are late-model Mercedes-Benz, maintained to manufacturer standard. Child seats available on request at no charge.
          </p>
        </div>
      </section>

      {/* Route detail */}
      <section className="bg-anthracite py-16 md:py-24 border-b border-anthracite-light">
        <div className="max-w-7xl mx-auto px-6 md:px-12 grid grid-cols-1 md:grid-cols-2 gap-16">
          <div>
            <p className="label mb-6">The Journey</p>
            <h2 className="display text-[28px] md:text-[38px] mb-6">
              Prague to Kutná Hora,<br />
              <span className="display-italic">the route.</span>
            </h2>
            <div className="flex flex-col gap-8 mt-10">
              {[
                { city: 'Prague', note: 'Pickup from your hotel, office, or Prague Airport (PRG). Driver waits up to 60 minutes at the airport.', anchor: true, custom: false },
                { city: 'Anywhere you like', note: 'A stop at Kolín, a roadside break, or any address on the way. Your route, your schedule.', anchor: false, custom: true },
                { city: 'Kutná Hora', note: 'Drop-off at the town centre, your hotel, or the Sedlec Ossuary entrance. Driver can wait for your return.', anchor: true, custom: false },
              ].map((stop, i, arr) => (
                <div key={stop.city} className="flex gap-6">
                  <div className="flex flex-col items-center">
                    <div className="w-2 h-2 rounded-full flex-shrink-0 mt-1" style={{ background: stop.anchor ? 'var(--copper)' : stop.custom ? 'transparent' : 'var(--anthracite-light)', border: stop.custom ? '1px solid var(--copper)' : 'none' }} />
                    {i < arr.length - 1 && (
                      <div className="w-px flex-1 mt-2" style={{ background: stop.custom ? 'var(--copper)' : 'var(--anthracite-light)', minHeight: '40px', opacity: stop.custom ? 0.4 : 1 }} />
                    )}
                  </div>
                  <div className="pb-6">
                    <p className="font-body font-light text-[11px] tracking-[0.15em] uppercase mb-1" style={{ color: stop.custom ? 'var(--copper-pale)' : 'var(--offwhite)' }}>{stop.city}</p>
                    <p className="body-text text-[12px]" style={{ lineHeight: '1.8' }}>{stop.note}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-6 justify-start pt-[60px]">
            <div className="border border-anthracite-light p-8">
              <p className="font-body font-light text-[9px] tracking-[0.2em] uppercase mb-6" style={{ color: 'var(--copper)' }}>Good to know</p>
              <div className="flex flex-col gap-5">
                {[
                  { label: 'Border crossing', value: 'No border crossing — entirely within the Czech Republic.' },
                  { label: 'Tolls', value: 'Czech motorway vignette included in the quoted price.' },
                  { label: 'Return transfer', value: 'Book both directions together for a reduced rate.' },
                  { label: 'Day trip', value: 'PRESTIGO covers the full day-trip format. Driver waits on-site or returns at your agreed time.' },
                ].map((item) => (
                  <div key={item.label}>
                    <p className="font-body font-light text-[9px] tracking-[0.2em] uppercase mb-1" style={{ color: 'var(--copper)' }}>{item.label}</p>
                    <p className="body-text text-[12px]" style={{ lineHeight: '1.8' }}>{item.value}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="bg-anthracite-mid py-16 md:py-20 border-b border-anthracite-light">
        <div className="max-w-3xl mx-auto px-6 md:px-12">
          <h2 className="display text-[28px] md:text-[34px] mb-12">Common questions</h2>
          <div className="flex flex-col gap-0">
            {faqs.map((faq, i) => (
              <div key={faq.q} className={`py-7 border-b border-anthracite-light ${i === 0 ? 'border-t' : ''}`}>
                <h3 className="font-body font-medium text-[12px] tracking-[0.1em] uppercase text-offwhite mb-3">{faq.q}</h3>
                <p className="body-text text-[12px]" style={{ lineHeight: '1.9' }}>{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-anthracite py-20 border-t border-anthracite-light">
        <div className="max-w-7xl mx-auto px-6 md:px-12 flex flex-col md:flex-row items-start md:items-center justify-between gap-8">
          <div>
            <h2 className="display text-[28px] md:text-[36px]">
              Prague to Kutná Hora.<br />
              <span className="display-italic">From €115, fixed.</span>
            </h2>
            <p className="body-text text-[13px] mt-4">No surprises. No meters. Your driver is waiting.</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-4">
            <a href="/book" className="btn-primary">Book Now</a>
            <a href="/routes" className="btn-ghost">All Routes</a>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  )
}
