import { useTranslations } from 'next-intl'
import Image from 'next/image'
import { Link } from '@/i18n/routing'
import Reveal from '@/components/Reveal'

// Structural config (model/photo) stays in code — model is a proper noun
// (NOT translated), used as the React key and interpolated into the
// per-index altTemplate translation. Zipped by index with the translated
// `vehicles` catalog array (category/passengers/bags/features/altTemplate).
const vehicles = [
  { model: 'Mercedes-Benz E-Class', photo: '/vehicles/e-class.avif' },
  { model: 'Mercedes-Benz S-Class', photo: '/vehicles/s-class.avif' },
  { model: 'Mercedes-Benz V-Class', photo: '/vehicles/v-class.avif' },
]

export default function Fleet() {
  const t = useTranslations('Fleet')
  const catalog = t.raw('vehicles') as {
    category: string
    passengers: string
    bags: string
    features: string[]
  }[]

  return (
    <section id="fleet" aria-labelledby="fleet-heading" className="theme-light bg-anthracite py-20 md:py-28 border-t border-anthracite-light">
      <div className="max-w-7xl mx-auto px-6 md:px-12">

        <Reveal variant="up" className="mb-14">
          <p className="label mb-6">{t('label')}</p>
          <span className="copper-line mb-8 block" />
          <h2 id="fleet-heading" className="display text-[36px] md:text-[44px]">
            {t('headingLine1')}<br />
            <span className="display-italic">{t('headingLine2')}</span>
          </h2>
        </Reveal>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {vehicles.map((v, i) => {
            const item = catalog[i]
            const alt = t(`vehicles.${i}.altTemplate`, { model: v.model })
            return (
              <Reveal key={v.model} variant="up" delay={i * 120}>
                <div className="group border border-anthracite-light hover:border-copper/40 transition-colors overflow-hidden">
                  {/* Vehicle photo — full-bleed photography */}
                  <div className="relative w-full h-56 overflow-hidden" style={{ background: '#EFE8DA' }}>
                    <Image
                      src={v.photo}
                      alt={alt}
                      fill
                      className="object-contain"
                      sizes="(max-width: 768px) 100vw, 400px"
                      loading="lazy"
                    />
                  </div>

                  {/* Card content */}
                  <div className="p-8 pt-5">
                    <p className="label mb-2">{item.category}</p>
                    <h3 className="font-display font-light text-xl text-offwhite mb-1">{v.model}</h3>
                    <div className="flex gap-4 mb-5">
                      <span className="body-text text-[11px]">{item.passengers}</span>
                      <span style={{ color: 'var(--anthracite-light)' }} className="body-text text-[11px]">·</span>
                      <span className="body-text text-[11px]">{item.bags}</span>
                    </div>
                    <ul className="flex flex-col gap-2">
                      {item.features.map((f) => (
                        <li key={f} className="flex items-center gap-2">
                          <span className="w-1 h-1 rounded-full flex-shrink-0" style={{ background: 'var(--copper)' }} />
                          <span className="font-body font-light text-[11px] text-warmgrey tracking-wide">{f}</span>
                        </li>
                      ))}
                    </ul>
                    <Link
                      href="/book"
                      className="inline-block mt-4 font-body font-light text-[10px] tracking-[0.18em] uppercase text-copper hover:text-copper-light transition-colors"
                    >
                      {t('seePricing')}
                    </Link>
                  </div>
                </div>
              </Reveal>
            )
          })}
        </div>
      </div>
    </section>
  )
}
