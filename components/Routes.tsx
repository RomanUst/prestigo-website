const routes = [
  { from: 'Prague', to: 'Vienna', slug: 'prague-vienna', distance: '330 km', duration: '~3.5 h', price: 'From €290' },
  { from: 'Prague', to: 'Berlin', slug: 'prague-berlin', distance: '350 km', duration: '~4 h', price: 'From €310' },
  { from: 'Prague', to: 'Munich', slug: 'prague-munich', distance: '380 km', duration: '~4.5 h', price: 'From €330' },
  { from: 'Prague', to: 'Budapest', slug: 'prague-budapest', distance: '530 km', duration: '~6 h', price: 'From €420' },
  { from: 'Prague', to: 'Bratislava', slug: 'prague-bratislava', distance: '330 km', duration: '~3.5 h', price: 'From €280' },
  { from: 'Prague', to: 'Salzburg', slug: 'prague-salzburg', distance: '410 km', duration: '~5 h', price: 'From €360' },
]

export default function Routes() {
  return (
    <section id="routes" aria-labelledby="routes-heading" className="bg-anthracite-mid py-20 md:py-28 border-t border-anthracite-light">
      <div className="max-w-7xl mx-auto px-6 md:px-12">

        <div className="mb-14">
          <p className="label mb-6">Intercity routes</p>
          <span className="copper-line mb-8 block" />
          <h2 id="routes-heading" className="display text-[36px] md:text-[44px]">
            Central Europe,<br />
            <span className="display-italic">at your pace.</span>
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-anthracite-light">
          {routes.map((r) => (
            <a
              key={`${r.from}-${r.to}`}
              href={`/routes/${r.slug}`}
              className="bg-anthracite-mid px-8 py-6 flex items-center justify-between hover:bg-anthracite transition-colors group"
            >
              <div className="flex items-center gap-4">
                <div>
                  <p className="font-display font-light text-lg text-offwhite">
                    {r.from}
                    <span className="text-copper-pale italic mx-2">→</span>
                    {r.to}
                  </p>
                  <p className="body-text text-[11px] mt-1">{r.distance} · {r.duration}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="font-body font-light text-[11px] tracking-[0.1em] text-copper group-hover:text-copper-light transition-colors">
                  {r.price}
                </p>
                <span className="font-body font-light text-[10px] tracking-[0.2em] uppercase text-warmgrey group-hover:text-offwhite transition-colors mt-1 block py-1">
                  View route →
                </span>
              </div>
            </a>
          ))}
        </div>

        <p className="body-text text-[11px] mt-6 text-center">
          All prices include tolls, waiting time, and meet &amp; greet. Fixed — guaranteed at booking.
        </p>

        <div className="mt-10 flex justify-center">
          <a href="/routes" className="btn-ghost" style={{ borderColor: 'var(--copper)', color: 'var(--copper)' }}>
            View all routes
          </a>
        </div>
      </div>
    </section>
  )
}
