// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { driverChatIdentifier, isDriverChatIdentifier } from '@/lib/driver-help-contract'

const DRIVER_UUID = 'a0000002-0000-4000-8000-000000000002'

describe('driver chat identifier', () => {
  it('driverChatIdentifier prefixes and lower-cases the uuid', () => {
    expect(driverChatIdentifier('A0000002-0000-4000-8000-000000000002')).toBe(`driver:${DRIVER_UUID}`)
  })

  it('driverChatIdentifier throws on a non-uuid input', () => {
    expect(() => driverChatIdentifier('not-a-uuid')).toThrow()
    expect(() => driverChatIdentifier('')).toThrow()
  })

  it('isDriverChatIdentifier accepts driver: + uuid only', () => {
    expect(isDriverChatIdentifier(`driver:${DRIVER_UUID}`)).toBe(true)
    expect(isDriverChatIdentifier(DRIVER_UUID)).toBe(false)
    expect(isDriverChatIdentifier('driver:')).toBe(false)
    expect(isDriverChatIdentifier('driver:not-a-uuid')).toBe(false)
    expect(isDriverChatIdentifier(`Driver:${DRIVER_UUID}`)).toBe(false)
    expect(isDriverChatIdentifier(null)).toBe(false)
    expect(isDriverChatIdentifier(42)).toBe(false)
  })
})
