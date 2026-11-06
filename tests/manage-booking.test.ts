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
