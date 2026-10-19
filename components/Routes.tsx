import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/routing'
import Reveal from '@/components/Reveal'
import RoutesMap, { type MapCity } from '@/components/RoutesMap'
import RoutesBento, { type BentoTile } from '@/components/RoutesBento'
import type { RoutePrice } from '@/lib/route-prices'
import { ROUTES_BY_SLUG } from '@/lib/routes'

// Door-to-door time from lib/routes.ts ('~5.5 hours' → '5h 30m') so the home
// page never disagrees with the route pages.
function routeTime(slug: string): string {
  const m = ROUTES_BY_SLUG[slug]?.duration.match(/(\d+(?:\.\d+)?)\s*hour/)
  if (!m) return ''
  const mins = Math.round(parseFloat(m[1]) * 60)
  return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m`
}

// Real geographic coordinates (same positions the booking map uses) + real
// door-to-door times (lib/routes.ts where a route page exists). Ordered
// clockwise so the animated dots sweep the map.
const PRAGUE: MapCity = { name: 'Prague', lat: 50.0755, lng: 14.4378 }

const CITIES: MapCity[] = [
  { name: 'Berlin', lat: 52.52, lng: 13.405, time: routeTime('prague-berlin') },
  { name: 'Leipzig', lat: 51.3397, lng: 12.3731, time: routeTime('prague-leipzig'), dx: -10 },
  { name: 'Dresden', lat: 51.0504, lng: 13.7373, time: routeTime('prague-dresden') },
  { name: 'Wrocław', lat: 51.1079, lng: 17.0385, time: routeTime('prague-wroclaw') },
  { name: 'Warsaw', lat: 52.2297, lng: 21.0122, time: routeTime('prague-warsaw') },
  { name: 'Kraków', lat: 50.0647, lng: 19.945, time: routeTime('prague-krakow'), dx: -6 },
  { name: 'Zakopane', lat: 49.2992, lng: 19.9496, time: '5h 30m', dx: 42, dy: 4 },
  { name: 'Budapest', lat: 47.4979, lng: 19.0402, time: routeTime('prague-budapest') },
  { name: 'Bratislava', lat: 48.1486, lng: 17.1077, time: routeTime('prague-bratislava'), dx: 48, dy: 10 },
  { name: 'Vienna', lat: 48.2082, lng: 16.3738, time: routeTime('prague-vienna'), dx: -36, dy: -2 },
  { name: 'Frankfurt', lat: 50.1109, lng: 8.6821, time: '4h 50m' },
  { name: 'Nuremberg', lat: 49.4521, lng: 11.0767, time: routeTime('prague-nuremberg') },
  { name: 'Munich', lat: 48.1351, lng: 11.582, time: routeTime('prague-munich'), dx: -24 },
  { name: 'Salzburg', lat: 47.8095, lng: 13.055, time: routeTime('prague-salzburg') },
  { name: 'Innsbruck', lat: 47.2692, lng: 11.4041, time: '5h 00m', dy: 6 },
]

// Pool of routes the bento cards rotate through (all have live route pages, so
// links never 404). Prices are resolved live by slug; times are door-to-door.
const POOL: Array<{ slug: string; to: string; time: string }> = [
  { slug: 'prague-vienna', to: 'Vienna', time: routeTime('prague-vienna') },
  { slug: 'prague-berlin', to: 'Berlin', time: routeTime('prague-berlin') },
  { slug: 'prague-munich', to: 'Munich', time: routeTime('prague-munich') },
  { slug: 'prague-budapest', to: 'Budapest', time: routeTime('prague-budapest') },
  { slug: 'prague-dresden', to: 'Dresden', time: routeTime('prague-dresden') },
  { slug: 'prague-krakow', to: 'Kraków', time: routeTime('prague-krakow') },
  { slug: 'prague-bratislava', to: 'Bratislava', time: routeTime('prague-bratislava') },
  { slug: 'prague-salzburg', to: 'Salzburg', time: routeTime('prague-salzburg') },
  { slug: 'prague-nuremberg', to: 'Nuremberg', time: routeTime('prague-nuremberg') },
  { slug: 'prague-leipzig', to: 'Leipzig', time: routeTime('prague-leipzig') },
  { slug: 'prague-wroclaw', to: 'Wrocław', time: routeTime('prague-wroclaw') },
  { slug: 'prague-warsaw', to: 'Warsaw', time: routeTime('prague-warsaw') },
  { slug: 'prague-brno', to: 'Brno', time: routeTime('prague-brno') },
  { slug: 'prague-karlovy-vary', to: 'Karlovy Vary', time: routeTime('prague-karlovy-vary') },
  { slug: 'prague-linz', to: 'Linz', time: routeTime('prague-linz') },
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
  const t = useTranslations('RoutesSection')
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
            <p className="label mb-6">{t('label')}</p>
            <span className="copper-line mb-8 block" />
            <h2 id="routes-heading" className="display text-[36px] md:text-[44px]">
              {t('headingLine1')}<br />
              <span className="display-italic">{t('headingItalic')}</span>
            </h2>
          </Reveal>

          <Reveal variant="up" delay={120}>
            <p className="body-text max-w-md mb-8">
              {t('intro')}
            </p>
            <Link href="/routes" className="btn-primary">
              {t('exploreRoutes')}
            </Link>
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
            {t('footnote')}
          </p>
        </Reveal>
      </div>
    </section>
  )
}
