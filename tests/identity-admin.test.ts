// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { getAdminUserMock, rpcMock, publishMock } = vi.hoisted(() => ({
  getAdminUserMock: vi.fn(),
  rpcMock: vi.fn(),
  publishMock: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
  getAdminUser: getAdminUserMock,
}))

vi.mock('@/lib/supabase', () => ({
  createSupabaseServiceClient: vi.fn(() => ({ rpc: rpcMock })),
}))

vi.mock('@/lib/outbox', async () => {
  const actual = await vi.importActual<typeof import('@/lib/outbox')>('@/lib/outbox')
  return { ...actual, publishOutboxDispatch: publishMock }
})

import { POST as splitPost } from '@/app/api/admin/identities/split/route'
import { GET as listGet } from '@/app/api/admin/identities/route'
import { POST as sharedPost } from '@/app/api/admin/identities/shared/route'

const ADMIN_ID = '8a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d'
const OLD_ID = '3f1c2d4e-5a6b-4c7d-8e9f-0a1b2c3d4e5f'
const NEW_ID = '7b2c3d4e-5f6a-4b7c-9d8e-1f2a3b4c5d6e'
const KEYS = [
  `sync.espo:${NEW_ID}:s1760900000`,
  `sync.chatwoot:${NEW_ID}:s1760900000`,
  `sync.espo:${OLD_ID}:s1760900000`,
  `sync.chatwoot:${OLD_ID}:s1760900000`,
]

function post(body: unknown, raw = false): Request {
  return new Request('http://localhost/api/admin/identities/split', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: raw ? (body as string) : JSON.stringify(body),
  })
}

function asAdmin() {
  getAdminUserMock.mockResolvedValue({ user: { id: ADMIN_ID }, error: null })
}

