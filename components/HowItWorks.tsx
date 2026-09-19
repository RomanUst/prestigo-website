import { useTranslations } from 'next-intl'
import Image from 'next/image'
import Reveal from '@/components/Reveal'

// Structural config (number + photo path) stays in code — zipped by index
// with the translated `steps` catalog array (title/body/photoAlt).
const stepConfig = [
  { number: '01', photo: '/journey-01-book.jpg' },
  { number: '02', photo: '/journey-02-track.jpg' },
  { number: '03', photo: '/journey-03-arrive.jpg' },
]

export default function HowItWorks() {
  const t = useTranslations('HowItWorks')
  const steps = t.raw('steps') as { title: string; body: string; photoAlt: string }[]

  return (
    <section
      id="how-it-works"
      aria-labelledby="how-it-works-heading"
      className="bg-anthracite py-20 md:py-28 border-t border-anthracite-light"
    >
      <div className="max-w-7xl mx-auto px-6 md:px-12">

        <Reveal variant="up" className="mb-14 md:mb-20">
          <p className="label mb-6">{t('label')}</p>
          <span className="copper-line mb-8 block" />
          <h2 id="how-it-works-heading" className="display text-[36px] md:text-[44px]">
            {t('headingLine1')}<br />
            <span className="display-italic">{t('headingLine2')}</span>
          </h2>
        </Reveal>

        {/* Photo journey — the ride, told step by step */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-10">
          {stepConfig.map((cfg, i) => {
            const step = steps[i]
            return (
              <Reveal key={cfg.number} variant="up" delay={i * 140}>
                <figure className="group flex flex-col">
                  <div
                    className="relative w-full overflow-hidden border border-anthracite-light"
                    style={{ aspectRatio: '3 / 4' }}
                  >
                    <Image
                      src={cfg.photo}
                      alt={step.photoAlt}
                      fill
                      sizes="(max-width: 768px) 100vw, 420px"
                      className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]"
                      loading="lazy"
                    />
                    {/* Navy veil for depth + legible numbering */}
                    <div
                      className="absolute inset-0"
                      style={{
                        background:
                          'linear-gradient(to top, rgba(15,29,44,0.72) 0%, rgba(15,29,44,0.12) 40%, transparent 70%)',
                      }}
                    />
                    <span
                      className="absolute start-5 bottom-4 font-display leading-none text-offwhite"
                      style={{ fontSize: '40px', fontVariationSettings: "'opsz' 144" }}
                    >
                      {cfg.number}
                    </span>
                  </div>

                  <figcaption className="mt-6">
                    <div className="flex items-center gap-4 mb-4">
                      <span className="copper-line block" />
                      <span className="label">{t('stepPrefix')} {cfg.number}</span>
                    </div>
                    <h3 className="display text-[24px] md:text-[26px] mb-3">{step.title}</h3>
                    <p className="body-text">{step.body}</p>
                  </figcaption>
                </figure>
              </Reveal>
            )
          })}
        </div>
      </div>
    </section>
  )
}
