const services = [
  {
    label: 'Airport',
    title: 'Airport Transfer',
    body: 'Prague Václav Havel Airport. Flight tracking, meet & greet, fixed price.',
    detail: 'PRG · VIE · BER · MUC',
    href: '/services/airport-transfer',
  },
  {
    label: 'Intercity',
    title: 'Intercity Routes',
    body: 'Prague to Vienna, Berlin, Munich, Budapest and beyond. Comfort across borders.',
    detail: '4–6 hour routes',
    href: '/services/intercity-routes',
  },
  {
    label: 'Corporate',
    title: 'Corporate Accounts',
    body: 'Monthly invoicing, dedicated account manager, priority dispatch, reporting.',
    detail: 'Volume pricing available',
    href: '/services/corporate-accounts',
  },
  {
    label: 'VIP',
    title: 'VIP & Events',
    body: 'Diplomatic visits, private events, luxury hotel transfers, multi-vehicle coordination.',
    detail: 'On request',
    href: '/services/vip-events',
  },
  {
    label: 'City',
    title: 'Prague City Rides',
    body: 'Hourly hire within Prague. Business meetings, sightseeing, theatre — at your pace.',
    detail: '1–8 hours',
    href: '/services/city-rides',
  },
  {
    label: 'Group',
    title: 'Group Transfers',
    body: 'Minivan and multi-car coordination for groups, conferences, and incentive travel.',
    detail: 'Up to 8 passengers',
    href: '/services/group-transfers',
  },
]

export default function Services() {
  return (
    <section id="services" aria-labelledby="services-heading" className="bg-anthracite-mid py-20 md:py-28 border-t border-anthracite-light">
      <div className="max-w-7xl mx-auto px-6 md:px-12">

        <div className="mb-14">
          <p className="label mb-6">Our services</p>
          <span className="copper-line mb-8 block" />
          <h2 id="services-heading" className="display text-[36px] md:text-[44px]">
            Every journey,<br />
            <span className="display-italic">covered.</span>
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px bg-anthracite-light">
          {services.map((s) => (
            <div
              key={s.label}
              className="bg-anthracite-mid p-8 hover:bg-anthracite transition-colors group flex flex-col"
            >
              <p className="label mb-4">{s.label}</p>
              <h3 className="font-display font-light text-xl text-offwhite mb-3 group-hover:text-copper-pale transition-colors">
                {s.title}
              </h3>
              <p className="body-text mb-5">{s.body}</p>
              <span
                className="font-body font-light text-[10px] tracking-[0.2em] uppercase mb-6"
                style={{ color: 'var(--warmgrey)' }}
              >
                {s.detail}
              </span>
              <div className="mt-auto">
                <a
                  href={s.href}
                  className="inline-flex items-center justify-center font-body font-light text-[10px] tracking-[0.18em] uppercase border border-copper-light/40 px-5 py-3 min-h-[44px] text-copper-light hover:bg-copper-light/10 hover:border-copper-light transition-colors"
                >
                  Learn more
                </a>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-10 flex justify-center">
          <a href="#book" className="btn-primary">Book a transfer</a>
        </div>
      </div>
    </section>
  )
}
