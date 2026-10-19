// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Plan 82-13 (D-07, D-09): admin erasure preview / confirm / log routes and the keyed email hash.

const { getAdminUserMock, scopeMock, createPreviewMock, loadMock, confirmMock, logMock, publishMock } = vi.hoisted(
  () => ({
    getAdminUserMock: vi.fn(),
    scopeMock: vi.fn(),
    createPreviewMock: vi.fn(),
    loadMock: vi.fn(),
    confirmMock: vi.fn(),
    logMock: vi.fn(),
    publishMock: vi.fn(),
  }),
)

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
  getAdminUser: getAdminUserMock,
}))

vi.mock('@/lib/erasure-store', () => ({
  erasureScope: scopeMock,
  createErasurePreview: createPreviewMock,
  loadErasure: loadMock,
  confirmErasure: confirmMock,
  erasureLog: logMock,
}))

vi.mock('@/lib/outbox', async () => {
  const actual = await vi.importActual<typeof import('@/lib/outbox')>('@/lib/outbox')
  return { ...actual, publishOutboxDispatch: publishMock }
})

import { POST as previewPost } from '@/app/api/admin/erasure/preview/route'
import { POST as confirmPost } from '@/app/api/admin/erasure/confirm/route'
import { GET as logGet } from '@/app/api/admin/erasure/route'
import { erasureEmailHmac, hmacEquals, loadErasureHmacKey } from '@/lib/erasure-hash'

const ADMIN_ID = '8a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d'
const REQUEST_ID = '3f1c2d4e-5a6b-4c7d-8e9f-0a1b2c3d4e5f'
const KEY = 'k'.repeat(40)

