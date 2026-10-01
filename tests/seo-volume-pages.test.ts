// @vitest-environment node
/**
 * competitor-analysis 2026-10-01, item 3 (SEO volume): inbound mirror routes
 * ({city} → Prague) and the keyword-variant landing pages (/services/<slug>,
 * /faq/<slug>). Guards content completeness across all 7 locales, internal
 * link integrity, price-token discipline and sitemap coverage.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import { ROUTES, MIRROR_ROUTES, MIRROR_SLUG_BY_SOURCE } from '@/lib/routes'
import { LANDING_PAGES } from '@/lib/landing-pages'
import { getRouteContent } from '@/lib/route-content'
import { getPageContent } from '@/lib/page-content'
import sitemap from '@/app/sitemap'

const LOCALES = ['en', 'ru', 'es', 'fr', 'ar', 'hi', 'zh'] as const
const ROOT = process.cwd()
const ALL_ROUTE_SLUGS = new Set([...ROUTES.map((r) => r.slug), ...MIRROR_ROUTES.map((r) => r.slug)])

/** Recursively collects every {token} used in a JSON value. */
function tokens(v: unknown): string[] {
  if (typeof v === 'string') return (v.match(/\{\w+\}/g) ?? []).sort()
  if (Array.isArray(v)) return v.flatMap(tokens)
  if (v && typeof v === 'object') return Object.values(v).flatMap(tokens)
  return []
}

describe('mirror routes', () => {
  it('derives one inbound mirror per indexed route', () => {
    expect(MIRROR_ROUTES).toHaveLength(ROUTES.length)
    expect(MIRROR_SLUG_BY_SOURCE['prague-vienna']).toBe('vienna-prague')
    expect(MIRROR_SLUG_BY_SOURCE['prague-ceske-budejovice']).toBe('ceske-budejovice-prague')
  })

  for (const m of MIRROR_ROUTES) {
    it(`${m.slug}: genuine content in every locale, valid links, tokens only`, () => {
      const en = getRouteContent(m.slug, 'en')
      for (const locale of LOCALES) {
        const file = path.join(ROOT, 'content', 'routes', locale, `${m.slug}.json`)
        expect(fs.existsSync(file), file).toBe(true)
        const c = getRouteContent(m.slug, locale)
        expect(tokens(c)).toEqual(tokens(en))
        expect(JSON.stringify(c)).not.toMatch(/€\s?\d/)
        expect(c.faqs).toHaveLength(en.faqs.length)
        for (const r of c.relatedRoutes) expect(ALL_ROUTE_SLUGS.has(r.slug), r.slug).toBe(true)
      }
      expect(en.metadata.title).toContain('{ePrice}')
      expect(en.hero.label).toContain('→ Prague')
    })
  }
})

describe('landing pages', () => {
  for (const p of LANDING_PAGES) {
    it(`/${p.section}/${p.slug}: content in every locale, links resolve`, () => {
      const key = `${p.section}/${p.slug}`
      const en = getPageContent(key, 'en') as { faqs: unknown[]; related: { links: { href: string }[] } }
      for (const locale of LOCALES) {
        const file = path.join(ROOT, 'content', 'pages', locale, `${key}.json`)
        expect(fs.existsSync(file), file).toBe(true)
        const c = getPageContent(key, locale) as typeof en
        expect(tokens(c)).toEqual(tokens(en))
        expect(c.faqs).toHaveLength(en.faqs.length)
        expect(JSON.stringify(c)).not.toMatch(/€\s?\d/)
      }
      for (const { href } of en.related.links) {
        expect(href).not.toBe(`/${key}`)
        const [, section, slug] = href.split('/')
        const exists =
          LANDING_PAGES.some((l) => l.section === section && l.slug === slug) ||
          fs.existsSync(path.join(ROOT, 'app', '[locale]', ...href.split('/').filter(Boolean), 'page.tsx')) ||
          fs.existsSync(path.join(ROOT, 'content', 'blog', 'en', `${slug}.mdx`))
        expect(exists, href).toBe(true)
      }
    })
  }
})

describe('sitemap', () => {
  it('lists every mirror route and landing page', () => {
    const urls = new Set(sitemap().map((e) => e.url))
    for (const m of MIRROR_ROUTES) expect(urls.has(`https://rideprestigo.com/routes/${m.slug}`), m.slug).toBe(true)
    for (const p of LANDING_PAGES) expect(urls.has(`https://rideprestigo.com/${p.section}/${p.slug}`), p.slug).toBe(true)
  }, 60_000) // sitemap() resolves a git lastmod per URL
})
