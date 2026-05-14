import { MetadataRoute } from 'next'
import { ROUTES } from '@/lib/routes'
import { lastModFor } from '@/lib/lastmod'
import { getAllPosts, JSX_POSTS } from '@/lib/blog'

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

const entry = (urlPath: string, sourceFile: string): SitemapEntry => {
  const url = urlPath === '' ? BASE : `${BASE}${urlPath}`
  return {
    url,
    lastModified: lastModFor(sourceFile),
    alternates: { languages: { en: url, 'x-default': url } },
  }
}

export default function sitemap(): MetadataRoute.Sitemap {
  const routeEntries: MetadataRoute.Sitemap = ROUTES.map((r) =>
    entry(`/routes/${r.slug}`, `app/routes/${r.slug}/page.tsx`),
  )

  const mdxBlogEntries: MetadataRoute.Sitemap = getAllPosts()
    .filter((p) => p.source === 'mdx')
    .map((p) => entry(`/blog/${p.slug}`, `content/blog/${p.slug}.mdx`))

  return [
    entry('', 'app/page.tsx'),
    entry('/book', 'app/book/page.tsx'),
    entry('/book/multi-day', 'app/book/multi-day/page.tsx'),
    entry('/services', 'app/services/page.tsx'),
    entry('/services/airport-transfer', 'app/services/airport-transfer/page.tsx'),
    entry('/services/intercity-routes', 'app/services/intercity-routes/page.tsx'),
    entry('/services/vip-events', 'app/services/vip-events/page.tsx'),
    entry('/services/city-rides', 'app/services/city-rides/page.tsx'),
    entry('/services/group-transfers', 'app/services/group-transfers/page.tsx'),
    entry('/fleet', 'app/fleet/page.tsx'),
    entry('/routes', 'app/routes/page.tsx'),
    ...routeEntries,
    // Blog hub + migrated JSX articles (Phase 56 MIG-04)
    // JSX_POSTS is the single source of truth — slugs are derived, not hardcoded.
    entry('/blog', 'app/blog/page.tsx'),
    ...JSX_POSTS.map((p) => entry(`/blog/${p.slug}`, `app/blog/${p.slug}/page.tsx`)),
    ...mdxBlogEntries,
    entry('/corporate', 'app/corporate/page.tsx'),
    entry('/about', 'app/about/page.tsx'),
    entry('/faq', 'app/faq/page.tsx'),
    entry('/contact', 'app/contact/page.tsx'),
  ]
}
