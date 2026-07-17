import Reveal from '@/components/Reveal'
import RoutesMap, { type MapCity } from '@/components/RoutesMap'
import RoutesBento, { type BentoTile } from '@/components/RoutesBento'
import type { RoutePrice } from '@/lib/route-prices'

// Real geographic coordinates (same positions the booking map uses) + real
// door-to-door times. Ordered clockwise so the animated dots sweep the map.
const PRAGUE: MapCity = { name: 'Prague', lat: 50.0755, lng: 14.4378 }

const CITIES: MapCity[] = [
  { name: 'Berlin', lat: 52.52, lng: 13.405, time: '4h 10m' },
  { name: 'Leipzig', lat: 51.3397, lng: 12.3731, time: '2h 50m', dx: -10 },
  { name: 'Dresden', lat: 51.0504, lng: 13.7373, time: '2h 10m' },
  { name: 'Wrocław', lat: 51.1079, lng: 17.0385, time: '3h 00m' },
  { name: 'Warsaw', lat: 52.2297, lng: 21.0122, time: '6h 50m' },
  { name: 'Kraków', lat: 50.0647, lng: 19.945, time: '5h 00m', dx: -6 },
  { name: 'Zakopane', lat: 49.2992, lng: 19.9496, time: '5h 30m', dx: 42, dy: 4 },
  { name: 'Budapest', lat: 47.4979, lng: 19.0402, time: '6h 30m' },
  { name: 'Bratislava', lat: 48.1486, lng: 17.1077, time: '4h 00m', dx: 48, dy: 10 },
  { name: 'Vienna', lat: 48.2082, lng: 16.3738, time: '3h 30m', dx: -36, dy: -2 },
  { name: 'Frankfurt', lat: 50.1109, lng: 8.6821, time: '4h 50m' },
  { name: 'Nuremberg', lat: 49.4521, lng: 11.0767, time: '2h 50m' },
  { name: 'Munich', lat: 48.1351, lng: 11.582, time: '3h 30m', dx: -24 },
  { name: 'Salzburg', lat: 47.8095, lng: 13.055, time: '3h 40m' },
  { name: 'Innsbruck', lat: 47.2692, lng: 11.4041, time: '5h 00m', dy: 6 },
]

// Pool of routes the bento cards rotate through (all have live route pages, so
// links never 404). Prices are resolved live by slug; times are door-to-door.
const POOL: Array<{ slug: string; to: string; time: string }> = [
  { slug: 'prague-vienna', to: 'Vienna', time: '3h 30m' },
  { slug: 'prague-berlin', to: 'Berlin', time: '4h 10m' },
  { slug: 'prague-munich', to: 'Munich', time: '3h 30m' },
  { slug: 'prague-budapest', to: 'Budapest', time: '6h 30m' },
  { slug: 'prague-dresden', to: 'Dresden', time: '2h 10m' },
  { slug: 'prague-krakow', to: 'Kraków', time: '5h 00m' },
  { slug: 'prague-bratislava', to: 'Bratislava', time: '4h 00m' },
  { slug: 'prague-salzburg', to: 'Salzburg', time: '3h 40m' },
  { slug: 'prague-nuremberg', to: 'Nuremberg', time: '2h 50m' },
  { slug: 'prague-leipzig', to: 'Leipzig', time: '2h 50m' },
  { slug: 'prague-wroclaw', to: 'Wrocław', time: '3h 00m' },
  { slug: 'prague-warsaw', to: 'Warsaw', time: '6h 50m' },
  { slug: 'prague-brno', to: 'Brno', time: '2h 00m' },
  { slug: 'prague-karlovy-vary', to: 'Karlovy Vary', time: '1h 30m' },
  { slug: 'prague-linz', to: 'Linz', time: '2h 40m' },
]

// Bento mosaic layout — one photo feature tile (2×2) + wide (2×1) + square (1×1).
const TILES: BentoTile[] = [
  { span: 'col-span-2 row-span-2', feature: true, img: '/multi-day-itineraries-bg.png' },
  { span: 'col-span-2' },
  { span: 'col-span-1' },
  { span: 'col-span-1' },
  { span: 'col-span-2' },
  { span: 'col-span-1' },
  { span: 'col-span-1' },
]

type Props = { routes: RoutePrice[] }

export default function Routes({ routes }: Props) {
  const priceOf = (slug: string) => routes.find((r) => r.slug === slug)?.eClassEur
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

      {/* Bento — popular routes as a rotating mosaic of cards */}
      <div className="relative z-10 max-w-7xl mx-auto px-6 md:px-12 mt-14 md:mt-20">
        <RoutesBento pool={POOL.map((p) => ({ ...p, price: priceOf(p.slug) }))} tiles={TILES} />

        <Reveal variant="fade" delay={150}>
          <p className="body-text text-[11px] mt-10 text-center">
            All fares include tolls, vignettes, waiting time and meet &amp; greet — fixed
            and guaranteed at booking.
          </p>
        </Reveal>
      </div>
    </section>
  )
}
