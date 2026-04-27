import type { VehicleClass } from '@/types/booking'

export const GNET_VEHICLE_MAP: Readonly<Record<string, VehicleClass>> = Object.freeze({})

export function mapGnetVehicle(_gnetVehicleType: string): VehicleClass | null {
  throw new Error('NotImplemented — Wave 0 stub, see Task 3')
}
