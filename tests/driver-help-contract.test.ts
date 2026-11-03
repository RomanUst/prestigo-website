// @vitest-environment node
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import {
  DRIVER_HELP_CONTEXT_KEYS,
  DRIVER_HELP_PAGE_PATH,
  DRIVER_HELP_STORAGE_KEY,
  driverChatIdentifier,
  driverHelpConfigPath,
  isDriverChatIdentifier,
  loadDriverHelpConfig,
  openDriverHelpPage,
  parseDriverHelpConfig,
  saveDriverHelpConfig,
} from '@/lib/driver-help-contract'

const DRIVER_UUID = 'a0000002-0000-4000-8000-000000000002'
const TRIP_TOKEN = 'a0000004-0000-4000-8000-000000000004'

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

describe('driver help paths and keys', () => {
  it('builds the config route path from the trip token', () => {
    expect(driverHelpConfigPath(TRIP_TOKEN)).toBe(`/api/driver/trip/${TRIP_TOKEN}/help`)
    expect(driverHelpConfigPath('a/b')).toBe('/api/driver/trip/a%2Fb/help')
  })

  it('the help page path is tokenless', () => {
    expect(DRIVER_HELP_PAGE_PATH).toBe('/driver/trip/help')
    expect(DRIVER_HELP_PAGE_PATH).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/i)
  })

  it('exposes the storage key and the conversation attribute keys', () => {
    expect(DRIVER_HELP_STORAGE_KEY).toBe('prestigo_driver_help')
    expect([...DRIVER_HELP_CONTEXT_KEYS]).toEqual(['chat_role', 'driver_trip_ref'])
  })
})

function validConfig(): Record<string, unknown> {
  return {
    enabled: true,
    baseUrl: 'https://chat.example.com',
    websiteToken: 'site-token-123',
    user: {
      identifier: `driver:${DRIVER_UUID}`,
      identifierHash: 'a'.repeat(64),
      name: 'Pavel Driver',
      email: null,
      phone: null,
    },
    conversation: { chat_role: 'driver', driver_trip_ref: 'PR-2026-0042' },
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mutate(fn: (c: Record<string, any>) => void): unknown {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = validConfig() as Record<string, any>
  fn(c)
  return c
}

describe('parseDriverHelpConfig', () => {
  it('accepts a valid enabled config and rebuilds it from the checked fields only', () => {
    const input = { ...validConfig(), extra: 'x', user: { ...(validConfig().user as object), role: 'admin' } }
    expect(parseDriverHelpConfig(input)).toEqual(validConfig())
  })

  it.each([
    ['not an object', null],
    ['enabled false', { enabled: false }],
    ['enabled missing', mutate((c) => delete c.enabled)],
    ['http base url', mutate((c) => (c.baseUrl = 'http://chat.example.com'))],
    ['base url with a path', mutate((c) => (c.baseUrl = 'https://chat.example.com/x'))],
    ['empty website token', mutate((c) => (c.websiteToken = ''))],
    ['over-long website token', mutate((c) => (c.websiteToken = 'x'.repeat(201)))],
    ['customer identifier', mutate((c) => (c.user.identifier = DRIVER_UUID))],
    ['short hash', mutate((c) => (c.user.identifierHash = 'a'.repeat(63)))],
    ['non-hex hash', mutate((c) => (c.user.identifierHash = 'z'.repeat(64)))],
    ['empty name', mutate((c) => (c.user.name = ''))],
    ['over-long name', mutate((c) => (c.user.name = 'n'.repeat(121)))],
    ['email set', mutate((c) => (c.user.email = 'a@x.example'))],
    ['phone set', mutate((c) => (c.user.phone = '+420777900001'))],
    ['other chat role', mutate((c) => (c.conversation.chat_role = 'visitor'))],
    ['empty trip ref', mutate((c) => (c.conversation.driver_trip_ref = ''))],
    ['over-long trip ref', mutate((c) => (c.conversation.driver_trip_ref = 'r'.repeat(61)))],
    ['control character in trip ref', mutate((c) => (c.conversation.driver_trip_ref = 'PR-1\n2'))],
    ['user missing', mutate((c) => delete c.user)],
    ['conversation missing', mutate((c) => delete c.conversation)],
  ])('rejects %s', (_label, value) => {
    expect(parseDriverHelpConfig(value)).toBeNull()
  })
})

describe('sessionStorage helpers', () => {
  let store: Map<string, string>
  let setItem: ReturnType<typeof vi.fn>
  let assign: ReturnType<typeof vi.fn>

  beforeEach(() => {
    store = new Map()
    setItem = vi.fn((k: string, v: string) => void store.set(k, v))
    assign = vi.fn()
    vi.stubGlobal('window', {
      sessionStorage: {
        setItem,
        getItem: (k: string) => store.get(k) ?? null,
      },
      location: { assign },
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('save writes valid JSON under the storage key and returns true', () => {
    expect(saveDriverHelpConfig(validConfig())).toBe(true)
    expect(JSON.parse(store.get('prestigo_driver_help')!)).toEqual(validConfig())
  })

  it('save of an invalid config writes nothing and returns false', () => {
    expect(saveDriverHelpConfig({ enabled: false })).toBe(false)
    expect(setItem).not.toHaveBeenCalled()
  })

  it('save returns false when sessionStorage throws', () => {
    setItem.mockImplementation(() => {
      throw new Error('quota')
    })
    expect(saveDriverHelpConfig(validConfig())).toBe(false)
  })

  it('load returns the parsed config for stored valid JSON', () => {
    store.set('prestigo_driver_help', JSON.stringify(validConfig()))
    expect(loadDriverHelpConfig()).toEqual(validConfig())
  })

  it('load returns null for missing, malformed or invalid content', () => {
    expect(loadDriverHelpConfig()).toBeNull()
    store.set('prestigo_driver_help', '{not json')
    expect(loadDriverHelpConfig()).toBeNull()
    store.set('prestigo_driver_help', JSON.stringify({ enabled: false }))
    expect(loadDriverHelpConfig()).toBeNull()
  })

  it('openDriverHelpPage hard-navigates to the tokenless help page', () => {
    openDriverHelpPage()
    expect(assign).toHaveBeenCalledWith('/driver/trip/help')
  })
})
