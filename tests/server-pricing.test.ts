import { describe, it, expect } from 'vitest'
import {
  isNightTime,
  isHolidayDate,
  applyGlobals,
  computeOutboundLegTotal,
  computeReturnLegTotal,
  computeCombinedTotalMinor,
  type PricingConfig,
  type PriceBreakdownMap,
} from '@/lib/server-pricing'

// -----------------------------------------------------------------------
// Fixture mirroring the DEFAULT_PRICING shape from
// tests/create-payment-intent.test.ts so the unit tests here and the
// integration tests in Plan 02 share a single mental model of the rate table.
// holidayDates=['2026-12-25'] enables the holiday-coefficient path.
// -----------------------------------------------------------------------
const FIXTURE_RATES: PricingConfig = {
  ratePerKm: { business: 2.5, first_class: 3.5, business_van: 3.0 },
  hourlyRate: { business: 20, first_class: 30, business_van: 25 },
  dailyRate: { business: 150, first_class: 250, business_van: 200 },
  minFare: { business: 30, first_class: 50, business_van: 40 },
  globals: {
    airportFee: 10,
    nightCoefficient: 1.3,
    holidayCoefficient: 1.2,
    holidayDates: ['2026-12-25'],
    returnDiscountPercent: 10,
    extraChildSeat: 10,
    extraLuggage: 5,
    hourlyMinHours: 2,
    hourlyMaxHours: 8,
    notificationFlags: null,
  },
}

function makeBreakdownMap(bases: Record<string, number>): PriceBreakdownMap {
  return Object.fromEntries(
    Object.entries(bases).map(([vc, base]) => [
      vc,
      { base, extras: 0, total: base, currency: 'EUR' },
    ]),
  )
}