function req(path: string, body: unknown, raw = false): Request {
  return new Request(`http://localhost/api/admin/erasure/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: raw ? (body as string) : JSON.stringify(body),
  })
}

function asAdmin() {
  getAdminUserMock.mockResolvedValue({ user: { id: ADMIN_ID }, error: null })
}

const scopeOk = (upcoming = 0) => ({
  outcome: 'ok' as const,
  primaryEmail: 'jane@example.com',
  emails: ['jane@example.com'],
  phones: [],
  identityId: null,
  userId: null,
  bookingIds: [],
  inquiryIds: [],
  counts: { bookings: 3, upcoming, inquiries: 1, quoteLeads: 0, hasAccount: true },
})

function stored(upcoming = 0, email = 'jane@example.com') {
  return {
    id: REQUEST_ID,
    status: 'previewed',
    requestedBy: ADMIN_ID,
    emailHmac: erasureEmailHmac(KEY, email),
    expiresAt: '2030-01-01T00:00:00Z',
    identity: null,
    userId: null,
    emails: [email],
    phones: [],
    bookingIds: [],
    inquiryIds: [],
    counts: { bookings: 3, upcoming, inquiries: 1, quote_leads: 0, has_account: true },
    steps: {},
  }
}

describe('lib/erasure-hash', () => {
  it('loadErasureHmacKey: needs at least 32 characters', () => {
    expect(loadErasureHmacKey({})).toBeNull()
    expect(loadErasureHmacKey({ ERASURE_HMAC_KEY: 'short' })).toBeNull()
    expect(loadErasureHmacKey({ ERASURE_HMAC_KEY: KEY })).toBe(KEY)
  })

  it('erasureEmailHmac: 64 hex over the normalised email, key-dependent', () => {
    const a = erasureEmailHmac(KEY, 'jane@example.com')
    expect(a).toMatch(/^[0-9a-f]{64}$/)
    expect(erasureEmailHmac(KEY, '  Jane@Example.com ')).toBe(a)
    expect(erasureEmailHmac('z'.repeat(40), 'jane@example.com')).not.toBe(a)
  })

  it('hmacEquals: false on a length mismatch, true on equal values', () => {
    expect(hmacEquals('abc', 'abcd')).toBe(false)
    expect(hmacEquals('abc', 'abd')).toBe(false)
    expect(hmacEquals('abc', 'abc')).toBe(true)
  })
})

describe('POST /api/admin/erasure/preview', () => {
  let errSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('ERASURE_HMAC_KEY', KEY)
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    errSpy.mockRestore()
    vi.unstubAllEnvs()
  })

  it('401 without a session and 403 for a non-admin; nothing is read', async () => {
    getAdminUserMock.mockResolvedValue({ user: null, error: '401' })
    expect((await previewPost(req('preview', { query: 'jane@example.com' }))).status).toBe(401)
    getAdminUserMock.mockResolvedValue({ user: null, error: '403' })
    expect((await previewPost(req('preview', { query: 'jane@example.com' }))).status).toBe(403)
    expect(scopeMock).not.toHaveBeenCalled()
  })

  it('503 erasure_unconfigured when ERASURE_HMAC_KEY is unset (fail closed)', async () => {
    asAdmin()
    vi.stubEnv('ERASURE_HMAC_KEY', '')
    const res = await previewPost(req('preview', { query: 'jane@example.com' }))
    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({ error: 'erasure_unconfigured' })
    expect(scopeMock).not.toHaveBeenCalled()
  })

  it('400 for malformed JSON, a missing query or an extra field', async () => {
    asAdmin()
    expect((await previewPost(req('preview', '{', true))).status).toBe(400)
    expect((await previewPost(req('preview', {}))).status).toBe(400)
    expect((await previewPost(req('preview', { query: 'a@b.cz', extra: 1 }))).status).toBe(400)
    expect((await previewPost(req('preview', { query: '' }))).status).toBe(400)
    expect(scopeMock).not.toHaveBeenCalled()
  })

  it('422 invalid_query for text that is neither an email nor a phone', async () => {
    asAdmin()
    const res = await previewPost(req('preview', { query: 'nonsense' }))
    expect(res.status).toBe(422)
    expect(await res.json()).toEqual({ error: 'invalid_query' })
    expect(scopeMock).not.toHaveBeenCalled()
  })

  it('ok: stores a preview with a 64-hex HMAC of the normalised primary email and ttl 900', async () => {
    asAdmin()
    scopeMock.mockResolvedValue(scopeOk(2))
    createPreviewMock.mockResolvedValue(REQUEST_ID)
    const res = await previewPost(req('preview', { query: '  Jane@Example.com ' }))
    expect(res.status).toBe(200)
    expect(scopeMock).toHaveBeenCalledWith('jane@example.com', null)
    const arg = createPreviewMock.mock.calls[0][0]
    expect(arg.actor).toBe(ADMIN_ID)
    expect(arg.ttlSeconds).toBe(900)
    expect(arg.emailHmac).toMatch(/^[0-9a-f]{64}$/)
    expect(arg.emailHmac).toBe(erasureEmailHmac(KEY, 'jane@example.com'))
    expect(await res.json()).toEqual({
      requestId: REQUEST_ID,
      primaryEmail: 'jane@example.com',
      counts: { bookings: 3, upcoming: 2, inquiries: 1, quoteLeads: 0, hasAccount: true },
    })
  })

  it('a phone query goes through the phone normaliser (E.164)', async () => {
    asAdmin()
    scopeMock.mockResolvedValue({ outcome: 'not_found' })
    await previewPost(req('preview', { query: '+44 20 7946 0958' }))
    expect(scopeMock).toHaveBeenCalledWith(null, '+442079460958')
  })

  it('422 shared_phone carries the identity count and creates no preview', async () => {
    asAdmin()
    scopeMock.mockResolvedValue({ outcome: 'shared_phone', identities: 3 })
    const res = await previewPost(req('preview', { query: '+44 20 7946 0958' }))
    expect(res.status).toBe(422)
    expect(await res.json()).toEqual({ error: 'shared_phone', identities: 3 })
    expect(createPreviewMock).not.toHaveBeenCalled()
  })

  it.each(['already_in_progress', 'not_found', 'invalid'])('422 %s', async (outcome) => {
    asAdmin()
    scopeMock.mockResolvedValue({ outcome })
    const res = await previewPost(req('preview', { query: 'jane@example.com' }))
    expect(res.status).toBe(422)
    expect(await res.json()).toEqual({ error: outcome })
    expect(createPreviewMock).not.toHaveBeenCalled()
  })

  it('500 on a store error; the log line carries the code only', async () => {
    asAdmin()
    scopeMock.mockRejectedValue(new Error('jane@example.com leaked'))
    const res = await previewPost(req('preview', { query: 'jane@example.com' }))
    expect(res.status).toBe(500)
    const logged = errSpy.mock.calls.map((c) => c.join(' ')).join('\n')
    expect(logged).toContain('code=db_error')
    expect(logged).not.toContain('jane@example.com')
  })
})

describe('POST /api/admin/erasure/confirm', () => {
  let errSpy: ReturnType<typeof vi.spyOn>

  const body = (over: Record<string, unknown> = {}) => ({
    requestId: REQUEST_ID,
    confirmEmail: '  Jane@Example.com ',
    identityVerified: true,
    ...over,
  })

  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('ERASURE_HMAC_KEY', KEY)
    publishMock.mockResolvedValue(true)
    confirmMock.mockResolvedValue('confirmed')
    loadMock.mockResolvedValue(stored())
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    errSpy.mockRestore()
    vi.unstubAllEnvs()
  })

  it('401 / 403 before anything is read', async () => {
    getAdminUserMock.mockResolvedValue({ user: null, error: '401' })
    expect((await confirmPost(req('confirm', body()))).status).toBe(401)
    getAdminUserMock.mockResolvedValue({ user: null, error: '403' })
    expect((await confirmPost(req('confirm', body()))).status).toBe(403)
    expect(loadMock).not.toHaveBeenCalled()
    expect(confirmMock).not.toHaveBeenCalled()
  })

  it('503 erasure_unconfigured without the key', async () => {
    asAdmin()
    vi.stubEnv('ERASURE_HMAC_KEY', '')
    const res = await confirmPost(req('confirm', body()))
    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({ error: 'erasure_unconfigured' })
    expect(confirmMock).not.toHaveBeenCalled()
  })

  it('400 for malformed JSON, identityVerified false, a bad id or an extra field', async () => {
    asAdmin()
    expect((await confirmPost(req('confirm', '{', true))).status).toBe(400)
    expect((await confirmPost(req('confirm', body({ identityVerified: false })))).status).toBe(400)
    expect((await confirmPost(req('confirm', body({ identityVerified: undefined })))).status).toBe(400)
    expect((await confirmPost(req('confirm', body({ requestId: 'nope' })))).status).toBe(400)
    expect((await confirmPost(req('confirm', body({ extra: 1 })))).status).toBe(400)
    expect(confirmMock).not.toHaveBeenCalled()
  })

  it('422 not_found when the request does not exist', async () => {
    asAdmin()
    loadMock.mockResolvedValue(null)
    const res = await confirmPost(req('confirm', body()))
    expect(res.status).toBe(422)
    expect(await res.json()).toEqual({ error: 'not_found' })
    expect(confirmMock).not.toHaveBeenCalled()
  })

  it('200: a padded, differently cased email matching the stored HMAC confirms and publishes erase.person', async () => {
    asAdmin()
    const res = await confirmPost(req('confirm', body()))
    expect(res.status).toBe(200)
    expect(confirmMock).toHaveBeenCalledWith(REQUEST_ID, ADMIN_ID)
    expect(publishMock).toHaveBeenCalledWith(`erase.person:${REQUEST_ID}`, { dedupSuffix: 'c' })
    expect(await res.json()).toEqual({ ok: true, queued: true, published: true })
  })

  it('still 200 when the publish fails (the sweep is the fallback); published false', async () => {
    asAdmin()
    publishMock.mockResolvedValue(false)
    const res = await confirmPost(req('confirm', body()))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, queued: true, published: false })
  })

  it('422 email_mismatch for another email; no confirm call, no publish', async () => {
    asAdmin()
    const res = await confirmPost(req('confirm', body({ confirmEmail: 'john@example.com' })))
    expect(res.status).toBe(422)
    expect(await res.json()).toEqual({ error: 'email_mismatch' })
    expect(confirmMock).not.toHaveBeenCalled()
    expect(publishMock).not.toHaveBeenCalled()
  })

  it('422 email_mismatch for text that is not an email at all', async () => {
    asAdmin()
    const res = await confirmPost(req('confirm', body({ confirmEmail: 'jane' })))
    expect(res.status).toBe(422)
    expect(await res.json()).toEqual({ error: 'email_mismatch' })
    expect(confirmMock).not.toHaveBeenCalled()
  })

  it('422 upcoming_not_acknowledged when the preview had upcoming trips', async () => {
    asAdmin()
    loadMock.mockResolvedValue(stored(2))
    const res = await confirmPost(req('confirm', body()))
    expect(res.status).toBe(422)
    expect(await res.json()).toEqual({ error: 'upcoming_not_acknowledged' })
    expect(confirmMock).not.toHaveBeenCalled()
    const ok = await confirmPost(req('confirm', body({ upcomingAcknowledged: true })))
    expect(ok.status).toBe(200)
    expect(confirmMock).toHaveBeenCalledTimes(1)
  })

  it.each(['actor_mismatch', 'already_in_progress', 'expired', 'not_previewed', 'not_found'])(
    '422 %s from the confirm RPC; nothing published',
    async (outcome) => {
      asAdmin()
      confirmMock.mockResolvedValue(outcome)
      const res = await confirmPost(req('confirm', body()))
      expect(res.status).toBe(422)
      expect(await res.json()).toEqual({ error: outcome })
      expect(publishMock).not.toHaveBeenCalled()
    },
  )

  it('500 on a store error; the log line carries the code only', async () => {
    asAdmin()
    loadMock.mockRejectedValue(new Error('jane@example.com leaked'))
    const res = await confirmPost(req('confirm', body()))
    expect(res.status).toBe(500)
    const logged = errSpy.mock.calls.map((c) => c.join(' ')).join('\n')
    expect(logged).toContain('code=db_error')
    expect(logged).not.toContain('jane@example.com')
  })
})

describe('GET /api/admin/erasure (log)', () => {
  let errSpy: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    vi.clearAllMocks()
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => errSpy.mockRestore())

  it('401 / 403', async () => {
    getAdminUserMock.mockResolvedValue({ user: null, error: '401' })
    expect((await logGet()).status).toBe(401)
    getAdminUserMock.mockResolvedValue({ user: null, error: '403' })
    expect((await logGet()).status).toBe(403)
    expect(logMock).not.toHaveBeenCalled()
  })

  it('200 { rows } from erasureLog(100) with no email in the JSON', async () => {
    asAdmin()
    logMock.mockResolvedValue([
      {
        id: REQUEST_ID,
        reference: 'abcdef0123',
        status: 'completed',
        requestedAt: '2026-10-19T10:00:00Z',
        completedAt: '2026-10-19T10:03:00Z',
        steps: { supabase: { bookings_anonymised: 4 } },
        verified: true,
      },
    ])
    const res = await logGet()
    expect(res.status).toBe(200)
    const text = JSON.stringify(await res.json())
    expect(logMock).toHaveBeenCalledWith(100)
    expect(text).toContain('abcdef0123')
    expect(text).not.toContain('@')
  })

  it('500 on a store error', async () => {
    asAdmin()
    logMock.mockRejectedValue(new Error('x'))
    expect((await logGet()).status).toBe(500)
    expect(errSpy.mock.calls.map((c) => c.join(' ')).join('\n')).toContain('code=db_error')
  })
})
