/**
 * Phase 81, Plan 05 — InquiryNotice namespace parity across all 7 site locales
 * (D-16, LEAD-01/02/03). Reads the committed catalogs directly with fs.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const LOCALES = ['en', 'ru', 'es', 'fr', 'ar', 'hi', 'zh'] as const

type Catalog = {
  InquiryNotice?: Record<string, unknown>
  Footer: { privacy: string }
}

function loadCatalog(locale: string): Catalog {
  const raw = readFileSync(join(process.cwd(), 'messages', `${locale}.json`), 'utf8')
  return JSON.parse(raw) as Catalog
}

const catalogs = Object.fromEntries(LOCALES.map((l) => [l, loadCatalog(l)])) as Record<
  (typeof LOCALES)[number],
  Catalog
>

const CHUNK_RE = /<privacy>(.+?)<\/privacy>/

describe('InquiryNotice namespace exists in all 7 catalogs', () => {
  for (const locale of LOCALES) {
    it(`messages/${locale}.json has InquiryNotice.stored with a privacy chunk`, () => {
      const stored = catalogs[locale].InquiryNotice?.stored
      expect(typeof stored).toBe('string')
      expect(stored as string).toContain('<privacy>')
      expect(stored as string).toContain('</privacy>')
    })
  }

  it('InquiryNotice key set is exactly { stored } in every locale', () => {
    for (const locale of LOCALES) {
      expect(Object.keys(catalogs[locale].InquiryNotice ?? {})).toEqual(['stored'])
    }
  })
})

describe('non-EN InquiryNotice.stored is a real translation', () => {
  const en = catalogs.en.InquiryNotice?.stored as string
  for (const locale of LOCALES) {
    if (locale === 'en') continue
    const value = catalogs[locale].InquiryNotice?.stored as string

    it(`${locale} differs from the EN text`, () => {
      expect(value).not.toBe(en)
    })

    it(`${locale} is not an [XX] stub placeholder`, () => {
      expect(value).not.toMatch(/\[[A-Z]{2}\]/)
    })

    it(`${locale} privacy chunk equals that locale's Footer.privacy`, () => {
      const match = CHUNK_RE.exec(value)
      expect(match).not.toBeNull()
      expect(match?.[1]).toBe(catalogs[locale].Footer.privacy)
    })
  }

  it('en privacy chunk equals en Footer.privacy', () => {
    expect(CHUNK_RE.exec(en)?.[1]).toBe(catalogs.en.Footer.privacy)
  })
})

describe('InquiryNotice never uses the misspelling "Prestigio" and carries no price', () => {
  for (const locale of LOCALES) {
    it(`${locale} is clean`, () => {
      const value = catalogs[locale].InquiryNotice?.stored as string
      expect(value.includes('Prestigio')).toBe(false)
      expect(/[€$£¥]|Kč|EUR|CZK|USD/.test(value)).toBe(false)
    })
  }
})
