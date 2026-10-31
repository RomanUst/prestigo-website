import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  parsePeriod,
  b2bStatsSchema,
  conversionStatsSchema,
  customersStatsSchema,
  PERIOD_PRESETS,
  PRESET_LABELS,
  pragueToday,
  resolvePreset,
  defaultPeriod,
  matchPreset,
  periodQuery,
  formatPct,
  formatEur,
  FUNNEL_SOURCES,
  FUNNEL_SOURCE_LABELS,
  DIRECT_SOURCES,
  DIRECT_SOURCE_LABELS,
} from '@/lib/admin-stats'

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

const conversionOk = {
  from: '2026-01-01',
  to: '2026-03-31',
  funnel: FUNNEL_SOURCES.map(source => ({
    source,
    inquiries: 2,
    converted: 1,
    window_open: 0,
    revenue_eur: 100,
  })),
  funnel_total: { inquiries: 18, converted: 9, window_open: 0, converting_bookings: 8, revenue_eur: 900 },
  direct: DIRECT_SOURCES.map(source => ({ source, bookings: 3, revenue_eur: 300 })),
  direct_total: { bookings: 24, revenue_eur: 2400 },
  trips_in_period: 40,
  attributed_bookings: 30,
}

const customerRow = {
  name: 'Jane',
  email: 'j@example.com',
  trips: 3,
  revenue_eur: 450,
  first_trip: '2026-01-02',
  last_trip: '2026-03-01',
}

const customersOk = {
  from: '2026-01-01',
  to: '2026-03-31',
  customers: 20,
  repeat_customers: 5,
  revenue_eur: 4000,
  repeat_revenue_eur: 1500,
  repeat_customers_all_time: 9,
  top: [customerRow],
}

describe('conversionStatsSchema / customersStatsSchema', () => {
  it('accepts valid payloads', () => {
    expect(conversionStatsSchema.safeParse(conversionOk).success).toBe(true)
    expect(customersStatsSchema.safeParse(customersOk).success).toBe(true)
  })

  it('accepts null name / email in top', () => {
    const ok = { ...customersOk, top: [{ ...customerRow, name: null, email: null }] }
    expect(customersStatsSchema.safeParse(ok).success).toBe(true)
  })

  it('rejects an unknown funnel source', () => {
    const bad = { ...conversionOk, funnel: [{ ...conversionOk.funnel[0], source: 'chat_sms' }] }
    expect(conversionStatsSchema.safeParse(bad).success).toBe(false)
  })

  it('rejects an unknown direct source', () => {
    const bad = { ...conversionOk, direct: [{ source: 'carrier_pigeon', bookings: 1, revenue_eur: 1 }] }
    expect(conversionStatsSchema.safeParse(bad).success).toBe(false)
  })

  it('rejects a top array of 11 entries', () => {
    const bad = { ...customersOk, top: Array.from({ length: 11 }, () => customerRow) }
    expect(customersStatsSchema.safeParse(bad).success).toBe(false)
    const ok10 = { ...customersOk, top: Array.from({ length: 10 }, () => customerRow) }
    expect(customersStatsSchema.safeParse(ok10).success).toBe(true)
  })
})

describe('pragueToday (Europe/Prague calendar day)', () => {
  it('rolls to the next day after Prague midnight (CET)', () => {
    expect(pragueToday(new Date('2026-10-31T23:30:00Z'))).toBe('2026-11-01')
  })
  it('rolls to the next day after Prague midnight (CEST)', () => {
    expect(pragueToday(new Date('2026-07-15T22:30:00Z'))).toBe('2026-07-16')
  })
  it('handles the DST switch night', () => {
    expect(pragueToday(new Date('2026-03-29T00:30:00Z'))).toBe('2026-03-29')
  })
})

