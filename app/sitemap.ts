import { MetadataRoute } from 'next'
import { ROUTES } from '@/lib/routes'
import { lastModFor } from '@/lib/lastmod'

const BASE = 'https://rideprestigo.com'

// Route entries derived from lib/routes.ts (30 indexed: 17 Green + 13 Yellow).
// The 20 long-distance routes were removed 2026-04-09 per SEO strategy
// — see /Users/romanustyugov/Desktop/founder prestigo/routes/03-noindex-rules-20-red-routes.md
//
// lastModified is resolved per-page from `git log -1` on the corresponding
// source file at build time. Uniform build-time lastmod is discounted by
// Google; real per-page dates let Search Console see genuine freshness signals.
//
// changeFrequency and priority are omitted: Google has stated it largely ignores
// these hints, and removing them keeps the sitemap clean and future-proof.

type SitemapEntry = MetadataRoute.Sitemap[number]

const entry = (urlPath: string, sourceFile: string): SitemapEntry => ({
  url: urlPath === '' ? BASE : `${BASE}${urlPath}`,
  lastModified: lastModFor(sourceFile),
})

export default function sitemap(): MetadataRoute.Sitemap {
  const routeEntries: MetadataRoute.Sitemap = ROUTES.map((r) =>
    entry(`/routes/${r.slug}`, `app/routes/${r.slug}/page.tsx`),
  )

  return [
    entry('', 'app/page.tsx'),
    entry('/book', 'app/book/page.tsx'),
    entry('/services', 'app/services/page.tsx'),
    entry('/services/airport-transfer', 'app/services/airport-transfer/page.tsx'),
    entry('/services/intercity-routes', 'app/services/intercity-routes/page.tsx'),
    entry('/services/vip-events', 'app/services/vip-events/page.tsx'),
    entry('/services/city-rides', 'app/services/city-rides/page.tsx'),
    entry('/services/group-transfers', 'app/services/group-transfers/page.tsx'),
    entry('/fleet', 'app/fleet/page.tsx'),
    entry('/routes', 'app/routes/page.tsx'),
    ...routeEntries,
    // Comparison + guide pages — AI-search-optimised editorial for LLM citation
    entry('/compare/prague-vienna-transfer-vs-train', 'app/compare/prague-vienna-transfer-vs-train/page.tsx'),
    entry('/compare/prague-airport-taxi-vs-chauffeur', 'app/compare/prague-airport-taxi-vs-chauffeur/page.tsx'),
    entry('/guides/prague-airport-to-city-center', 'app/guides/prague-airport-to-city-center/page.tsx'),
    entry('/corporate', 'app/corporate/page.tsx'),
    entry('/about', 'app/about/page.tsx'),
    entry('/authors/roman-ustyugov', 'app/authors/roman-ustyugov/page.tsx'),
    entry('/faq', 'app/faq/page.tsx'),
    entry('/contact', 'app/contact/page.tsx'),
    entry('/privacy', 'app/privacy/page.tsx'),
    entry('/terms', 'app/terms/page.tsx'),
  ]
}
