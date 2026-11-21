// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createFakeToursDb, type FakeToursDb } from './helpers/fake-tours-db'

/**
 * Phase 93 plan 93-08 (TRIP-05; D-07; T-93-23): publish / unpublish. The route, the store and publishChecklist run for
 * real against an in-memory database; the admin session is a switch and revalidatePath is a spy.
 */

const { world, revalidateMock } = vi.hoisted(() => ({
  world: {
    db: null as null | { client: { from: (t: string) => unknown } },
    auth: 'admin' as 'admin' | '401' | '403',
  },
  revalidateMock: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  getAdminUser: vi.fn(async () => {
    if (world.auth === '401') return { user: null, error: '401' as const }
    if (world.auth === '403') return { user: null, error: '403' as const }
    return { user: { id: '99999999-9999-4999-8999-999999999999' }, error: null }
  }),
}))
vi.mock('@/lib/supabase', () => ({
  createSupabaseServiceClient: () => ({ from: (t: string) => world.db!.client.from(t) }),
}))
vi.mock('next/cache', () => ({ revalidatePath: revalidateMock }))

import { POST } from '@/app/api/admin/tours/[id]/publish/route'

let db: FakeToursDb

const TOUR_ID = '11111111-1111-4111-8111-111111111111'
const PHOTO_ID = '00000000-0000-4000-8000-000000000001'

/** A tour that passes every check of publishChecklist: prices, basics, an English row marked complete, a cover. */
function seedReadyTour(extra: Record<string, unknown> = {}) {
  db.tables.tours.push({
    id: TOUR_ID,
    slug: 'karlstejn-day-trip',
    status: 'draft',
    sort_order: 0,
    hours_included: 4,
    drive_minutes_each_way: 40,
    start_time_min: '08:00',
    start_time_max: '11:00',
    price_e_eur: 400,
    price_s_eur: 500,
    price_v_eur: 450,
    destination_label: 'Karlstejn',
    first_published_at: null,
    created_at: '2026-11-18T00:00:00.000Z',
    updated_at: '2026-11-18T00:00:00.000Z',
    ...extra,
  })
  db.tables.tour_translations.push({ tour_id: TOUR_ID, locale: 'en', title: 'Karlstejn', is_complete: true })
  db.tables.tour_photos.push({
    id: PHOTO_ID,
    tour_id: TOUR_ID,
    storage_path: `tours/${TOUR_ID}/${PHOTO_ID}.jpg`,
    position: 1,
    is_cover: true,
    source: 'own',
    credit_text: null,
    license: null,
    credit_url: null,
    width: null,
    height: null,
    created_at: '2026-11-18T00:00:00.000Z',
  })
}

