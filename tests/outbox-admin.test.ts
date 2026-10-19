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

import { GET } from '@/app/api/admin/outbox/route'
import { outboxEventLabel, outboxErrorHint } from '@/lib/outbox-labels'

const UUID = '3f1c2d4e-5a6b-4c7d-8e9f-0a1b2c3d4e5f'
const PII = /@|\+\d{6,}|\b\d{3}[ -]\d{3}[ -]\d{3}\b/

const HEALTH = {
  pending: 2,
  processing: 1,
  failed: 3,
  stuck: 1,
  open_total: 7,
  oldest_pending_seconds: 120,
  sent_last_24h: 40,
  by_type: [{ event_type: 'lead.booking', status: 'failed', count: 3 }],
}

const EVENT = {
  idempotency_key: `lead.booking:${UUID}:new`,
  event_type: 'lead.booking',
  aggregate_type: 'booking',
  aggregate_id: UUID,
  status: 'failed',
  stuck: false,
  attempts: 6,
  last_error: 'crm_http_500',
  available_at: '2026-10-19T10:00:00Z',
  updated_at: '2026-10-19T10:00:00Z',
  booking_reference: 'PRG-1234',
}

function getReq(qs = ''): Request {
  return new Request(`http://localhost/api/admin/outbox${qs}`)
}

function postReq(url: string, body: unknown, raw = false): Request {
  return new Request(`http://localhost${url}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: raw ? (body as string) : JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  getAdminUserMock.mockResolvedValue({ user: { id: 'admin' }, error: null })
  publishMock.mockResolvedValue(true)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('SYNC-05 GET /api/admin/outbox', () => {
  it('401 without a session, before any RPC', async () => {
    getAdminUserMock.mockResolvedValue({ user: null, error: '401' })
    const res = await GET(getReq())
    expect(res.status).toBe(401)
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('403 for a non-admin, before any RPC', async () => {
    getAdminUserMock.mockResolvedValue({ user: null, error: '403' })
    const res = await GET(getReq())
    expect(res.status).toBe(403)
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('200 with health and events for an admin', async () => {
    rpcMock.mockImplementation(async (fn: string) =>
      fn === 'outbox_health' ? { data: HEALTH, error: null } : { data: [EVENT], error: null },
    )
    const res = await GET(getReq())
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.health.failed).toBe(3)
    expect(json.health.oldest_pending_seconds).toBe(120)
    expect(json.events).toHaveLength(1)
    expect(json.events[0].booking_reference).toBe('PRG-1234')
    expect(typeof json.updatedAt).toBe('string')
    expect(rpcMock).toHaveBeenCalledWith('outbox_open_events', { p_status: null, p_limit: 100 })
  })

  it('passes a concrete status filter to the RPC', async () => {
    rpcMock.mockResolvedValue({ data: [], error: null })
    const res = await GET(getReq('?status=failed'))
    expect(res.status).toBe(200)
    expect(rpcMock).toHaveBeenCalledWith('outbox_open_events', { p_status: 'failed', p_limit: 100 })
  })

  it('400 for a status outside the set', async () => {
    const res = await GET(getReq('?status=bogus'))
    expect(res.status).toBe(400)
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('500 on an RPC error and the logged line carries no personal data', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    rpcMock.mockResolvedValue({ data: null, error: { message: 'boom anna@example.com +420777123456' } })
    const res = await GET(getReq())
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'Database error' })
    const logged = errSpy.mock.calls.map((c) => c.join(' ')).join('\n')
    expect(logged).toContain('[admin/outbox.GET] code=db_error')
    expect(logged).not.toMatch(PII)
  })

  it('a response never contains an email or phone shaped value', async () => {
    rpcMock.mockImplementation(async (fn: string) =>
      fn === 'outbox_health' ? { data: HEALTH, error: null } : { data: [EVENT], error: null },
    )
    const res = await GET(getReq())
    expect(JSON.stringify(await res.json())).not.toMatch(PII)
  })
})

describe('outbox labels', () => {
  it('maps event types to display names', () => {
    expect(outboxEventLabel('sync.espo')).toBe('EspoCRM update')
    expect(outboxEventLabel('sync.chatwoot')).toBe('Chatwoot update')
    expect(outboxEventLabel('sync.booking')).toBe('Booking sync')
    expect(outboxEventLabel('sync.signup')).toBe('Signup sync')
    expect(outboxEventLabel('erase.person')).toBe('Erasure')
    expect(outboxEventLabel('lead.purge')).toBe('Lead')
    expect(outboxEventLabel('lead.booking')).toBe('Lead')
    expect(outboxEventLabel('mystery.type')).toBe('mystery.type')
  })

  it('returns hints for the known error codes only', () => {
    expect(outboxErrorHint('cw_ambiguous')).toMatch(/^Chatwoot has several/)
    expect(outboxErrorHint('crm_unconfigured')).toBe('Credentials are missing in Vercel settings.')
    expect(outboxErrorHint('chatwoot_unconfigured')).toBe('Credentials are missing in Vercel settings.')
    expect(outboxErrorHint('unsupported_event')).toMatch(/not handled/)
    expect(outboxErrorHint('crm_network')).toMatch(/did not answer/)
    expect(outboxErrorHint('cw_timeout')).toMatch(/did not answer/)
    expect(outboxErrorHint('espo_timeout')).toMatch(/did not answer/)
    expect(outboxErrorHint('weird')).toBeNull()
    expect(outboxErrorHint(null)).toBeNull()
  })
})
