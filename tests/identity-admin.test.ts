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
    const logged = errSpy.mock.calls.map((c) => c.join(' ')).join('\n')
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
