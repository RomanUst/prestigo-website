import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import { buildSeedRows, loadSeedTours, type SeedData, type SeedTranslation } from '@/lib/tours/seed'
import { locales } from '@/i18n/locales'
import { TOUR_SLUG_PATTERN, type TourPhotoRow, type TourRow } from '@/lib/tours/types'
import { proposeExtraHourPrices, proposeTourPrices } from '@/scripts/lib/tour-price-proposal'
import { main, parseFlags, parsePriceOverrides, type SeedDeps, type SeedStore } from '@/scripts/seed-tours'

// Phase 93 (plan 93-21): the seed library turns content/tours-seed into rows. Pure, no database.

const ROOT = path.resolve(__dirname, '..')

const seed = loadSeedTours(ROOT)

describe('loadSeedTours + buildSeedRows (tracer: Dresden EN)', () => {
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

  it('yields 6 x 8: six tours and a complete translation in every locale, zh-hant generated from zh', () => {
    const built = buildSeedRows(seed, { locales: [...locales] })
    expect(locales).toHaveLength(8)
    expect(built.tours).toHaveLength(6)
    expect(built.translations).toHaveLength(6 * locales.length)
    for (const slug of seed.tours.map((t) => t.slug)) {
      expect(built.translations.filter((r) => r.slug === slug).map((r) => r.locale).sort()).toEqual([...locales].sort())
    }
    for (const row of built.translations) expect(row.is_complete, `${row.slug}/${row.locale}`).toBe(true)
    expect(built.reports).toHaveLength(6 * locales.length)
    for (const r of built.reports) {
      expect({ key: `${r.slug}/${r.locale}`, present: r.present, complete: r.complete, missing: r.missing, leak: r.leak, overflow: r.overflow }).toEqual({
        key: `${r.slug}/${r.locale}`,
        present: true,
        complete: true,
        missing: [],
        leak: null,
        overflow: [],
      })
    }
    // zh-hant is not a seed folder: every zh-hant row is the opencc conversion of the zh row.
    expect(fs.existsSync(path.join(ROOT, 'content', 'tours-seed', 'zh-hant'))).toBe(false)
    for (const slug of seed.tours.map((t) => t.slug)) {
      const zh = built.translations.find((r) => r.slug === slug && r.locale === 'zh')!
      const hant = built.translations.find((r) => r.slug === slug && r.locale === 'zh-hant')!
      expect(hant.title).not.toBe(zh.title)
      expect(hant.itinerary).toHaveLength(zh.itinerary.length)
    }
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

// ---------------------------------------------------------------------------------------------
// Task 3: price proposal and the seed runner

describe('proposeTourPrices / proposeExtraHourPrices', () => {
  it('adds the discounted return leg to the route fare', () => {
    const p = proposeTourPrices({ routeFares: { e: 100, s: 160, v: 110 }, returnDiscountPct: 10, ratePerKm: { e: 1, s: 1, v: 1 }, distanceKm: 35 })
    expect(p).toEqual({ e: 190, s: 304, v: 209, basis: 'route' })
  })

  it('estimates from distance x rate per km when there is no route fare', () => {
    const p = proposeTourPrices({ routeFares: null, returnDiscountPct: 10, ratePerKm: { e: 1.5, s: 2.5, v: 1.7 }, distanceKm: 35 })
    expect(p.basis).toBe('estimate')
    expect(p.e).toBe(53 + Math.round(53 * 0.9))
    expect(p.s).toBe(88 + Math.round(88 * 0.9))
    expect(p.v).toBe(60 + Math.round(60 * 0.9))
  })

  it('refuses a missing rate instead of guessing', () => {
    expect(() => proposeTourPrices({ routeFares: null, returnDiscountPct: 10, ratePerKm: { e: 0, s: 1, v: 1 }, distanceKm: 35 })).toThrow()
  })

  it('copies the hourly rate per class for the extra hour', () => {
    expect(proposeExtraHourPrices({ e: 40, s: 70, v: 50 })).toEqual({ e: 40, s: 70, v: 50 })
  })
})

describe('runtime import', () => {
  it('no file in app/, components/ or lib/ imports the price proposal helper', () => {
    const hits: string[] = []
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.name === 'node_modules' || e.name === '.next') continue
        const full = path.join(dir, e.name)
        if (e.isDirectory()) walk(full)
        else if (/\.(ts|tsx|mjs|js)$/.test(e.name) && fs.readFileSync(full, 'utf8').includes('tour-price-proposal')) hits.push(full)
      }
    }
    for (const d of ['app', 'components', 'lib']) walk(path.join(ROOT, d))
    expect(hits).toEqual([])
  })
})

describe('parseFlags', () => {
  it('defaults to a dry run and rejects unsafe combinations', () => {
    expect(parseFlags([])).toEqual({ apply: false, force: false, publish: [], pricesFile: null })
    expect(parseFlags(['--apply', '--dry-run'])).toHaveProperty('error')
    expect(parseFlags(['--force'])).toHaveProperty('error')
    expect(parseFlags(['--bogus'])).toHaveProperty('error')
    expect(parseFlags(['--apply', '--publish=a-day-trip,b-day-trip'])).toMatchObject({ apply: true, publish: ['a-day-trip', 'b-day-trip'] })
  })
})

type Existing = Array<{ id: string; slug: string; status: string; photoCount: number }>

function fakeStore(overrides: Partial<SeedStore> = {}) {
  const calls: Record<string, unknown[][]> = {}
  const rec =
    <T>(name: string, ret: T) =>
    (...args: unknown[]) => {
      ;(calls[name] ??= []).push(args)
      return Promise.resolve(ret)
    }
  let n = 0
  const store = {
    getPricing: rec('getPricing', { returnDiscountPct: 10, ratePerKm: { e: 1.5, s: 2.5, v: 1.7 }, hourlyRate: { e: 40, s: 70, v: 50 } }),
    getRouteFares: rec('getRouteFares', {
      'prague-dresden': { e: 235, s: 385, v: 255 },
      'prague-kutna-hora': { e: 110, s: 180, v: 120 },
    }),
    getExistingTours: rec('getExistingTours', [] as Existing),
    insertTour: (...args: unknown[]) => {
      ;(calls.insertTour ??= []).push(args)
      n += 1
      return Promise.resolve(`00000000-0000-4000-8000-00000000000${n}`)
    },
    updateTour: rec('updateTour', undefined),
    upsertTranslation: rec('upsertTranslation', undefined),
    getExtraHourPrices: rec('getExtraHourPrices', { e: null, s: null, v: null }),
    setExtraHourPrices: rec('setExtraHourPrices', undefined),
    uploadPhoto: rec('uploadPhoto', undefined),
    removePhotoObjects: rec('removePhotoObjects', undefined),
    insertPhoto: rec('insertPhoto', undefined),
    deleteTourPhotos: rec('deleteTourPhotos', undefined),
    loadPublishInput: rec('loadPublishInput', null),
    publishTour: rec('publishTour', undefined),
    ...overrides,
  } as unknown as SeedStore
  return { store, calls }
}

function makeDeps(argv: string[], store: SeedStore | null, extra: Partial<SeedDeps> = {}) {
  const lines: string[] = []
  const fetchCalls: Array<{ url: string; init?: RequestInit }> = []
  const deps: SeedDeps = {
    argv,
    root: ROOT,
    log: (l) => lines.push(l),
    hasEnv: () => store !== null,
    createStore: async () => store!,
    fetchImpl: (async (url: string | URL | Request, init?: RequestInit) => {
      fetchCalls.push({ url: String(url), init })
      return new Response(new Uint8Array([1, 2, 3, 4]), { status: 200, headers: { 'content-type': 'image/jpeg' } })
    }) as typeof fetch,
    sleep: async () => undefined,
    now: () => new Date('2026-11-18T10:00:00Z'),
    ...extra,
  }
  return { deps, lines, fetchCalls }
}

describe('seed-tours main', () => {
  it('without env prints the completeness table, says Supabase env is not available and writes nothing', async () => {
    const { deps, lines } = makeDeps([], null)
    expect(await main(deps)).toBe(0)
    const out = lines.join('\n')
    expect(out).toContain('Supabase env not available')
    expect(out).toContain('dresden-day-trip')
    expect(out).toContain('| Tour | en | ru |')
  })

  it('--apply without env refuses with exit code 1 and writes nothing', async () => {
    const { deps, lines } = makeDeps(['--apply'], null)
    expect(await main(deps)).toBe(1)
    expect(lines.join('\n')).toContain('Refusing to apply without SUPABASE_URL')
  })

  it('dry run prints the price table (route and estimate rows) and the extra-hour prices, and writes nothing', async () => {
    const { store, calls } = fakeStore()
    const { deps, lines, fetchCalls } = makeDeps([], store)
    expect(await main(deps)).toBe(0)
    const out = lines.join('\n')
    expect(out).toContain('Proposed initial prices')
    expect(out).toMatch(/\| dresden-day-trip \| 5 \| 447 EUR \|/)
    expect(out).toMatch(/\| karlstejn-day-trip \| 3 \|.*ESTIMATE/)
    expect(out).toContain('Extra hour price per car class')
    expect(out).toMatch(/\| 40 EUR \| 70 EUR \| 50 EUR \|/)
    for (const w of ['insertTour', 'updateTour', 'upsertTranslation', 'insertPhoto', 'uploadPhoto', 'setExtraHourPrices', 'publishTour']) {
      expect(calls[w] ?? []).toEqual([])
    }
    expect(fetchCalls).toEqual([])
  })

  it('apply inserts draft tours, translations, photos with credits and the extra-hour prices', async () => {
    const { store, calls } = fakeStore()
    const { deps, lines, fetchCalls } = makeDeps(['--apply'], store)
    expect(await main(deps)).toBe(0)
    expect(calls.insertTour).toHaveLength(6)
    const first = calls.insertTour[0][0] as Record<string, unknown>
    expect(first.status).toBe('draft')
    expect(typeof first.price_e_eur).toBe('number')
    const translations = calls.upsertTranslation.map((c) => c[1] as { locale: string; is_complete: boolean })
    expect(translations.some((t) => t.locale === 'en')).toBe(true)
    expect(translations.every((t) => t.is_complete === true)).toBe(true)
    expect(fetchCalls.length).toBeGreaterThan(0)
    for (const c of fetchCalls) {
      expect(new URL(c.url).protocol).toBe('https:')
      expect((c.init?.headers as Record<string, string>)['User-Agent']).toBe('prestigo-tour-seed/1.0')
    }
    const photos = calls.insertPhoto.map((c) => c[0] as { source: string; is_cover: boolean; credit_text: string | null; storage_path: string; tour_id: string })
    expect(photos.length).toBeGreaterThanOrEqual(30)
    for (const p of photos) {
      expect(p.storage_path).toMatch(/^tours\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp|avif)$/)
      if (p.source !== 'own') expect(p.credit_text).toBeTruthy()
    }
    const covers = new Map<string, number>()
    for (const p of photos) if (p.is_cover) covers.set(p.tour_id, (covers.get(p.tour_id) ?? 0) + 1)
    expect([...covers.values()].every((c) => c === 1)).toBe(true)
    expect(covers.size).toBe(6)
    expect(calls.setExtraHourPrices[0][0]).toEqual({ e: 40, s: 70, v: 50 })
    expect(lines.join('\n')).not.toMatch(/SUPABASE|service_role|eyJ/i)
  })

  it('is insert-only: existing slugs are skipped without --force', async () => {
    const { store, calls } = fakeStore({
      getExistingTours: async () => [{ id: 'id-dresden', slug: 'dresden-day-trip', status: 'published', photoCount: 7 }],
    })
    const { deps } = makeDeps(['--apply'], store)
    expect(await main(deps)).toBe(0)
    const slugs = calls.insertTour.map((c) => (c[0] as { slug: string }).slug)
    expect(slugs).toHaveLength(5)
    expect(slugs).not.toContain('dresden-day-trip')
    expect(calls.updateTour ?? []).toEqual([])
  })

  it('with --force updates the existing tour and keeps its photos', async () => {
    const { store, calls } = fakeStore({
      getExistingTours: async () => [{ id: 'id-dresden', slug: 'dresden-day-trip', status: 'draft', photoCount: 7 }],
    })
    const { deps } = makeDeps(['--apply', '--force'], store)
    expect(await main(deps)).toBe(0)
    expect(calls.updateTour).toHaveLength(1)
    expect(calls.updateTour[0][0]).toBe('id-dresden')
    const photoTours = new Set(calls.insertPhoto.map((c) => (c[0] as { tour_id: string }).tour_id))
    expect(photoTours.has('id-dresden')).toBe(false)
  })

  it('removes the photos of a tour when a download fails and reports a failure', async () => {
    const { store, calls } = fakeStore()
    const { deps, lines } = makeDeps(['--apply'], store, {
      fetchImpl: (async () => new Response('nope', { status: 404 })) as typeof fetch,
    })
    expect(await main(deps)).toBe(1)
    expect(calls.deleteTourPhotos.length).toBeGreaterThan(0)
    expect(lines.join('\n')).toContain('PHOTOS FAILED')
  })

  it('only fills empty extra-hour prices unless --force', async () => {
    const { store, calls } = fakeStore({ getExtraHourPrices: async () => ({ e: 45, s: null, v: null }) })
    const { deps } = makeDeps(['--apply'], store)
    await main(deps)
    expect(calls.setExtraHourPrices[0][0]).toEqual({ s: 70, v: 50 })
  })

  it('publish checks the checklist and publishes only the tours that pass, and only with --apply', async () => {
    const tour = {
      id: 't1',
      slug: 'dresden-day-trip',
      first_published_at: null,
      price_e_eur: 470,
      price_s_eur: 770,
      price_v_eur: 510,
      drive_minutes_each_way: 120,
      destination_label: 'Dresden, Germany',
    } as unknown as TourRow
    const photo = { id: 'p', tour_id: 't1', is_cover: true, source: 'own', credit_text: null, license: null } as unknown as TourPhotoRow
    const loadPublishInput = async (slug: string) =>
      slug === 'dresden-day-trip'
        ? { tour, enComplete: true, photos: [photo] }
        : { tour: { ...tour, id: 't2', slug, price_e_eur: null } as unknown as TourRow, enComplete: true, photos: [photo] }

    const dry = fakeStore({ loadPublishInput })
    const d1 = makeDeps(['--publish=dresden-day-trip,kutna-hora-day-trip'], dry.store)
    expect(await main(d1.deps)).toBe(1)
    expect(d1.lines.join('\n')).toContain('dresden-day-trip: ready to publish')
    expect(d1.lines.join('\n')).toContain('kutna-hora-day-trip: blocked (MISSING_PRICE)')
    expect(dry.calls.publishTour ?? []).toEqual([])

    const live = fakeStore({
      loadPublishInput,
      getExistingTours: async () => seed.tours.map((t, i) => ({ id: `x${i}`, slug: t.slug, status: 'draft', photoCount: 1 })),
    })
    const d2 = makeDeps(['--apply', '--publish=dresden-day-trip,kutna-hora-day-trip'], live.store)
    await main(d2.deps)
    expect(live.calls.publishTour).toHaveLength(1)
    expect(live.calls.publishTour[0][0]).toBe('t1')
  })

  it('reads owner-approved prices from a file', () => {
    expect(parsePriceOverrides({ tours: { 'dresden-day-trip': { e: 300, s: 480, v: 320, hours_included: 6 } }, extra_hour: { e: 40, s: 60, v: 45 } })).toEqual({
      tours: { 'dresden-day-trip': { e: 300, s: 480, v: 320, hours_included: 6 } },
      extra_hour: { e: 40, s: 60, v: 45 },
    })
    expect(() => parsePriceOverrides({ tours: { x: { e: 0, s: 1, v: 1 } } })).toThrow()
    expect(() => parsePriceOverrides({ tours: { x: { e: 1, s: 1, v: 1, hours_included: 13 } } })).toThrow()
  })
})

