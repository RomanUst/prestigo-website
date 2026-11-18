// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createFakeToursDb, type FakeToursDb } from './helpers/fake-tours-db'

/**
 * Phase 93 plan 93-08 (TRIP-02, TRIP-05; D-15; T-93-21, T-93-22, T-93-23): tour photo management. The routes and the
 * store run for real against an in-memory database; Storage is a stub that records the calls it receives; the admin
 * session is a switch and revalidatePath is a spy.
 */

const { world, revalidateMock } = vi.hoisted(() => ({
  world: {
    db: null as null | { client: { from: (t: string) => unknown } },
    auth: 'admin' as 'admin' | '401' | '403',
    /** Paths the storage stub reports as existing. */
    objects: new Set<string>(),
    signed: [] as string[],
    removed: [] as string[],
    failRemove: false,
    failSign: false,
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
  createSupabaseServiceClient: () => ({
    from: (t: string) => world.db!.client.from(t),
    storage: {
      from: (bucket: string) => ({
        createSignedUploadUrl: async (path: string) => {
          expect(bucket).toBe('tour-photos')
          if (world.failSign) return { data: null, error: { message: 'storage secret detail' } }
          world.signed.push(path)
          return { data: { signedUrl: `https://abc.supabase.co/storage/v1/object/upload/sign/tour-photos/${path}?token=t`, token: 't', path }, error: null }
        },
        exists: async (path: string) => ({ data: world.objects.has(path), error: null }),
        remove: async (paths: string[]) => {
          if (world.failRemove) return { data: null, error: { message: 'storage down' } }
          world.removed.push(...paths)
          return { data: [], error: null }
        },
      }),
    },
  }),
}))
vi.mock('next/cache', () => ({ revalidatePath: revalidateMock }))

import { POST as SIGN } from '@/app/api/admin/tours/[id]/photos/sign/route'
import { POST as REGISTER } from '@/app/api/admin/tours/[id]/photos/route'
import { PATCH, DELETE } from '@/app/api/admin/tours/[id]/photos/[photoId]/route'

let db: FakeToursDb

const TOUR_ID = '11111111-1111-4111-8111-111111111111'
const OTHER_TOUR_ID = '22222222-2222-4222-8222-222222222222'
const U1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const U2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const U3 = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

function seedTour(id = TOUR_ID, extra: Record<string, unknown> = {}) {
  db.tables.tours.push({
    id,
    slug: `t${db.tables.tours.length}-day-trip`,
    status: 'draft',
    sort_order: db.tables.tours.length,
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
}

function seedPhoto(photoId: string, position: number, extra: Record<string, unknown> = {}) {
  db.tables.tour_photos.push({
    id: photoId,
    tour_id: TOUR_ID,
    storage_path: `tours/${TOUR_ID}/${photoId}.jpg`,
    position,
    is_cover: position === 1,
    source: 'own',
    credit_text: null,
    license: null,
    credit_url: null,
    width: null,
    height: null,
    created_at: '2026-11-18T00:00:00.000Z',
    ...extra,
  })
}

function json(method: string, body: unknown): Request {
  return new Request('http://localhost/api/admin/tours/x', {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function ctx(id: string) {
  return { params: Promise.resolve({ id }) }
}

function pctx(id: string, photoId: string) {
  return { params: Promise.resolve({ id, photoId }) }
}

const P1 = '00000000-0000-4000-8000-000000000001'
const P2 = '00000000-0000-4000-8000-000000000002'
const P3 = '00000000-0000-4000-8000-000000000003'

function seedThree() {
  seedPhoto(P1, 1)
  seedPhoto(P2, 2)
  seedPhoto(P3, 3)
}

const order = () =>
  [...db.tables.tour_photos].sort((a, b) => (a.position as number) - (b.position as number)).map((p) => p.id)
const covers = () => db.tables.tour_photos.filter((p) => p.is_cover).map((p) => p.id)

beforeEach(() => {
  db = createFakeToursDb()
  world.db = db
  world.auth = 'admin'
  world.objects = new Set()
  world.signed = []
  world.removed = []
  world.failRemove = false
  world.failSign = false
  revalidateMock.mockClear()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('tour photos: guards', () => {
  it('401 without a session and 403 for a non-admin, the body is never read and nothing is touched', async () => {
    seedTour()
    for (const auth of ['401', '403'] as const) {
      world.auth = auth
      const signReq = json('POST', { contentType: 'image/jpeg', size: 1000 })
      const textSpy = vi.spyOn(signReq, 'text')
      expect((await SIGN(signReq, ctx(TOUR_ID))).status).toBe(Number(auth))
      expect(textSpy).not.toHaveBeenCalled()
      expect((await REGISTER(json('POST', { path: 'x', source: 'own' }), ctx(TOUR_ID))).status).toBe(Number(auth))
    }
    expect(world.signed).toHaveLength(0)
    expect(db.tables.tour_photos).toHaveLength(0)
    expect(revalidateMock).not.toHaveBeenCalled()
  })

  it('404 for an id that is not a uuid or an unknown tour', async () => {
    expect((await SIGN(json('POST', { contentType: 'image/jpeg', size: 10 }), ctx('nope'))).status).toBe(404)
    expect((await SIGN(json('POST', { contentType: 'image/jpeg', size: 10 }), ctx(OTHER_TOUR_ID))).status).toBe(404)
    expect((await REGISTER(json('POST', { path: 'x', source: 'own' }), ctx(OTHER_TOUR_ID))).status).toBe(404)
    expect(world.signed).toHaveLength(0)
  })
})

describe('tour photos: signed upload', () => {
  beforeEach(() => seedTour())

  it('mints tours/<tourId>/<uuid>.<ext> with the extension from the content type', async () => {
    const cases = [
      ['image/jpeg', 'jpg'],
      ['image/png', 'png'],
      ['image/webp', 'webp'],
      ['image/avif', 'avif'],
    ] as const
    for (const [contentType, ext] of cases) {
      const res = await SIGN(json('POST', { contentType, size: 5_000_000 }), ctx(TOUR_ID))
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.path).toMatch(new RegExp(`^tours/${TOUR_ID}/[0-9a-f-]{36}\\.${ext}$`))
      expect(body.token).toBe('t')
      expect(body.signedUrl).toContain(body.path)
    }
    expect(world.signed).toHaveLength(4)
    expect(new Set(world.signed).size).toBe(4)
    expect(revalidateMock).not.toHaveBeenCalled()
  })

  it('refuses an svg and an html content type before minting', async () => {
    for (const contentType of ['image/svg+xml', 'text/html', 'image/gif', 'application/pdf']) {
      const res = await SIGN(json('POST', { contentType, size: 1000 }), ctx(TOUR_ID))
      expect(res.status).toBe(400)
    }
    expect(world.signed).toHaveLength(0)
  })

  it('refuses a file over 8 MB, an empty file and a client-chosen path or file name', async () => {
    expect((await SIGN(json('POST', { contentType: 'image/jpeg', size: 8_388_609 }), ctx(TOUR_ID))).status).toBe(400)
    expect((await SIGN(json('POST', { contentType: 'image/jpeg', size: 0 }), ctx(TOUR_ID))).status).toBe(400)
    expect((await SIGN(json('POST', { contentType: 'image/jpeg', size: 1.5 }), ctx(TOUR_ID))).status).toBe(400)
    expect((await SIGN(json('POST', { contentType: 'image/jpeg', size: 10, path: 'tours/x/evil.html' }), ctx(TOUR_ID))).status).toBe(400)
    expect((await SIGN(json('POST', { contentType: 'image/jpeg', size: 10, fileName: '../x.svg' }), ctx(TOUR_ID))).status).toBe(400)
    // the 8 MB limit itself is allowed
    expect((await SIGN(json('POST', { contentType: 'image/jpeg', size: 8_388_608 }), ctx(TOUR_ID))).status).toBe(200)
    expect(world.signed).toHaveLength(1)
  })

  it('413 for an oversized body and 400 for malformed json', async () => {
    const big = json('POST', { contentType: 'image/jpeg', size: 10, pad: 'x'.repeat(3000) })
    expect((await SIGN(big, ctx(TOUR_ID))).status).toBe(413)
    const bad = new Request('http://localhost/x', { method: 'POST', body: '{nope' })
    expect((await SIGN(bad, ctx(TOUR_ID))).status).toBe(400)
  })

  it('refuses minting when the tour already has 50 photos', async () => {
    for (let i = 1; i <= 50; i += 1) {
      seedPhoto(`00000000-0000-4000-8000-${String(i).padStart(12, '0')}`, i)
    }
    const res = await SIGN(json('POST', { contentType: 'image/jpeg', size: 10 }), ctx(TOUR_ID))
    expect(res.status).toBe(422)
    expect((await res.json()).code).toBe('PHOTO_LIMIT')
  })

  it('a storage failure is a fixed 500 with no storage message', async () => {
    world.failSign = true
    const res = await SIGN(json('POST', { contentType: 'image/jpeg', size: 10 }), ctx(TOUR_ID))
    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).not.toContain('secret')
  })
})

describe('tour photos: register after the object exists', () => {
  beforeEach(() => seedTour())

  const pathOf = (tourId: string, uuid: string, ext = 'jpg') => `tours/${tourId}/${uuid}.${ext}`

  it('OBJECT_MISSING (422) when the object is not in the bucket, and no row is written', async () => {
    const res = await REGISTER(json('POST', { path: pathOf(TOUR_ID, U1), source: 'own' }), ctx(TOUR_ID))
    expect(res.status).toBe(422)
    expect((await res.json()).code).toBe('OBJECT_MISSING')
    expect(db.tables.tour_photos).toHaveLength(0)
    expect(revalidateMock).not.toHaveBeenCalled()
  })

  it('registers an existing object; the first photo is the cover, the next ones follow in order and are not covers', async () => {
    for (const u of [U1, U2, U3]) world.objects.add(pathOf(TOUR_ID, u))
    const first = await REGISTER(json('POST', { path: pathOf(TOUR_ID, U1), source: 'own', width: 1600, height: 900 }), ctx(TOUR_ID))
    expect(first.status).toBe(201)
    const p1 = (await first.json()).photo
    expect(p1).toMatchObject({ tour_id: TOUR_ID, storage_path: pathOf(TOUR_ID, U1), position: 1, is_cover: true, source: 'own', width: 1600, height: 900 })

    const second = await REGISTER(json('POST', { path: pathOf(TOUR_ID, U2), source: 'own' }), ctx(TOUR_ID))
    expect((await second.json()).photo).toMatchObject({ position: 2, is_cover: false })
    const third = await REGISTER(json('POST', { path: pathOf(TOUR_ID, U3), source: 'own' }), ctx(TOUR_ID))
    expect((await third.json()).photo).toMatchObject({ position: 3, is_cover: false })

    expect(db.tables.tour_photos.filter((p) => p.is_cover)).toHaveLength(1)
    expect(revalidateMock).toHaveBeenCalledTimes(3)
    expect(revalidateMock).toHaveBeenCalledWith('/[locale]', 'layout')
  })

  it('refuses a path of another tour, a traversal string, a wrong extension and a non-uuid name (no row)', async () => {
    const bad = [
      pathOf(OTHER_TOUR_ID, U1),
      `tours/${TOUR_ID}/../${OTHER_TOUR_ID}/${U1}.jpg`,
      `../tours/${TOUR_ID}/${U1}.jpg`,
      `tours/${TOUR_ID}/${U1}.svg`,
      `tours/${TOUR_ID}/${U1}.jpg/../x.html`,
      `tours/${TOUR_ID}/evil.jpg`,
      `/tours/${TOUR_ID}/${U1}.jpg`,
      pathOf(TOUR_ID, U1.toUpperCase()),
      'content-media/reel.mp4',
    ]
    for (const path of bad) {
      world.objects.add(path)
      const res = await REGISTER(json('POST', { path, source: 'own' }), ctx(TOUR_ID))
      expect(res.status, path).toBe(400)
    }
    expect(db.tables.tour_photos).toHaveLength(0)
  })

  it('stores a non-own source without credit (the publish checklist reports it later)', async () => {
    world.objects.add(pathOf(TOUR_ID, U1))
    const res = await REGISTER(json('POST', { path: pathOf(TOUR_ID, U1), source: 'commons' }), ctx(TOUR_ID))
    expect(res.status).toBe(201)
    expect((await res.json()).photo).toMatchObject({ source: 'commons', credit_text: null, license: null, credit_url: null })
  })

  it('stores credit text, licence and an https source link; blank strings become null', async () => {
    world.objects.add(pathOf(TOUR_ID, U1))
    world.objects.add(pathOf(TOUR_ID, U2))
    const full = await REGISTER(
      json('POST', {
        path: pathOf(TOUR_ID, U1),
        source: 'commons',
        credit_text: ' Jane Doe ',
        license: 'CC BY-SA 4.0',
        credit_url: 'https://commons.wikimedia.org/wiki/File:X.jpg',
      }),
      ctx(TOUR_ID),
    )
    expect((await full.json()).photo).toMatchObject({
      credit_text: 'Jane Doe',
      license: 'CC BY-SA 4.0',
      credit_url: 'https://commons.wikimedia.org/wiki/File:X.jpg',
    })
    const blank = await REGISTER(json('POST', { path: pathOf(TOUR_ID, U2), source: 'own', credit_text: '  ', license: '' }), ctx(TOUR_ID))
    expect((await blank.json()).photo).toMatchObject({ credit_text: null, license: null })
  })

  it('refuses a javascript:, http: or data: source link and an unknown source (no row)', async () => {
    world.objects.add(pathOf(TOUR_ID, U1))
    for (const credit_url of ['javascript:x', 'http://example.com/a', 'data:text/html,x', 'https://', 'ftp://example.com']) {
      const res = await REGISTER(json('POST', { path: pathOf(TOUR_ID, U1), source: 'other', credit_url }), ctx(TOUR_ID))
      expect(res.status, credit_url).toBe(400)
    }
    expect((await REGISTER(json('POST', { path: pathOf(TOUR_ID, U1), source: 'flickr' }), ctx(TOUR_ID))).status).toBe(400)
    expect(db.tables.tour_photos).toHaveLength(0)
  })

  it('refuses unknown keys (is_cover, position, tour_id) from the client', async () => {
    world.objects.add(pathOf(TOUR_ID, U1))
    for (const extra of [{ is_cover: true }, { position: 1 }, { tour_id: OTHER_TOUR_ID }, { id: U2 }]) {
      const res = await REGISTER(json('POST', { path: pathOf(TOUR_ID, U1), source: 'own', ...extra }), ctx(TOUR_ID))
      expect(res.status).toBe(400)
    }
    expect(db.tables.tour_photos).toHaveLength(0)
  })

  it('409 when the same object is registered twice, and the first row stays untouched', async () => {
    world.objects.add(pathOf(TOUR_ID, U1))
    expect((await REGISTER(json('POST', { path: pathOf(TOUR_ID, U1), source: 'own' }), ctx(TOUR_ID))).status).toBe(201)
    const again = await REGISTER(json('POST', { path: pathOf(TOUR_ID, U1), source: 'own' }), ctx(TOUR_ID))
    expect(again.status).toBe(409)
    expect(db.tables.tour_photos).toHaveLength(1)
  })

  it('a database failure is a fixed 500 and the message never reaches the client', async () => {
    world.objects.add(pathOf(TOUR_ID, U1))
    db.failWritesOn.add('tour_photos')
    const res = await REGISTER(json('POST', { path: pathOf(TOUR_ID, U1), source: 'own' }), ctx(TOUR_ID))
    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).not.toContain('secret@example.com')
  })
})

describe('tour photos: guards on PATCH and DELETE', () => {
  it('401 / 403 first, nothing changes and nothing is revalidated', async () => {
    seedTour()
    seedThree()
    for (const auth of ['401', '403'] as const) {
      world.auth = auth
      expect((await PATCH(json('PATCH', { is_cover: true }), pctx(TOUR_ID, P2))).status).toBe(Number(auth))
      expect((await DELETE(new Request('http://localhost/x', { method: 'DELETE' }), pctx(TOUR_ID, P2))).status).toBe(Number(auth))
    }
    expect(db.tables.tour_photos).toHaveLength(3)
    expect(covers()).toEqual([P1])
    expect(world.removed).toHaveLength(0)
    expect(revalidateMock).not.toHaveBeenCalled()
  })

  it('404 for ids that are not uuids, an unknown photo and a photo of another tour', async () => {
    seedTour()
    seedTour(OTHER_TOUR_ID)
    seedThree()
    expect((await PATCH(json('PATCH', { is_cover: true }), pctx('nope', P1))).status).toBe(404)
    expect((await PATCH(json('PATCH', { is_cover: true }), pctx(TOUR_ID, 'nope'))).status).toBe(404)
    expect((await PATCH(json('PATCH', { is_cover: true }), pctx(TOUR_ID, U1))).status).toBe(404)
    expect((await PATCH(json('PATCH', { is_cover: true }), pctx(OTHER_TOUR_ID, P2))).status).toBe(404)
    expect((await DELETE(new Request('http://localhost/x', { method: 'DELETE' }), pctx(OTHER_TOUR_ID, P2))).status).toBe(404)
    expect(db.tables.tour_photos).toHaveLength(3)
    expect(world.removed).toHaveLength(0)
  })
})

describe('tour photos: cover and order', () => {
  beforeEach(() => {
    seedTour()
    seedThree()
  })

  it('is_cover moves the cover: the old one is cleared, there is never a second cover', async () => {
    const res = await PATCH(json('PATCH', { is_cover: true }), pctx(TOUR_ID, P3))
    expect(res.status).toBe(200)
    expect(covers()).toEqual([P3])
    const { photos } = await res.json()
    expect(photos.map((p: { id: string; is_cover: boolean }) => [p.id, p.is_cover])).toEqual([
      [P1, false],
      [P2, false],
      [P3, true],
    ])
    expect(revalidateMock).toHaveBeenCalledWith('/[locale]', 'layout')
  })

  it('is_cover on the current cover changes nothing; is_cover false is refused', async () => {
    expect((await PATCH(json('PATCH', { is_cover: true }), pctx(TOUR_ID, P1))).status).toBe(200)
    expect(covers()).toEqual([P1])
    expect((await PATCH(json('PATCH', { is_cover: false }), pctx(TOUR_ID, P1))).status).toBe(400)
  })

  it('move up / down swaps with the neighbour and renumbers; it is a no-op at the ends', async () => {
    let res = await PATCH(json('PATCH', { move: 'down' }), pctx(TOUR_ID, P1))
    expect((await res.json()).photos.map((p: { id: string }) => p.id)).toEqual([P2, P1, P3])
    expect(order()).toEqual([P2, P1, P3])
    res = await PATCH(json('PATCH', { move: 'up' }), pctx(TOUR_ID, P3))
    expect(order()).toEqual([P2, P3, P1])
    // P2 is first: up is a no-op, and so is down for the last one (P1)
    expect((await PATCH(json('PATCH', { move: 'up' }), pctx(TOUR_ID, P2))).status).toBe(200)
    expect((await PATCH(json('PATCH', { move: 'down' }), pctx(TOUR_ID, P1))).status).toBe(200)
    expect(order()).toEqual([P2, P3, P1])
    expect(db.tables.tour_photos.map((p) => p.position).sort()).toEqual([1, 2, 3])
    // the cover does not follow the order
    expect(covers()).toEqual([P1])
  })

  it('edits source, credit text, licence and an https source link; null or blank clears a field', async () => {
    const res = await PATCH(
      json('PATCH', { source: 'commons', credit_text: ' Jane Doe ', license: 'CC BY 4.0', credit_url: 'https://commons.wikimedia.org/x' }),
      pctx(TOUR_ID, P2),
    )
    expect(res.status).toBe(200)
    expect(db.tables.tour_photos.find((p) => p.id === P2)).toMatchObject({
      source: 'commons',
      credit_text: 'Jane Doe',
      license: 'CC BY 4.0',
      credit_url: 'https://commons.wikimedia.org/x',
    })
    const cleared = await PATCH(json('PATCH', { credit_text: '   ', license: null, credit_url: null }), pctx(TOUR_ID, P2))
    expect(cleared.status).toBe(200)
    expect(db.tables.tour_photos.find((p) => p.id === P2)).toMatchObject({ credit_text: null, license: null, credit_url: null })
  })

  it('refuses a javascript: / http: link, an unknown source, unknown keys and an empty patch', async () => {
    for (const body of [
      { credit_url: 'javascript:alert(1)' },
      { credit_url: 'http://example.com' },
      { source: 'flickr' },
      { storage_path: 'tours/x/y.jpg' },
      { position: 1 },
      { tour_id: OTHER_TOUR_ID },
      {},
      { move: 'left' },
    ]) {
      expect((await PATCH(json('PATCH', body), pctx(TOUR_ID, P2))).status, JSON.stringify(body)).toBe(400)
    }
    expect(db.tables.tour_photos.find((p) => p.id === P2)).toMatchObject({ source: 'own', credit_url: null })
  })

  it('a database failure is a fixed 500 and the message does not leak', async () => {
    db.failWritesOn.add('tour_photos')
    const res = await PATCH(json('PATCH', { is_cover: true }), pctx(TOUR_ID, P2))
    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).not.toContain('secret@example.com')
  })
})

describe('tour photos: delete', () => {
  const del = (photoId: string) => DELETE(new Request('http://localhost/x', { method: 'DELETE' }), pctx(TOUR_ID, photoId))

  it('removes the row and then the Storage object, and renumbers the rest', async () => {
    seedTour()
    seedThree()
    const res = await del(P2)
    expect(res.status).toBe(200)
    expect((await res.json()).photos.map((p: { id: string; position: number }) => [p.id, p.position])).toEqual([
      [P1, 1],
      [P3, 2],
    ])
    expect(world.removed).toEqual([`tours/${TOUR_ID}/${P2}.jpg`])
    expect(covers()).toEqual([P1])
    expect(revalidateMock).toHaveBeenCalledWith('/[locale]', 'layout')
  })

  it('deleting the cover makes the next photo the cover', async () => {
    seedTour()
    seedThree()
    expect((await del(P1)).status).toBe(200)
    expect(covers()).toEqual([P2])
    expect(order()).toEqual([P2, P3])
  })

  it('refuses to delete the last photo of a published tour: 409 LAST_PHOTO, row and object stay', async () => {
    seedTour(TOUR_ID, { status: 'published', first_published_at: '2026-11-01T00:00:00.000Z' })
    seedPhoto(P1, 1)
    const res = await del(P1)
    expect(res.status).toBe(409)
    expect((await res.json()).code).toBe('LAST_PHOTO')
    expect(db.tables.tour_photos).toHaveLength(1)
    expect(world.removed).toHaveLength(0)
    expect(revalidateMock).not.toHaveBeenCalled()
  })

  it('a published tour with several photos can lose one; a draft can lose its last one', async () => {
    seedTour(TOUR_ID, { status: 'published', first_published_at: '2026-11-01T00:00:00.000Z' })
    seedPhoto(P1, 1)
    seedPhoto(P2, 2)
    expect((await del(P2)).status).toBe(200)
    expect((await del(P1)).status).toBe(409)

    db.tables.tours[0].status = 'draft'
    expect((await del(P1)).status).toBe(200)
    expect(db.tables.tour_photos).toHaveLength(0)
  })

  it('a Storage failure after the row is gone does not fail the request', async () => {
    seedTour()
    seedThree()
    world.failRemove = true
    const res = await del(P3)
    expect(res.status).toBe(200)
    expect(db.tables.tour_photos).toHaveLength(2)
  })
})
