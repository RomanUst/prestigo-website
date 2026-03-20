import type { Metadata } from 'next'
import Nav from '@/components/Nav'
import Footer from '@/components/Footer'

export const metadata: Metadata = {
  title: 'Prague to Vienna, Berlin, Munich & More — Intercity Chauffeur | PRESTIGO',
  description: 'Private chauffeur transfers from Prague to Vienna (from €290), Berlin (from €310), Munich (from €330), Budapest, Bratislava, Salzburg, Dresden. Fixed price, door-to-door.',
  alternates: { canonical: '/routes' },
  openGraph: {
    url: 'https://prestigo-site.vercel.app/routes',
    title: 'Prague to Vienna, Berlin, Munich & More — Intercity Chauffeur | PRESTIGO',
    description: 'Private chauffeur transfers from Prague to Vienna (from €290), Berlin (from €310), Munich (from €330), Budapest, Bratislava, Salzburg, Dresden. Fixed price, door-to-door.',
  },
}

const routes = [
  {
    from: 'Prague',
    to: 'Vienna',
    h2: 'Prague to Vienna Private Chauffeur',
    description: 'The classic Central European route. 330 km through the Bohemian countryside, arriving in Vienna\'s Innere Stadt. Business class, without the airport.',
    distance: '330 km',
    duration: '~3.5 hours',
    road: 'Motorway D1/A22',
    price: 'From €290',
    notes: ['Flight tracking from Vienna Airport on return', 'Stops available on request (Bratislava, Brno)'],
  },
  {
    from: 'Prague',
    to: 'Berlin',
    h2: 'Prague to Berlin Private Transfer',
    description: 'Four hours north through Dresden. Board meetings, trade shows, weekend escapes. One vehicle, one price, no connections.',
    distance: '350 km',
    duration: '~4 hours',
    road: 'Motorway D8/A17',
    price: 'From €310',
    notes: ['Dresden stopover available', 'Return journeys bookable online'],
  },
  {
    from: 'Prague',
    to: 'Munich',
    h2: 'Prague to Munich Chauffeur Service',
    description: 'West through Pilsen and Bavaria. Oktoberfest, business parks, the Munich airport — PRESTIGO covers every reason to travel.',
    distance: '380 km',
    duration: '~4.5 hours',
    road: 'Motorway D5/A93',
    price: 'From €330',
    notes: ['Munich Airport (MUC) pickups included'],
  },
  {
    from: 'Prague',
    to: 'Budapest',
    h2: 'Prague to Budapest Private Driver',
    description: 'The longest route in the portfolio, and the most scenic. Brno, Vienna, and the Danube bend — six hours that feel curated.',
    distance: '530 km',
    duration: '~6 hours',
    road: null,
    price: 'From €420',
    notes: ['Vienna and Bratislava stops available'],
  },
  {
    from: 'Prague',
    to: 'Bratislava',
    h2: 'Prague to Bratislava Chauffeur',
    description: 'Slovakia\'s capital is just 3.5 hours from Prague. Corporate travel, EU institutions, weekend breaks.',
    distance: '330 km',
    duration: '~3.5 hours',
    road: null,
    price: 'From €280',
    notes: [],
  },
  {
    from: 'Prague',
    to: 'Salzburg',
    h2: 'Prague to Salzburg Transfer',
    description: 'Mozart, the Alps, and five hours of quiet motorway. Business or leisure.',
    distance: '410 km',
    duration: '~5 hours',
    road: null,
    price: 'From €360',
    notes: [],
  },
  {
    from: 'Prague',
    to: 'Dresden',
    h2: 'Prague to Dresden Private Transfer',
    description: 'Just 150 km through the Saxon Switzerland national park. The closest major German city to Prague.',
    distance: '150 km',
    duration: '~1.5 hours',
    road: 'Motorway D8/A17',
    price: 'From €180',
    notes: [],
  },
]

const faqs = [
  {
    q: 'Can I stop en route?',
    a: 'Yes. Stops can be added at booking or on the day.',
  },
  {
    q: 'What if my plans change?',
    a: 'Free cancellation up to 2 hours before departure.',
  },
  {
    q: 'Can I book a return journey?',
    a: 'Yes, return bookings are available at a discount.',
  },
  {
    q: 'What vehicle will I travel in?',
    a: 'Mercedes E-Class (standard), S-Class (executive), or V-Class (group). Select at booking.',
  },
]

