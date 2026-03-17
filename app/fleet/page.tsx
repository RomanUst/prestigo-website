import type { Metadata } from 'next'
import Image from 'next/image'
import Nav from '@/components/Nav'
import Footer from '@/components/Footer'

export const metadata: Metadata = {
  title: 'Our Fleet — Mercedes Chauffeur Cars Prague | PRESTIGO',
  description: 'Travel in a Mercedes E-Class, S-Class or V-Class. PRESTIGO operates a modern, fully insured Mercedes fleet for executive transfers in Prague and across Central Europe.',
}

const vehicles = [
  {
    model: 'Mercedes E-Class',
    category: 'Business Sedan',
    description: 'The first choice for airport transfers and city rides. Comfortable, discreet, efficient. Capacity: 3 passengers + luggage.',
    features: ['Leather interior', 'Climate control', 'Wi-Fi available', 'Chargers'],
    idealFor: 'Airport, city, solo business travel',
    price: 'From €49',
    photo: '/e-class.png',
    photoAlt: 'Mercedes-Benz E-Class',
    photoScale: 1.5,
  },
  {
    model: 'Mercedes S-Class',
    category: 'Executive Sedan',
    description: 'For those who travel at the highest level. Rear massaging seats, ambient lighting, panoramic roof. Silence as standard.',
    features: ['Premium leather', 'Massage seats', 'Ambient lighting', 'Champagne on request'],
    idealFor: 'VIP, diplomatic, extended intercity',
    price: 'From €89',
    photo: '/s-class.png',
    photoAlt: 'Mercedes-Benz S-Class',
    photoScale: 1.55,
  },
  {
    model: 'Mercedes V-Class',
    category: 'Executive Van',
    description: 'Up to 7 passengers. Full luggage. Privacy partition available. The choice for families, groups, and multi-bag travellers who refuse to compromise.',
    features: ['7 seats', 'Full luggage capacity', 'Individual captain seats', 'Privacy screen'],
    idealFor: 'Groups, families, conference transfers',
    price: 'From €69',
    photo: '/v-class.png',
    photoAlt: 'Mercedes-Benz V-Class',
    photoScale: 2.0,
  },
]

const standards = [
  { title: 'Pre-trip inspection', body: 'Checked before every journey' },
  { title: 'Interior cleaned', body: 'Fresh cabin for every client' },
  { title: 'Climate preset', body: 'Set to your preference' },
  { title: 'Chargers & Wi-Fi', body: 'Stay connected on the move' },
]

export default function FleetPage() {
  return (
    <main id="main-content">
      <Nav />

      {/* Hero */}
      <section className="bg-anthracite pt-32 pb-16 md:pt-40 md:pb-20 border-b border-anthracite-light">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <p className="label mb-6">The Fleet</p>
          <span className="copper-line mb-8 block" />
          <h1 className="display text-[40px] md:text-[56px] max-w-xl">
            The vehicle is part<br />
            <span className="display-italic">of the experience.</span>
          </h1>
          <p className="body-text text-[13px] mt-6 max-w-lg" style={{ lineHeight: '1.9' }}>
            Every PRESTIGO vehicle is a late-model Mercedes-Benz, maintained to exacting standards, fully insured, and prepared before every journey. The interior is your space to think, work, or simply arrive.
          </p>
        </div>
      </section>

      {/* Vehicle cards */}
      <section className="bg-anthracite py-16 md:py-24">
        <div className="max-w-7xl mx-auto px-6 md:px-12 flex flex-col gap-16">
          {vehicles.map((v, i) => (
            <div
              key={v.model}
              className={`grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-16 pb-16 ${i < vehicles.length - 1 ? 'border-b border-anthracite-light' : ''}`}
            >
              {/* Photo */}
              <div className="relative h-64 md:h-80 flex items-center justify-center overflow-hidden bg-anthracite-mid border border-anthracite-light">
                <div
                  className="absolute bottom-2 left-1/2 -translate-x-1/2 w-4/5 h-8 blur-2xl rounded-full opacity-20"
                  style={{ background: 'var(--copper)' }}
                />
                <div
                  className="w-full h-full car-image-wrap"
                  style={{ '--s': v.photoScale, '--sh': v.photoScale * 1.05 } as React.CSSProperties}
                >
                  <Image
                    src={v.photo}
                    alt={v.photoAlt}
                    width={600}
                    height={340}
                    className="w-full h-full object-contain drop-shadow-2xl"
                    style={{ transform: `scale(var(--s))`, transition: 'transform 700ms ease' }}
                    sizes="(max-width: 768px) 100vw, 50vw"
                  />
                </div>
              </div>

              {/* Info */}
              <div className="flex flex-col justify-center gap-6">
                <div>
                  <p className="label mb-2">{v.category}</p>
                  <h2 className="display text-[28px] md:text-[34px] mb-3">{v.model}</h2>
                  <p className="body-text text-[13px]" style={{ lineHeight: '1.9' }}>{v.description}</p>
                </div>
                <ul className="flex flex-col gap-2">
                  {v.features.map((f) => (
                    <li key={f} className="flex items-center gap-3">
                      <span className="w-1 h-1 rounded-full flex-shrink-0" style={{ background: 'var(--copper)' }} />
                      <span className="font-body font-light text-[12px] text-warmgrey tracking-wide">{f}</span>
                    </li>
                  ))}
                </ul>
                <div className="flex items-center gap-6">
                  <p className="font-body font-light text-[13px]" style={{ color: 'var(--copper-light)' }}>{v.price}</p>
                  <a href="/book" className="btn-primary" style={{ padding: '10px 24px', fontSize: '9px' }}>
                    Book {v.model.split(' ')[1]}
                  </a>
                </div>
                <p className="font-body font-light text-[11px] text-warmgrey">
                  Ideal for: {v.idealFor}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Standards */}
      <section className="bg-anthracite-mid py-16 md:py-20 border-t border-anthracite-light">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <h2 className="display text-[28px] md:text-[36px] mb-14">Every vehicle, every time</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {standards.map((s) => (
              <div key={s.title}>
                <span className="copper-line mb-5 block" />
                <h3 className="font-body font-medium text-[11px] tracking-[0.15em] uppercase text-offwhite mb-2">{s.title}</h3>
                <p className="body-text text-[12px]">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-anthracite py-20 border-t border-anthracite-light">
        <div className="max-w-7xl mx-auto px-6 md:px-12 text-center">
          <h2 className="display text-[32px] md:text-[42px] mb-4">
            Choose your vehicle.<br />
            <span className="display-italic">Book online.</span>
          </h2>
          <p className="body-text text-[13px] mt-4 mb-10">Select your preferred class at checkout.</p>
          <a href="/book" className="btn-primary">Book a Transfer</a>
        </div>
      </section>

      <Footer />
    </main>
  )
}
