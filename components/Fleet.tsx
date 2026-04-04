import Image from 'next/image'

const vehicles = [
  {
    model: 'Mercedes-Benz E-Class',
    category: 'Business',
    passengers: '3 pax',
    bags: '3 bags',
    features: ['Leather interior', 'Tinted windows', 'Climate control', 'Wi-Fi on request'],
    photo: '/e-class-photo.png',
    photoAlt: 'Mercedes-Benz E-Class — Prague chauffeur service',
  },
  {
    model: 'Mercedes-Benz S-Class',
    category: 'First Class',
    passengers: '3 pax',
    bags: '3 bags',
    features: ['Executive rear seats', 'Ambient lighting', 'Champagne service', 'Privacy screen'],
    photo: '/s-class-photo.png',
    photoAlt: 'Mercedes-Benz S-Class — Prague chauffeur service',
  },
  {
    model: 'Mercedes-Benz V-Class',
    category: 'Group',
    passengers: '6 pax',
    bags: '6 bags',
    features: ['Facing seats', 'Extra luggage space', 'Conference seating', 'USB charging'],
    photo: '/v-class-photo.png',
    photoAlt: 'Mercedes-Benz V-Class — Prague chauffeur service',
  },
]

export default function Fleet() {
  return (
    <section id="fleet" aria-labelledby="fleet-heading" className="bg-anthracite py-20 md:py-28 border-t border-anthracite-light">
      <div className="max-w-7xl mx-auto px-6 md:px-12">

        <div className="mb-14">
          <p className="label mb-6">The fleet</p>
          <span className="copper-line mb-8 block" />
          <h2 id="fleet-heading" className="display text-[36px] md:text-[44px]">
            Mercedes only.<br />
            <span className="display-italic">Always.</span>
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {vehicles.map((v) => (
            <div
              key={v.model}
              className="group border border-anthracite-light hover:border-copper/40 transition-colors overflow-hidden"
            >
              {/* Vehicle photo — full-bleed photography */}
              <div className="relative w-full h-56 overflow-hidden">
                <Image
                  src={v.photo}
                  alt={v.photoAlt}
                  width={460}
                  height={260}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                  sizes="(max-width: 768px) 100vw, 400px"
                  loading="lazy"
                />
              </div>

              {/* Card content */}
              <div className="p-8 pt-5">
                <p className="label mb-2">{v.category}</p>
                <h3 className="font-display font-light text-xl text-offwhite mb-1">{v.model}</h3>
                <div className="flex gap-4 mb-5">
                  <span className="body-text text-[11px]">{v.passengers}</span>
                  <span style={{ color: 'var(--anthracite-light)' }} className="body-text text-[11px]">·</span>
                  <span className="body-text text-[11px]">{v.bags}</span>
                </div>
                <ul className="flex flex-col gap-2">
                  {v.features.map((f) => (
                    <li key={f} className="flex items-center gap-2">
                      <span className="w-1 h-1 rounded-full flex-shrink-0" style={{ background: 'var(--copper)' }} />
                      <span className="font-body font-light text-[11px] text-warmgrey tracking-wide">{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
