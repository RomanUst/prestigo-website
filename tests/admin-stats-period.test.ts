import { describe, it, expect } from 'vitest'
import { parsePeriod, b2bStatsSchema } from '@/lib/admin-stats'

function q(from?: string, to?: string) {
  const p = new URLSearchParams()
  if (from !== undefined) p.set('from', from)
  if (to !== undefined) p.set('to', to)
  return p
}

describe('parsePeriod (D-13)', () => {
  it('accepts a normal period', () => {
    expect(parsePeriod(q('2026-01-01', '2026-03-31'))).toEqual({
      ok: true,
      period: { from: '2026-01-01', to: '2026-03-31' },
    })
  })

  it('accepts from = to', () => {
    expect(parsePeriod(q('2026-05-05', '2026-05-05')).ok).toBe(true)
  })

  it('accepts a leap day', () => {
    expect(parsePeriod(q('2024-02-29', '2024-03-01')).ok).toBe(true)
  })

  it('rejects a missing parameter', () => {
    expect(parsePeriod(q('2026-01-01')).ok).toBe(false)
    expect(parsePeriod(q(undefined, '2026-01-01')).ok).toBe(false)
    expect(parsePeriod(q()).ok).toBe(false)
  })

  it('rejects non zero-padded dates', () => {
    expect(parsePeriod(q('2026-1-01', '2026-03-31')).ok).toBe(false)
  })

  it('rejects impossible calendar dates', () => {
    expect(parsePeriod(q('2026-02-30', '2026-03-31')).ok).toBe(false)
    expect(parsePeriod(q('2026-01-01', '2026-13-01')).ok).toBe(false)
    expect(parsePeriod(q('2025-02-29', '2025-03-01')).ok).toBe(false)
  })

  it('rejects from after to', () => {
    expect(parsePeriod(q('2026-04-01', '2026-03-31')).ok).toBe(false)
  })

  it('enforces the 2000-01-01 .. 2099-12-31 bounds', () => {
    expect(parsePeriod(q('1999-12-31', '2026-03-31')).ok).toBe(false)
    expect(parsePeriod(q('2000-01-01', '2026-03-31')).ok).toBe(true)
    expect(parsePeriod(q('2026-01-01', '2100-01-01')).ok).toBe(false)
    expect(parsePeriod(q('2026-01-01', '2099-12-31')).ok).toBe(true)
  })

  it('rejects hostile strings', () => {
    expect(parsePeriod(q("2026-01-01'; drop table bookings;--", '2026-03-31')).ok).toBe(false)
  })
})

describe('b2bStatsSchema', () => {
  const valid = {
    from: '2026-01-01',
    to: '2026-03-31',
    accounts_total: 3,
    b2b_bookings: 5,
    b2b_revenue_eur: 1200,
    all_bookings: 40,
    all_revenue_eur: 9000,
    accounts: [
      {
        user_id: '11111111-1111-4111-8111-111111111111',
        company_name: 'ACME s.r.o.',
        full_name: null,
        email: 'a@example.com',
        bookings: 5,
        revenue_eur: 1200,
        avg_eur: 240,
        last_trip: '2026-03-10',
        without_amount: 0,
      },
    ],
  }

  it('accepts a valid payload', () => {
    expect(b2bStatsSchema.safeParse(valid).success).toBe(true)
  })

  it('rejects a non-integer revenue_eur', () => {
    const bad = { ...valid, accounts: [{ ...valid.accounts[0], revenue_eur: 12.5 }] }
    expect(b2bStatsSchema.safeParse(bad).success).toBe(false)
  })

  it('rejects a last_trip that is not YYYY-MM-DD', () => {
    const bad = { ...valid, accounts: [{ ...valid.accounts[0], last_trip: '10.03.2026' }] }
    expect(b2bStatsSchema.safeParse(bad).success).toBe(false)
  })
})
