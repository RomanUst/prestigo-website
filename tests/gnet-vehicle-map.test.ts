import { describe, it, expect } from 'vitest'
import { mapGnetVehicle, GNET_VEHICLE_MAP } from '@/lib/gnet-vehicle-map'

describe('CLIENT-03: mapGnetVehicle', () => {
  it('maps each known GNet vehicle code to expected VehicleClass', () => {
    expect(mapGnetVehicle('SEDAN')).toBe('business')
    expect(mapGnetVehicle('EXECUTIVE')).toBe('first_class')
    expect(mapGnetVehicle('VAN')).toBe('business_van')
    expect(mapGnetVehicle('MINIVAN')).toBe('business_van')
  })

  it('returns null for unknown codes (never throws)', () => {
    expect(mapGnetVehicle('UNKNOWN_CODE')).toBeNull()
    expect(mapGnetVehicle('')).toBeNull()
    expect(mapGnetVehicle('HELICOPTER')).toBeNull()
    expect(mapGnetVehicle('BICYCLE')).toBeNull()
  })

  it('is case-insensitive', () => {
    expect(mapGnetVehicle('sedan')).toBe('business')
    expect(mapGnetVehicle('Sedan')).toBe('business')
    expect(mapGnetVehicle('SEDAN')).toBe('business')
  })

  it('exports GNET_VEHICLE_MAP as frozen object', () => {
    expect(Object.isFrozen(GNET_VEHICLE_MAP)).toBe(true)
  })
})
