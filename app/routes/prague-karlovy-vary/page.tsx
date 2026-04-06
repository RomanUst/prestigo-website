import type { Metadata } from 'next'
import Nav from '@/components/Nav'
import Footer from '@/components/Footer'

export const metadata: Metadata = {
  title: 'Prague to Karlovy Vary Private Transfer — From €215',
  description: 'Book a private chauffeur from Prague to Karlovy Vary. 130 km door-to-door in a Mercedes-Benz. Fixed price from €215, spa town luxury transfer.',
  alternates: { canonical: '/routes/prague-karlovy-vary' },
  openGraph: {
    url: 'https://rideprestigo.com/routes/prague-karlovy-vary',
    title: 'Prague to Karlovy Vary Private Transfer — From €215',
    description: 'Book a private chauffeur from Prague to Karlovy Vary. 130 km door-to-door in a Mercedes-Benz. Fixed price from €215, spa town luxury transfer.',
  },
}

const highlights = [
  { label: 'Distance', value: '~130 km' },
  { label: 'Duration', value: '~1.5 hours' },
  { label: 'Vehicles', value: ['Business Class', 'First Class', 'Business Van'] },
  { label: 'Price from', value: 'From €215', copper: true },
]

const vehicles = [
  { name: 'Mercedes-Benz E-Class', category: 'Business Class', capacity: '1–3 passengers', bags: '3 bags', price: 'From €215', photo: '/e-class-photo.png' },
  { name: 'Mercedes-Benz S-Class', category: 'Executive Class', capacity: '1–3 passengers', bags: '3 bags', price: 'From €320', photo: '/s-class-photo.png' },
  { name: 'Mercedes-Benz V-Class', category: 'Business Van', capacity: '1–6 passengers', bags: '6 bags', price: 'From €250', photo: '/v-class-photo.png' },
]

const inclusions = [
  'Door-to-door service from any Prague address',
  'Fixed price — no surge, no meter running',
  'Complimentary still water on board',
  'Meet & greet with name board at hotel or airport',
  'Stops available — Mariánské Lázně or Františkovy Lázně on request',
  'Return same day or multi-day — book both legs together',
  'Free cancellation up to 2 hours before departure',
  "Need an hour or more at a stop? Waiting time is simply added to the final price — your driver is always there when you're ready.",
]

const faqs = [
  { q: 'How long does the Prague to Karlovy Vary transfer take?', a: 'Approximately 1.5 hours via the D6 motorway under normal traffic conditions. The route is straightforward and rarely congested outside peak summer weekends.' },
  { q: 'Can I stop in Mariánské Lázně on the way?', a: 'Yes. Mariánské Lázně and Františkovy Lázně are both available as en-route stops. Request at booking or let your driver know on the day.' },
  { q: 'Do you offer same-day return transfers from Karlovy Vary?', a: 'Yes. Return transfers are available on the same day or on a later date. Booking both legs together qualifies for a reduced rate.' },
  { q: 'What is included in the fixed price?', a: 'All tolls, fuel, and driver waiting time up to 60 minutes at airports. No hidden charges — the price quoted is the price paid.' },
  { q: 'Can I be picked up from Karlovy Vary Airport?', a: 'Yes. PRESTIGO serves Karlovy Vary Airport (KLV). Request airport pickup at booking and your driver will track your flight.' },
  { q: 'What vehicles are available on this route?', a: 'Mercedes-Benz E-Class for individuals or small groups, S-Class for a more executive experience, and V-Class for groups of up to 6 passengers.' },
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
    { '@type': 'ListItem', position: 3, name: 'Prague to Karlovy Vary', item: 'https://rideprestigo.com/routes/prague-karlovy-vary' },
  ],
}

export default function PragueKarlovyVaryPage() {
  return (
    <main id="main-content">
      <Nav />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />

      {/* Hero */}
      <section className="relative border-b border-anthracite-light overflow-hidden" style={{ minHeight: '560px' }}>
        <div className="absolute inset-0">
          <img src="/photohero.png" alt="Karlovy Vary" className="w-full h-full object-cover" style={{ filter: 'brightness(0.38)' }} />
        </div>
        <div className="relative z-10 max-w-7xl mx-auto px-6 md:px-12 pt-40 pb-20">
          <p className="label mb-6">Prague → Karlovy Vary</p>
          <span className="copper-line mb-8 block" />
          <h1 className="display text-[40px] md:text-[56px] max-w-2xl">
            Prague to Karlovy Vary,<br />
            <span className="display-italic">spa country, direct.</span>
          </h1>
          <p className="body-text text-[13px] mt-6 max-w-lg" style={{ lineHeight: '1.9' }}>
            130 km west on the D6, through the Bohemian highlands. The most celebrated spa town in Central Europe — film festival, thermal colonnades, and Becherovka. One vehicle, one fixed price.
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
              PRESTIGO's Prague–Karlovy Vary transfer covers the full journey in comfort. No rail transfers, no taxi queues at the spa. Your driver meets you at the door and delivers you to the colonnade.
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
                <div className="w-full overflow-hidden" style={{ aspectRatio: '16/9', position: 'relative' }}>
                  <img src={v.photo} alt={v.name} className="w-full h-full object-cover object-top" style={{ filter: 'brightness(0.92)' }} />
                  <div style={{ position: 'absolute', bottom: 0, right: 0, width: 120, height: 120, background: 'radial-gradient(circle at bottom right, rgba(0,0,0,1) 0%, rgba(0,0,0,0.85) 40%, transparent 75%)' }} />
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
              Prague to Karlovy Vary,<br />
              <span className="display-italic">the route.</span>
            </h2>
            <div className="flex flex-col gap-8 mt-10">
              {[
                { city: 'Prague', note: 'Pickup from your hotel, office, or Prague Airport (PRG). Driver waits up to 60 minutes at the airport.', anchor: true, custom: false },
                { city: 'Anywhere you like', note: 'A stop for a photo, a coffee, or a detour. The route belongs to you.', anchor: false, custom: true },
                { city: 'Karlovy Vary', note: 'Drop-off at your hotel, the Grand Colonnade, or Karlovy Vary Airport (KLV) on request.', anchor: true, custom: false },
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
                  { label: 'Spa stops', value: 'Mariánské Lázně and Františkovy Lázně are available as en-route stops. Just request at booking.' },
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
              Prague to Karlovy Vary.<br />
              <span className="display-italic">From €215, fixed.</span>
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
