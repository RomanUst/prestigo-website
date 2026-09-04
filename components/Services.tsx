import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/routing'
import Reveal from '@/components/Reveal'

// Structural config (id/href/isNew) stays in code — id is used as the React
// key AND the priceCallouts lookup key (not rendered), zipped by index with
// the translated `cards` catalog array (label/title/body/detail).
interface ServiceConfig {
  id: string
  href: string
  isNew?: boolean
}

const services: ServiceConfig[] = [
  { id: 'Airport', href: '/services/airport-transfer' },
  { id: 'Intercity', href: '/services/intercity-routes' },
  { id: 'Corporate', href: '/services/corporate-accounts' },
  { id: 'VIP', href: '/services/vip-events' },
  { id: 'City', href: '/services/city-rides' },
  { id: 'Concierge', href: '/services/concierge' },
  { id: 'Group', href: '/services/group-transfers' },
  { id: 'Multi-day', href: '/book/multi-day', isNew: true },
]

type Props = {
  airportPrice: number
  hourlyFrom: number
  cheapestIntercity: number
}

export default function Services({ airportPrice, hourlyFrom, cheapestIntercity }: Props) {
  const t = useTranslations('Services')
  const cards = t.raw('cards') as { label: string; title: string; body: string; detail: string }[]

  // Price callouts per service type (DB-driven, no hardcoded € literals)
  const priceCallouts: Record<string, string> = {
    Airport: t('fromPrice', { price: airportPrice }),
    City: t('fromPriceHourly', { price: hourlyFrom }),
    Intercity: t('fromPrice', { price: cheapestIntercity }),
  }

  return (
    <section id="services" aria-labelledby="services-heading" className="bg-anthracite-mid py-20 md:py-28 border-t border-anthracite-light">
      <div className="max-w-7xl mx-auto px-6 md:px-12">

        <Reveal variant="up" className="mb-14">
          <p className="label mb-6">{t('label')}</p>
          <span className="copper-line mb-8 block" />
          <h2 id="services-heading" className="display text-[36px] md:text-[44px]">
            {t('headingLine1')}<br />
            <span className="display-italic">{t('headingLine2')}</span>
          </h2>
        </Reveal>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px bg-anthracite-light">
          {services.map((s, i) => {
            const card = cards[i]
            return (
              <Reveal key={s.id} variant="up" delay={i * 80} className="bg-anthracite-mid">
                <div className="p-8 hover:bg-anthracite transition-colors group flex flex-col h-full">
                  <div className="flex items-center gap-2 mb-4">
                    <p className="label">{card.label}</p>
                    {s.isNew && (
                      <span className="font-body font-light text-[9px] tracking-[0.14em] uppercase px-1.5 py-0.5 border border-copper/60 text-copper-light leading-none">NEW</span>
                    )}
                  </div>
                  <h3 className="font-display font-light text-xl text-offwhite mb-3 group-hover:text-copper-pale transition-colors">
                    {card.title}
                  </h3>
                  <p className="body-text mb-5">{card.body}</p>
                  <span
                    className="font-body font-light text-[10px] tracking-[0.2em] uppercase mb-6"
                    style={{ color: 'var(--warmgrey)' }}
                  >
                    {priceCallouts[s.id] ?? card.detail}
                  </span>
                  <div className="mt-auto">
                    <Link
                      href={s.href}
                      className="inline-flex items-center justify-center font-body font-light text-[10px] tracking-[0.18em] uppercase border border-copper-light/40 px-5 py-3 min-h-[44px] text-copper-light hover:bg-copper-light/10 hover:border-copper-light transition-colors"
                    >
                      {t('learnMore')}
                    </Link>
                  </div>
                </div>
              </Reveal>
            )
          })}
        </div>

        <Reveal variant="fade" delay={200} className="mt-10 flex justify-center">
          <a href="#book" className="btn-primary">{t('bookTransfer')}</a>
        </Reveal>
      </div>
    </section>
  )
}
