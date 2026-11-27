// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

// POST /api/admin/bookings/[id]/resend-confirmation: sends the "Booking confirmed" email again with the stored
// booking. Supabase, the email log, the policy block and the email send are stubs.

const world = vi.hoisted(() => ({
  auth: 'admin' as 'admin' | '401' | '403',
  booking: null as null | Record<string, unknown>,
  auditUpdates: [] as Array<{ payload: Record<string, unknown>; filters: Array<[string, unknown]> }>,
  emailLogDeletes: 0,
}))

const { stubLogEmail, stubSendConfirmed, stubPolicy } = vi.hoisted(() => ({
  stubLogEmail: vi.fn(),
  stubSendConfirmed: vi.fn(),
  stubPolicy: vi.fn(),
}))

const ADMIN_ID = '99999999-9999-4999-8999-999999999999'
const ID = '77777777-7777-4777-8777-777777777777'

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
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: world.booking, error: null }) }) }) }
      }
      if (table === 'booking_edit_audit_log') {
        return {
          update: (payload: Record<string, unknown>) => {
            const entry = { payload, filters: [] as Array<[string, unknown]> }
            world.auditUpdates.push(entry)
            const chain = {
              eq: (col: string, val: unknown) => {
                entry.filters.push([col, val])
                return chain
              },
              then: (resolve: (v: { error: null }) => void) => resolve({ error: null }),
            }
            return chain
          },
        }
      }
      if (table === 'email_log') {
        const chain = {
          delete: () => { world.emailLogDeletes++; return chain },
          eq: () => chain,
          gte: async () => ({ error: null }),
        }
        return chain
      }
      throw new Error(`unexpected table ${table}`)
    },
  }),
}))

vi.mock('@/lib/email-log', () => ({ logEmail: stubLogEmail }))
vi.mock('@/lib/email', () => ({ sendStatusConfirmedEmail: stubSendConfirmed }))
vi.mock('@/lib/payments/emails/policy-block', () => ({ buildPolicyBlockHtml: stubPolicy }))

import { POST } from '@/app/api/admin/bookings/[id]/resend-confirmation/route'

function call(id = ID) {
  return POST(new Request(`http://localhost/api/admin/bookings/${id}/resend-confirmation`, { method: 'POST' }), {
    params: Promise.resolve({ id }),
  })
}

beforeEach(() => {
  world.auth = 'admin'
  world.booking = {
    id: ID,
    status: 'confirmed',
    booking_reference: 'PRG-TEST',
    client_email: 'client@example.com',
    pickup_date: '2026-12-05',
    pickup_time: '17:30',
  }
  world.auditUpdates = []
  world.emailLogDeletes = 0
  stubLogEmail.mockReset().mockResolvedValue(true)
  stubSendConfirmed.mockReset().mockResolvedValue(true)
  stubPolicy.mockReset().mockResolvedValue('')
})

describe('POST /api/admin/bookings/[id]/resend-confirmation', () => {
  it('401 / 403 before anything is read', async () => {
    world.auth = '401'
    expect((await call()).status).toBe(401)
    world.auth = '403'
    expect((await call()).status).toBe(403)
    expect(stubSendConfirmed).not.toHaveBeenCalled()
  })

  it('400 for a non-uuid id', async () => {
    expect((await call('nope')).status).toBe(400)
  })

  it('404 when the booking is missing', async () => {
    world.booking = null
    expect((await call()).status).toBe(404)
  })

  it('422 for a booking that is not confirmed', async () => {
    world.booking = { ...world.booking, status: 'pending' }
    const res = await call()
    expect(res.status).toBe(422)
    expect(await res.json()).toEqual({ error: 'not_confirmed' })
    expect(stubSendConfirmed).not.toHaveBeenCalled()
  })

  it('sends the confirmed email with the stored booking and marks pending history rows notified', async () => {
    stubPolicy.mockResolvedValue('<p>policy</p>')
    const res = await call()
    expect(res.status).toBe(200)
    expect(stubLogEmail).toHaveBeenCalledWith({ bookingId: ID, emailType: 'booking_confirmed', recipient: 'client@example.com' })
    expect(stubSendConfirmed).toHaveBeenCalledWith(expect.objectContaining({ pickup_date: '2026-12-05', policyBlockHtml: '<p>policy</p>' }))
    expect(world.auditUpdates).toHaveLength(1)
    expect(world.auditUpdates[0].payload).toEqual({ notified: true })
    expect(world.auditUpdates[0].filters).toEqual([['booking_id', ID], ['notified', false]])
  })

  it('429 within the dedup window, nothing sent', async () => {
    stubLogEmail.mockResolvedValue(false)
    const res = await call()
    expect(res.status).toBe(429)
    expect(stubSendConfirmed).not.toHaveBeenCalled()
  })

  it('502 when the send fails: the dedup row is dropped and history stays unnotified', async () => {
    stubSendConfirmed.mockResolvedValue(false)
    const res = await call()
    expect(res.status).toBe(502)
    expect(world.emailLogDeletes).toBe(1)
    expect(world.auditUpdates).toHaveLength(0)
  })
})