describe('POST /api/admin/identities/split (D-06)', () => {
  let errSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()
    publishMock.mockResolvedValue(true)
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => errSpy.mockRestore())

  it('401 without a session, no RPC call', async () => {
    getAdminUserMock.mockResolvedValue({ user: null, error: '401' })
    const res = await splitPost(post({ email: 'b@example.com' }))
    expect(res.status).toBe(401)
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('403 for a non-admin, no RPC call', async () => {
    getAdminUserMock.mockResolvedValue({ user: null, error: '403' })
    const res = await splitPost(post({ email: 'b@example.com' }))
    expect(res.status).toBe(403)
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('400 for malformed JSON', async () => {
    asAdmin()
    const res = await splitPost(post('{', true))
    expect(res.status).toBe(400)
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('400 for an invalid email or an extra field', async () => {
    asAdmin()
    expect((await splitPost(post({ email: 'x' }))).status).toBe(400)
    expect((await splitPost(post({ email: 'b@example.com', extra: 1 }))).status).toBe(400)
    expect((await splitPost(post({}))).status).toBe(400)
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('422 not_phone_merge when the RPC says the email was not merged by phone', async () => {
    asAdmin()
    rpcMock.mockResolvedValue({
      data: { outcome: 'not_phone_merge', old_identity_id: OLD_ID, new_identity_id: null, keys: [] },
      error: null,
    })
    const res = await splitPost(post({ email: 'b@example.com' }))
    expect(res.status).toBe(422)
    expect(await res.json()).toEqual({ error: 'not_phone_merge' })
    expect(publishMock).not.toHaveBeenCalled()
  })

  it.each(['not_found', 'erasing'])('422 %s', async (outcome) => {
    asAdmin()
    rpcMock.mockResolvedValue({
      data: { outcome, old_identity_id: null, new_identity_id: null, keys: [] },
      error: null,
    })
    const res = await splitPost(post({ email: 'b@example.com' }))
    expect(res.status).toBe(422)
    expect(await res.json()).toEqual({ error: outcome })
  })

  it('200: calls identity_split with the lower-cased email and admin id, publishes all four keys with dedupSuffix p', async () => {
    asAdmin()
    rpcMock.mockResolvedValue({
      data: { outcome: 'split', old_identity_id: OLD_ID, new_identity_id: NEW_ID, keys: KEYS },
      error: null,
    })
    const res = await splitPost(post({ email: ' B@Example.COM ' }))
    expect(res.status).toBe(200)
    expect(rpcMock).toHaveBeenCalledWith('identity_split', { p_email: 'b@example.com', p_actor: ADMIN_ID })
    expect(publishMock).toHaveBeenCalledTimes(4)
    for (const key of KEYS) expect(publishMock).toHaveBeenCalledWith(key, { dedupSuffix: 'p' })
    expect(await res.json()).toEqual({
      ok: true,
      oldIdentityId: OLD_ID,
      newIdentityId: NEW_ID,
      published: 4,
    })
  })

  it('200 even when a publish fails (the sweep re-arms the pending row)', async () => {
    asAdmin()
    publishMock.mockResolvedValue(false)
    rpcMock.mockResolvedValue({
      data: { outcome: 'split', old_identity_id: OLD_ID, new_identity_id: NEW_ID, keys: KEYS },
      error: null,
    })
    const res = await splitPost(post({ email: 'b@example.com' }))
    expect(res.status).toBe(200)
    expect((await res.json()).published).toBe(0)
  })

  it('500 on an RPC error and the log line contains no address', async () => {
    asAdmin()
    rpcMock.mockResolvedValue({ data: null, error: { message: 'boom b@example.com' } })
    const res = await splitPost(post({ email: 'b@example.com' }))
    expect(res.status).toBe(500)
    const logged = errSpy.mock.calls.map((c: unknown[]) => c.join(' ')).join('\n')
    expect(logged).toContain('code=db_error')
    expect(logged).not.toContain('@')
    expect(JSON.stringify(await res.json())).not.toContain('@')
    expect(publishMock).not.toHaveBeenCalled()
  })

  it('500 when the RPC answers an unknown outcome shape', async () => {
    asAdmin()
    rpcMock.mockResolvedValue({ data: { outcome: 'weird' }, error: null })
    const res = await splitPost(post({ email: 'b@example.com' }))
    expect(res.status).toBe(500)
  })
})

describe('GET /api/admin/identities (D-05 / D-06 lists)', () => {
  let errSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => errSpy.mockRestore())

  it('GET 401 without a session', async () => {
    getAdminUserMock.mockResolvedValue({ user: null, error: '401' })
    expect((await listGet()).status).toBe(401)
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('GET 403 for a non-admin', async () => {
    getAdminUserMock.mockResolvedValue({ user: null, error: '403' })
    expect((await listGet()).status).toBe(403)
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('GET 200 returns merges and shared numbers from the RPCs', async () => {
    asAdmin()
    rpcMock.mockImplementation(async (fn: string) => {
      if (fn === 'identity_phone_merges') {
        return {
          data: [
            {
              identity_id: OLD_ID,
              contact_email: 'a@example.com',
              merged_email: 'b@example.com',
              phone: '+420777123456',
              bookings: 2,
              merged_at: '2026-10-19T10:00:00Z',
            },
          ],
          error: null,
        }
      }
      if (fn === 'identity_shared_phones') {
        return {
          data: [
            {
              phone: '+420777123456',
              source: 'manual',
              note: 'TravelExpress desk',
              marked_at: '2026-10-19T09:00:00Z',
              emails: ['a@example.com', 'b@example.com'],
            },
          ],
          error: null,
        }
      }
      return { data: null, error: { message: 'unexpected' } }
    })
    const res = await listGet()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      merges: [
        {
          identityId: OLD_ID,
          contactEmail: 'a@example.com',
          mergedEmail: 'b@example.com',
          phone: '+420777123456',
          bookings: 2,
          mergedAt: '2026-10-19T10:00:00Z',
        },
      ],
      shared: [
        {
          phone: '+420777123456',
          source: 'manual',
          note: 'TravelExpress desk',
          markedAt: '2026-10-19T09:00:00Z',
          emails: ['a@example.com', 'b@example.com'],
        },
      ],
    })
  })

  it('GET 200 with empty lists when the RPCs return nothing', async () => {
    asAdmin()
    rpcMock.mockResolvedValue({ data: [], error: null })
    const res = await listGet()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ merges: [], shared: [] })
  })

  it('GET 500 on an RPC error without leaking the message', async () => {
    asAdmin()
    rpcMock.mockResolvedValue({ data: null, error: { message: 'boom b@example.com' } })
    const res = await listGet()
    expect(res.status).toBe(500)
    const logged = errSpy.mock.calls.map((c: unknown[]) => c.join(' ')).join('\n')
    expect(logged).toContain('code=db_error')
    expect(logged).not.toContain('@')
  })
})

function sharedReq(body: unknown, raw = false): Request {
  return new Request('http://localhost/api/admin/identities/shared', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: raw ? (body as string) : JSON.stringify(body),
  })
}

describe('POST /api/admin/identities/shared (D-05 manual)', () => {
  let errSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => errSpy.mockRestore())

  it('401 / 403 before anything else', async () => {
    getAdminUserMock.mockResolvedValue({ user: null, error: '401' })
    expect((await sharedPost(sharedReq({ phone: '+420777123456' }))).status).toBe(401)
    getAdminUserMock.mockResolvedValue({ user: null, error: '403' })
    expect((await sharedPost(sharedReq({ phone: '+420777123456' }))).status).toBe(403)
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('400 for malformed JSON, a missing phone, an extra field and a note over 80 characters', async () => {
    asAdmin()
    expect((await sharedPost(sharedReq('{', true))).status).toBe(400)
    expect((await sharedPost(sharedReq({}))).status).toBe(400)
    expect((await sharedPost(sharedReq({ phone: '+420777123456', extra: 1 }))).status).toBe(400)
    expect((await sharedPost(sharedReq({ phone: '+420777123456', note: 'x'.repeat(81) }))).status).toBe(400)
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('422 invalid_phone for a number without a country code (never guessed)', async () => {
    asAdmin()
    const res = await sharedPost(sharedReq({ phone: '777 123 456' }))
    expect(res.status).toBe(422)
    const json = await res.json()
    expect(json.error).toBe('invalid_phone')
    expect(json.message).toMatch(/country code/)
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('200 normalises the number, passes the note and the admin id to the RPC', async () => {
    asAdmin()
    rpcMock.mockResolvedValue({ data: 'marked', error: null })
    const res = await sharedPost(sharedReq({ phone: '+420 777 123 456', note: 'TravelExpress desk' }))
    expect(res.status).toBe(200)
    expect(rpcMock).toHaveBeenCalledWith('identity_mark_shared', {
      p_phone: '+420777123456',
      p_note: 'TravelExpress desk',
      p_actor: ADMIN_ID,
    })
    expect(await res.json()).toEqual({ ok: true, phone: '+420777123456' })
  })

  it('200 without a note sends null', async () => {
    asAdmin()
    rpcMock.mockResolvedValue({ data: 'marked', error: null })
    const res = await sharedPost(sharedReq({ phone: '+420777123456' }))
    expect(res.status).toBe(200)
    expect(rpcMock).toHaveBeenCalledWith('identity_mark_shared', {
      p_phone: '+420777123456',
      p_note: null,
      p_actor: ADMIN_ID,
    })
  })

  it('422 already_shared when the number is already shared', async () => {
    asAdmin()
    rpcMock.mockResolvedValue({ data: 'already_shared', error: null })
    const res = await sharedPost(sharedReq({ phone: '+420777123456' }))
    expect(res.status).toBe(422)
    expect((await res.json()).error).toBe('already_shared')
  })

  it('500 on an RPC error and the log carries no number', async () => {
    asAdmin()
    rpcMock.mockResolvedValue({ data: null, error: { message: 'boom +420777123456' } })
    const res = await sharedPost(sharedReq({ phone: '+420777123456' }))
    expect(res.status).toBe(500)
    const logged = errSpy.mock.calls.map((c: unknown[]) => c.join(' ')).join('\n')
    expect(logged).toContain('code=db_error')
    expect(logged).not.toMatch(/\+?\d{6,}/)
  })
})

describe('identities admin imports', () => {
  it('the store and the routes import no CRM or Chatwoot module', async () => {
    const { readFileSync } = await import('fs')
    const files = [
      'lib/identity-admin-store.ts',
      'app/api/admin/identities/route.ts',
      'app/api/admin/identities/split/route.ts',
      'app/api/admin/identities/shared/route.ts',
    ]
    for (const f of files) {
      const src = readFileSync(f, 'utf8')
      const specifiers = [...src.matchAll(/^import .*from '([^']+)'/gm)].map((m) => m[1])
      expect(specifiers.length, f).toBeGreaterThan(0)
      for (const spec of specifiers) expect(spec, f).not.toMatch(/espo|chatwoot|crm/i)
    }
  })
})
