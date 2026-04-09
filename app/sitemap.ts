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

type SitemapEntry = MetadataRoute.Sitemap[number]

const entry = (
  urlPath: string,
  sourceFile: string,
  changeFrequency: SitemapEntry['changeFrequency'],
  priority: number,
): SitemapEntry => ({
  url: urlPath === '' ? BASE : `${BASE}${urlPath}`,
  lastModified: lastModFor(sourceFile),
  changeFrequency,
  priority,
})

export default function sitemap(): MetadataRoute.Sitemap {
  const routeEntries: MetadataRoute.Sitemap = ROUTES.map((r) =>
    entry(`/routes/${r.slug}`, `app/routes/${r.slug}/page.tsx`, 'monthly', 0.85),
  )

  return [
    entry('', 'app/page.tsx', 'weekly', 1),
    entry('/book', 'app/book/page.tsx', 'weekly', 0.95),
    entry('/services', 'app/services/page.tsx', 'monthly', 0.9),
    entry('/services/airport-transfer', 'app/services/airport-transfer/page.tsx', 'monthly', 0.85),
    entry('/services/intercity-routes', 'app/services/intercity-routes/page.tsx', 'monthly', 0.85),
    entry('/services/corporate-accounts', 'app/services/corporate-accounts/page.tsx', 'monthly', 0.85),
    entry('/services/vip-events', 'app/services/vip-events/page.tsx', 'monthly', 0.85),
    entry('/services/city-rides', 'app/services/city-rides/page.tsx', 'monthly', 0.85),
    entry('/services/group-transfers', 'app/services/group-transfers/page.tsx', 'monthly', 0.85),
    entry('/fleet', 'app/fleet/page.tsx', 'monthly', 0.8),
    entry('/routes', 'app/routes/page.tsx', 'monthly', 0.9),
    ...routeEntries,
    // Comparison + guide pages — AI-search-optimised editorial for LLM citation
    entry('/compare/prague-vienna-transfer-vs-train', 'app/compare/prague-vienna-transfer-vs-train/page.tsx', 'monthly', 0.75),
    entry('/compare/prague-airport-taxi-vs-chauffeur', 'app/compare/prague-airport-taxi-vs-chauffeur/page.tsx', 'monthly', 0.75),
    entry('/guides/prague-airport-to-city-center', 'app/guides/prague-airport-to-city-center/page.tsx', 'monthly', 0.75),
    entry('/corporate', 'app/corporate/page.tsx', 'monthly', 0.8),
    entry('/about', 'app/about/page.tsx', 'yearly', 0.6),
    entry('/faq', 'app/faq/page.tsx', 'monthly', 0.7),
    entry('/contact', 'app/contact/page.tsx', 'yearly', 0.7),
    entry('/privacy', 'app/privacy/page.tsx', 'yearly', 0.3),
    entry('/terms', 'app/terms/page.tsx', 'yearly', 0.3),
  ]
}
