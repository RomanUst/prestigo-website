/**
 * Phase 75, Plan 33 (gap round 2: WR-01, IN-05, WINDOWS #24/#26 404 part).
 *
 * Before: a mistyped blog slug (/ru/blog/totally-made-up-slug) resolved its
 * metadata from blog/[slug]'s hardcoded English `{ title: 'Not Found —
 * Prestigo' }` (non-absolute, so the layout template doubled the brand), and
 * the raw 404 error shell used app/[locale]/not-found.tsx's static English
 * title — `<title>Page Not Found — PRESTIGO | PRESTIGO</title>` on every
 * locale.
 *
 * After: every 404 metadata path returns getNotFoundMetadata(locale) (75-31):
 * localized absolute title, localized description + openGraph (twitter is
 * mirrored from og by Next.js), robots noindex/nofollow. The requested slug
 * never reaches the metadata.
 *
 * The contract cases run Next.js's REAL accumulateMetadata over the layout
 * default + the 404 metadata, which is how Next resolves both the hydrated
 * page head and the error-shell head (layout + not-found module metadata).
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { resolveNextMetadata } from './helpers/resolveNextMetadata'

const ROOT = path.resolve(__dirname, '..')
const LOCALES = ['en', 'ru', 'es', 'fr', 'ar', 'hi', 'zh'] as const

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

// The page modules pull in the site chrome; only their metadata exports are
// under test here.
vi.mock('@/components/Nav', () => ({ default: () => null }))
vi.mock('@/components/Footer', () => ({ default: () => null }))
vi.mock('@/components/ArticleByline', () => ({ default: () => null }))

const MISSING_SLUG = 'this-post-does-not-exist'
const EXISTING_SLUG = 'beyond-transport-luxury-chauffeur-service-prague'

async function blogMeta(slug: string, locale: string) {
  const { generateMetadata } = await import('@/app/[locale]/blog/[slug]/page')
  return generateMetadata({ params: Promise.resolve({ slug, locale }) })
}

describe('blog/[slug] generateMetadata — unknown slug (WR-01)', () => {
  for (const locale of LOCALES) {
    it(`${locale}: returns the localized, noindex getNotFoundMetadata shape`, async () => {
      const { getNotFoundMetadata } = await import('@/lib/site-metadata')
      const meta = await blogMeta(MISSING_SLUG, locale)
      expect(meta).toEqual(await getNotFoundMetadata(locale))
      expect(meta.title).toEqual({ absolute: str(locale, 'NotFound.metaTitle') })
      expect(meta.description).toBe(str(locale, 'NotFound.metaDescription'))
      expect(meta.openGraph?.title).toBe(str(locale, 'NotFound.metaTitle'))
      expect(meta.openGraph?.description).toBe(str(locale, 'NotFound.metaDescription'))
      expect(meta.robots).toEqual({ index: false, follow: false })
      expect(meta).not.toHaveProperty('twitter')
      // The requested slug is never reflected into the metadata (T-75-G41).
      expect(JSON.stringify(meta)).not.toContain(MISSING_SLUG)
    })
  }

  it('returns {} without throwing for a non-locale segment (api)', async () => {
    const meta = await blogMeta(MISSING_SLUG, 'api')
    expect(meta).toEqual({})
  })

  it('leaves the found-post branch unchanged (ru existing post)', async () => {
    const meta = await blogMeta(EXISTING_SLUG, 'ru')
    const title = meta.title as { absolute: string }
    expect(title.absolute).toMatch(/ — Prestigo$/)
    expect(title.absolute).not.toBe(str('ru', 'NotFound.metaTitle'))
    expect(typeof meta.description).toBe('string')
    expect(meta.openGraph?.title).toBe(title.absolute.replace(/ — Prestigo$/, ''))
    expect(meta.robots).toBeUndefined()
  })

  it('contract: ru unknown slug resolves to an absolute title with mirrored twitter', async () => {
    const { getLocaleSiteMetadata } = await import('@/lib/site-metadata')
    const resolved = await resolveNextMetadata(
      [await getLocaleSiteMetadata('ru'), await blogMeta(MISSING_SLUG, 'ru')],
      '/ru/blog/x'
    )
    const metaTitle = str('ru', 'NotFound.metaTitle')
    const metaDescription = str('ru', 'NotFound.metaDescription')
    expect(resolved.title?.absolute).toBe(metaTitle)
    expect(resolved.title?.absolute).not.toMatch(/\| PRESTIGO$/)
    expect(resolved.twitter?.title?.absolute).toBe(metaTitle)
    expect(resolved.twitter?.description).toBe(metaDescription)
  })
})
