const vehicles = [
  {
    model: 'Mercedes-Benz E-Class',
    category: 'Business',
    passengers: '3 pax',
    bags: '3 bags',
    features: ['Leather interior', 'Tinted windows', 'Climate control', 'Wi-Fi on request'],
  },
  {
    model: 'Mercedes-Benz S-Class',
    category: 'First Class',
    passengers: '3 pax',
    bags: '3 bags',
    features: ['Executive rear seats', 'Ambient lighting', 'Champagne service', 'Privacy screen'],
  },
  {
    model: 'Mercedes-Benz V-Class',
    category: 'Group',
    passengers: '7 pax',
    bags: '7 bags',
    features: ['Facing seats', 'Extra luggage space', 'Conference seating', 'USB charging'],
  },
]

export default function Fleet() {
  return (
    <section id="fleet" className="bg-anthracite py-20 md:py-28 border-t border-anthracite-light">
      <div className="max-w-7xl mx-auto px-6 md:px-12">

        <div className="mb-14">
          <p className="label mb-6">The fleet</p>
          <span className="copper-line mb-8 block" />
          <h2 className="display text-[36px] md:text-[44px]">
            Mercedes only.<br />
            <span className="display-italic">Always.</span>
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {vehicles.map((v) => (
            <div
              key={v.model}
              className="border border-anthracite-light p-8 hover:border-copper/40 transition-colors"
            >
              {/* Car silhouette placeholder */}
              <div className="w-full h-32 mb-6 flex items-center justify-center">
                <svg viewBox="0 0 240 80" className="w-full opacity-20" fill="none">
                  <path
                    d="M40 55 C40 55 60 30 100 28 L140 28 C180 28 200 55 200 55 L220 55 C225 55 228 58 228 63 L228 68 C228 68 215 68 215 68 C215 62 210 57 203 57 C196 57 191 62 191 68 L63 68 C63 62 58 57 51 57 C44 57 39 62 39 68 L12 68 C12 68 12 63 12 63 C12 58 15 55 20 55 Z"
                    stroke="var(--copper)"
                    strokeWidth="1.5"
                    fill="none"
                  />
                  <circle cx="51" cy="68" r="8" stroke="var(--copper)" strokeWidth="1.5" fill="none" />
                  <circle cx="203" cy="68" r="8" stroke="var(--copper)" strokeWidth="1.5" fill="none" />
                </svg>
              </div>

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
          ))}
        </div>
      </div>
    </section>
  )
}
