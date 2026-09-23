import { MetadataRoute } from 'next'
import { ROUTES } from '@/lib/routes'
import { lastModFor } from '@/lib/lastmod'
import { getAllPosts, JSX_POSTS } from '@/lib/blog'
import { getAlternates, type ContentRef } from '@/lib/seo'

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

type EntryOpts = { indexable?: boolean; content?: ContentRef }

// entry() delegates its alternates.languages cluster to getAlternates() —
// the same single source of truth every page-level generateMetadata() reads
// (SEO-01/03) — so the sitemap and per-page <link rel="alternate"> tags can
// never diverge.
const entry = (urlPath: string, sourceFile: string, opts: EntryOpts = {}): SitemapEntry => {
  const url = urlPath === '' ? BASE : `${BASE}${urlPath}`
  const { languages } = getAlternates(urlPath, opts)
  return {
    url,
    lastModified: lastModFor(sourceFile),
    alternates: { languages },
  }
}

export default function sitemap(): MetadataRoute.Sitemap {
  // sourceFile paths below point at app/[locale]/... (Phase 68 route-tree
  // move) — lastModFor() resolves git history/mtime from these paths, so
  // they must track the physical file location, not the public URL.
  const routeEntries: MetadataRoute.Sitemap = ROUTES.map((r) =>
    entry(`/routes/${r.slug}`, `app/[locale]/routes/${r.slug}/page.tsx`, {
      indexable: true,
      content: { kind: 'route', key: r.slug },
    }),
  )

  const mdxBlogEntries: MetadataRoute.Sitemap = getAllPosts()
    .filter((p) => p.source === 'mdx')
    .map((p) =>
      entry(`/blog/${p.slug}`, `content/blog/${p.slug}.mdx`, {
        indexable: true,
        content: { kind: 'blog', key: p.slug },
      }),
    )

  return [
    entry('', 'app/[locale]/page.tsx', { indexable: true, content: { kind: 'page', key: 'home' } }),
    entry('/book', 'app/[locale]/book/page.tsx', { indexable: true }),
    entry('/book/multi-day', 'app/[locale]/book/multi-day/page.tsx', { indexable: true }),
    entry('/services', 'app/[locale]/services/page.tsx', {
      indexable: true,
      content: { kind: 'page', key: 'services' },
    }),
    entry('/services/airport-transfer', 'app/[locale]/services/airport-transfer/page.tsx', {
      indexable: true,
      content: { kind: 'page', key: 'services/airport-transfer' },
    }),
    // /services/intercity-routes intentionally excluded: it canonicalises to
    // /routes (see its metadata) to consolidate signals on the routes hub.
    entry('/services/vip-events', 'app/[locale]/services/vip-events/page.tsx', {
      indexable: true,
      content: { kind: 'page', key: 'services/vip-events' },
    }),
    entry('/services/city-rides', 'app/[locale]/services/city-rides/page.tsx', {
      indexable: true,
      content: { kind: 'page', key: 'services/city-rides' },
    }),
    entry('/services/concierge', 'app/[locale]/services/concierge/page.tsx', {
      indexable: true,
      content: { kind: 'page', key: 'services/concierge' },
    }),
    entry('/services/group-transfers', 'app/[locale]/services/group-transfers/page.tsx', {
      indexable: true,
      content: { kind: 'page', key: 'services/group-transfers' },
    }),
    // /fleet has no content-model backing (deliberately deferred — see
    // PROJECT.md Deferred Ideas); treated as a chrome-only page, no content
    // ref supplied.
    entry('/fleet', 'app/[locale]/fleet/page.tsx', { indexable: true }),
    entry('/routes', 'app/[locale]/routes/page.tsx', { indexable: true }),
    ...routeEntries,
    // Blog hub + migrated JSX articles (Phase 56 MIG-04)
    // JSX_POSTS is the single source of truth — slugs are derived, not hardcoded.
    entry('/blog', 'app/[locale]/blog/page.tsx', { indexable: true, content: { kind: 'page', key: 'blog' } }),
    ...JSX_POSTS.map((p) =>
      entry(`/blog/${p.slug}`, `app/[locale]/blog/${p.slug}/page.tsx`, {
        indexable: true,
        // JSX_POSTS have no content/blog/<locale> file for ANY locale (they
        // are legacy hardcoded-EN articles) — the content-ref probe
        // correctly collapses these to en + x-default only (D-07).
        content: { kind: 'blog', key: p.slug },
      }),
    ),
    ...mdxBlogEntries,
    entry('/corporate', 'app/[locale]/corporate/page.tsx', {
      indexable: true,
      content: { kind: 'page', key: 'corporate' },
    }),
    entry('/about', 'app/[locale]/about/page.tsx', { indexable: true, content: { kind: 'page', key: 'about' } }),
    entry('/faq', 'app/[locale]/faq/page.tsx', { indexable: true, content: { kind: 'page', key: 'faq' } }),
    entry('/contact', 'app/[locale]/contact/page.tsx', {
      indexable: true,
      content: { kind: 'page', key: 'contact' },
    }),
    entry('/privacy', 'app/[locale]/privacy/page.tsx', {
      indexable: true,
      content: { kind: 'page', key: 'privacy' },
    }),
    entry('/terms', 'app/[locale]/terms/page.tsx', { indexable: true, content: { kind: 'page', key: 'terms' } }),
    // CR-02: content ref must match the page's own generateMetadata() call
    // exactly (app/[locale]/authors/roman-ustyugov/page.tsx) — no
    // content/pages/<locale>/authors/roman-ustyugov.json exists for any
    // locale, so this collapses to en + x-default only (D-07 EN-fallback),
    // matching what the page itself already declares. Previously this entry
    // omitted the content ref, which produced a full 7-locale hreflang
    // cluster here while the page declared itself EN-only — a
    // non-reciprocal, self-contradicting hreflang divergence.
    entry('/authors/roman-ustyugov', 'app/[locale]/authors/roman-ustyugov/page.tsx', {
      indexable: true,
      content: { kind: 'page', key: 'authors/roman-ustyugov' },
    }),
  ]
}
