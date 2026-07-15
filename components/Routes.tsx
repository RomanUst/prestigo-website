import Reveal from '@/components/Reveal'
import RoutesMap, { type MapCity } from '@/components/RoutesMap'

// Real geographic coordinates (same positions the booking map uses) + real
// door-to-door times. Ordered clockwise so the animated dots sweep the map.
const PRAGUE: MapCity = { name: 'Prague', lat: 50.0755, lng: 14.4378 }

const CITIES: MapCity[] = [
  { name: 'Berlin', lat: 52.52, lng: 13.405, time: '4h 10m' },
  { name: 'Dresden', lat: 51.0504, lng: 13.7373, time: '2h 10m' },
  { name: 'Frankfurt', lat: 50.1109, lng: 8.6821, time: '4h 50m' },
  { name: 'Nuremberg', lat: 49.4521, lng: 11.0767, time: '2h 50m' },
  { name: 'Munich', lat: 48.1351, lng: 11.582, time: '3h 30m' },
  { name: 'Salzburg', lat: 47.8095, lng: 13.055, time: '3h 40m' },
  { name: 'Vienna', lat: 48.2082, lng: 16.3738, time: '3h 30m' },
  { name: 'Bratislava', lat: 48.1486, lng: 17.1077, time: '4h 00m' },
  { name: 'Budapest', lat: 47.4979, lng: 19.0402, time: '6h 30m' },
  { name: 'Kraków', lat: 50.0647, lng: 19.945, time: '5h 00m' },
]

export default function Routes() {
  return (
    <section
      id="routes"
      aria-labelledby="routes-heading"
      className="relative overflow-hidden bg-anthracite-mid py-20 md:py-28 border-t border-anthracite-light"
    >
      {/* Header row — heading left, intro + CTA right */}
      <div className="relative z-10 max-w-7xl mx-auto px-6 md:px-12">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-16 items-end mb-12 md:mb-16">
          <Reveal variant="up">
            <p className="label mb-6">Popular routes</p>
            <span className="copper-line mb-8 block" />
            <h2 id="routes-heading" className="display text-[36px] md:text-[44px]">
              Central Europe.<br />
              <span className="display-italic">Connected.</span>
            </h2>
          </Reveal>

          <Reveal variant="up" delay={120}>
            <p className="body-text max-w-md mb-8">
              Point to point or multi-city. We connect the key destinations of Central
              Europe — with comfort, discretion and precision. One chauffeur, one fixed
              fare, door to door.
            </p>
            <a href="/routes" className="btn-primary">
              Explore routes
            </a>
          </Reveal>
        </div>
      </div>

      {/* Full-bleed live map — spans the whole section, edge to edge, no frame */}
      <div className="relative z-10">
        <RoutesMap hub={PRAGUE} cities={CITIES} />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-6 md:px-12">
        <Reveal variant="fade" delay={150}>
          <p className="body-text text-[11px] mt-6 text-center">
            All fares include tolls, vignettes, waiting time and meet &amp; greet — fixed
            and guaranteed at booking.
          </p>
        </Reveal>
      </div>
    </section>
  )
}