describe('presets', () => {
  const now = new Date('2026-10-31T10:00:00Z')

  it('resolves each preset against the Prague today', () => {
    expect(resolvePreset('last_30', now)).toEqual({ from: '2026-10-02', to: '2026-10-31' })
    expect(resolvePreset('last_90', now)).toEqual({ from: '2026-08-03', to: '2026-10-31' })
    expect(resolvePreset('this_month', now)).toEqual({ from: '2026-10-01', to: '2026-10-31' })
    expect(resolvePreset('this_year', now)).toEqual({ from: '2026-01-01', to: '2026-10-31' })
    expect(resolvePreset('all_time', now)).toEqual({ from: '2000-01-01', to: '2026-10-31' })
  })

  it('crosses a month boundary for last_30', () => {
    expect(resolvePreset('last_30', new Date('2026-03-01T10:00:00Z'))).toEqual({
      from: '2026-01-31',
      to: '2026-03-01',
    })
  })

  it('defaultPeriod is last_90', () => {
    expect(defaultPeriod(now)).toEqual(resolvePreset('last_90', now))
  })

  it('matchPreset finds the preset and returns null for a custom range', () => {
    for (const preset of PERIOD_PRESETS) {
      expect(matchPreset(resolvePreset(preset, now), now)).toBe(preset)
    }
    expect(matchPreset({ from: '2026-05-01', to: '2026-05-07' }, now)).toBeNull()
  })

  it('has a label for every preset', () => {
    expect(PRESET_LABELS).toEqual({
      last_30: 'Last 30 days',
      last_90: 'Last 90 days',
      this_month: 'This month',
      this_year: 'This year',
      all_time: 'All time',
    })
  })

  it('invariant: every preset round-trips through periodQuery and parsePeriod', () => {
    const nows = [
      now,
      new Date('2026-10-31T23:30:00Z'),
      new Date('2026-03-29T00:30:00Z'),
      new Date('2026-01-01T00:10:00Z'),
      new Date('2024-02-29T12:00:00Z'),
    ]
    for (const n of nows) {
      for (const preset of PERIOD_PRESETS) {
        const period = resolvePreset(preset, n)
        expect(parsePeriod(new URLSearchParams(periodQuery(period)))).toEqual({ ok: true, period })
      }
    }
  })
})

describe('formatPct', () => {
  it('rounds to one decimal', () => {
    expect(formatPct(1, 3)).toBe('33.3%')
    expect(formatPct(2, 3)).toBe('66.7%')
    expect(formatPct(1, 8)).toBe('12.5%')
    expect(formatPct(0, 5)).toBe('0.0%')
    expect(formatPct(5, 5)).toBe('100.0%')
  })
  it('returns n/a for a zero denominator', () => {
    expect(formatPct(3, 0)).toBe('n/a')
    expect(formatPct(0, 0)).toBe('n/a')
  })
})

describe('formatEur (D-15)', () => {
  it('groups digits cs-CZ and ends with the word EUR', () => {
    expect(formatEur(1234)).toMatch(/^1\s234 EUR$/)
    expect(formatEur(0)).toBe('0 EUR')
    expect(formatEur(1234567)).toMatch(/^1\s234\s567 EUR$/)
  })
})

describe('source labels (D-05 / D-06)', () => {
  it('lists the nine funnel sources in RPC order', () => {
    expect([...FUNNEL_SOURCES]).toEqual([
      'chat_web',
      'chat_whatsapp',
      'chat_email',
      'chat_telegram',
      'chat_other',
      'form_contact',
      'form_corporate',
      'form_multiday_quote',
      'abandoned',
    ])
  })
  it('lists the eight direct sources in RPC order', () => {
    expect([...DIRECT_SOURCES]).toEqual([
      'manual_whatsapp',
      'manual_phone',
      'manual_email',
      'manual_partner',
      'manual_other',
      'manual_unknown',
      'gnet',
      'online',
    ])
  })
  it('has a label for every source', () => {
    for (const s of FUNNEL_SOURCES) expect(FUNNEL_SOURCE_LABELS[s]).toBeTruthy()
    for (const s of DIRECT_SOURCES) expect(DIRECT_SOURCE_LABELS[s]).toBeTruthy()
    expect(FUNNEL_SOURCE_LABELS.chat_web).toBe('Chat · Web widget')
    expect(FUNNEL_SOURCE_LABELS.abandoned).toBe('Abandoned checkout')
    expect(DIRECT_SOURCE_LABELS.manual_whatsapp).toBe('Manual · WhatsApp')
    expect(DIRECT_SOURCE_LABELS.online).toBe('Online · direct')
  })
})

describe('lib/admin-stats.ts is client-safe and price-rule clean', () => {
  const src = readFileSync(join(process.cwd(), 'lib/admin-stats.ts'), 'utf8')
  it('imports only zod', () => {
    const imports = [...src.matchAll(/^import .* from '([^']+)'/gm)].map(m => m[1])
    expect(imports).toEqual(['zod'])
  })
  it('contains no currency symbol literal', () => {
    expect(src).not.toContain('€')
  })
})