describe('hub and terms in English (D-25)', () => {
  const read = (rel: string) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8')) as unknown

  function strings(v: unknown): string[] {
    if (typeof v === 'string') return [v]
    if (Array.isArray(v)) return v.flatMap(strings)
    if (v && typeof v === 'object') return Object.values(v).flatMap(strings)
    return []
  }

  it('the hub no longer names a fixed count or a list of destinations', () => {
    const hub = read('content/pages/en/services/day-trips-from-prague.json')
    const all = strings(hub)
    expect(all.join('\n')).not.toMatch(/Four day trips|four day trips/)
    const names = ['Český Krumlov', 'Kutná Hora', 'Karlovy Vary', 'Dresden', 'Karlštejn', 'Bohemian Switzerland']
    for (const s of all) {
      expect(names.filter((n) => s.includes(n)).length, s.slice(0, 80)).toBeLessThan(2)
    }
    expect(all.join('\n')).not.toMatch(/first 15 minutes|started 15/i)
  })

  it('the hub keeps the structure of the other locales (same keys, same array lengths)', () => {
    const hub = read('content/pages/en/services/day-trips-from-prague.json') as Record<string, unknown>
    const ru = read('content/pages/ru/services/day-trips-from-prague.json') as Record<string, unknown>
    expect(Object.keys(hub)).toEqual(Object.keys(ru))
    for (const key of ['glance', 'features', 'steps', 'related']) {
      const a = hub[key] as { items?: unknown[]; links?: unknown[] }
      const b = ru[key] as { items?: unknown[]; links?: unknown[] }
      expect((a.items ?? a.links)?.length).toBe((b.items ?? b.links)?.length)
    }
    expect((hub.faqs as unknown[]).length).toBe((ru.faqs as unknown[]).length)
  })

  it('the terms carry a day-trip clause with no number in it', () => {
    const terms = read('content/pages/en/terms.json')
    const holder = strings(terms).find((s) => s.includes('Day trips have their own'))
    expect(holder).toBeDefined()
    // the clause is the text from its first sentence to the end of the string
    const clause = holder!.slice(holder!.indexOf('Day trips have their own'))
    expect(clause).not.toMatch(/\d/)
    expect(clause).toMatch(/free-cancellation period/)
    expect(clause).toMatch(/person at Prestigo approves/)
  })
})