function json(body: unknown): Request {
  return new Request('http://localhost/api/admin/tours/x/publish', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const ctx = (id: string) => ({ params: Promise.resolve({ id }) })
const tour = () => db.tables.tours[0]

beforeEach(() => {
  db = createFakeToursDb()
  world.db = db
  world.auth = 'admin'
  revalidateMock.mockClear()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('tour publish: guards', () => {
  it('401 / 403 first, the body is never read for an anonymous caller, and the tour stays a draft', async () => {
    seedReadyTour()
    world.auth = '401'
    const req = json({ action: 'publish' })
    const textSpy = vi.spyOn(req, 'text')
    expect((await POST(req, ctx(TOUR_ID))).status).toBe(401)
    expect(textSpy).not.toHaveBeenCalled()
    world.auth = '403'
    expect((await POST(json({ action: 'publish' }), ctx(TOUR_ID))).status).toBe(403)
    expect(tour().status).toBe('draft')
    expect(revalidateMock).not.toHaveBeenCalled()
  })

  it('404 for a non-uuid or unknown id; 400 for an unknown action, extra keys and a bad body', async () => {
    seedReadyTour()
    expect((await POST(json({ action: 'publish' }), ctx('nope'))).status).toBe(404)
    expect((await POST(json({ action: 'publish' }), ctx('22222222-2222-4222-8222-222222222222'))).status).toBe(404)
    expect((await POST(json({ action: 'archive' }), ctx(TOUR_ID))).status).toBe(400)
    expect((await POST(json({ action: 'publish', status: 'published' }), ctx(TOUR_ID))).status).toBe(400)
    expect((await POST(json({ action: 'publish', first_published_at: '2020-01-01' }), ctx(TOUR_ID))).status).toBe(400)
    expect((await POST(json({}), ctx(TOUR_ID))).status).toBe(400)
    expect((await POST(new Request('http://localhost/x', { method: 'POST', body: '{nope' }), ctx(TOUR_ID))).status).toBe(400)
    expect(tour().status).toBe('draft')
    expect(revalidateMock).not.toHaveBeenCalled()
  })
})

describe('tour publish: the checklist', () => {
  it('a tour missing a price answers 422 CHECKLIST_FAILED with MISSING_PRICE and stays a draft', async () => {
    seedReadyTour({ price_s_eur: null })
    const res = await POST(json({ action: 'publish' }), ctx(TOUR_ID))
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.code).toBe('CHECKLIST_FAILED')
    expect(body.failures).toContain('MISSING_PRICE')
    expect(tour().status).toBe('draft')
    expect(tour().first_published_at).toBeNull()
    expect(revalidateMock).not.toHaveBeenCalled()
  })

  it('reports every failure at once: incomplete English, no photo, missing basics', async () => {
    seedReadyTour({ drive_minutes_each_way: null })
    db.tables.tour_translations[0].is_complete = false
    db.tables.tour_photos.length = 0
    const res = await POST(json({ action: 'publish' }), ctx(TOUR_ID))
    expect(res.status).toBe(422)
    expect((await res.json()).failures).toEqual(expect.arrayContaining(['EN_INCOMPLETE', 'NO_PHOTO', 'MISSING_BASICS']))
    expect(tour().status).toBe('draft')
  })

  it('a non-own photo without a credit blocks publishing (MISSING_CREDIT)', async () => {
    seedReadyTour()
    db.tables.tour_photos[0].source = 'commons'
    const res = await POST(json({ action: 'publish' }), ctx(TOUR_ID))
    expect(res.status).toBe(422)
    expect((await res.json()).failures).toEqual(['MISSING_CREDIT'])
    db.tables.tour_photos[0].credit_text = 'Jane Doe'
    db.tables.tour_photos[0].license = 'CC BY 4.0'
    expect((await POST(json({ action: 'publish' }), ctx(TOUR_ID))).status).toBe(200)
  })

  it('only English blocks publishing: other locales may be incomplete or missing', async () => {
    seedReadyTour()
    db.tables.tour_translations.push({ tour_id: TOUR_ID, locale: 'ru', title: '', is_complete: false })
    expect((await POST(json({ action: 'publish' }), ctx(TOUR_ID))).status).toBe(200)
  })
})

describe('tour publish: status changes', () => {
  it('a ready tour is published, first_published_at is set, and the locale layout is revalidated', async () => {
    seedReadyTour()
    const res = await POST(json({ action: 'publish' }), ctx(TOUR_ID))
    expect(res.status).toBe(200)
    const { tour: out } = await res.json()
    expect(out.status).toBe('published')
    expect(typeof out.first_published_at).toBe('string')
    expect(tour().status).toBe('published')
    expect(tour().first_published_at).toBe(out.first_published_at)
    expect(revalidateMock).toHaveBeenCalledTimes(1)
    expect(revalidateMock).toHaveBeenCalledWith('/[locale]', 'layout')
  })

  it('a second publish keeps the first first_published_at', async () => {
    seedReadyTour({ status: 'published', first_published_at: '2026-10-01T10:00:00.000Z' })
    const res = await POST(json({ action: 'publish' }), ctx(TOUR_ID))
    expect(res.status).toBe(200)
    expect(tour().first_published_at).toBe('2026-10-01T10:00:00.000Z')
  })

  it('unpublish sets the status back to draft, keeps first_published_at and revalidates', async () => {
    seedReadyTour({ status: 'published', first_published_at: '2026-10-01T10:00:00.000Z' })
    const res = await POST(json({ action: 'unpublish' }), ctx(TOUR_ID))
    expect(res.status).toBe(200)
    expect((await res.json()).tour.status).toBe('draft')
    expect(tour().status).toBe('draft')
    expect(tour().first_published_at).toBe('2026-10-01T10:00:00.000Z')
    expect(revalidateMock).toHaveBeenCalledWith('/[locale]', 'layout')
  })

  it('unpublish needs no checklist: a tour that would fail it can still go back to draft', async () => {
    seedReadyTour({ status: 'published', first_published_at: '2026-10-01T10:00:00.000Z', price_e_eur: null })
    db.tables.tour_photos.length = 0
    const res = await POST(json({ action: 'unpublish' }), ctx(TOUR_ID))
    expect(res.status).toBe(200)
    expect(tour().status).toBe('draft')
  })

  it('a database failure is a fixed 500 and the tour does not change', async () => {
    seedReadyTour()
    db.failWritesOn.add('tours')
    const res = await POST(json({ action: 'publish' }), ctx(TOUR_ID))
    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).not.toContain('secret@example.com')
    expect(tour().status).toBe('draft')
    expect(revalidateMock).not.toHaveBeenCalled()
  })
})
