// Phase 93 (plan 93-21; D-01, D-21): the one-off formula behind the INITIAL tour prices the owner reviews.
// Reproduces today's tariff once: the route fare of the way there plus the discounted return leg
// (the formula of lib/server-pricing.ts computeReturnLegTotal: Math.round(base x (1 - discount / 100))).
// After the seed the stored price is edited by hand and no formula drives it (D-01).
// Pure, for scripts only: never import this module from app/, components/ or lib/ (tests/tour-seed.test.ts guards it).

export interface ClassPrices {
  e: number
  s: number
  v: number
}

export interface TourPriceProposal extends ClassPrices {
  /** 'route': from the route fare; 'estimate': from distance x rate per km (flag it for the owner). */
  basis: 'route' | 'estimate'
}

const CLASSES = ['e', 's', 'v'] as const

function roundTrip(oneWay: number, discountPct: number): number {
  return oneWay + Math.round(oneWay * (1 - discountPct / 100))
}

/**
 * Initial price of a tour per car class, in whole EUR.
 * With the fares of the matching route the first leg is that fare; without them it is estimated from the
 * one-way distance and the per-km rate of the class. The way back is the discounted return leg in both cases.
 */
export function proposeTourPrices(input: {
  routeFares: ClassPrices | null
  returnDiscountPct: number
  ratePerKm: ClassPrices
  distanceKm: number
}): TourPriceProposal {
  const { routeFares, returnDiscountPct, ratePerKm, distanceKm } = input
  if (!Number.isFinite(returnDiscountPct) || returnDiscountPct < 0 || returnDiscountPct > 100) {
    throw new Error('return discount must be between 0 and 100')
  }
  const out: ClassPrices = { e: 0, s: 0, v: 0 }
  if (routeFares) {
    for (const c of CLASSES) {
      if (!(routeFares[c] > 0)) throw new Error(`route fare for class ${c} must be positive`)
      out[c] = roundTrip(routeFares[c], returnDiscountPct)
    }
    return { ...out, basis: 'route' }
  }
  if (!(distanceKm > 0)) throw new Error('distance must be positive')
  for (const c of CLASSES) {
    if (!(ratePerKm[c] > 0)) throw new Error(`rate per km for class ${c} must be positive`)
    out[c] = roundTrip(Math.round(distanceKm * ratePerKm[c]), returnDiscountPct)
  }
  return { ...out, basis: 'estimate' }
}

/** The extra-hour price per class is today's hourly rate of the class (D-02). */
export function proposeExtraHourPrices(hourlyRate: ClassPrices): ClassPrices {
  for (const c of CLASSES) {
    if (!(hourlyRate[c] > 0)) throw new Error(`hourly rate for class ${c} must be positive`)
  }
  return { e: hourlyRate.e, s: hourlyRate.s, v: hourlyRate.v }
}
