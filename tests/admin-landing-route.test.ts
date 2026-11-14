// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import fs from 'fs'
import path from 'path'

// Phase 91 plan 15 (STOP-05, D-08, D-11): POST /api/admin/bookings/[id]/landing. The route and applyLandingChange run for
// real; Supabase, the payment edit hook, the email log and the change email are stubs.

const world = vi.hoisted(() => ({
  auth: 'admin' as 'admin' | '401' | '403',
  booking: null as null | Record<string, unknown>,
  updateRows: [{ id: 'x' }] as Array<{ id: string }>,
  updateError: null as null | { message: string },
  readError: null as null | { message: string },
  updates: [] as Array<Record<string, unknown>>,
  audits: [] as Array<Array<Record<string, unknown>>>,
  flags: null as null | Record<string, boolean>,
}))

const { stubReevaluate, stubPrecheck, stubLogEmail, stubSendChanged } = vi.hoisted(() => ({
  stubReevaluate: vi.fn(),
  stubPrecheck: vi.fn(),
  stubLogEmail: vi.fn(),
  stubSendChanged: vi.fn(),
}))

const ADMIN_ID = '99999999-9999-4999-8999-999999999999'
const ID = '77777777-7777-4777-8777-777777777777'

vi.mock('next/server', async () => {
  const actual = await vi.importActual<typeof import('next/server')>('next/server')
  return { ...actual, after: (fn: () => unknown) => void fn() }
})

vi.mock('@/lib/supabase/server', () => ({
  getAdminUser: vi.fn(async () => {
    if (world.auth === '401') return { user: null, error: '401' as const }
    if (world.auth === '403') return { user: null, error: '403' as const }
    return { user: { id: ADMIN_ID }, error: null }
  }),
}))

vi.mock('@/lib/supabase', () => ({
  createSupabaseServiceClient: () => ({
    from: (table: string) => {
      if (table === 'bookings') {
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: world.booking, error: world.readError }) }) }),
          update: (payload: Record<string, unknown>) => {
            world.updates.push(payload)
            const chain = {
              eq: () => chain,
              select: async () => ({ data: world.updateError ? null : world.updateRows, error: world.updateError }),
            }
            return chain
          },
        }
      }
      if (table === 'pricing_globals') {
        return {
          select: () => ({
            eq: () => ({ single: async () => ({ data: { notification_flags: world.flags }, error: null }) }),
          }),
        }
      }
      if (table === 'booking_edit_audit_log') {
        return {
          insert: async (rows: Array<Record<string, unknown>>) => {
            world.audits.push(rows)
            return { error: null }
          },
        }
      }
      throw new Error(`unexpected table ${table}`)
    },
  }),
}))

vi.mock('@/lib/payments/edit-hook', () => ({
  assertEditablePrecheck: stubPrecheck,
  reevaluateAfterEdit: stubReevaluate,
}))
vi.mock('@/lib/email-log', () => ({ logEmail: stubLogEmail }))
vi.mock('@/lib/email', () => ({ sendBookingChangedEmail: stubSendChanged }))

import { POST } from '@/app/api/admin/bookings/[id]/landing/route'

function booking(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: ID,
    booking_reference: 'PRG-1',
    status: 'confirmed',
    client_email: 'ivan@example.com',
    client_first_name: 'Ivan',
    client_last_name: 'Petrov',
    payment_mode: null,
    payment_state: null,
    landing_date: '2027-06-10',
    landing_time: '14:00',
    pickup_offset_min: 30,
    pickup_date: '2027-06-10',
    pickup_time: '14:30',
    ...over,
  }
}

const GOOD = {
  landing_date: '2027-06-10',
  landing_time: '15:10',
  expected_pickup_date: '2027-06-10',
  expected_pickup_time: '15:40',
  notify_client: false,
}

async function call(body: unknown, id: string = ID, raw?: string) {
  const request = new Request(`http://localhost/api/admin/bookings/${id}/landing`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: raw ?? JSON.stringify(body),
  })
  const res = await POST(request, { params: Promise.resolve({ id }) })
  return { status: res.status, json: (await res.json()) as Record<string, unknown> }
}

beforeEach(() => {
  world.auth = 'admin'
  world.booking = booking()
  world.updateRows = [{ id: ID }]
  world.updateError = null
  world.readError = null
  world.updates = []
  world.audits = []
  world.flags = null
  stubReevaluate.mockReset().mockResolvedValue(null)
  stubPrecheck.mockReset().mockReturnValue(null)
  stubLogEmail.mockReset().mockResolvedValue(true)
  stubSendChanged.mockReset().mockResolvedValue(undefined)
})

