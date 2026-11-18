// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createFakeToursDb, type FakeToursDb } from './helpers/fake-tours-db'

/**
 * Phase 93 plan 93-07 (TRIP-03, TRIP-05; D-07, D-08, D-24): the admin tour API. The routes and the store run for real
 * against an in-memory database; the admin session is a switch and revalidatePath is a spy.
 */

const { world, revalidateMock } = vi.hoisted(() => ({
  world: {
    db: null as null | { client: { from: (t: string) => unknown } },
    auth: 'admin' as 'admin' | '401' | '403',
    adminCalls: 0,
  },
  revalidateMock: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  getAdminUser: vi.fn(async () => {
    world.adminCalls += 1
    if (world.auth === '401') return { user: null, error: '401' as const }
    if (world.auth === '403') return { user: null, error: '403' as const }
    return { user: { id: '99999999-9999-4999-8999-999999999999' }, error: null }
  }),
}))
vi.mock('@/lib/supabase', () => ({
  createSupabaseServiceClient: () => ({ from: (t: string) => world.db!.client.from(t) }),
}))
vi.mock('next/cache', () => ({ revalidatePath: revalidateMock }))

import { GET as LIST, POST as CREATE } from '@/app/api/admin/tours/route'
import { GET as DETAIL } from '@/app/api/admin/tours/[id]/route'
import { PUT as SAVE_TRANSLATION } from '@/app/api/admin/tours/[id]/translations/[locale]/route'

let db: FakeToursDb

const TOUR_ID = '11111111-1111-4111-8111-111111111111'

function seedTour(extra: Record<string, unknown> = {}) {
  db.tables.tours.push({
    id: TOUR_ID,
    slug: 'karlstejn-day-trip',
    status: 'draft',
    sort_order: 0,
    hours_included: 4,
    drive_minutes_each_way: null,
    start_time_min: '08:00',
    start_time_max: '11:00',
    price_e_eur: null,
    price_s_eur: null,
    price_v_eur: null,
    destination_label: '',
    first_published_at: null,
    created_at: '2026-11-18T00:00:00.000Z',
    updated_at: '2026-11-18T00:00:00.000Z',
    ...extra,
  })
}

