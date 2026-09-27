/**
 * Phase 75, Plan 31 (GAP-4 metadata half: WR-02 + WINDOWS #24/#26 /login part).
 *
 * Before: app/[locale]/layout.tsx exported the static English siteMetadata,
 * whose twitter block set its own title/description — so Next.js never
 * mirrored a page's localized openGraph into twitter:*, and every non-EN page
 * shipped English twitter:title/twitter:description (plus English default
 * description/og on pages without an og override, e.g. /data-deletion).
 *
 * After: the layout's generateMetadata returns getLocaleSiteMetadata(locale)
 * — localized default title/description/keywords/og — whose twitter block
 * carries only card + images, so Next.js's own postProcessMetadata fills
 * twitter title/description from each page's resolved openGraph.
 *
 * The contract cases run Next.js's REAL accumulateMetadata
 * (tests/helpers/resolveNextMetadata.ts), so they fail if a Next.js upgrade
 * stops mirroring og into twitter.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { Metadata } from 'next'
import { resolveNextMetadata } from './helpers/resolveNextMetadata'

const ROOT = path.resolve(__dirname, '..')
const LOCALES = ['en', 'ru', 'es', 'fr', 'ar', 'hi', 'zh'] as const
const NON_EN = LOCALES.filter((l) => l !== 'en')

type Catalog = Record<string, unknown>

function loadCatalog(locale: string): Catalog {
  return JSON.parse(readFileSync(path.join(ROOT, 'messages', `${locale}.json`), 'utf8'))
}

function lookup(catalog: Catalog, dotPath: string): unknown {
  return dotPath.split('.').reduce<unknown>((node, seg) => {
    if (node && typeof node === 'object') return (node as Record<string, unknown>)[seg]
    return undefined
  }, catalog)
}

function str(locale: string, dotPath: string): string {
  const value = lookup(loadCatalog(locale), dotPath)
  if (typeof value !== 'string') throw new Error(`missing ${locale}:${dotPath}`)
  return value
}

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async ({ locale, namespace }: { locale: string; namespace: string }) => {
    const catalog = loadCatalog(locale)
    return (key: string) => {
      const value = lookup(catalog, `${namespace}.${key}`)
      if (typeof value !== 'string') throw new Error(`missing ${locale}:${namespace}.${key}`)
      return value
    }
  }),
  setRequestLocale: vi.fn(),
}))

// app/[locale]/layout.tsx imports SiteChrome (next/font + globals.css) — the
// metadata export is what is under test, so the chrome is stubbed.
vi.mock('@/components/SiteChrome', () => ({
  default: ({ children }: { children: unknown }) => children,
  siteMetadata: {},
}))

const EXPECTED_OG_LOCALE: Record<string, string> = {
  en: 'en_US',
  ru: 'ru_RU',
  es: 'es_ES',
  fr: 'fr_FR',
  ar: 'ar_AR',
  hi: 'hi_IN',
  zh: 'zh_CN',
}

const EN_TITLE = 'PRESTIGO — Premium Chauffeur Service Prague'
const EN_DESCRIPTION =
  'Premium chauffeur service in Prague. Airport transfers, intercity routes, corporate accounts. Fixed prices, flight tracking, meet & greet.'
const EN_KEYWORDS = [
  'chauffeur Prague',
  'airport transfer Prague',
  'private driver Prague',
  'luxury transfer Prague',
  'Prague taxi service',
  'executive transfer Prague',
]

function ogOf(meta: Metadata): Record<string, unknown> {
  return (meta.openGraph ?? {}) as Record<string, unknown>
}

function ogImage(meta: Metadata): Record<string, unknown> {
  const images = ogOf(meta).images as Array<Record<string, unknown>>
  return images[0]
}

describe('getLocaleSiteMetadata — locale-aware site default', () => {
  it('EN is byte-equivalent to the previous siteMetadata except twitter (card + images only)', async () => {
    const { getLocaleSiteMetadata, siteMetadata } = await import('@/lib/site-metadata')
    const meta = await getLocaleSiteMetadata('en')
    expect(meta.title).toEqual({ default: EN_TITLE, template: '%s | PRESTIGO' })
    expect(meta.description).toBe(EN_DESCRIPTION)
    expect(meta.openGraph).toEqual(siteMetadata.openGraph)
    expect(meta.openGraph).toEqual({
      type: 'website',
      locale: 'en_US',
      siteName: 'PRESTIGO',
      title: EN_TITLE,
      description: EN_DESCRIPTION,
      images: [{ url: '/og-image.jpg', width: 1200, height: 630, alt: EN_TITLE }],
    })
    // Next.js renders keywords as array.join(',') — a bare-comma string renders identically.
    const keywords = meta.keywords
    const rendered = Array.isArray(keywords) ? keywords.join(',') : keywords
    expect(rendered).toBe(EN_KEYWORDS.join(','))
    expect(meta.twitter).toEqual({ card: 'summary_large_image', images: ['/og-image.jpg'] })
    // Unchanged site-wide fields.
    expect(meta.metadataBase).toEqual(siteMetadata.metadataBase)
    expect(meta.robots).toEqual(siteMetadata.robots)
    expect(meta.icons).toEqual(siteMetadata.icons)
    expect(meta.other).toEqual(siteMetadata.other)
    expect(meta.authors).toEqual(siteMetadata.authors)
    expect(meta.creator).toBe('PRESTIGO')
  })

  for (const locale of NON_EN) {
    it(`${locale}: default title/description/og/keywords come from the ${locale} catalog`, async () => {
      const { getLocaleSiteMetadata } = await import('@/lib/site-metadata')
      const meta = await getLocaleSiteMetadata(locale)
      const title = str(locale, 'SiteMetadata.defaultTitle')
      const description = str(locale, 'SiteMetadata.defaultDescription')
      const keywords = str(locale, 'SiteMetadata.keywords')
      expect(title).not.toBe(EN_TITLE)
      expect(description).not.toBe(EN_DESCRIPTION)
      expect(keywords).not.toBe(EN_KEYWORDS.join(','))
      expect(meta.title).toEqual({ default: title, template: '%s | PRESTIGO' })
      expect(meta.description).toBe(description)
      expect(meta.keywords).toBe(keywords)
      expect(ogOf(meta).locale).toBe(EXPECTED_OG_LOCALE[locale])
      expect(ogOf(meta).title).toBe(title)
      expect(ogOf(meta).description).toBe(description)
      expect(ogImage(meta).alt).toBe(title)
      expect(meta.twitter).toEqual({ card: 'summary_large_image', images: ['/og-image.jpg'] })
    })
  }

  it('falls back to EN for a non-locale segment without throwing', async () => {
    const { getLocaleSiteMetadata } = await import('@/lib/site-metadata')
    await expect(getLocaleSiteMetadata('xx')).resolves.toEqual(await getLocaleSiteMetadata('en'))
  })

  it('OG_LOCALE covers all 7 locales', async () => {
    const { OG_LOCALE } = await import('@/lib/site-metadata')
    expect(OG_LOCALE).toEqual(EXPECTED_OG_LOCALE)
  })
})

describe('Next.js metadata resolution contract (real accumulateMetadata)', () => {
  for (const locale of LOCALES) {
    it(`${locale}: twitter:title/description mirror the page's own localized og`, async () => {
      const { getLocaleSiteMetadata } = await import('@/lib/site-metadata')
      const layout = await getLocaleSiteMetadata(locale)
      const pageTitle = `${locale} fleet page title`
      const pageDescription = `${locale} fleet page description`
      const page: Metadata = {
        title: pageTitle,
        description: pageDescription,
        openGraph: { title: pageTitle, description: pageDescription },
      }
      const resolved = await resolveNextMetadata([layout, page])
      expect(resolved.openGraph?.title?.absolute).toBe(pageTitle)
      expect(resolved.twitter?.title?.absolute).toBe(resolved.openGraph?.title?.absolute)
      expect(resolved.twitter?.description).toBe(resolved.openGraph?.description)
      expect(resolved.twitter?.description).toBe(pageDescription)
      expect(resolved.twitter?.card).toBe('summary_large_image')
      const twImage = resolved.twitter?.images?.[0]
      expect(String(twImage?.url)).toMatch(/\/og-image\.jpg$/)
    })
  }

  for (const locale of NON_EN) {
    it(`${locale}: a page without an og override inherits the localized default (never EN)`, async () => {
      const { getLocaleSiteMetadata } = await import('@/lib/site-metadata')
      const layout = await getLocaleSiteMetadata(locale)
      // data-deletion shape: title + description only, no openGraph.
      const page: Metadata = { title: 'x', description: 'y' }
      const resolved = await resolveNextMetadata([layout, page])
      const title = str(locale, 'SiteMetadata.defaultTitle')
      const description = str(locale, 'SiteMetadata.defaultDescription')
      expect(resolved.openGraph?.title?.absolute).toBe(title)
      expect(resolved.openGraph?.description).toBe(description)
      expect(resolved.twitter?.title?.absolute).toBe(title)
      expect(resolved.twitter?.description).toBe(description)
      expect(resolved.openGraph?.locale).toBe(EXPECTED_OG_LOCALE[locale])
      expect(resolved.twitter?.title?.absolute).not.toBe(EN_TITLE)
      expect(resolved.twitter?.description).not.toBe(EN_DESCRIPTION)
      expect(resolved.keywords).toEqual([str(locale, 'SiteMetadata.keywords')])
    })
  }
})

describe('app/[locale]/layout.tsx metadata export', () => {
  it('exports generateMetadata (no static metadata constant) returning the locale default', async () => {
    const mod = (await import('@/app/[locale]/layout')) as Record<string, unknown>
    expect(mod.metadata).toBeUndefined()
    expect(typeof mod.generateMetadata).toBe('function')
    const { getLocaleSiteMetadata } = await import('@/lib/site-metadata')
    const generateMetadata = mod.generateMetadata as (args: {
      params: Promise<{ locale: string }>
    }) => Promise<Metadata>
    const meta = await generateMetadata({ params: Promise.resolve({ locale: 'ru' }) })
    expect(meta).toEqual(await getLocaleSiteMetadata('ru'))
  })

  it('reads the locale from params, never the request-scoped getLocale()', () => {
    const src = readFileSync(path.join(ROOT, 'app', '[locale]', 'layout.tsx'), 'utf8')
    expect(src).not.toMatch(/getLocale\(/)
  })
})
