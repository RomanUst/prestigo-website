// Phase 93 plan 05 (D-08, D-23): locale completeness with the leak guard, and the publish checklist.
import { describe, it, expect } from 'vitest'
import { isLocaleComplete } from '@/lib/tours/completeness'
import { publishChecklist, type PublishFailure } from '@/lib/tours/publish-checklist'
import type { TourPhotoRow, TourRow, TourTranslationRow } from '@/lib/tours/types'

function row(over: Partial<TourTranslationRow> = {}): TourTranslationRow {
  return {
    tour_id: 't1',
    locale: 'en',
    title: 'Dresden day trip',
    short_description: 'A day in Dresden',
    description: 'About the trip',
    pickup_info: 'Pickup in Prague',
    important_info: '',
    seo_title: 'Dresden day trip from Prague',
    seo_description: 'Private day trip to Dresden',
    highlights: ['Old town'],
    itinerary: [{ title: 'Pickup', body: 'We meet you' }],
    includes: ['Driver'],
    excludes: ['Meals'],
    faq: [{ q: 'Question?', a: 'Answer.' }],
    is_complete: false,
    updated_at: '2026-11-01T00:00:00Z',
    ...over,
  }
}

describe('isLocaleComplete', () => {
  it('a fully filled en row is complete; important_info is optional', () => {
    expect(isLocaleComplete('en', row())).toEqual({ complete: true, missing: [], leak: null })
  })

  it.each([
    ['title', { title: '' }],
    ['short_description', { short_description: '  ' }],
    ['description', { description: '' }],
    ['pickup_info', { pickup_info: '' }],
    ['seo_title', { seo_title: '' }],
    ['seo_description', { seo_description: '' }],
    ['highlights', { highlights: [] }],
    ['itinerary', { itinerary: [] }],
    ['includes', { includes: [] }],
    ['excludes', { excludes: [] }],
    ['faq', { faq: [] }],
  ] as const)('missing %s makes the row incomplete', (field, over) => {
    const r = isLocaleComplete('en', row(over as Partial<TourTranslationRow>))
    expect(r.complete).toBe(false)
    expect(r.missing).toContain(field)
  })

  it('lists that hold only whitespace entries count as empty', () => {
    expect(isLocaleComplete('en', row({ highlights: ['  ', ''] })).missing).toContain('highlights')
    expect(isLocaleComplete('en', row({ itinerary: [{ title: ' ', body: '' }] })).missing).toContain('itinerary')
    expect(isLocaleComplete('en', row({ faq: [{ q: 'Q', a: '' }] })).missing).toContain('faq')
  })

  it('ru with a Latin-only title is a script leak', () => {
    const r = isLocaleComplete('ru', row({ locale: 'ru', title: 'Dresden day trip', short_description: 'Однодневная поездка' }))
    expect(r).toMatchObject({ complete: false, leak: 'script' })
  })

  it('a translated ru row passes', () => {
    const r = isLocaleComplete('ru', row({ locale: 'ru', title: 'Поездка в Дрезден', short_description: 'Один день в Дрездене' }))
    expect(r).toEqual({ complete: true, missing: [], leak: null })
  })

  it.each([
    ['ar', 'رحلة إلى دريسدن', 'يوم في دريسدن'],
    ['hi', 'ड्रेसडेन की एक दिन की यात्रा', 'ड्रेसडेन में एक दिन'],
    ['zh', '德累斯顿一日游', '在德累斯顿的一天'],
    ['zh-hant', '德累斯頓一日遊', '在德累斯頓的一天'],
  ] as const)('%s needs its own script', (locale, title, short) => {
    expect(isLocaleComplete(locale, row({ locale, title, short_description: short })).leak).toBeNull()
    expect(isLocaleComplete(locale, row({ locale, title: 'Dresden day trip', short_description: short })).leak).toBe('script')
  })

  it('es / fr with the EN title or short description copied is an english leak', () => {
    const en = row()
    expect(isLocaleComplete('es', row({ locale: 'es', title: en.title, short_description: 'Un día en Dresde' }), en).leak).toBe('english')
    expect(isLocaleComplete('fr', row({ locale: 'fr', title: 'Excursion à Dresde', short_description: en.short_description }), en).leak).toBe('english')
    expect(isLocaleComplete('fr', row({ locale: 'fr', title: 'Excursion à Dresde', short_description: 'Un jour à Dresde' }), en).complete).toBe(true)
  })
})

const TOUR: TourRow = {
  id: 't1',
  slug: 'dresden-day-trip',
  status: 'draft',
  sort_order: 1,
  hours_included: 5,
  drive_minutes_each_way: 150,
  start_time_min: '07:00',
  start_time_max: '09:00',
  price_e_eur: 100,
  price_s_eur: 180,
  price_v_eur: 120,
  destination_label: 'Dresden',
  first_published_at: null,
  created_at: '2026-11-01T00:00:00Z',
  updated_at: '2026-11-01T00:00:00Z',
}
function photo(over: Partial<TourPhotoRow> = {}): TourPhotoRow {
  return {
    id: 'p1',
    tour_id: 't1',
    storage_path: 'tours/t1/p1.jpg',
    position: 1,
    is_cover: true,
    source: 'own',
    credit_text: null,
    license: null,
    credit_url: null,
    width: 2000,
    height: 1200,
    created_at: '2026-11-01T00:00:00Z',
    ...over,
  }
}
function failures(over: { tour?: Partial<TourRow>; enComplete?: boolean; photos?: TourPhotoRow[] } = {}): PublishFailure[] {
  return publishChecklist({
    tour: { ...TOUR, ...over.tour },
    enComplete: over.enComplete ?? true,
    photos: over.photos ?? [photo()],
  }).failures
}

describe('publishChecklist', () => {
  it('all good is ok with no failures', () => {
    expect(publishChecklist({ tour: TOUR, enComplete: true, photos: [photo()] })).toEqual({ ok: true, failures: [] })
  })
  it('EN_INCOMPLETE', () => {
    expect(failures({ enComplete: false })).toEqual(['EN_INCOMPLETE'])
  })
  it('NO_PHOTO', () => {
    expect(failures({ photos: [] })).toEqual(['NO_PHOTO'])
  })
  it('NO_COVER', () => {
    expect(failures({ photos: [photo({ is_cover: false })] })).toEqual(['NO_COVER'])
  })
  it('MISSING_CREDIT for a commons photo without licence or credit text; own photos need none', () => {
    const commons = photo({ id: 'p2', is_cover: false, source: 'commons', credit_text: 'Author', license: null })
    expect(failures({ photos: [photo(), commons] })).toEqual(['MISSING_CREDIT'])
    const credited = { ...commons, license: 'CC BY-SA 4.0' }
    expect(failures({ photos: [photo(), credited] })).toEqual([])
  })
  it('MISSING_PRICE when any class price is null', () => {
    expect(failures({ tour: { price_v_eur: null } })).toEqual(['MISSING_PRICE'])
  })
  it('MISSING_BASICS for null drive minutes or an empty destination label', () => {
    expect(failures({ tour: { drive_minutes_each_way: null } })).toEqual(['MISSING_BASICS'])
    expect(failures({ tour: { destination_label: ' ' } })).toEqual(['MISSING_BASICS'])
  })
})
