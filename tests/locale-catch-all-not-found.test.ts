/**
 * Phase 75, Plan 25 (GAP-4a / WINDOWS #22) — the required catch-all
 * app/[locale]/[...rest]/page.tsx routes every unmatched localized (and
 * EN-root, via next-intl's as-needed rewrite) path into the already-localized
 * app/[locale]/not-found.tsx boundary instead of the English root
 * app/not-found.tsx.
 *
 * Asserts:
 *   - the default export throws Next's not-found error synchronously (digest
 *     `NEXT_HTTP_ERROR_FALLBACK;404`) — no await before it, so the response
 *     status stays a real 404 (no streamed/locked 200, no soft-404);
 *   - generateMetadata returns the locale's NotFound.metaTitle as an absolute
 *     title + noindex for every locale, and {} (no throw, no title) for a
 *     non-locale first segment such as `api`; since 75-33 it returns the full
 *     getNotFoundMetadata(locale) shape (localized description + openGraph,
 *     twitter mirrored from og by Next.js);
 *   - route shape: required `[...rest]` (never an optional `[[...rest]]`
 *     sibling that would shadow the locale home) and no generateStaticParams.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'

const ROOT = path.resolve(__dirname, '..')
const LOCALES = ['en', 'ru', 'es', 'fr', 'ar', 'hi', 'zh'] as const

function loadCatalog(locale: string): Record<string, Record<string, string>> {
  return JSON.parse(readFileSync(path.join(ROOT, 'messages', `${locale}.json`), 'utf8'))
}

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async ({ locale, namespace }: { locale: string; namespace: string }) => {
    const catalog = loadCatalog(locale)
    return (key: string) => {
      const value = catalog[namespace]?.[key]
      if (typeof value !== 'string') throw new Error(`missing ${locale}:${namespace}.${key}`)
      return value
    }
  }),
}))

const PAGE_DIR = path.join(ROOT, 'app', '[locale]', '[...rest]')
const PAGE_FILE = path.join(PAGE_DIR, 'page.tsx')

describe('app/[locale]/[...rest] route shape', () => {
  it('is a required catch-all with a page.tsx', () => {
    expect(existsSync(PAGE_FILE)).toBe(true)
  })

  it('has no optional [[...x]] catch-all sibling under app/[locale] (would shadow the locale home)', () => {
    const optional = readdirSync(path.join(ROOT, 'app', '[locale]')).filter((d) => d.startsWith('[[...'))
    expect(optional).toEqual([])
  })

  it('exports no generateStaticParams', async () => {
    const mod = (await import('@/app/[locale]/[...rest]/page')) as Record<string, unknown>
    expect(mod.generateStaticParams).toBeUndefined()
    const src = readFileSync(PAGE_FILE, 'utf8')
      .split('\n')
      .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
      .join('\n')
    expect(src).not.toMatch(/generateStaticParams/)
  })
})

describe('catch-all default export', () => {
  it('throws the Next.js 404 not-found error synchronously', async () => {
    const mod = await import('@/app/[locale]/[...rest]/page')
    const Page = mod.default as () => unknown
    let thrown: unknown
    try {
      const result = Page()
      // Must not be a promise — a thrown error must happen before any await.
      expect(result).toBeUndefined()
    } catch (err) {
      thrown = err
    }
    expect(thrown).toBeInstanceOf(Error)
    expect((thrown as { digest?: string }).digest).toBe('NEXT_HTTP_ERROR_FALLBACK;404')
  })
})

describe('catch-all generateMetadata', () => {
  for (const locale of LOCALES) {
    it(`returns ${locale} NotFound.metaTitle as an absolute, noindex title`, async () => {
      const { generateMetadata } = await import('@/app/[locale]/[...rest]/page')
      const meta = await generateMetadata({ params: Promise.resolve({ locale, rest: ['x'] }) })
      const expected = loadCatalog(locale).NotFound.metaTitle
      expect(typeof expected).toBe('string')
      expect(expected.length).toBeGreaterThan(0)
      expect(meta.title).toEqual({ absolute: expected })
      expect(meta.robots).toEqual({ index: false, follow: false })
    })

    it(`returns the full ${locale} getNotFoundMetadata shape (description + og, 75-33)`, async () => {
      const { generateMetadata } = await import('@/app/[locale]/[...rest]/page')
      const { getNotFoundMetadata } = await import('@/lib/site-metadata')
      const meta = await generateMetadata({ params: Promise.resolve({ locale, rest: ['x'] }) })
      expect(meta).toEqual(await getNotFoundMetadata(locale))
      const catalog = loadCatalog(locale).NotFound
      expect(meta.description).toBe(catalog.metaDescription)
      expect(meta.openGraph?.title).toBe(catalog.metaTitle)
      expect(meta.openGraph?.description).toBe(catalog.metaDescription)
      expect(meta).not.toHaveProperty('twitter')
    })
  }

  it('keeps the EN title byte-identical to the existing static 404 title', () => {
    expect(loadCatalog('en').NotFound.metaTitle).toBe('Page Not Found — PRESTIGO')
  })

  it('translates metaTitle in every non-EN catalog (PRESTIGO kept in Latin)', () => {
    const en = loadCatalog('en').NotFound.metaTitle
    for (const locale of LOCALES.filter((l) => l !== 'en')) {
      const value = loadCatalog(locale).NotFound.metaTitle
      expect(value, locale).toContain('PRESTIGO')
      expect(value, locale).not.toBe(en)
    }
  })

  it('returns {} without throwing for a non-locale first segment (e.g. api)', async () => {
    const { generateMetadata } = await import('@/app/[locale]/[...rest]/page')
    const meta = await generateMetadata({ params: Promise.resolve({ locale: 'api', rest: ['x'] }) })
    expect(meta).toEqual({})
    expect(meta.title).toBeUndefined()
  })
})