function json(method: string, body: unknown): Request {
  return new Request('http://localhost/api/admin/tours', {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function ctx(id: string): { params: Promise<{ id: string }> }
function ctx(id: string, locale: string): { params: Promise<{ id: string; locale: string }> }
function ctx(id: string, locale?: string) {
  return { params: Promise.resolve(locale === undefined ? { id } : { id, locale }) }
}

const EN_CONTENT = {
  title: 'Karlstejn Castle day trip',
  short_description: 'A private day trip to the Gothic castle with a chauffeur.',
  description: 'Leave Prague in the morning and reach Karlstejn within the hour.',
  pickup_info: 'Pickup at your hotel in Prague.',
  important_info: 'Bring a jacket.',
  seo_title: 'Karlstejn day trip from Prague',
  seo_description: 'Private chauffeur day trip from Prague to Karlstejn Castle.',
  highlights: ['Gothic castle'],
  includes: ['Chauffeur'],
  excludes: ['Entry tickets'],
  itinerary: [{ title: 'Drive', body: 'About 40 minutes each way.' }],
  faq: [{ q: 'How long is the trip?', a: 'Half a day.' }],
}

const RU_LATIN = { ...EN_CONTENT, title: 'Karlstejn castle trip' }

beforeEach(() => {
  db = createFakeToursDb()
  world.db = db
  world.auth = 'admin'
  world.adminCalls = 0
  revalidateMock.mockClear()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('admin tours API: guards', () => {
  it('401 without a session on every Task 1 route, and the body is never read', async () => {
    world.auth = '401'
    const req = json('POST', { slug: 'karlstejn-day-trip', title: 'X' })
    const textSpy = vi.spyOn(req, 'text')
    expect((await LIST()).status).toBe(401)
    expect((await CREATE(req)).status).toBe(401)
    expect(textSpy).not.toHaveBeenCalled()
    expect((await DETAIL(new Request('http://localhost/x'), ctx(TOUR_ID))).status).toBe(401)
    const put = json('PUT', EN_CONTENT)
    const putSpy = vi.spyOn(put, 'text')
    expect((await SAVE_TRANSLATION(put, ctx(TOUR_ID, 'en'))).status).toBe(401)
    expect(putSpy).not.toHaveBeenCalled()
    expect(revalidateMock).not.toHaveBeenCalled()
  })

  it('403 for a signed-in user who is not an admin', async () => {
    world.auth = '403'
    expect((await LIST()).status).toBe(403)
    expect((await CREATE(json('POST', { slug: 'karlstejn-day-trip', title: 'X' }))).status).toBe(403)
    expect((await DETAIL(new Request('http://localhost/x'), ctx(TOUR_ID))).status).toBe(403)
    expect((await SAVE_TRANSLATION(json('PUT', EN_CONTENT), ctx(TOUR_ID, 'en'))).status).toBe(403)
    expect(db.tables.tours).toHaveLength(0)
    expect(revalidateMock).not.toHaveBeenCalled()
  })
})

describe('admin tours API: create', () => {
  it('creates a draft and an en row holding the title, and revalidates once', async () => {
    const res = await CREATE(json('POST', { slug: 'karlstejn-day-trip', title: 'Karlstejn Castle day trip' }))
    expect(res.status).toBe(201)
    const { id } = await res.json()
    expect(db.tables.tours).toHaveLength(1)
    expect(db.tables.tours[0]).toMatchObject({ id, slug: 'karlstejn-day-trip', status: 'draft', sort_order: 0 })
    expect(db.tables.tour_translations).toHaveLength(1)
    expect(db.tables.tour_translations[0]).toMatchObject({ tour_id: id, locale: 'en', title: 'Karlstejn Castle day trip', is_complete: false })
    expect(revalidateMock).toHaveBeenCalledTimes(1)
    expect(revalidateMock).toHaveBeenCalledWith('/[locale]', 'layout')
  })

  it('puts a new tour after the last one (sort_order = max + 1)', async () => {
    seedTour({ sort_order: 4 })
    const res = await CREATE(json('POST', { slug: 'dresden-day-trip', title: 'Dresden' }))
    expect(res.status).toBe(201)
    expect(db.tables.tours.find((t) => t.slug === 'dresden-day-trip')?.sort_order).toBe(5)
  })

  it.each([
    ['no -day-trip suffix', { slug: 'karlstejn', title: 'X' }],
    ['uppercase slug', { slug: 'Karlstejn-day-trip', title: 'X' }],
    ['empty title', { slug: 'karlstejn-day-trip', title: '' }],
    ['title with a line break', { slug: 'karlstejn-day-trip', title: 'a\nb' }],
    ['title over 120', { slug: 'karlstejn-day-trip', title: 'x'.repeat(121) }],
    ['unknown key', { slug: 'karlstejn-day-trip', title: 'X', status: 'published' }],
  ])('400 for %s', async (_label, body) => {
    const res = await CREATE(json('POST', body))
    expect(res.status).toBe(400)
    expect(db.tables.tours).toHaveLength(0)
    expect(revalidateMock).not.toHaveBeenCalled()
  })

  it('400 for malformed JSON', async () => {
    const req = new Request('http://localhost/x', { method: 'POST', body: '{not json' })
    expect((await CREATE(req)).status).toBe(400)
  })

  it('413 for an oversized body', async () => {
    const req = new Request('http://localhost/x', {
      method: 'POST',
      headers: { 'content-length': '999999' },
      body: JSON.stringify({ slug: 'karlstejn-day-trip', title: 'X' }),
    })
    expect((await CREATE(req)).status).toBe(413)
  })

  it('409 SLUG_TAKEN for an existing slug and no revalidation', async () => {
    seedTour()
    const res = await CREATE(json('POST', { slug: 'karlstejn-day-trip', title: 'Again' }))
    expect(res.status).toBe(409)
    expect((await res.json()).code).toBe('SLUG_TAKEN')
    expect(db.tables.tours).toHaveLength(1)
    expect(revalidateMock).not.toHaveBeenCalled()
  })

  it('removes the draft again when the English row cannot be written, and answers a fixed 500', async () => {
    db.failWritesOn.add('tour_translations')
    const res = await CREATE(json('POST', { slug: 'karlstejn-day-trip', title: 'X' }))
    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).not.toContain('secret@example.com')
    expect(db.tables.tours).toHaveLength(0)
    expect(revalidateMock).not.toHaveBeenCalled()
  })
})

describe('admin tours API: save a translation and read it back (tracer)', () => {
  beforeEach(() => seedTour())

  it('saves a full English row: complete true, stored is_complete true, revalidated once', async () => {
    const res = await SAVE_TRANSLATION(json('PUT', EN_CONTENT), ctx(TOUR_ID, 'en'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.complete).toBe(true)
    expect(body.missing).toEqual([])
    expect(body.leak).toBeNull()
    expect(body.translation.is_complete).toBe(true)
    expect(db.tables.tour_translations[0]).toMatchObject({ tour_id: TOUR_ID, locale: 'en', is_complete: true })
    expect(revalidateMock).toHaveBeenCalledTimes(1)
    expect(revalidateMock).toHaveBeenCalledWith('/[locale]', 'layout')
  })

  it('an incomplete row is stored with is_complete false and the missing fields are listed', async () => {
    const res = await SAVE_TRANSLATION(json('PUT', { ...EN_CONTENT, faq: [], pickup_info: '' }), ctx(TOUR_ID, 'en'))
    const body = await res.json()
    expect(body.complete).toBe(false)
    expect(body.missing).toEqual(expect.arrayContaining(['pickup_info', 'faq']))
    expect(db.tables.tour_translations[0].is_complete).toBe(false)
  })

  it('upserts: a second save of the same locale keeps one row', async () => {
    await SAVE_TRANSLATION(json('PUT', EN_CONTENT), ctx(TOUR_ID, 'en'))
    await SAVE_TRANSLATION(json('PUT', { ...EN_CONTENT, title: 'Karlstejn Castle' }), ctx(TOUR_ID, 'en'))
    expect(db.tables.tour_translations).toHaveLength(1)
    expect(db.tables.tour_translations[0].title).toBe('Karlstejn Castle')
  })

  it('is_complete in the body is rejected (strict schema) and nothing is written', async () => {
    const res = await SAVE_TRANSLATION(json('PUT', { ...EN_CONTENT, is_complete: true }), ctx(TOUR_ID, 'en'))
    expect(res.status).toBe(400)
    expect(db.tables.tour_translations).toHaveLength(0)
    expect(revalidateMock).not.toHaveBeenCalled()
  })

  it('an unknown locale segment is 404, an unknown tour is 404', async () => {
    expect((await SAVE_TRANSLATION(json('PUT', EN_CONTENT), ctx(TOUR_ID, 'de'))).status).toBe(404)
    expect((await SAVE_TRANSLATION(json('PUT', EN_CONTENT), ctx('22222222-2222-4222-8222-222222222222', 'en'))).status).toBe(404)
    expect((await SAVE_TRANSLATION(json('PUT', EN_CONTENT), ctx('not-a-uuid', 'en'))).status).toBe(404)
    expect(revalidateMock).not.toHaveBeenCalled()
  })

  it('a ru row with a Latin title is saved incomplete with leak "script"', async () => {
    const res = await SAVE_TRANSLATION(json('PUT', RU_LATIN), ctx(TOUR_ID, 'ru'))
    const body = await res.json()
    expect(body.complete).toBe(false)
    expect(body.leak).toBe('script')
    expect(db.tables.tour_translations[0]).toMatchObject({ locale: 'ru', is_complete: false })
  })

  it('an es row copied from English is incomplete with leak "english"', async () => {
    await SAVE_TRANSLATION(json('PUT', EN_CONTENT), ctx(TOUR_ID, 'en'))
    const res = await SAVE_TRANSLATION(json('PUT', EN_CONTENT), ctx(TOUR_ID, 'es'))
    const body = await res.json()
    expect(body.complete).toBe(false)
    expect(body.leak).toBe('english')
  })

  it('changing the English text re-checks es / fr rows against it', async () => {
    await SAVE_TRANSLATION(json('PUT', EN_CONTENT), ctx(TOUR_ID, 'en'))
    const es = { ...EN_CONTENT, title: 'Excursion a Karlstejn', short_description: 'Excursion privada al castillo gotico.' }
    expect((await (await SAVE_TRANSLATION(json('PUT', es), ctx(TOUR_ID, 'es'))).json()).complete).toBe(true)
    // the English title is now the same as the stored Spanish one: the Spanish row turns incomplete
    await SAVE_TRANSLATION(
      json('PUT', { ...EN_CONTENT, title: es.title, short_description: es.short_description }),
      ctx(TOUR_ID, 'en'),
    )
    expect(db.tables.tour_translations.find((r) => r.locale === 'es')?.is_complete).toBe(false)
  })

  it('a database failure is a fixed 500 that never echoes the message, and does not revalidate', async () => {
    db.failWritesOn.add('tour_translations')
    const res = await SAVE_TRANSLATION(json('PUT', EN_CONTENT), ctx(TOUR_ID, 'en'))
    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).not.toContain('secret@example.com')
    expect(revalidateMock).not.toHaveBeenCalled()
  })

  it('drops blank list rows and trims the text before storing', async () => {
    await SAVE_TRANSLATION(
      json('PUT', { ...EN_CONTENT, title: '  Karlstejn  ', highlights: ['Castle', '  ', ''], faq: [{ q: '', a: '' }, ...EN_CONTENT.faq] }),
      ctx(TOUR_ID, 'en'),
    )
    const row = db.tables.tour_translations[0]
    expect(row.title).toBe('Karlstejn')
    expect(row.highlights).toEqual(['Castle'])
    expect(row.faq).toEqual(EN_CONTENT.faq)
  })
})

describe('admin tours API: read', () => {
  it('GET list returns the tours with the English title, cover and completeness per locale', async () => {
    seedTour()
    db.tables.tour_translations.push(
      { tour_id: TOUR_ID, locale: 'en', title: 'Karlstejn', is_complete: true },
      { tour_id: TOUR_ID, locale: 'ru', title: 'Карлштейн', is_complete: false },
    )
    db.tables.tour_photos.push({ tour_id: TOUR_ID, storage_path: `tours/${TOUR_ID}/p.jpg`, is_cover: true })
    const res = await LIST()
    expect(res.status).toBe(200)
    const { tours } = await res.json()
    expect(tours).toHaveLength(1)
    expect(tours[0]).toMatchObject({ id: TOUR_ID, slug: 'karlstejn-day-trip', title: 'Karlstejn', cover_path: `tours/${TOUR_ID}/p.jpg` })
    expect(tours[0].completeness).toEqual({ en: true, ru: false, es: false, fr: false, ar: false, hi: false, zh: false, 'zh-hant': false })
  })

  it('GET list is an empty array when there are no tours', async () => {
    expect(await (await LIST()).json()).toEqual({ tours: [] })
  })

  it('GET detail keys the translations by all 8 locales (null where absent) and returns the checklist', async () => {
    seedTour()
    await SAVE_TRANSLATION(json('PUT', EN_CONTENT), ctx(TOUR_ID, 'en'))
    const res = await DETAIL(new Request('http://localhost/x'), ctx(TOUR_ID))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Object.keys(body.translations).sort()).toEqual(['ar', 'en', 'es', 'fr', 'hi', 'ru', 'zh', 'zh-hant'])
    expect(body.translations.en.is_complete).toBe(true)
    expect(body.translations.ru).toBeNull()
    expect(body.tour.id).toBe(TOUR_ID)
    expect(body.photos).toEqual([])
    // English is complete; the rest of the checklist still blocks publishing
    expect(body.checklist.ok).toBe(false)
    expect(body.checklist.failures).toEqual(expect.arrayContaining(['NO_PHOTO', 'MISSING_PRICE', 'MISSING_BASICS']))
    expect(body.checklist.failures).not.toContain('EN_INCOMPLETE')
  })

  it('GET detail 404 for an unknown or malformed id', async () => {
    expect((await DETAIL(new Request('http://localhost/x'), ctx('22222222-2222-4222-8222-222222222222'))).status).toBe(404)
    expect((await DETAIL(new Request('http://localhost/x'), ctx('nope'))).status).toBe(404)
  })
})
