// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Phase 91 plan 15 (STOP-05, D-08, D-11): applyLandingChange, the one function that moves the landing and the pickup of
// an airport booking when the operator presses "Move pickup". Supabase, the payment edit hook, the email log and the
// change email are replaced by stubs; the pickup arithmetic (lib/airport-pickup) runs for real.

type Row = Record<string, unknown>

const world = vi.hoisted(() => ({
  booking: null as null | Record<string, unknown>,
  readError: null as null | { message: string },
  updateRows: [{ id: 'b-1' }] as Array<{ id: string }>,
  updateError: null as null | { message: string },
  updates: [] as Array<{ payload: Record<string, unknown>; eqs: Array<[string, unknown]> }>,
  audits: [] as Array<Array<Record<string, unknown>>>,
  flags: null as null | Record<string, boolean>,
  logEmailResult: true,
  order: [] as string[],
}))

const { stubReevaluate, stubPrecheck, stubLogEmail, stubSendChanged } = vi.hoisted(() => ({
  stubReevaluate: vi.fn(),
  stubPrecheck: vi.fn(),
  stubLogEmail: vi.fn(),
  stubSendChanged: vi.fn(),
}))

vi.mock('next/server', () => ({
  after: (fn: () => unknown) => {
    void fn()
  },
}))

