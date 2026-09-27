/**
 * Phase 75, Plan 28 (GAP-4d, fix:75-28 rows for /login) — /<locale>/login
 * used to render the EN site-default <title>/description on every locale
 * because app/[locale]/login/layout.tsx only exported a static robots
 * object. It now exports generateMetadata({ params }) that reads
 * Auth.login.metaTitle / metaDescription for the route's own locale
 * (CR-01: never a bare getLocale()) while robots stays noindex/follow.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'

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

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async ({ locale, namespace }: { locale: string; namespace: string }) => {
    const catalog = loadCatalog(locale)
    return (key: string) => {
      const value = lookup(catalog, `${namespace}.${key}`)
      if (typeof value !== 'string') throw new Error(`missing ${locale}:${namespace}.${key}`)
      return value
    }
  }),
}))

describe('/login generateMetadata', () => {
  for (const locale of LOCALES) {
    it(`returns the ${locale} Auth.login metaTitle/metaDescription with robots unchanged`, async () => {
      const { generateMetadata } = await import('@/app/[locale]/login/layout')
      const meta = await generateMetadata({ params: Promise.resolve({ locale }) })
      const catalog = loadCatalog(locale)
      const title = lookup(catalog, 'Auth.login.metaTitle')
      const description = lookup(catalog, 'Auth.login.metaDescription')
      expect(typeof title).toBe('string')
      expect(typeof description).toBe('string')
      expect(meta.title).toEqual({ absolute: title })
      expect(meta.description).toBe(description)
      expect(meta.robots).toEqual({ index: false, follow: true })
      // 75-31: localized openGraph; no twitter key (the locale layout default
      // mirrors og:* into twitter:*).
      const og = meta.openGraph as Record<string, unknown>
      expect(og.title).toBe(title)
      expect(og.description).toBe(description)
      expect(og.type).toBe('website')
      expect(og.siteName).toBe('PRESTIGO')
      expect(meta).not.toHaveProperty('twitter')
    })
  }

  it('returns only the robots directive for a non-locale segment (no throw)', async () => {
    const { generateMetadata } = await import('@/app/[locale]/login/layout')
    const meta = await generateMetadata({ params: Promise.resolve({ locale: 'api' }) })
    expect(meta).toEqual({ robots: { index: false, follow: true } })
  })

  it('translates the title and description in every non-EN catalog (PRESTIGO kept in Latin)', () => {
    const en = loadCatalog('en')
    const enTitle = lookup(en, 'Auth.login.metaTitle') as string
    const enDescription = lookup(en, 'Auth.login.metaDescription') as string
    expect(enTitle).toContain('PRESTIGO')
    for (const locale of LOCALES.filter((l) => l !== 'en')) {
      const catalog = loadCatalog(locale)
      const title = lookup(catalog, 'Auth.login.metaTitle') as string
      const description = lookup(catalog, 'Auth.login.metaDescription') as string
      expect(title, locale).toContain('PRESTIGO')
      expect(title, locale).not.toBe(enTitle)
      expect(description, locale).not.toBe(enDescription)
    }
  })

  it('keeps the layout body a pass-through and does not add canonical/alternates', () => {
    const src = readFileSync(path.join(ROOT, 'app', '[locale]', 'login', 'layout.tsx'), 'utf8')
    expect(src).not.toMatch(/alternates|canonical/)
    expect(src).not.toMatch(/getLocale\(/)
  })
})
