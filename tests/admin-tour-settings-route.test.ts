// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createFakeToursDb, type FakeToursDb } from './helpers/fake-tours-db'

/**
 * Phase 93 plan 93-07 (TRIP-03; D-02, D-12, D-22): the global tour settings API against an in-memory database.
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

import { GET, PATCH } from '@/app/api/admin/tour-settings/route'

let db: FakeToursDb

function patch(body: unknown): Request {
  return new Request('http://localhost/api/admin/tour-settings', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  db = createFakeToursDb({
    tour_settings: [
      {
        id: 1,
        // PostgREST can hand numeric columns back as strings: the API must answer numbers
        extra_hour_e_eur: '40.00',
        extra_hour_s_eur: '55.50',
        extra_hour_v_eur: null,
        free_cancel_hours: 24,
        pickup_radius_km: '15.0',
        updated_at: '2026-11-18T00:00:00.000Z',
      },
    ],
  })
  world.db = db
  world.auth = 'admin'
  revalidateMock.mockClear()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('admin tour settings API', () => {
  it('401 without a session and 403 for a non-admin, before any body read or write', async () => {
    for (const auth of ['401', '403'] as const) {
      world.auth = auth
      const status = auth === '401' ? 401 : 403
      const req = patch({ free_cancel_hours: 12 })
      const spy = vi.spyOn(req, 'text')
      expect((await GET()).status).toBe(status)
      expect((await PATCH(req)).status).toBe(status)
      expect(spy).not.toHaveBeenCalled()
    }
    expect(db.tables.tour_settings[0].free_cancel_hours).toBe(24)
    expect(revalidateMock).not.toHaveBeenCalled()
  })

  it('GET returns the singleton row with numbers, not strings', async () => {
    const res = await GET()
    expect(res.status).toBe(200)
    const row = await res.json()
    expect(row).toMatchObject({
      id: 1,
      extra_hour_e_eur: 40,
      extra_hour_s_eur: 55.5,
      extra_hour_v_eur: null,
      free_cancel_hours: 24,
      pickup_radius_km: 15,
    })
  })

  it('PATCH { free_cancel_hours: 24 } updates only that field and revalidates the locale layout once', async () => {
    const res = await PATCH(patch({ free_cancel_hours: 48 }))
    expect(res.status).toBe(200)
    const { settings } = await res.json()
    expect(settings.free_cancel_hours).toBe(48)
    expect(settings.extra_hour_e_eur).toBe(40)
    expect(settings.pickup_radius_km).toBe(15)
    expect(db.tables.tour_settings[0].extra_hour_e_eur).toBe('40.00')
    expect(revalidateMock).toHaveBeenCalledTimes(1)
    expect(revalidateMock).toHaveBeenCalledWith('/[locale]', 'layout')
  })

  it('PATCH stores the extra-hour prices and the radius', async () => {
    const res = await PATCH(patch({ extra_hour_e_eur: 45, extra_hour_s_eur: 60.25, extra_hour_v_eur: 50, pickup_radius_km: 12.5 }))
    expect(res.status).toBe(200)
    const { settings } = await res.json()
    expect(settings).toMatchObject({ extra_hour_e_eur: 45, extra_hour_s_eur: 60.25, extra_hour_v_eur: 50, pickup_radius_km: 12.5 })
  })

  it('accepts the boundary values 0 and 72 hours, 1 and 50 km', async () => {
    expect((await PATCH(patch({ free_cancel_hours: 0 }))).status).toBe(200)
    expect((await PATCH(patch({ free_cancel_hours: 72 }))).status).toBe(200)
    expect((await PATCH(patch({ pickup_radius_km: 1 }))).status).toBe(200)
    expect((await PATCH(patch({ pickup_radius_km: 50 }))).status).toBe(200)
  })

  it.each([
    ['free_cancel_hours 73', { free_cancel_hours: 73 }],
    ['free_cancel_hours -1', { free_cancel_hours: -1 }],
    ['free_cancel_hours 12.5', { free_cancel_hours: 12.5 }],
    ['pickup_radius_km 0.5', { pickup_radius_km: 0.5 }],
    ['pickup_radius_km 51', { pickup_radius_km: 51 }],
    ['pickup_radius_km 10.3 (not a 0.5 step)', { pickup_radius_km: 10.3 }],
    ['extra_hour_v_eur 0', { extra_hour_v_eur: 0 }],
    ['extra_hour_e_eur negative', { extra_hour_e_eur: -4 }],
    ['extra_hour_s_eur 3 decimals', { extra_hour_s_eur: 10.125 }],
    ['extra_hour_e_eur as a string', { extra_hour_e_eur: '40' }],
    ['unknown key id', { id: 2 }],
    ['empty body', {}],
  ])('400 for %s and nothing is written', async (_label, body) => {
    const before = JSON.stringify(db.tables.tour_settings[0])
    const res = await PATCH(patch(body))
    expect(res.status).toBe(400)
    expect(JSON.stringify(db.tables.tour_settings[0])).toBe(before)
    expect(revalidateMock).not.toHaveBeenCalled()
  })

  it('400 for malformed JSON and 413 for an oversized body', async () => {
    expect((await PATCH(new Request('http://localhost/x', { method: 'PATCH', body: '{nope' }))).status).toBe(400)
    const big = new Request('http://localhost/x', {
      method: 'PATCH',
      headers: { 'content-length': '5000' },
      body: JSON.stringify({ free_cancel_hours: 24 }),
    })
    expect((await PATCH(big)).status).toBe(413)
  })

  it('a database failure is a fixed 500 that never echoes the message and does not revalidate', async () => {
    db.failWritesOn.add('tour_settings')
    const res = await PATCH(patch({ free_cancel_hours: 12 }))
    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).not.toContain('secret@example.com')
    expect(revalidateMock).not.toHaveBeenCalled()
  })

  it('404 when the settings row is missing', async () => {
    db.tables.tour_settings.length = 0
    expect((await GET()).status).toBe(404)
    expect((await PATCH(patch({ free_cancel_hours: 12 }))).status).toBe(404)
    expect(revalidateMock).not.toHaveBeenCalled()
  })
})
