import { describe, it, expect } from 'vitest'
import { mapGnetVehicle, GNET_VEHICLE_MAP } from '@/lib/gnet-vehicle-map'

describe('CLIENT-03: mapGnetVehicle', () => {
  it('maps each known GNet vehicle code to expected VehicleClass', () => {
    // Authoritative GRDD codes confirmed from GRDD Connect dashboard (Phase 47 decision option-a)
    expect(mapGnetVehicle('SEDAN')).toBe('business')           // Mercedes-Benz E-Class
    expect(mapGnetVehicle('SEDAN_LUX')).toBe('first_class')    // Mercedes-Benz S-Class
    expect(mapGnetVehicle('VAN_MINI_LUXURY')).toBe('business_van') // Mercedes-Benz V-Class
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
    expect(mapGnetVehicle('sedan_lux')).toBe('first_class')
    expect(mapGnetVehicle('van_mini_luxury')).toBe('business_van')
  })

  it('exports GNET_VEHICLE_MAP as frozen object', () => {
    expect(Object.isFrozen(GNET_VEHICLE_MAP)).toBe(true)
  })

  it('GNET_VEHICLE_MAP contains exactly the 3 authoritative GRDD codes (no extra placeholder entries)', () => {
    // Only the 3 real codes confirmed from GRDD dashboard should be present
    const keys = Object.keys(GNET_VEHICLE_MAP)
    expect(keys).toHaveLength(3)
    expect(keys).toContain('SEDAN')
    expect(keys).toContain('SEDAN_LUX')
    expect(keys).toContain('VAN_MINI_LUXURY')
  })
})
