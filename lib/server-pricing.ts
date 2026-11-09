import { buildPriceMap } from '@/lib/pricing'
import { eurToCzk } from '@/lib/currency'
import type { PricingRates, PricingGlobals } from '@/lib/pricing-config'
import type { VehicleClass } from '@/types/booking'

// Re-export the rates type under the name Plan 02 imports by.
// `PricingRates` (from pricing-config) is the canonical shape used throughout
// the server; we expose it here as `PricingConfig` to match the Phase 26 plan's
// interface contract. Both names refer to the exact same object.
export type PricingConfig = PricingRates

export type PriceBreakdownMap = Record<
  string,
  { base: number; extras: number; total: number; currency: string }
>

// -----------------------------------------------------------------------
// Extracted verbatim from prestigo/app/api/calculate-price/route.ts lines 33-37
// Night window: hour >= 22 OR hour < 6 (so 22:00, 23:59, 00:00, 05:59 all night;
// 06:00 and 21:59 are daytime). Behavior MUST remain identical — do not touch.
// -----------------------------------------------------------------------
export function isNightTime(time: string | null): boolean {
  if (!time) return false
  const hour = parseInt(time.split(':')[0], 10)
  return hour >= 22 || hour < 6
}

// -----------------------------------------------------------------------
// Extracted verbatim from prestigo/app/api/calculate-price/route.ts lines 27-31
// -----------------------------------------------------------------------
export function isHolidayDate(date: string | null, holidayDates: string[]): boolean {
  if (!date || holidayDates.length === 0) return false
  const dateSet = new Set(holidayDates)
  return dateSet.has(date)
}

// -----------------------------------------------------------------------
// Extracted verbatim from prestigo/app/api/calculate-price/route.ts lines 53-71
// Night takes precedence over holiday — explicit business rule. DO NOT reorder.
// Math.round on coefficient FIRST, airport fee added AFTER, minFare clamp LAST.
// -----------------------------------------------------------------------
export function applyGlobals(
  prices: PriceBreakdownMap,
  globals: PricingGlobals,
  isAirport: boolean,
  isNight: boolean,
  isHoliday: boolean,
  minFare: Record<string, number>,
): PriceBreakdownMap {
  const coefficient = isNight
    ? globals.nightCoefficient
    : isHoliday
      ? globals.holidayCoefficient
      : 1.0
  return Object.fromEntries(
    Object.entries(prices).map(([vc, breakdown]) => {
      let adjustedBase = Math.round(breakdown.base * coefficient)
      if (isAirport) adjustedBase += globals.airportFee
      adjustedBase = Math.max(adjustedBase, minFare[vc] ?? 0)
      return [vc, { ...breakdown, base: adjustedBase, total: adjustedBase }]
    }),
  )
}

/**
 * Outbound leg total BEFORE extras, BEFORE promo.
 *
 * Returns the adjusted single-vehicle-class total (post-coefficient,
 * post-airport-fee, post-minFare) as a plain number.
 *
 * - For `transfer`: pass `distanceKm` (hours/days ignored).
 * - For `hourly`:   pass `hours`      (distance/days ignored).
 * - For `daily`:    pass `days`       (distance/hours ignored).
 *
 * Coefficient is computed from `pickupDate` + `pickupTime`. Night takes
 * precedence over holiday, matching the Phase 25 business rule.
 */
export function computeOutboundLegTotal(
  vehicleClass: VehicleClass,
  distanceKm: number | null,
  hours: number,
  days: number,
  tripType: 'transfer' | 'hourly' | 'daily',
  pickupDate: string | null,
  pickupTime: string | null,
  isAirport: boolean,
  rates: PricingConfig,
): number {
  const priceMap = buildPriceMap(tripType, distanceKm, hours, days, rates)
  const adjusted = applyGlobals(
    priceMap,
    rates.globals,
    isAirport,
    isNightTime(pickupTime),
    isHolidayDate(pickupDate, rates.globals.holidayDates),
    rates.minFare,
  )
  return adjusted[vehicleClass].total
}

/**
 * Return leg total AFTER coefficient + discount — ALWAYS extras=0 (RTPR-03).
 *
 * Uses SYMMETRIC distance (same `distanceKm` as outbound — no second Google
 * Routes call, per RTPR-01). Coefficient is computed from `returnDate` +
 * `returnTime` INDEPENDENTLY of the outbound pickup (RTPR-01).
 *
 * Discount is applied to the POST-applyGlobals adjusted base — this must
 * match the Phase 25 formula in `calculate-price/route.ts` line 199
 * byte-for-byte so that `/api/calculate-price` and `/api/create-payment-intent`
 * agree on the return-leg amount.
 */
export function computeReturnLegTotal(
  vehicleClass: VehicleClass,
  distanceKm: number,
  returnDate: string,
  returnTime: string,
  isAirport: boolean,
  rates: PricingConfig,
): number {
  const returnBase = buildPriceMap('transfer', distanceKm, 0, 0, rates)
  const returnAdjusted = applyGlobals(
    returnBase,
    rates.globals,
    isAirport,
    isNightTime(returnTime),
    isHolidayDate(returnDate, rates.globals.holidayDates),
    rates.minFare,
  )
  const discountPct = rates.globals.returnDiscountPercent
  // Discount on post-applyGlobals adjusted base (matches calculate-price line 199 exactly)
  return Math.round(returnAdjusted[vehicleClass].base * (1 - discountPct / 100))
}

/**
 * Combined-total orchestrator used by `/api/create-payment-intent`.
 *
 * - Applies promo ONCE on `(outbound + extras + return)` — NEVER per leg
 *   (T-26-03 / RTPR-04 regression guard).
 * - Rounds ONCE for the promo step.
 * - Clamps to minimum 1 EUR (100 cents) for Stripe minimum-amount compliance.
 * - Returns Stripe smallest-unit amount (cents for EUR, hellers for CZK —
 *   both 2-decimal currencies on Stripe).
 *
 * Returns:
 * - `finalTotalEur`           — post-promo, clamped EUR amount
 * - `finalTotalCzk`           — post-promo CZK amount (via `eurToCzk`)
 * - `combinedBeforePromoEur`  — pre-promo sum of the three legs/extras
 * - `stripeAmountMinor`       — smallest unit for the chosen currency
 * - `appliedPromoPct`         — echo of the input `promoPct`
 */
export function computeCombinedTotalMinor(args: {
  outboundLegEur: number
  extrasEur: number
  returnLegEur: number
  promoPct: number // 0 if no promo
  currency: 'eur' | 'czk'
}): {
  finalTotalEur: number
  finalTotalCzk: number
  combinedBeforePromoEur: number
  stripeAmountMinor: number
  appliedPromoPct: number
} {
  const combinedBeforePromoEur =
    args.outboundLegEur + args.extrasEur + args.returnLegEur
  let finalTotalEur = combinedBeforePromoEur
  if (args.promoPct > 0) {
    finalTotalEur = Math.round(combinedBeforePromoEur * (1 - args.promoPct / 100))
  }
  if (finalTotalEur <= 0) finalTotalEur = 1 // Stripe minimum — 1 EUR floor
  const finalTotalCzk = eurToCzk(finalTotalEur)
  const stripeAmountMinor =
    args.currency === 'eur'
      ? Math.round(finalTotalEur * 100)
      : Math.round(finalTotalCzk * 100)
  return {
    finalTotalEur,
    finalTotalCzk,
    combinedBeforePromoEur,
    stripeAmountMinor,
    appliedPromoPct: args.promoPct,
  }
}