describe('POST /api/admin/bookings/[id]/landing: guards before anything is read', () => {
  it('unauthenticated -> 401 before parsing the body', async () => {
    world.auth = '401'
    const { status } = await call(null, ID, 'not json at all')
    expect(status).toBe(401)
    expect(world.updates).toHaveLength(0)
  })

  it('non-admin -> 403 before parsing the body', async () => {
    world.auth = '403'
    const { status } = await call(null, ID, 'not json at all')
    expect(status).toBe(403)
    expect(world.updates).toHaveLength(0)
  })

  it('a bad uuid -> 400', async () => {
    expect((await call(GOOD, 'not-a-uuid')).status).toBe(400)
  })

  it('a body that is not JSON -> 400', async () => {
    expect((await call(null, ID, '{oops')).status).toBe(400)
  })

  it.each(['landing_date', 'landing_time', 'expected_pickup_date', 'expected_pickup_time', 'notify_client'])(
    'a missing %s -> 400',
    async (key) => {
      const body: Record<string, unknown> = { ...GOOD }
      delete body[key]
      expect((await call(body)).status).toBe(400)
      expect(world.updates).toHaveLength(0)
    },
  )

  it('an unknown key -> 400 (strict schema)', async () => {
    expect((await call({ ...GOOD, pickup_utc: '2027-06-10T13:40:00Z' })).status).toBe(400)
    expect((await call({ ...GOOD, pickup_time: '15:40' })).status).toBe(400)
  })

  it("landing_time '25:00' -> 400", async () => {
    expect((await call({ ...GOOD, landing_time: '25:00' })).status).toBe(400)
  })

  it('notify_client as a string -> 400', async () => {
    expect((await call({ ...GOOD, notify_client: 'true' })).status).toBe(400)
  })

  it('an unknown booking -> 404', async () => {
    world.booking = null
    const { status, json } = await call(GOOD)
    expect(status).toBe(404)
    expect(json.error).toBe('not_found')
  })
})

describe('POST /api/admin/bookings/[id]/landing: business rules', () => {
  it('a city booking without landing -> 422 no_landing', async () => {
    world.booking = booking({ landing_date: null, landing_time: null, pickup_offset_min: null })
    const { status, json } = await call(GOOD)
    expect(status).toBe(422)
    expect(json.error).toBe('no_landing')
  })

  it('a completed booking -> 422 final_status', async () => {
    world.booking = booking({ status: 'completed' })
    const { status, json } = await call(GOOD)
    expect(status).toBe(422)
    expect(json.error).toBe('final_status')
  })

  it('a well-formed date that does not exist -> 422 invalid_landing (400 is for shape only)', async () => {
    const { status, json } = await call({ ...GOOD, landing_date: '2027-02-31' })
    expect(status).toBe(422)
    expect(json.error).toBe('invalid_landing')
  })

  it('a card_hold booking in placing_hold -> 409 payment_in_progress and nothing written', async () => {
    world.booking = booking({ payment_mode: 'card_hold', payment_state: 'placing_hold' })
    stubPrecheck.mockReturnValue({ status: 409, body: { error: 'payment_in_progress' } })
    const { status, json } = await call(GOOD)
    expect(status).toBe(409)
    expect(json.error).toBe('payment_in_progress')
    expect(world.updates).toHaveLength(0)
  })

  it('expected pickup 15:30 when the server computes 15:40 -> 409 pickup_changed with 15:40 and nothing updated', async () => {
    const { status, json } = await call({ ...GOOD, expected_pickup_time: '15:30' })
    expect(status).toBe(409)
    expect(json).toEqual({ error: 'pickup_changed', pickup_date: '2027-06-10', pickup_time: '15:40' })
    expect(world.updates).toHaveLength(0)
    expect(world.audits).toHaveLength(0)
  })

  it('the compare-and-set finds the pickup already changed by someone else -> 409 stale and no audit rows', async () => {
    world.updateRows = []
    const { status, json } = await call({ ...GOOD, notify_client: true })
    expect(status).toBe(409)
    expect(json.error).toBe('stale')
    expect(world.audits).toHaveLength(0)
    expect(stubSendChanged).not.toHaveBeenCalled()
  })

  it('a database failure -> 500 without leaking the booking', async () => {
    world.updateError = { message: 'db down ivan@example.com' }
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { status, json } = await call(GOOD)
    expect(status).toBe(500)
    expect(JSON.stringify(json)).not.toContain('ivan')
    const logged = JSON.stringify(spy.mock.calls)
    expect(logged).not.toContain('ivan@example.com')
    spy.mockRestore()
  })
})

