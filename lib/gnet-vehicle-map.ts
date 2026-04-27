import type { VehicleClass } from '@/types/booking'

/**
 * GNet vehicle type strings → Prestigo VehicleClass mapping.
 *
 * Source: placeholder per Phase 47 option-c decision.
 *   Real GRDD codes must be obtained from support@grdd.net or the GRDD partner portal
 *   BEFORE Phase 49 ships (see STATE.md Pending Todos).
 * Used by: app/api/gnet/farmin/route.ts (Phase 49)
 *
 * Unknown codes intentionally return null (not throw) so Phase 49 can
 * reject them as business failures (HTTP 200, success: false) rather
 * than 4xx — GNet retries on non-2xx.
 */
export const GNET_VEHICLE_MAP: Readonly<Record<string, VehicleClass>> = Object.freeze({
  SEDAN:     'business',
  EXECUTIVE: 'first_class',
  VAN:       'business_van',
  MINIVAN:   'business_van',
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
