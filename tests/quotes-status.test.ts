// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { effectiveQuoteStatus, firstPickupMs, lastPickupMs, quoteLinkState } from '@/lib/quotes/status'
import { pickupInstantMs } from '@/lib/prague-date'
import type { QuoteStatus } from '@/lib/quotes/vocabulary'

/**
 * Phase 92 plan 92-02 (QUOTE-02, QUOTE-06; D-02, D-05, D-10): one answer per link, derived from the current
 * version, the operator expiry and the first pickup. DST dates are checked on purpose.
 */

const DAY = 86_400_000
const NOW = Date.parse('2027-03-20T12:00:00Z')

function input(
  over: {
    status?: QuoteStatus
    current?: string | null
    versionId?: string
    revoked?: string | null
    expires?: string | null
    cancelled?: string | null
    firstPickup?: number | null
    now?: number
  } = {},
) {
  return {
    link: { version_id: over.versionId ?? 'v1', revoked_at: over.revoked ?? null },
    quote: {
      status: over.status ?? ('sent' as QuoteStatus),
      current_version_id: over.current === undefined ? 'v1' : over.current,
      expires_at: over.expires ?? null,
      cancelled_at: over.cancelled ?? null,
    },
    firstPickupMs: over.firstPickup === undefined ? NOW + 5 * DAY : over.firstPickup,
    nowMs: over.now ?? NOW,
  }
}

describe('firstPickupMs / lastPickupMs', () => {
  it('returns the earliest and latest pickup instants', () => {
    const lines = [
      { pickup_date: '2027-04-10', pickup_time: '09:00' },
      { pickup_date: '2027-04-02', pickup_time: '18:30' },
      { pickup_date: '2027-04-20', pickup_time: '07:15' },
    ]
    expect(firstPickupMs(lines)).toBe(pickupInstantMs({ pickup_utc: null, pickup_date: '2027-04-02', pickup_time: '18:30' }))
    expect(lastPickupMs(lines)).toBe(pickupInstantMs({ pickup_utc: null, pickup_date: '2027-04-20', pickup_time: '07:15' }))
  })

  it('returns null for no lines or unparseable lines', () => {
    expect(firstPickupMs([])).toBeNull()
    expect(lastPickupMs([])).toBeNull()
    expect(firstPickupMs([{ pickup_date: 'nope', pickup_time: '09:00' }])).toBeNull()
  })

  it('skips an unparseable line but keeps the others', () => {
    const lines = [
      { pickup_date: 'bad', pickup_time: '09:00' },
      { pickup_date: '2027-04-02', pickup_time: '18:30' },
    ]
    expect(firstPickupMs(lines)).not.toBeNull()
  })
})

describe('effectiveQuoteStatus', () => {
  it('expires a sent or viewed quote past expires_at (D-02)', () => {
    const past = new Date(NOW - 1000).toISOString()
    expect(effectiveQuoteStatus({ status: 'sent', expires_at: past, cancelled_at: null }, NOW)).toBe('expired')
    expect(effectiveQuoteStatus({ status: 'viewed', expires_at: past, cancelled_at: null }, NOW)).toBe('expired')
  })

  it('keeps sent while expires_at is in the future or null', () => {
    expect(effectiveQuoteStatus({ status: 'sent', expires_at: new Date(NOW + 1000).toISOString(), cancelled_at: null }, NOW)).toBe('sent')
    expect(effectiveQuoteStatus({ status: 'sent', expires_at: null, cancelled_at: null }, NOW)).toBe('sent')
  })

  it('does not expire accepted, paid, draft or voided', () => {
    const past = new Date(NOW - 1000).toISOString()
    for (const status of ['accepted', 'paid', 'draft', 'voided'] as const) {
      expect(effectiveQuoteStatus({ status, expires_at: past, cancelled_at: null }, NOW)).toBe(status)
    }
  })

  it('reports cancelled when cancelled_at is set', () => {
    expect(effectiveQuoteStatus({ status: 'paid', expires_at: null, cancelled_at: '2027-03-19T00:00:00Z' }, NOW)).toBe('cancelled')
  })
})

