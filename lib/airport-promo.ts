// Phase 45: Airport promo price helper.
// Computes the effective price per vehicle class taking into account
// whether the airport promo is currently active.
// NEVER put € + number literals in app/** or components/**.

import type { PricingGlobals } from '@/lib/pricing-config'

type VehicleClass = 'business' | 'first_class' | 'business_van'

/**
 * Returns the effective airport price for the given vehicle class.
 *
 * - business   → airportPromoPriceEur (when promo active) or airportRegularPriceEur
 * - first_class → sClassPrice (always fixed, no promo)
 * - business_van → vClassPrice (always fixed, no promo)
 */
export function getEffectiveAirportPrice(
  vehicleClass: VehicleClass,
  config: PricingGlobals,
  sClassPrice: number,
  vClassPrice: number,
): number {
  if (vehicleClass === 'first_class') return sClassPrice
  if (vehicleClass === 'business_van') return vClassPrice
  // business tier
  return config.airportPromoActive
    ? config.airportPromoPriceEur
    : config.airportRegularPriceEur
}
