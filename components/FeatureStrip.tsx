import { UserRound, Car, ShieldCheck, Clock } from 'lucide-react'
import Reveal from '@/components/Reveal'

/**
 * Feature strip — the cream "why us" bar that sits flush under the Hero,
 * mirroring the reference. Summarises the homepage's strongest points in
 * four pillars: the people, the cars, the price promise, and availability.
 */
const features = [
  { Icon: UserRound, title: 'Professional chauffeurs', sub: 'English-speaking & discreet' },
  { Icon: Car, title: 'Premium Mercedes fleet', sub: 'E-, S- & V-Class, latest models' },
  { Icon: ShieldCheck, title: 'Fixed prices', sub: 'No hidden fees, flight tracking' },
  { Icon: Clock, title: '24/7 support', sub: 'Always on time, every day' },
]

export default function FeatureStrip() {
  return (
    <section aria-label="Why PRESTIGO" className="theme-light bg-anthracite">
      <div className="max-w-7xl mx-auto px-6 md:px-12 py-9 md:py-11">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-8 lg:gap-0">
          {features.map(({ Icon, title, sub }, i) => (
            <Reveal key={title} variant="up" delay={i * 100}>
              <div
                className={`flex items-center gap-4 h-full lg:px-8 ${
                  i > 0 ? 'lg:border-l lg:border-anthracite-light' : ''
                }`}
              >
                <Icon
                  strokeWidth={1}
                  className="w-8 h-8 flex-shrink-0"
                  style={{ color: 'var(--copper)' }}
                  aria-hidden="true"
                />
                <div>
                  <p className="font-body font-medium text-[13px] tracking-[0.02em] text-offwhite mb-1">
                    {title}
                  </p>
                  <p className="font-body font-light text-[11px] tracking-[0.03em] text-warmgrey">
                    {sub}
                  </p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
