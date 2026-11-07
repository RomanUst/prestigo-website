/**
 * Phase 89, plan 89-28 — the client's write routes on the manage link (HOLD-06, CANC-01; D-01 to D-04).
 *
 * Tracer: POST /api/manage/cancel through resolveManageToken and cancelBooking (initiator client_token) to a cancelled
 * booking. Then the change-request route (alert to the operator, once per message and 10-minute bucket).
 *
 * The token resolver and the orchestrator are faked: their own behaviour is covered by tests/manage-link.test.ts and
 * tests/payments-cancel.test.ts (client_token cases). What is asserted here is the route's contract: guards, the
 * uniform answer, the mapping of every CancelResult, and that nothing client-written reaches a log or the ledger.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const { mockResolve, mockCancel, mockRate, mockAlert, mockFrom } = vi.hoisted(() => ({
  mockResolve: vi.fn(),
  mockCancel: vi.fn(),
  mockRate: vi.fn(),
  mockAlert: vi.fn(),
  mockFrom: vi.fn(),
}))

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: mockRate,
  getClientIp: () => '203.0.113.9',
}))

vi.mock('@/lib/manage-link', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/manage-link')>()
  return { ...actual, resolveManageToken: mockResolve }
})

vi.mock('@/lib/payments/cancel', () => ({ cancelBooking: mockCancel }))
vi.mock('@/lib/payments/alerts', () => ({ sendPaymentOperatorAlert: mockAlert }))
vi.mock('@/lib/supabase', () => ({ createSupabaseServiceClient: () => ({ from: mockFrom }) }))

import { POST as cancelPOST } from '@/app/api/manage/cancel/route'
import { POST as changePOST } from '@/app/api/manage/change-request/route'

const REPO_ROOT = path.resolve(__dirname, '..')
const TOKEN = 'A'.repeat(43)
const BOOKING_ID = 'b0000001-0000-4000-8000-000000000001'

function post(url: string, body: unknown, raw?: string): Request {
  return new Request(`http://localhost${url}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: raw ?? JSON.stringify(body),
  })
}

const cancelReq = (body: unknown, raw?: string) => post('/api/manage/cancel', body, raw)
const changeReq = (body: unknown, raw?: string) => post('/api/manage/change-request', body, raw)

beforeEach(() => {
  vi.clearAllMocks()
  mockRate.mockResolvedValue({ allowed: true, remaining: 9, limit: 10 })
  mockResolve.mockResolvedValue(BOOKING_ID)
  mockCancel.mockResolvedValue({ kind: 'ok', outcome: 'free', money: 'none' })
})

describe('POST /api/manage/cancel (tracer)', () => {
  it('cancels a free booking through cancelBooking as client_token and answers the result', async () => {
    mockCancel.mockResolvedValue({ kind: 'ok', outcome: 'free', money: 'refunded', refundedMinor: 12000, currency: 'eur', refundId: 're_secret' })
    const res = await cancelPOST(cancelReq({ token: TOKEN, acknowledge: 'free' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ ok: true, outcome: 'free', money: 'refunded', refundedMinor: 12000, currency: 'eur' })
    expect(JSON.stringify(body)).not.toContain('re_secret')
    expect(mockResolve).toHaveBeenCalledWith(TOKEN)
    expect(mockCancel).toHaveBeenCalledTimes(1)
    expect(mockCancel).toHaveBeenCalledWith({
      bookingId: BOOKING_ID,
      initiator: 'client_token',
      actor: { type: 'system', id: 'client_token' },
      acknowledge: 'free',
    })
    expect(res.headers.get('cache-control')).toBe('no-store')
  })

  it('passes acknowledge late and answers the late result', async () => {
    mockCancel.mockResolvedValue({ kind: 'ok', outcome: 'late', money: 'kept' })
    const res = await cancelPOST(cancelReq({ token: TOKEN, acknowledge: 'late' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, outcome: 'late', money: 'kept' })
    expect(mockCancel.mock.calls[0][0].acknowledge).toBe('late')
  })

  it('a malformed token is 400 with no database call', async () => {
    for (const token of ['short', 'A'.repeat(42), 'A'.repeat(44), `${'A'.repeat(42)}!`, 123, null]) {
      const res = await cancelPOST(cancelReq({ token, acknowledge: 'free' }))
      expect(res.status).toBe(400)
    }
    expect(mockResolve).not.toHaveBeenCalled()
    expect(mockCancel).not.toHaveBeenCalled()
  })

  it('an invalid body is 400 (strict schema, acknowledge required, no extra keys)', async () => {
    for (const body of [
      { token: TOKEN },
      { token: TOKEN, acknowledge: 'maybe' },
      { token: TOKEN, acknowledge: 'free', bookingId: BOOKING_ID },
      { token: TOKEN, acknowledge: 'free', initiator: 'admin_prestigo' },
      [],
      'text',
    ]) {
      const res = await cancelPOST(cancelReq(body))
      expect(res.status).toBe(400)
    }
    expect((await cancelPOST(cancelReq(null, '{not json'))).status).toBe(400)
    expect(mockCancel).not.toHaveBeenCalled()
  })

  it('unknown, revoked, partner and expired tokens get one identical answer (the resolver answers null for all four)', async () => {
    const answers: Array<{ status: number; body: unknown }> = []
    for (const _reason of ['unknown', 'revoked', 'partner', 'expired']) {
      mockResolve.mockResolvedValueOnce(null)
      const res = await cancelPOST(cancelReq({ token: TOKEN, acknowledge: 'free' }))
      answers.push({ status: res.status, body: await res.json() })
    }
    expect(answers).toHaveLength(4)
    for (const a of answers) expect(a).toEqual(answers[0])
    expect(answers[0].status).toBe(404)
    // A booking that vanished between the token and the cancel looks the same.
    mockCancel.mockResolvedValueOnce({ kind: 'not_found' })
    const gone = await cancelPOST(cancelReq({ token: TOKEN, acknowledge: 'free' }))
    expect({ status: gone.status, body: await gone.json() }).toEqual(answers[0])
    expect(mockCancel).toHaveBeenCalledTimes(1)
  })

  it('an acknowledge mismatch is 409 POLICY_CHANGED with the current outcome', async () => {
    mockCancel.mockResolvedValue({ kind: 'policy_changed', outcome: 'late' })
    const res = await cancelPOST(cancelReq({ token: TOKEN, acknowledge: 'free' }))
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ code: 'POLICY_CHANGED', outcome: 'late' })
  })

  it('busy is 409 payment_busy', async () => {
    mockCancel.mockResolvedValue({ kind: 'busy' })
    const res = await cancelPOST(cancelReq({ token: TOKEN, acknowledge: 'free' }))
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'payment_busy' })
  })

  it('a repeat cancel is a 200 with the current state', async () => {
    mockCancel.mockResolvedValue({ kind: 'already_cancelled' })
    const res = await cancelPOST(cancelReq({ token: TOKEN, acknowledge: 'free' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, alreadyCancelled: true })
  })

  it('on board is 409 with the current status; at or after pickup is 409 too_late', async () => {
    mockCancel.mockResolvedValueOnce({ kind: 'not_cancellable', status: 'on_board' })
    const onBoard = await cancelPOST(cancelReq({ token: TOKEN, acknowledge: 'free' }))
    expect(onBoard.status).toBe(409)
    expect(await onBoard.json()).toEqual({ error: 'not_cancellable', currentStatus: 'on_board' })

    mockCancel.mockResolvedValueOnce({ kind: 'too_late' })
    const late = await cancelPOST(cancelReq({ token: TOKEN, acknowledge: 'late' }))
    expect(late.status).toBe(409)
    expect(await late.json()).toEqual({ error: 'too_late' })
  })

  it('a lost race is 409 status_conflict with the current status', async () => {
    mockCancel.mockResolvedValue({ kind: 'conflict', currentStatus: 'completed' })
    const res = await cancelPOST(cancelReq({ token: TOKEN, acknowledge: 'free' }))
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'status_conflict', currentStatus: 'completed' })
  })

  it('a failed refund after the cancel is a success that says nothing about Stripe', async () => {
    mockCancel.mockResolvedValue({ kind: 'money_failed', amount_minor: 5000, currency: 'eur' })
    const res = await cancelPOST(cancelReq({ token: TOKEN, acknowledge: 'free' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ ok: true, outcome: 'free', money: 'manual' })
  })

  it('db_failed: before the cancel is 500; after the cancel (case not opened) the cancel stands', async () => {
    mockCancel.mockResolvedValueOnce({ kind: 'db_failed' })
    expect((await cancelPOST(cancelReq({ token: TOKEN, acknowledge: 'free' }))).status).toBe(500)
    mockCancel.mockResolvedValueOnce({ kind: 'db_failed', cancelled: true })
    const res = await cancelPOST(cancelReq({ token: TOKEN, acknowledge: 'late' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, outcome: 'late', money: 'kept' })
  })

  it('an orchestrator that throws is a generic 500 and nothing is logged with the token', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockCancel.mockRejectedValue(new Error(`boom ${TOKEN}`))
    const res = await cancelPOST(cancelReq({ token: TOKEN, acknowledge: 'free' }))
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'cancel_failed' })
    expect(JSON.stringify(spy.mock.calls)).not.toContain(TOKEN)
    spy.mockRestore()
  })

  it('rate limit is 429 under the registered key, before anything else', async () => {
    mockRate.mockResolvedValue({ allowed: false, remaining: 0, limit: 10 })
    const res = await cancelPOST(cancelReq({ token: TOKEN, acknowledge: 'free' }))
    expect(res.status).toBe(429)
    expect(mockRate).toHaveBeenCalledWith('/api/manage/cancel', '203.0.113.9')
    expect(mockResolve).not.toHaveBeenCalled()
    expect(mockCancel).not.toHaveBeenCalled()
  })

  it('an oversized body is 413 before the rate limit', async () => {
    const res = await cancelPOST(
      new Request('http://localhost/api/manage/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'content-length': '999999' },
        body: '{}',
      }),
    )
    expect(res.status).toBe(413)
    expect(mockRate).not.toHaveBeenCalled()
  })

  it('source: client_token initiator, no token logging, route key and CSRF prefix registered', () => {
    const src = fs.readFileSync(path.join(REPO_ROOT, 'app/api/manage/cancel/route.ts'), 'utf8')
    expect(src).toContain("'client_token'")
    expect(src).not.toMatch(/console\.\w+\([^)]*token/i)
    const limits = fs.readFileSync(path.join(REPO_ROOT, 'lib/rate-limit.ts'), 'utf8')
    expect(limits).toContain("'/api/manage/cancel'")
    expect(limits).toContain("'/api/manage/change-request'")
    expect(fs.readFileSync(path.join(REPO_ROOT, 'middleware.ts'), 'utf8')).toContain("'/api/manage'")
  })
})

// ── change request ───────────────────────────────────────────────────────────────────────────────────────────────────

const BOOKING_ROW = {
  id: BOOKING_ID,
  booking_reference: 'PRG-1001',
  status: 'confirmed',
  client_first_name: 'Ada',
  client_last_name: 'Lovelace',
  pickup_date: '2030-05-01',
  pickup_time: '10:00',
  payment_currency: 'eur',
  payment_amount_minor: 12000,
}

function stubBookingRead(row: Record<string, unknown> | null, error: unknown = null) {
  mockFrom.mockImplementation(() => {
    const chain = {
      select: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      maybeSingle: vi.fn(() => Promise.resolve({ data: row, error })),
    }
    return chain
  })
}

describe('POST /api/manage/change-request', () => {
  beforeEach(() => {
    mockAlert.mockResolvedValue('sent')
    stubBookingRead(BOOKING_ROW)
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('mails the operator with the message and answers ok', async () => {
    const res = await changePOST(changeReq({ token: TOKEN, message: '  Please move the pickup to 11:00.  ' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(mockAlert).toHaveBeenCalledTimes(1)
    const [kind, booking, details] = mockAlert.mock.calls[0]
    expect(kind).toBe('change_request')
    expect(booking.booking_reference).toBe('PRG-1001')
    expect(details.message).toBe('Please move the pickup to 11:00.')
    expect(details.eventKey).toMatch(new RegExp(`^alert:change_request:${BOOKING_ID}:\\d+:[0-9a-f]{8}$`))
    expect(mockRate).toHaveBeenCalledWith('/api/manage/change-request', '203.0.113.9')
  })

  it('the same message inside one 10-minute bucket has the same key, a later bucket a new one', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2030-04-01T10:01:00Z'))
    await changePOST(changeReq({ token: TOKEN, message: 'Hello' }))
    vi.setSystemTime(new Date('2030-04-01T10:08:00Z'))
    await changePOST(changeReq({ token: TOKEN, message: 'Hello' }))
    vi.setSystemTime(new Date('2030-04-01T10:11:00Z'))
    await changePOST(changeReq({ token: TOKEN, message: 'Hello' }))
    const keys = mockAlert.mock.calls.map((c) => c[2].eventKey as string)
    expect(keys[0]).toBe(keys[1])
    expect(keys[2]).not.toBe(keys[0])
  })

  it('a different message in the same bucket is not swallowed as a duplicate', async () => {
    await changePOST(changeReq({ token: TOKEN, message: 'Move to 11:00' }))
    await changePOST(changeReq({ token: TOKEN, message: 'Actually 12:00' }))
    const keys = mockAlert.mock.calls.map((c) => c[2].eventKey as string)
    expect(keys[0]).not.toBe(keys[1])
  })

  it('a duplicate (the alert says so) is still a success to the client', async () => {
    mockAlert.mockResolvedValue('duplicate')
    const res = await changePOST(changeReq({ token: TOKEN, message: 'Hello' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })

  it('a mail that could not be sent is an error, so the client keeps the text', async () => {
    mockAlert.mockResolvedValue('failed')
    const res = await changePOST(changeReq({ token: TOKEN, message: 'Hello' }))
    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({ error: 'send_failed' })
  })

  it('1 to 1000 characters: empty, blank and 1001 are 400; 1000 passes', async () => {
    for (const message of ['', '   \n  ', 'x'.repeat(1001), 5, null]) {
      const res = await changePOST(changeReq({ token: TOKEN, message }))
      expect(res.status).toBe(400)
    }
    expect(mockAlert).not.toHaveBeenCalled()
    const ok = await changePOST(changeReq({ token: TOKEN, message: 'x'.repeat(1000) }))
    expect(ok.status).toBe(200)
  })

  it('a malformed token is 400 with no database call; unknown tokens get one uniform 404', async () => {
    expect((await changePOST(changeReq({ token: 'nope', message: 'Hi' }))).status).toBe(400)
    expect(mockResolve).not.toHaveBeenCalled()
    mockResolve.mockResolvedValue(null)
    const res = await changePOST(changeReq({ token: TOKEN, message: 'Hi' }))
    const cancelRes = await cancelPOST(cancelReq({ token: TOKEN, acknowledge: 'free' }))
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual(await cancelRes.json())
    expect(mockAlert).not.toHaveBeenCalled()
  })

  it('strict body: extra keys are refused', async () => {
    const res = await changePOST(changeReq({ token: TOKEN, message: 'Hi', bookingId: BOOKING_ID }))
    expect(res.status).toBe(400)
    expect((await changePOST(changeReq(null, 'nope{'))).status).toBe(400)
  })

  it('refuses a booking that can no longer change (cancelled, completed, on board) and a missing row', async () => {
    for (const status of ['cancelled', 'completed', 'no_show', 'on_board']) {
      stubBookingRead({ ...BOOKING_ROW, status })
      const res = await changePOST(changeReq({ token: TOKEN, message: 'Hi' }))
      expect(res.status).toBe(409)
      expect(await res.json()).toEqual({ error: 'not_changeable' })
    }
    stubBookingRead(null)
    expect((await changePOST(changeReq({ token: TOKEN, message: 'Hi' }))).status).toBe(404)
    stubBookingRead(null, { message: 'db down' })
    expect((await changePOST(changeReq({ token: TOKEN, message: 'Hi' }))).status).toBe(500)
    expect(mockAlert).not.toHaveBeenCalled()
  })

  it('rate limit is 429 under its own key', async () => {
    mockRate.mockResolvedValue({ allowed: false, remaining: 0, limit: 5 })
    const res = await changePOST(changeReq({ token: TOKEN, message: 'Hi' }))
    expect(res.status).toBe(429)
    expect(mockAlert).not.toHaveBeenCalled()
  })

  it('the message never reaches a log, and the route writes nothing to the booking or the ledger (T-89-53)', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    mockAlert.mockRejectedValue(new Error('smtp down'))
    const secret = 'my secret request text'
    const res = await changePOST(changeReq({ token: TOKEN, message: secret }))
    expect(res.status).toBe(502)
    expect(JSON.stringify([...spy.mock.calls, ...logSpy.mock.calls])).not.toContain(secret)
    expect(JSON.stringify([...spy.mock.calls, ...logSpy.mock.calls])).not.toContain(TOKEN)
    spy.mockRestore()
    logSpy.mockRestore()

    const src = fs.readFileSync(path.join(REPO_ROOT, 'app/api/manage/change-request/route.ts'), 'utf8')
    expect(src).not.toMatch(/\.from\([^)]*\)\s*\.(insert|update|upsert|delete)\(/)
    expect(src).not.toContain('appendPaymentEvent')
    expect(src).not.toContain('advanceBookingStatus')
  })
})