describe('quoteLinkState', () => {
  it("answers 'offer' for sent, viewed and accepted live quotes", () => {
    for (const status of ['sent', 'viewed', 'accepted'] as const) {
      expect(quoteLinkState(input({ status }))).toBe('offer')
    }
  })

  it('answers null for draft and voided', () => {
    expect(quoteLinkState(input({ status: 'draft' }))).toBeNull()
    expect(quoteLinkState(input({ status: 'voided' }))).toBeNull()
  })

  it('answers null for a quote stored as expired', () => {
    expect(quoteLinkState(input({ status: 'expired' }))).toBeNull()
  })

  it('answers null for a revoked link', () => {
    expect(quoteLinkState(input({ revoked: '2027-03-19T00:00:00Z' }))).toBeNull()
  })

  it('answers null for a superseded link (version is not current), also when there is no current version', () => {
    expect(quoteLinkState(input({ versionId: 'v1', current: 'v2' }))).toBeNull()
    expect(quoteLinkState(input({ current: null }))).toBeNull()
  })

  it('answers null for a cancelled quote', () => {
    expect(quoteLinkState(input({ cancelled: '2027-03-19T00:00:00Z' }))).toBeNull()
    expect(quoteLinkState(input({ status: 'paid', cancelled: '2027-03-19T00:00:00Z' }))).toBeNull()
  })

  it('D-02: answers null once the operator expiry has passed, for the offer only', () => {
    const past = new Date(NOW - 1000).toISOString()
    expect(quoteLinkState(input({ expires: past }))).toBeNull()
    expect(quoteLinkState(input({ status: 'viewed', expires: past }))).toBeNull()
    expect(quoteLinkState(input({ status: 'accepted', expires: past }))).toBeNull()
    expect(quoteLinkState(input({ expires: new Date(NOW + 1000).toISOString() }))).toBe('offer')
  })

  it('D-05: answers null at or after the first pickup and offer before it', () => {
    const pickup = NOW + DAY
    expect(quoteLinkState(input({ firstPickup: pickup, now: pickup - 1 }))).toBe('offer')
    expect(quoteLinkState(input({ firstPickup: pickup, now: pickup }))).toBeNull()
    expect(quoteLinkState(input({ firstPickup: pickup, now: pickup + 1 }))).toBeNull()
  })

  it('D-05: a quote with no readable first pickup is not an offer', () => {
    expect(quoteLinkState(input({ firstPickup: null }))).toBeNull()
  })

  it('D-05 on the spring DST day (2027-03-28, Prague 02:00 -> 03:00): the pickup instant is exact', () => {
    // 04:00 Prague on 2027-03-28 is CEST (UTC+2) = 02:00Z.
    const pickup = pickupInstantMs({ pickup_utc: null, pickup_date: '2027-03-28', pickup_time: '04:00' })!
    expect(pickup).toBe(Date.parse('2027-03-28T02:00:00Z'))
    expect(quoteLinkState(input({ firstPickup: pickup, now: pickup - 1 }))).toBe('offer')
    expect(quoteLinkState(input({ firstPickup: pickup, now: pickup }))).toBeNull()
  })

  it('D-05 on the autumn DST day (2027-10-31, Prague 03:00 -> 02:00): the pickup instant is exact', () => {
    // 06:00 Prague on 2027-10-31 is CET (UTC+1) = 05:00Z.
    const pickup = pickupInstantMs({ pickup_utc: null, pickup_date: '2027-10-31', pickup_time: '06:00' })!
    expect(pickup).toBe(Date.parse('2027-10-31T05:00:00Z'))
    expect(quoteLinkState(input({ firstPickup: pickup, now: pickup - 1 }))).toBe('offer')
    expect(quoteLinkState(input({ firstPickup: pickup, now: pickup + 1 }))).toBeNull()
  })

  it("answers 'paid' for a paid, not cancelled quote even after the first pickup and a past expires_at", () => {
    const past = new Date(NOW - 1000).toISOString()
    expect(quoteLinkState(input({ status: 'paid', firstPickup: NOW - DAY, expires: past }))).toBe('paid')
    expect(quoteLinkState(input({ status: 'paid' }))).toBe('paid')
  })

  it('answers null for a paid quote whose link is revoked or superseded', () => {
    expect(quoteLinkState(input({ status: 'paid', revoked: '2027-03-19T00:00:00Z' }))).toBeNull()
    expect(quoteLinkState(input({ status: 'paid', versionId: 'v1', current: 'v2' }))).toBeNull()
  })
})
