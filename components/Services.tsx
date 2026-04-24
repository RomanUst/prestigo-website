import Link from 'next/link'
import Reveal from '@/components/Reveal'

interface Service {
  label: string
  title: string
  body: string
  detail: string
  href: string
  isNew?: boolean
}

const services: Service[] = [
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
  {
    label: 'Multi-day',
    title: 'Multi-day Hire',
    body: 'One dedicated chauffeur for your entire trip. Mix transfers and hourly days across Central Europe.',
    detail: 'Custom itinerary · Quote within 24 h',
    href: '/book/multi-day',
    isNew: true,
  },
]

type Props = {
  airportPrice: number
  hourlyFrom: number
  cheapestIntercity: number
}

export default function Services({ airportPrice, hourlyFrom, cheapestIntercity }: Props) {
  // Price callouts per service type (DB-driven, no hardcoded € literals)
  const priceCallouts: Record<string, string> = {
    Airport: `From €${airportPrice}`,
    City: `From €${hourlyFrom}/hr`,
    Intercity: `From €${cheapestIntercity}`,
  }

  return (
    <section id="services" aria-labelledby="services-heading" className="bg-anthracite-mid py-20 md:py-28 border-t border-anthracite-light">
      <div className="max-w-7xl mx-auto px-6 md:px-12">

        <Reveal variant="up" className="mb-14">
          <p className="label mb-6">Our services</p>
          <span className="copper-line mb-8 block" />
          <h2 id="services-heading" className="display text-[36px] md:text-[44px]">
            Every journey,<br />
            <span className="display-italic">covered.</span>
          </h2>
        </Reveal>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px bg-anthracite-light">
          {services.map((s, i) => (
            <Reveal key={s.label} variant="up" delay={i * 80} className="bg-anthracite-mid">
              <div className="p-8 hover:bg-anthracite transition-colors group flex flex-col h-full">
                <div className="flex items-center gap-2 mb-4">
                  <p className="label">{s.label}</p>
                  {s.isNew && (
                    <span className="font-body font-light text-[9px] tracking-[0.14em] uppercase px-1.5 py-0.5 border border-copper/60 text-copper-light leading-none">NEW</span>
                  )}
                </div>
                <h3 className="font-display font-light text-xl text-offwhite mb-3 group-hover:text-copper-pale transition-colors">
                  {s.title}
                </h3>
                <p className="body-text mb-5">{s.body}</p>
                <span
                  className="font-body font-light text-[10px] tracking-[0.2em] uppercase mb-6"
                  style={{ color: 'var(--warmgrey)' }}
                >
                  {priceCallouts[s.label] ?? s.detail}
                </span>
                <div className="mt-auto">
                  <Link
                    href={s.href}
                    className="inline-flex items-center justify-center font-body font-light text-[10px] tracking-[0.18em] uppercase border border-copper-light/40 px-5 py-3 min-h-[44px] text-copper-light hover:bg-copper-light/10 hover:border-copper-light transition-colors"
                  >
                    Learn more
                  </Link>
                </div>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal variant="fade" delay={200} className="mt-10 flex justify-center">
          <a href="#book" className="btn-primary">Book a transfer</a>
        </Reveal>
      </div>
    </section>
  )
}