export default function RoutesPage() {
  return (
    <main id="main-content">
      <Nav />

      {/* Hero */}
      <section className="bg-anthracite pt-32 pb-16 md:pt-40 md:pb-20 border-b border-anthracite-light">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <p className="label mb-6">Intercity Routes</p>
          <span className="copper-line mb-8 block" />
          <h1 className="display text-[40px] md:text-[56px] max-w-xl">
            Central Europe,<br />
            <span className="display-italic">door to door.</span>
          </h1>
          <p className="body-text text-[13px] mt-6 max-w-lg" style={{ lineHeight: '1.9' }}>
            Prague is the centre of Central Europe. Vienna, Berlin, Munich, Budapest — all within a day's drive. PRESTIGO chauffeurs cover every route with fixed pricing, premium vehicles, and zero surprises.
          </p>
        </div>
      </section>

      {/* Route sections */}
      <section className="bg-anthracite py-16 md:py-24">
        <div className="max-w-7xl mx-auto px-6 md:px-12 flex flex-col gap-0">
          {routes.map((r, i) => (
            <div
              key={r.to}
              className={`py-14 md:py-16 border-b border-anthracite-light grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-16 ${i === 0 ? 'border-t' : ''}`}
            >
              <div>
                <p className="label mb-4">{r.from} → {r.to}</p>
                <h2 className="display text-[26px] md:text-[32px] mb-4">{r.h2}</h2>
                <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>{r.description}</p>
              </div>
              <div className="flex flex-col justify-between gap-6">
                <div className="flex flex-col gap-3">
                  <div className="flex gap-6">
                    <div>
                      <p className="font-body font-light text-[9px] tracking-[0.2em] uppercase mb-1" style={{ color: 'var(--copper)' }}>Distance</p>
                      <p className="font-body font-light text-[13px] text-offwhite">{r.distance}</p>
                    </div>
                    <div>
                      <p className="font-body font-light text-[9px] tracking-[0.2em] uppercase mb-1" style={{ color: 'var(--copper)' }}>Duration</p>
                      <p className="font-body font-light text-[13px] text-offwhite">{r.duration}</p>
                    </div>
                    <div>
                      <p className="font-body font-light text-[9px] tracking-[0.2em] uppercase mb-1" style={{ color: 'var(--copper)' }}>Price</p>
                      <p className="font-body font-light text-[13px]" style={{ color: 'var(--copper-light)' }}>{r.price}</p>
                    </div>
                  </div>
                  {r.notes.length > 0 && (
                    <ul className="flex flex-col gap-2 mt-2">
                      {r.notes.map((n) => (
                        <li key={n} className="flex items-start gap-3">
                          <span className="mt-[6px] w-1 h-1 rounded-full flex-shrink-0" style={{ background: 'var(--copper)' }} />
                          <span className="font-body font-light text-[12px] text-warmgrey">{n}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <a href="/book" className="btn-primary self-start" style={{ padding: '10px 24px', fontSize: '9px' }}>
                  Book Prague → {r.to}
                </a>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="bg-anthracite-mid py-16 md:py-20 border-t border-anthracite-light">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <h2 className="display text-[28px] md:text-[36px] mb-14">How it works</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
            {[
              { step: '01', title: 'Book', body: 'Select your route and vehicle. Fixed price confirmed instantly.' },
              { step: '02', title: 'Travel', body: 'Your chauffeur collects you at the agreed time and location.' },
              { step: '03', title: 'Arrive', body: 'Door-to-door delivery. No transfers, no terminals, no waiting.' },
            ].map((s) => (
              <div key={s.step} className="border border-anthracite-light p-8">
                <p className="font-body font-light text-[9px] tracking-[0.3em] uppercase mb-4" style={{ color: 'var(--copper)' }}>{s.step}</p>
                <h3 className="font-display font-light text-[22px] text-offwhite mb-3">{s.title}</h3>
                <p className="body-text text-[12px]" style={{ lineHeight: '1.9' }}>{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="bg-anthracite py-16 md:py-20 border-t border-anthracite-light">
        <div className="max-w-3xl mx-auto px-6 md:px-12">
          <h2 className="display text-[28px] md:text-[34px] mb-12">Common questions</h2>
          <div className="flex flex-col gap-0">
            {faqs.map((faq, i) => (
              <div
                key={faq.q}
                className={`py-7 border-b border-anthracite-light ${i === 0 ? 'border-t' : ''}`}
              >
                <h3 className="font-body font-medium text-[12px] tracking-[0.1em] uppercase text-offwhite mb-3">{faq.q}</h3>
                <p className="body-text text-[12px]" style={{ lineHeight: '1.9' }}>{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-anthracite-mid py-20 border-t border-anthracite-light">
        <div className="max-w-7xl mx-auto px-6 md:px-12 flex flex-col md:flex-row items-start md:items-center justify-between gap-8">
          <div>
            <h2 className="display text-[28px] md:text-[36px]">
              Not seeing your destination?<br />
              <span className="display-italic">We go anywhere.</span>
            </h2>
            <p className="body-text text-[13px] mt-4">PRESTIGO covers all destinations across Central Europe.</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-4">
            <a href="/book" className="btn-primary">Book a Route</a>
            <a href="/contact" className="btn-ghost">Request Custom Route</a>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  )
}
