import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createHmac } from 'node:crypto'

// ── vi.hoisted stubs (must be declared before vi.mock factories) ───────────

const { mockGetUser, mockMaybeSingle, mockEq, mockSelect, mockFrom } = vi.hoisted(() => {
  const maybeSingle = vi.fn()
  const eq = vi.fn(() => ({ maybeSingle }))
  const select = vi.fn(() => ({ eq }))
  const from = vi.fn(() => ({ select }))
  return {
    mockGetUser: vi.fn(),
    mockMaybeSingle: maybeSingle,
    mockEq: eq,
    mockSelect: select,
    mockFrom: from,
  }
})

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  }),
}))

// ── Import after mocks are set up ───────────────────────────────────────────

import { GET } from '@/app/api/chatwoot/identity/route'
import { computeIdentifierHash } from '@/lib/chatwoot-identity'
import { isSafeWidgetBaseUrl } from '@/lib/chat-widget-contract'

const BASE_URL = 'https://chat.rideprestigo.com'
const WEBSITE_TOKEN = 'test-website-token'
const HMAC_SECRET = 'test-hmac-secret'

const SIGNED_IN_USER = {
  id: '11111111-2222-3333-4444-555555555555',
  email: 'customer@example.com',
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.CHATWOOT_BASE_URL = BASE_URL
  process.env.CHATWOOT_WEBSITE_TOKEN = WEBSITE_TOKEN
  process.env.CHATWOOT_WIDGET_HMAC_SECRET = HMAC_SECRET

  mockGetUser.mockResolvedValue({ data: { user: null }, error: null })
  mockMaybeSingle.mockResolvedValue({ data: null, error: null })
  mockEq.mockReturnValue({ maybeSingle: mockMaybeSingle })
  mockSelect.mockReturnValue({ eq: mockEq })
  mockFrom.mockReturnValue({ select: mockSelect })
})

afterEach(() => {
  delete process.env.CHATWOOT_BASE_URL
  delete process.env.CHATWOOT_WEBSITE_TOKEN
  delete process.env.CHATWOOT_WIDGET_HMAC_SECRET
})

describe('computeIdentifierHash', () => {
  it('matches the HMAC-SHA256 hex digest Node crypto produces for a known vector', () => {
    const secret = 'test-secret'
    const identifier = '11111111-2222-3333-4444-555555555555'
    const expected = createHmac('sha256', secret).update(identifier).digest('hex')
    expect(computeIdentifierHash(secret, identifier)).toBe(expected)
  })

  it('matches the pinned literal digest (catches an implementation change)', () => {
    expect(computeIdentifierHash('test-secret', '11111111-2222-3333-4444-555555555555')).toBe(
      '197852d5db0511671a896ce0244ebe0243dba0ce3ecbd38ad52e3a22e567ea6b'
    )
  })
})

describe('isSafeWidgetBaseUrl', () => {
  it('accepts the https origin form', () => {
    expect(isSafeWidgetBaseUrl('https://chat.rideprestigo.com')).toBe(true)
  })

  it('rejects http:', () => {
    expect(isSafeWidgetBaseUrl('http://chat.rideprestigo.com')).toBe(false)
  })

  it('rejects a path', () => {
    expect(isSafeWidgetBaseUrl('https://chat.rideprestigo.com/widget')).toBe(false)
  })
})

describe('GET /api/chatwoot/identity', () => {
  it('returns 200 JSON with a correct HMAC identity for a signed-in user', async () => {
    mockGetUser.mockResolvedValue({ data: { user: SIGNED_IN_USER }, error: null })
    mockMaybeSingle.mockResolvedValue({
      data: { full_name: 'Jane Doe', phone: '+420123456789' },
      error: null,
    })

    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()

    const expectedHash = createHmac('sha256', HMAC_SECRET).update(SIGNED_IN_USER.id).digest('hex')
    expect(body).toMatchObject({
      enabled: true,
      baseUrl: BASE_URL,
      websiteToken: WEBSITE_TOKEN,
      user: {
        identifier: SIGNED_IN_USER.id,
        identifierHash: expectedHash,
        email: SIGNED_IN_USER.email,
        name: 'Jane Doe',
        phone: '+420123456789',
      },
    })
  })

  it('returns the anonymous widget config when getUser returns no user', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null })

    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({
      enabled: true,
      baseUrl: BASE_URL,
      websiteToken: WEBSITE_TOKEN,
      user: null,
    })
  })

  it('sets Cache-Control: no-store', async () => {
    const res = await GET()
    expect(res.headers.get('Cache-Control')).toBe('no-store')
  })
})