describe('lib/server-pricing', () => {
  // ----- Test 1: isNightTime boundary behavior ------------------------
  describe('isNightTime', () => {
    it('22:00 → true (night starts inclusive)', () => {
      expect(isNightTime('22:00')).toBe(true)
    })
    it('05:59 → true (night ends exclusive of 06:00)', () => {
      expect(isNightTime('05:59')).toBe(true)
    })
    it('06:00 → false (daytime starts inclusive)', () => {
      expect(isNightTime('06:00')).toBe(false)
    })
    it('21:59 → false (daytime ends just before 22:00)', () => {
      expect(isNightTime('21:59')).toBe(false)
    })
    it('null → false', () => {
      expect(isNightTime(null)).toBe(false)
    })
  })

  // ----- Test 2: isHolidayDate membership -----------------------------
  describe('isHolidayDate', () => {
    it('matches exact ISO date', () => {
      expect(isHolidayDate('2026-12-25', ['2026-12-25'])).toBe(true)
    })
    it('returns false for non-matching date', () => {
      expect(isHolidayDate('2026-12-24', ['2026-12-25'])).toBe(false)
    })
    it('null date → false', () => {
      expect(isHolidayDate(null, ['2026-12-25'])).toBe(false)
    })
    it('empty holiday list → false', () => {
      expect(isHolidayDate('2026-12-25', [])).toBe(false)
    })
  })

  // ----- Tests 3-5: applyGlobals coefficient + airport + minFare ------
  describe('applyGlobals', () => {
    it('Test 3: night precedence — isNight=true isHoliday=true uses nightCoefficient (1.3), not holidayCoefficient (1.2)', () => {
      const base = makeBreakdownMap({ business: 100 })
      const result = applyGlobals(
        base,
        FIXTURE_RATES.globals,
        false,
        true,
        true,
        FIXTURE_RATES.minFare,
      )
      // 100 * 1.3 = 130 (night), NOT 100 * 1.2 = 120 (holiday)
      expect(result.business.base).toBe(130)
      expect(result.business.total).toBe(130)
    })

    it('Test 4: airport fee added AFTER coefficient multiplication', () => {
      const base = makeBreakdownMap({ business: 100 })
      const result = applyGlobals(
        base,
        FIXTURE_RATES.globals,
        true, // isAirport
        true, // isNight → coefficient 1.3
        false,
        FIXTURE_RATES.minFare,
      )
      // 100 * 1.3 = 130, + airportFee(10) = 140
      expect(result.business.base).toBe(140)
    })

    it('Test 5: base below minFare is clamped up', () => {
      const base = makeBreakdownMap({ business: 10 })
      const result = applyGlobals(
        base,
        FIXTURE_RATES.globals,
        false,
        false,
        false,
        FIXTURE_RATES.minFare,
      )
      // 10 * 1.0 = 10, clamped to minFare.business = 30
      expect(result.business.base).toBe(30)
      expect(result.business.total).toBe(30)
    })

    it('no coefficient, no airport, above minFare → unchanged', () => {
      const base = makeBreakdownMap({ business: 100 })
      const result = applyGlobals(
        base,
        FIXTURE_RATES.globals,
        false,
        false,
        false,
        FIXTURE_RATES.minFare,
      )
      expect(result.business.base).toBe(100)
    })
  })

  // ----- Test 6: computeOutboundLegTotal deterministic result ---------
  describe('computeOutboundLegTotal', () => {
    it('Test 6: 10km business transfer, daytime, no holiday → ratePerKm * distance', () => {
      const total = computeOutboundLegTotal(
        'business',
        10,
        0,
        0,
        'transfer',
        '2026-06-01',
        '10:00',
        false,
        FIXTURE_RATES,
      )
      // buildPriceMap transfer: Math.round(10 * 2.5) = 25
      // applyGlobals coefficient 1.0 (not night, not holiday) → 25
      // not airport → no fee; minFare.business = 30 → clamped to 30
      expect(total).toBe(30)
    })

    it('10km business at night adds coefficient', () => {
      const total = computeOutboundLegTotal(
        'business',
        10,
        0,
        0,
        'transfer',
        '2026-06-01',
        '23:30',
        false,
        FIXTURE_RATES,
      )
      // base 25 * 1.3 = 32.5 → round 33; above minFare 30 → 33
      expect(total).toBe(33)
    })

    it('10km business first_class airport daytime → adds airportFee', () => {
      const total = computeOutboundLegTotal(
        'first_class',
        10,
        0,
        0,
        'transfer',
        '2026-06-01',
        '10:00',
        true,
        FIXTURE_RATES,
      )
      // 10 * 3.5 = 35; coeff 1.0 = 35; + airportFee(10) = 45; minFare first_class 50 → 50
      expect(total).toBe(50)
    })
  })

  // ----- Tests 7-9: computeReturnLegTotal ------------------------------
  describe('computeReturnLegTotal', () => {
    it('Test 7: night returnTime applies nightCoefficient then discount; > day result', () => {
      const dayTotal = computeReturnLegTotal(
        'business',
        10,
        '2026-06-05',
        '10:00',
        false,
        FIXTURE_RATES,
      )
      const nightTotal = computeReturnLegTotal(
        'business',
        10,
        '2026-06-05',
        '23:30',
        false,
        FIXTURE_RATES,
      )
      // Day: base=25 clamped to minFare 30 → discounted Math.round(30*0.9)=27
      // Night: base=25*1.3=33 (above minFare) → discounted Math.round(33*0.9)=30
      expect(dayTotal).toBe(27)
      expect(nightTotal).toBe(30)
      expect(nightTotal).toBeGreaterThan(dayTotal)
    })

    it('Test 8: return-leg helper returns a number (extras=0 is implicit — RTPR-03)', () => {
      const total = computeReturnLegTotal(
        'business',
        10,
        '2026-06-05',
        '10:00',
        false,
        FIXTURE_RATES,
      )
      // The helper returns a plain number — there is no extras field in the
      // return value, which encodes "return leg carries no extras" structurally.
      expect(typeof total).toBe('number')
      expect(total).toBeGreaterThan(0)
    })

    it('Test 9: coefficient uses returnTime, NOT outbound pickupTime', () => {
      // We can only pass returnTime to computeReturnLegTotal — proving the
      // function never sees pickupTime. Sanity check: a daytime returnTime
      // produces a NON-night result regardless of how night the outbound was.
      const dayReturn = computeReturnLegTotal(
        'business',
        10,
        '2026-06-05',
        '10:00',
        false,
        FIXTURE_RATES,
      )
      // Day coefficient → 25 clamped to 30 → discounted 27
      expect(dayReturn).toBe(27)
    })

    it('holiday returnDate applies holiday coefficient when daytime', () => {
      const holidayTotal = computeReturnLegTotal(
        'business',
        10,
        '2026-12-25',
        '14:00',
        false,
        FIXTURE_RATES,
      )
      // 25 * 1.2 = 30 (tied to minFare); discounted Math.round(30*0.9)=27
      expect(holidayTotal).toBe(27)
    })
  })

  // ----- Tests 10-14: computeCombinedTotalMinor (T-26-03 guard) -------
  describe('computeCombinedTotalMinor promo-once-on-combined (T-26-03 regression)', () => {
    it('Test 10: applies promo to combined, not per leg', () => {
      const result = computeCombinedTotalMinor({
        outboundLegEur: 150,
        extrasEur: 10,
        returnLegEur: 135,
        promoPct: 15,
        currency: 'eur',
      })
      // Combined: 295 * 0.85 = 250.75 → Math.round = 251
      expect(result.combinedBeforePromoEur).toBe(295)
      expect(result.finalTotalEur).toBe(251)
      expect(result.stripeAmountMinor).toBe(25100)
      expect(result.appliedPromoPct).toBe(15)
    })

    it('Test 11: per-leg-round anti-pattern produces a DIFFERENT number', () => {
      const result = computeCombinedTotalMinor({
        outboundLegEur: 150,
        extrasEur: 10,
        returnLegEur: 135,
        promoPct: 15,
        currency: 'eur',
      })
      // Anti-pattern: round each leg * 0.85 separately, then sum
      //   round(150*0.85)=128, round(10*0.85)=9, round(135*0.85)=115
      //   → 128+9+115 = 252
      // Correct (combined then round): round(295*0.85) = 251
      const perLegAnti =
        Math.round(150 * 0.85) + Math.round(10 * 0.85) + Math.round(135 * 0.85)
      expect(perLegAnti).toBe(252)
      expect(result.finalTotalEur).toBe(251)
      expect(perLegAnti).not.toBe(result.finalTotalEur)
    })

    it('Test 12: promoPct=0 returns sum unchanged with no rounding drift', () => {
      const result = computeCombinedTotalMinor({
        outboundLegEur: 150,
        extrasEur: 10,
        returnLegEur: 135,
        promoPct: 0,
        currency: 'eur',
      })
      expect(result.finalTotalEur).toBe(295)
      expect(result.combinedBeforePromoEur).toBe(295)
      expect(result.stripeAmountMinor).toBe(29500)
    })

    it('Test 13: clamps final total to 1 EUR minimum', () => {
      const result = computeCombinedTotalMinor({
        outboundLegEur: 1,
        extrasEur: 0,
        returnLegEur: 0,
        promoPct: 99,
        currency: 'eur',
      })
      // 1 * 0.01 = 0.01 → round = 0 → clamped to 1
      expect(result.finalTotalEur).toBeGreaterThanOrEqual(1)
      expect(result.finalTotalEur).toBe(1)
      expect(result.stripeAmountMinor).toBe(100)
    })

    it('Test 14: czk currency returns eurToCzk * 100 hellers (EUR_TO_CZK_RATE=25)', () => {
      const result = computeCombinedTotalMinor({
        outboundLegEur: 100,
        extrasEur: 0,
        returnLegEur: 0,
        promoPct: 0,
        currency: 'czk',
      })
      // 100 EUR * 25 = 2500 CZK → 250_000 hellers
      expect(result.finalTotalCzk).toBe(2500)
      expect(result.stripeAmountMinor).toBe(250000)
    })
  })
})