vi.mock('@/lib/supabase', () => ({
  createSupabaseServiceClient: () => ({
    from: (table: string) => {
      if (table === 'bookings') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: world.booking, error: world.readError }),
            }),
          }),
          update: (payload: Record<string, unknown>) => {
            const call = { payload, eqs: [] as Array<[string, unknown]> }
            world.updates.push(call)
            world.order.push('update')
            const chain = {
              eq: (column: string, value: unknown) => {
                call.eqs.push([column, value])
                return chain
              },
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
            world.order.push('audit')
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

import { applyLandingChange } from '@/lib/landing-change'

const ACTOR = { id: 'admin-1' }

function booking(over: Row = {}): Row {
  return {
    id: 'b-1',
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

function input(over: Partial<Parameters<typeof applyLandingChange>[0]> = {}): Parameters<typeof applyLandingChange>[0] {
  return {
    bookingId: 'b-1',
    landingDate: '2027-06-10',
    landingTime: '15:10',
    expectedPickupDate: '2027-06-10',
    expectedPickupTime: '15:40',
    notifyClient: false,
    actor: ACTOR,
    ...over,
  }
}

beforeEach(() => {
  world.booking = booking()
  world.readError = null
  world.updateRows = [{ id: 'b-1' }]
  world.updateError = null
  world.updates = []
  world.audits = []
  world.flags = null
  world.order = []
  stubReevaluate.mockReset().mockResolvedValue(null)
  stubPrecheck.mockReset().mockReturnValue(null)
  stubLogEmail.mockReset().mockResolvedValue(true)
  stubSendChanged.mockReset().mockResolvedValue(undefined)
})

describe('applyLandingChange (tracer): landing 14:00 + 30 moved to 15:10 -> pickup 15:40', () => {
  it('answers 200 with the new landing and pickup', async () => {
    const result = await applyLandingChange(input())
    expect(result).toEqual({
      status: 200,
      landingDate: '2027-06-10',
      landingTime: '15:10',
      pickupDate: '2027-06-10',
      pickupTime: '15:40',
      paymentEffect: null,
    })
  })

  it('updates landing and pickup together, compare-and-set on the current values, never touching the generated instant', async () => {
    await applyLandingChange(input())
    expect(world.updates).toHaveLength(1)
    expect(world.updates[0].payload).toEqual({
      landing_date: '2027-06-10',
      landing_time: '15:10',
      pickup_date: '2027-06-10',
      pickup_time: '15:40',
    })
    expect(Object.keys(world.updates[0].payload)).not.toContain('pickup_utc')
    expect(world.updates[0].eqs).toEqual(
      expect.arrayContaining([
        ['id', 'b-1'],
        ['pickup_date', '2027-06-10'],
        ['pickup_time', '14:30'],
      ]),
    )
  })

  it('writes one audit row per changed field with the operator id and no row for an unchanged date', async () => {
    await applyLandingChange(input())
    expect(world.audits).toHaveLength(1)
    const rows = world.audits[0]
    expect(rows.map(r => [r.field, r.old_value, r.new_value])).toEqual([
      ['landing_time', '14:00', '15:10'],
      ['pickup_time', '14:30', '15:40'],
    ])
    for (const row of rows) {
      expect(row.booking_id).toBe('b-1')
      expect(row.operator_id).toBe('admin-1')
      expect(row.notified).toBe(false)
    }
  })

  it('calls reevaluateAfterEdit once with pickupChanged true and priceChanged false, after the update and before the audit', async () => {
    await applyLandingChange(input())
    expect(stubReevaluate).toHaveBeenCalledTimes(1)
    const arg = stubReevaluate.mock.calls[0][0]
    expect(arg).toMatchObject({ bookingId: 'b-1', priceChanged: false, pickupChanged: true, actor: { type: 'admin', id: 'admin-1' } })
    expect(arg.before.pickup_time).toBe('14:30')
    expect(world.order).toEqual(['update', 'audit'])
  })

  it('returns the payment effect of the re-evaluation', async () => {
    const effect = { kind: 'hold_released', currency: 'eur', hold_date_iso: '2027-06-09', hold_at_iso: '2027-06-09T08:00:00Z' }
    stubReevaluate.mockResolvedValue(effect)
    const result = await applyLandingChange(input())
    expect(result).toMatchObject({ status: 200, paymentEffect: effect })
  })
})

describe('applyLandingChange: gates before any write', () => {
  it('unknown booking -> 404', async () => {
    world.booking = null
    expect(await applyLandingChange(input())).toEqual({ status: 404, error: 'not_found' })
    expect(world.updates).toHaveLength(0)
  })

  it('a read failure throws (the route answers 500)', async () => {
    world.readError = { message: 'boom' }
    await expect(applyLandingChange(input())).rejects.toThrow()
    expect(world.updates).toHaveLength(0)
  })

  it('a booking without landing -> 422 no_landing', async () => {
    world.booking = booking({ landing_date: null, landing_time: null, pickup_offset_min: null })
    expect(await applyLandingChange(input())).toEqual({ status: 422, error: 'no_landing' })
    expect(world.updates).toHaveLength(0)
  })

  it.each(['completed', 'cancelled', 'no_show'])('a %s booking -> 422 final_status', async (status) => {
    world.booking = booking({ status })
    expect(await applyLandingChange(input())).toEqual({ status: 422, error: 'final_status' })
    expect(world.updates).toHaveLength(0)
  })

  it('payment in flight -> 409 payment_in_progress from the existing precheck', async () => {
    stubPrecheck.mockReturnValue({ status: 409, body: { error: 'payment_in_progress' } })
    expect(await applyLandingChange(input())).toEqual({ status: 409, error: 'payment_in_progress' })
    expect(world.updates).toHaveLength(0)
    expect(stubReevaluate).not.toHaveBeenCalled()
  })

  it('a landing date that does not exist -> 422 invalid_landing', async () => {
    expect(await applyLandingChange(input({ landingDate: '2027-02-31' }))).toEqual({ status: 422, error: 'invalid_landing' })
    expect(world.updates).toHaveLength(0)
  })

  it('a stored offset outside the allowed list -> 422 invalid_landing', async () => {
    world.booking = booking({ pickup_offset_min: 20 })
    expect(await applyLandingChange(input())).toEqual({ status: 422, error: 'invalid_landing' })
  })

  it('the pickup the dialog showed differs from the server value -> 409 pickup_changed with the server pickup, nothing written', async () => {
    const result = await applyLandingChange(input({ expectedPickupTime: '15:30' }))
    expect(result).toEqual({ status: 409, error: 'pickup_changed', pickupDate: '2027-06-10', pickupTime: '15:40' })
    expect(world.updates).toHaveLength(0)
    expect(world.audits).toHaveLength(0)
    expect(stubReevaluate).not.toHaveBeenCalled()
  })

  it('the compare-and-set finds the pickup already moved (0 rows) -> 409 stale, no audit, no re-evaluation, no email', async () => {
    world.updateRows = []
    expect(await applyLandingChange(input({ notifyClient: true }))).toEqual({ status: 409, error: 'stale' })
    expect(world.audits).toHaveLength(0)
    expect(stubReevaluate).not.toHaveBeenCalled()
    expect(stubSendChanged).not.toHaveBeenCalled()
  })

  it('an update error throws (the route answers 500) and leaves no audit row', async () => {
    world.updateError = { message: 'db down' }
    await expect(applyLandingChange(input())).rejects.toThrow()
    expect(world.audits).toHaveLength(0)
  })
})

describe('applyLandingChange: midnight and DST', () => {
  it('landing 23:50 + 30 moves the pickup to the next day 00:20', async () => {
    world.booking = booking({ landing_time: '23:50', pickup_date: '2027-06-10', pickup_time: '23:50' })
    const result = await applyLandingChange(
      input({ landingTime: '23:50', expectedPickupDate: '2027-06-11', expectedPickupTime: '00:20' }),
    )
    expect(result).toMatchObject({ status: 200, pickupDate: '2027-06-11', pickupTime: '00:20' })
    expect(world.updates[0].payload).toMatchObject({ pickup_date: '2027-06-11', pickup_time: '00:20' })
    const fields = world.audits[0].map(r => r.field)
    expect(fields).toEqual(['pickup_date', 'pickup_time'])
  })

  it('landing on the spring DST day 2027-03-28 01:50 + 30 gives 03:20', async () => {
    world.booking = booking({ landing_date: '2027-03-28', landing_time: '00:10', pickup_date: '2027-03-28', pickup_time: '00:40' })
    const result = await applyLandingChange(
      input({ landingDate: '2027-03-28', landingTime: '01:50', expectedPickupDate: '2027-03-28', expectedPickupTime: '03:20' }),
    )
    expect(result).toMatchObject({ status: 200, pickupDate: '2027-03-28', pickupTime: '03:20' })
    expect(world.updates[0].payload).toMatchObject({ pickup_date: '2027-03-28', pickup_time: '03:20' })
  })

  it('the landing date moves with the landing (flight rolled to the next day)', async () => {
    const result = await applyLandingChange(
      input({ landingDate: '2027-06-11', landingTime: '00:10', expectedPickupDate: '2027-06-11', expectedPickupTime: '00:40' }),
    )
    expect(result).toMatchObject({ status: 200, landingDate: '2027-06-11', pickupDate: '2027-06-11', pickupTime: '00:40' })
    expect(world.audits[0].map(r => r.field)).toEqual(['landing_date', 'landing_time', 'pickup_date', 'pickup_time'])
  })
})

describe('applyLandingChange: client notice', () => {
  it('notify_client true with the flag on -> logEmail then one change email with landing and pickup entries', async () => {
    const result = await applyLandingChange(input({ notifyClient: true }))
    expect(result.status).toBe(200)
    expect(stubLogEmail).toHaveBeenCalledWith({ bookingId: 'b-1', emailType: 'booking_changed', recipient: 'ivan@example.com' })
    expect(stubSendChanged).toHaveBeenCalledTimes(1)
    const [sentBooking, entries] = stubSendChanged.mock.calls[0]
    expect(sentBooking).toMatchObject({ client_email: 'ivan@example.com', pickup_time: '15:40', landing_time: '15:10' })
    expect(entries).toEqual([
      { field: 'landing_time', label: 'Landing time', oldValue: '14:00', newValue: '15:10' },
      { field: 'pickup_time', label: 'Pickup time', oldValue: '14:30', newValue: '15:40' },
    ])
    expect(world.audits[0].every(r => r.notified === true)).toBe(true)
  })

  it('notify_client false -> no log row, no email, audit rows say not notified', async () => {
    await applyLandingChange(input({ notifyClient: false }))
    expect(stubLogEmail).not.toHaveBeenCalled()
    expect(stubSendChanged).not.toHaveBeenCalled()
    expect(world.audits[0].every(r => r.notified === false)).toBe(true)
  })

  it('the booking_changed flag off -> no email even when asked', async () => {
    world.flags = { booking_changed: false }
    await applyLandingChange(input({ notifyClient: true }))
    expect(stubLogEmail).not.toHaveBeenCalled()
    expect(stubSendChanged).not.toHaveBeenCalled()
    expect(world.audits[0].every(r => r.notified === false)).toBe(true)
  })

  it('the email log reports a duplicate -> no email', async () => {
    stubLogEmail.mockResolvedValue(false)
    await applyLandingChange(input({ notifyClient: true }))
    expect(stubSendChanged).not.toHaveBeenCalled()
    expect(world.audits[0].every(r => r.notified === false)).toBe(true)
  })
})

describe('applyLandingChange: no change', () => {
  it('the same landing is a 200 with no write, no audit, no re-evaluation and no email', async () => {
    const result = await applyLandingChange(
      input({ landingTime: '14:00', expectedPickupTime: '14:30', notifyClient: true }),
    )
    expect(result).toMatchObject({ status: 200, landingTime: '14:00', pickupTime: '14:30', paymentEffect: null })
    expect(world.updates).toHaveLength(0)
    expect(world.audits).toHaveLength(0)
    expect(stubReevaluate).not.toHaveBeenCalled()
    expect(stubSendChanged).not.toHaveBeenCalled()
  })
})
