import Image from 'next/image'
import Reveal from '@/components/Reveal'

const steps = [
  {
    number: '01',
    title: 'Book online',
    body: 'Enter your route and travel details. Receive instant confirmation with a fixed price — no hidden fees.',
    photo: '/vehicles/business-int-1.jpg',
    photoAlt: 'Executive Mercedes cabin, prepared for the journey',
  },
  {
    number: '02',
    title: 'We track your flight',
    body: 'Your driver monitors your flight in real time. Delays, early arrivals — we adjust automatically.',
    photo: '/prague-airport-arrivals-guide.avif',
    photoAlt: 'Prague Airport arrivals — your chauffeur tracking the flight',
  },
  {
    number: '03',
    title: 'Simply arrive',
    body: 'Your chauffeur is waiting at Arrivals with a name board. Direct transfer to your destination.',
    photo: '/prague-airport-meet-and-greet-cover.jpg',
    photoAlt: 'Chauffeur meet & greet at Prague Airport Arrivals',
  },
]

export default function HowItWorks() {
  return (
    <section
      id="how-it-works"
      aria-labelledby="how-it-works-heading"
      className="bg-anthracite py-20 md:py-28 border-t border-anthracite-light"
    >
      <div className="max-w-7xl mx-auto px-6 md:px-12">

        <Reveal variant="up" className="mb-14 md:mb-20">
          <p className="label mb-6">How it works</p>
          <span className="copper-line mb-8 block" />
          <h2 id="how-it-works-heading" className="display text-[36px] md:text-[44px]">
            Three steps.<br />
            <span className="display-italic">Zero surprises.</span>
          </h2>
        </Reveal>

        {/* Photo journey — the ride, told step by step */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-10">
          {steps.map((step, i) => (
            <Reveal key={step.number} variant="up" delay={i * 140}>
              <figure className="group flex flex-col">
                <div
                  className="relative w-full overflow-hidden border border-anthracite-light"
                  style={{ aspectRatio: '3 / 4' }}
                >
                  <Image
                    src={step.photo}
                    alt={step.photoAlt}
                    fill
                    sizes="(max-width: 768px) 100vw, 420px"
                    className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]"
                    loading={i === 0 ? 'eager' : 'lazy'}
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
                    className="absolute left-5 bottom-4 font-display leading-none text-offwhite"
                    style={{ fontSize: '40px', fontVariationSettings: "'opsz' 144" }}
                  >
                    {step.number}
                  </span>
                </div>

                <figcaption className="mt-6">
                  <div className="flex items-center gap-4 mb-4">
                    <span className="copper-line block" />
                    <span className="label">Step {step.number}</span>
                  </div>
                  <h3 className="display text-[24px] md:text-[26px] mb-3">{step.title}</h3>
                  <p className="body-text">{step.body}</p>
                </figcaption>
              </figure>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
