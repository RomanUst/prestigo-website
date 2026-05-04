import type { VehicleClass } from '@/types/booking'

/**
 * GNet vehicle type strings → Prestigo VehicleClass mapping.
 *
 * Source: Authoritative GRDD vehicle codes confirmed from GRDD Connect dashboard
 *   (Phase 47 plan 02, Task 1 — option-a, resolved 2026-05-04).
 * Used by: app/api/gnet/farmin/route.ts (Phase 49)
 *
 * Unknown codes intentionally return null (not throw) so Phase 49 can
 * reject them as business failures (HTTP 200, success: false) rather
 * than 4xx — GNet retries on non-2xx.
 *
 * Threat mitigations:
 *   T-47-06: never throws — returns null on any unknown/malformed input
 *   T-47-08: Object.freeze() prevents runtime mutation of routing decisions
 */
export const GNET_VEHICLE_MAP: Readonly<Record<string, VehicleClass>> = Object.freeze({
  SEDAN:           'business',      // Mercedes-Benz E-Class (3 pax, 3 luggage)
  SEDAN_LUX:       'first_class',   // Mercedes-Benz S-Class (3 pax, 3 luggage)
  VAN_MINI_LUXURY: 'business_van',  // Mercedes-Benz V-Class (6 pax, 6 luggage)
})

/**
 * Maps a GNet vehicle type string to a Prestigo VehicleClass.
 * Case-insensitive. Returns null for unknown codes — never throws.
 */
export function mapGnetVehicle(gnetVehicleType: string): VehicleClass | null {
  if (!gnetVehicleType) return null
  const key = gnetVehicleType.toUpperCase()
  return GNET_VEHICLE_MAP[key] ?? null
}