describe('POST /api/admin/bookings/[id]/landing: the move', () => {
  it('moves landing 14:00 + 30 to 15:10 -> 200 with the new pickup 15:40 and the audit rows', async () => {
    const { status, json } = await call(GOOD)
    expect(status).toBe(200)
    expect(json).toEqual({
      ok: true,
      landing_date: '2027-06-10',
      landing_time: '15:10',
      pickup_date: '2027-06-10',
      pickup_time: '15:40',
    })
    expect(world.updates).toEqual([
      { landing_date: '2027-06-10', landing_time: '15:10', pickup_date: '2027-06-10', pickup_time: '15:40' },
    ])
    expect(world.audits[0].map(r => [r.field, r.operator_id])).toEqual([
      ['landing_time', ADMIN_ID],
      ['pickup_time', ADMIN_ID],
    ])
    expect(stubReevaluate).toHaveBeenCalledTimes(1)
  })

  it('returns payment_effect when the re-evaluation produced one', async () => {
    const effect = { kind: 'hold_released', currency: 'eur', hold_date_iso: '2027-06-09', hold_at_iso: '2027-06-09T08:00:00Z' }
    stubReevaluate.mockResolvedValue(effect)
    const { json } = await call(GOOD)
    expect(json.payment_effect).toEqual(effect)
  })

  it('notify_client true with the flag on -> logEmail then sendBookingChangedEmail once with landing and pickup entries', async () => {
    const { status } = await call({ ...GOOD, notify_client: true })
    expect(status).toBe(200)
    expect(stubLogEmail).toHaveBeenCalledTimes(1)
    expect(stubSendChanged).toHaveBeenCalledTimes(1)
    const entries = stubSendChanged.mock.calls[0][1] as Array<{ field: string }>
    expect(entries.map(e => e.field)).toEqual(['landing_time', 'pickup_time'])
    expect(world.audits[0].every(r => r.notified === true)).toBe(true)
  })

  it('notify_client false -> no email and the audit rows record notified false', async () => {
    await call(GOOD)
    expect(stubSendChanged).not.toHaveBeenCalled()
    expect(world.audits[0].every(r => r.notified === false)).toBe(true)
  })

  it('notify_client true with the booking_changed flag off -> no email, notified false', async () => {
    world.flags = { booking_changed: false }
    await call({ ...GOOD, notify_client: true })
    expect(stubSendChanged).not.toHaveBeenCalled()
    expect(world.audits[0].every(r => r.notified === false)).toBe(true)
  })

  it('landing 23:50 with offset 30 moves pickup_date to the next day and pickup_time to 00:20', async () => {
    world.booking = booking({ landing_time: '23:00', pickup_time: '23:30' })
    const { status, json } = await call({
      landing_date: '2027-06-10',
      landing_time: '23:50',
      expected_pickup_date: '2027-06-11',
      expected_pickup_time: '00:20',
      notify_client: false,
    })
    expect(status).toBe(200)
    expect(json).toMatchObject({ pickup_date: '2027-06-11', pickup_time: '00:20' })
    expect(world.updates[0]).toMatchObject({ pickup_date: '2027-06-11', pickup_time: '00:20' })
  })

  it('landing on the spring DST day 2027-03-28 01:50 + 30 gives pickup 03:20', async () => {
    world.booking = booking({ landing_date: '2027-03-28', landing_time: '00:10', pickup_date: '2027-03-28', pickup_time: '00:40' })
    const { status, json } = await call({
      landing_date: '2027-03-28',
      landing_time: '01:50',
      expected_pickup_date: '2027-03-28',
      expected_pickup_time: '03:20',
      notify_client: false,
    })
    expect(status).toBe(200)
    expect(json).toMatchObject({ pickup_date: '2027-03-28', pickup_time: '03:20' })
  })

  it('the generated instant column is never written', async () => {
    await call(GOOD)
    for (const payload of world.updates) expect(Object.keys(payload)).not.toContain('pickup_utc')
  })
})

describe('D-11: nothing moves a pickup without a person (T-91-43)', () => {
  const ROOT = path.resolve(__dirname, '..')

  function walk(dir: string, out: string[] = []): string[] {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === '.next') continue
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full, out)
      else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full)
    }
    return out
  }

  it('only the landing route imports lib/landing-change', () => {
    const importers = ['app', 'lib', 'components']
      .flatMap(dir => walk(path.join(ROOT, dir)))
      .filter(file => /from\s+['"]@\/lib\/landing-change['"]/.test(fs.readFileSync(file, 'utf8')))
      .map(file => path.relative(ROOT, file).split(path.sep).join('/'))
    expect(importers).toEqual(['app/api/admin/bookings/[id]/landing/route.ts'])
  })

  it('the flight-refresh routes do not mention applyLandingChange', () => {
    for (const file of ['app/api/admin/flight-refresh/route.ts', 'app/api/cron/flight-refresh/route.ts']) {
      expect(fs.readFileSync(path.join(ROOT, file), 'utf8')).not.toMatch(/landing-change|applyLandingChange/)
    }
  })
})
