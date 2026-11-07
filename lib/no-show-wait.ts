import type { createSupabaseServiceClient } from '@/lib/supabase'
import { isNearAirport } from '@/lib/airport'

/**
 * Free waiting time before a no-show (Phase 87), split out of lib/no-show.ts in Phase 89 plan 89-04 so the payment
 * emails can state the wait in the cancellation box without importing the whole no-show service (which reaches the
 * status service and would form an import cycle with the payment engine). lib/no-show.ts re-exports both functions.
 */

type ServiceClient = ReturnType<typeof createSupabaseServiceClient>

export const DEFAULT_CITY_MIN = 30
export const DEFAULT_AIRPORT_MIN = 60
const AIRPORT_ADDRESS = /airport|letiště|letiste|václav havel|\bPRG\b/i

export function isAirportPickup(b: {
  origin_lat: number | null
  origin_lng: number | null
  origin_address: string | null
}): boolean {
  if (b.origin_lat !== null && b.origin_lng !== null && isNearAirport({ lat: b.origin_lat, lng: b.origin_lng })) {
    return true
  }
  return b.origin_address ? AIRPORT_ADDRESS.test(b.origin_address) : false
}

function validMinutes(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 240 ? v : fallback
}

/** pricing_globals id 1; the defaults 30 / 60 apply on any read problem. */
export async function getNoShowThresholds(
  supabase: ServiceClient,
): Promise<{ cityMin: number; airportMin: number }> {
  try {
    const { data, error } = await supabase
      .from('pricing_globals')
      .select('noshow_wait_city_min, noshow_wait_airport_min')
      .eq('id', 1)
      .single()
    if (error || !data) return { cityMin: DEFAULT_CITY_MIN, airportMin: DEFAULT_AIRPORT_MIN }
    const row = data as { noshow_wait_city_min?: unknown; noshow_wait_airport_min?: unknown }
    return {
      cityMin: validMinutes(row.noshow_wait_city_min, DEFAULT_CITY_MIN),
      airportMin: validMinutes(row.noshow_wait_airport_min, DEFAULT_AIRPORT_MIN),
    }
  } catch {
    return { cityMin: DEFAULT_CITY_MIN, airportMin: DEFAULT_AIRPORT_MIN }
  }
}
