// Phase 44: airport-promo helper (D-14, PRICE-07).
// Pure function — no DB calls. Caller provides PricingGlobals (already loaded via
// getPricingConfig()) plus S-Class and V-Class airport prices (sourced from
// pricing_config by caller — see D-08: S stays €120, V stays €76).

import type { PricingGlobals } from '@/lib/pricing-config'

/**
 * Returns the effective airport price for a vehicle class.
 *
 * - 'business'     → promo price when config.airportPromoActive, otherwise regular
 * - 'first_class'  → sClassPrice (fixed; no promo mechanism per D-08)
 * - 'business_van' → vClassPrice (fixed; no promo mechanism per D-08)
 * - other          → 0
 */
export function getEffectiveAirportPrice(
  vehicleClass: string,
  config: PricingGlobals,
  sClassPrice: number,
  vClassPrice: number,
): number {
  if (vehicleClass === 'business') {
    return config.airportPromoActive
      ? config.airportPromoPriceEur
      : config.airportRegularPriceEur
  }
  if (vehicleClass === 'first_class') return sClassPrice
  if (vehicleClass === 'business_van') return vClassPrice
  return 0
}
