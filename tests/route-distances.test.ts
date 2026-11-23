import { describe, it, expect, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

vi.mock('@/lib/route-prices', () => ({
  getAllRoutes: vi.fn(async () => [
    { slug: 'prague-vienna', distanceKm: 333 },
    { slug: 'prague-bratislava', distanceKm: 328.4 },
    { slug: 'prague-brno', distanceKm: 0 },
  ]),
}))

import { applyRouteDistances, getLiveRouteContent, getRouteDistances, ROUTE_KM_TOKEN } from '@/lib/route-distances'
import { getRouteContent } from '@/lib/route-content'
import { ROUTES_BY_SLUG } from '@/lib/routes'

// Route pages must quote the admin distance (route_prices.distance_km) — the
// same number /llms.txt, the JSON-LD and the fares use — never a typed one.
describe('route distances come from the admin', () => {
  it('admin value wins, rounded; static lib/routes.ts value is the fallback', async () => {
    const d = await getRouteDistances()
    expect(d['prague-vienna']).toBe(333)
    expect(d['prague-bratislava']).toBe(328)
    expect(d['prague-brno']).toBe(ROUTES_BY_SLUG['prague-brno'].distanceKm)
    expect(d['prague-warsaw']).toBe(ROUTES_BY_SLUG['prague-warsaw'].distanceKm)
  })

  it('fills the {routeKm} token everywhere in the page content', async () => {
    const content = await getLiveRouteContent('prague-vienna', 'en')
    expect(JSON.stringify(content)).not.toContain(ROUTE_KM_TOKEN)
    expect(content.hero.intro).toContain('333 km')
    expect(content.metadata.description).toContain('333 km')
    expect(content.highlights.some((h) => h.value === '333 km')).toBe(true)
  })

  it('related-route cards show the admin distance of the linked route', async () => {
    const content = await getLiveRouteContent('prague-vienna', 'ru')
    const bratislava = content.relatedRoutes.find((r) => r.slug === 'prague-bratislava')
    expect(bratislava?.distance).toBe('328 км')
  })

  it('an inbound mirror page uses the distance of its source route', () => {
    const content = applyRouteDistances(getRouteContent('vienna-prague', 'en'), 'vienna-prague', {
      'prague-vienna': 333,
    })
    expect(JSON.stringify(content)).not.toContain(ROUTE_KM_TOKEN)
    expect(JSON.stringify(content)).toContain('333 km')
  })

  it('every route content file carries the token instead of a typed distance', () => {
    const root = path.join(process.cwd(), 'content', 'routes')
    for (const locale of fs.readdirSync(root)) {
      for (const file of fs.readdirSync(path.join(root, locale))) {
        const raw = fs.readFileSync(path.join(root, locale, file), 'utf8')
        expect(raw.includes(ROUTE_KM_TOKEN), `${locale}/${file}`).toBe(true)
      }
    }
  })
})
