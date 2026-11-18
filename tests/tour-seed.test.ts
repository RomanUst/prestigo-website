import path from 'node:path'
import { describe, it, expect } from 'vitest'
import { buildSeedRows, loadSeedTours, type SeedData, type SeedTranslation } from '@/lib/tours/seed'
import { TOUR_SLUG_PATTERN } from '@/lib/tours/types'

// Phase 93 (plan 93-21): the seed library turns content/tours-seed into rows. Pure, no database.

const ROOT = path.resolve(__dirname, '..')

describe('loadSeedTours + buildSeedRows (tracer: Dresden EN)', () => {
  const seed = loadSeedTours(ROOT)

  it('reads the six launch tours with valid slugs', () => {
    expect(seed.tours).toHaveLength(6)
    for (const t of seed.tours) expect(t.slug).toMatch(TOUR_SLUG_PATTERN)
  })

  it('returns one draft tour row and a complete en translation for Dresden', () => {
    const dresden: SeedData = {
      tours: seed.tours.filter((t) => t.slug === 'dresden-day-trip'),
      translations: { en: { 'dresden-day-trip': seed.translations.en!['dresden-day-trip'] } },
    }
    const built = buildSeedRows(dresden, { locales: ['en'] })
    expect(built.tours).toHaveLength(1)
    expect(built.tours[0]).toMatchObject({ slug: 'dresden-day-trip', status: 'draft' })
    expect(built.tours[0]).not.toHaveProperty('price_e_eur')
    expect(built.translations).toHaveLength(1)
    expect(built.translations[0]).toMatchObject({ slug: 'dresden-day-trip', locale: 'en', is_complete: true })
    expect(built.reports[0]).toMatchObject({ slug: 'dresden-day-trip', locale: 'en', present: true, complete: true, leak: null })
    expect(built.reports[0].overflow).toEqual([])
  })

  it('reports a locale with no seed file as absent and writes no row for it', () => {
    const built = buildSeedRows({ tours: seed.tours.slice(0, 1), translations: { en: {} } }, { locales: ['en', 'ru'] })
    expect(built.translations).toHaveLength(0)
    expect(built.reports.map((r) => [r.locale, r.present, r.complete])).toEqual([
      ['en', false, false],
      ['ru', false, false],
    ])
  })

  it('generates zh-hant from zh with opencc and keeps the structure', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const openCC = require('opencc-js') as { Converter: (o: { from: string; to: string }) => (s: string) => string }
    const convert = openCC.Converter({ from: 'cn', to: 'twp' })
    const base = seed.translations.en!['dresden-day-trip']
    const zh: SeedTranslation = {
      ...base,
      title: '德累斯顿一日游',
      short_description: '乘坐奔驰专车，一天游览德累斯顿。',
    }
    const built = buildSeedRows(
      { tours: seed.tours.filter((t) => t.slug === 'dresden-day-trip'), translations: { en: { 'dresden-day-trip': base }, zh: { 'dresden-day-trip': zh } } },
      { locales: ['zh', 'zh-hant'] },
    )
    const hant = built.translations.find((r) => r.locale === 'zh-hant')!
    expect(hant.title).toBe(convert('德累斯顿一日游'))
    expect(hant.title).not.toBe(zh.title)
    expect(hant.short_description).toBe(convert('乘坐奔驰专车，一天游览德累斯顿。'))
    expect(hant.itinerary).toHaveLength(base.itinerary.length)
    expect(hant.is_complete).toBe(true)
  })

  it('flags a field longer than the database allows', () => {
    const base = seed.translations.en!['dresden-day-trip']
    const built = buildSeedRows(
      { tours: seed.tours.slice(0, 1), translations: { en: { [seed.tours[0].slug]: { ...base, short_description: 'x'.repeat(401) } } } },
      { locales: ['en'] },
    )
    expect(built.reports[0].overflow).toEqual(['short_description'])
  })
})
