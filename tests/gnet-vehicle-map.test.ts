import { describe, it, expect } from 'vitest'
import { mapGnetVehicle, GNET_VEHICLE_MAP } from '@/lib/gnet-vehicle-map'

describe('CLIENT-03: mapGnetVehicle', () => {
  it('maps luxury codes to first_class', () => {
    expect(mapGnetVehicle('SEDAN_LUX')).toBe('first_class')
    expect(mapGnetVehicle('SUV_LUX')).toBe('first_class')
  })

  it('maps business sedan/SUV codes to business', () => {
    expect(mapGnetVehicle('SEDAN')).toBe('business')
    expect(mapGnetVehicle('SEDAN_CORP')).toBe('business')
    expect(mapGnetVehicle('SEDAN_HYBRID')).toBe('business')
    expect(mapGnetVehicle('SUV')).toBe('business')
    expect(mapGnetVehicle('SUV_CORP')).toBe('business')
  })

  it('maps van codes to business_van', () => {
    expect(mapGnetVehicle('VAN_CORP')).toBe('business_van')
    expect(mapGnetVehicle('SPRINTER')).toBe('business_van')
    expect(mapGnetVehicle('VAN_MINI')).toBe('business_van')
    expect(mapGnetVehicle('VAN_MINI_LUXURY')).toBe('business_van')
  })

  it('returns null for unknown codes (never throws)', () => {
    expect(mapGnetVehicle('UNKNOWN_CODE')).toBeNull()
    expect(mapGnetVehicle('')).toBeNull()
    expect(mapGnetVehicle('EXECUTIVE')).toBeNull()
    expect(mapGnetVehicle('HELICOPTER')).toBeNull()
  })

  it('is case-insensitive', () => {
    expect(mapGnetVehicle('sedan_lux')).toBe('first_class')
    expect(mapGnetVehicle('Van_Corp')).toBe('business_van')
    expect(mapGnetVehicle('SPRINTER')).toBe('business_van')
  })

  it('exports GNET_VEHICLE_MAP as frozen object', () => {
    expect(Object.isFrozen(GNET_VEHICLE_MAP)).toBe(true)
  })
})
