// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { makeWorld, signEspo, type World } from './helpers/chat-world'
import { contactFingerprint } from '@/lib/sync-origin'

const { publishJSONMock, storeRef } = vi.hoisted(() => ({
  publishJSONMock: vi.fn(),
  storeRef: { current: null as unknown },
}))

vi.mock('next/server', async () => {
  const actual = await vi.importActual<typeof import('next/server')>('next/server')
  return {
    ...actual,
    // Run the after() callback right away so the publish is observable.
    after: (fn: () => unknown) => {
      void fn()
    },
  }
})
vi.mock('@upstash/qstash', () => ({
  Client: class {
    publishJSON = publishJSONMock
  },
}))
vi.mock('@/lib/supabase', () => ({ createSupabaseServiceClient: vi.fn() }))
vi.mock('@/lib/webhook-store', () => ({
  createWebhookStore: () => storeRef.current,
}))

import { POST } from '@/app/api/webhooks/espocrm/route'

// Obviously fake secrets and ids.
const SECRET = 'unit-test-espo-secret-current'
const WEBHOOK_ID = '5f0c1c2e11114222a'
const CONTACT = '0123456789abcdef0'

function build(payload: unknown, headers: Record<string, string>): Request {
  const body = typeof payload === 'string' ? payload : JSON.stringify(payload)
  return new Request('http://localhost/api/webhooks/espocrm', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body,
  })
}

const signed = (payload: unknown, secret = SECRET, id = WEBHOOK_ID) =>
  build(payload, signEspo(typeof payload === 'string' ? payload : JSON.stringify(payload), secret, id))

function janWorld(): World {
  const w = makeWorld({
    espo: { records: { Contact: [{ id: CONTACT, firstName: 'Jan', lastName: 'Novak' }] } },
    cw: { contacts: [{ id: 7, name: 'Jan Novak' }] },
  })
  w.identity.seed({ email: 'jan@x.example', espoContactId: CONTACT, chatwootContactId: 7 })
  return w
}

beforeEach(() => {
  vi.stubEnv('ESPOCRM_WEBHOOK_SECRET', SECRET)
  vi.stubEnv('ESPOCRM_WEBHOOK_SECRET_PREVIOUS', '')
  vi.stubEnv('ESPOCRM_WEBHOOK_ID', '')
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://example.test')
  publishJSONMock.mockReset().mockResolvedValue({ messageId: 'm1' })
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('POST /api/webhooks/espocrm: tracer', () => {
  it('a signed Contact edit reaches the linked Chatwoot contact with the origin fingerprint', async () => {
    const w = janWorld()
    storeRef.current = w.webhook.store
    // The owner changes the last name in EspoCRM.
    w.contacts()[0].lastName = 'Novák'

    const res = await POST(signed([{ id: CONTACT, lastName: 'Novák' }]))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ received: 1 })

    const keys = [...w.outbox.rows.keys()]
    expect(keys).toHaveLength(1)
    expect(keys[0]).toMatch(/^hook\.espo_contact:[0-9a-f-]{36}:b\d+m1$/)
    await Promise.resolve()
    expect(publishJSONMock).toHaveBeenCalledTimes(1)
    expect(publishJSONMock.mock.calls[0][0].body).toEqual({ key: keys[0] })

    // The row becomes available when its 30 s bucket has closed.
    w.advance(31_000)
    expect(await w.dispatch(keys[0])).toEqual({ outcome: 'sent' })
    const cw = w.cw.state.contacts.find((c) => c.id === 7)!
    expect(cw.name).toBe('Jan Novák')
    expect(cw.custom_attributes.site_sync_fp).toBe(
      contactFingerprint({ name: cw.name, email: cw.email, phone_number: cw.phone_number, identifier: cw.identifier }),
    )
    // Read-only towards EspoCRM.
    expect(w.espoWrites()).toEqual([])
  })

  it('a tampered body is answered 401 and never reaches the store', async () => {
    const w = janWorld()
    const ingest = vi.fn(w.webhook.store.ingestEspo)
    storeRef.current = { ...w.webhook.store, ingestEspo: ingest }
    const good = JSON.stringify([{ id: CONTACT, lastName: 'Novák' }])
    const res = await POST(build([{ id: CONTACT, lastName: 'Evil' }], signEspo(good, SECRET, WEBHOOK_ID)))
    expect(res.status).toBe(401)
    expect(ingest).not.toHaveBeenCalled()
  })

  it('answers 401 when no secret is configured', async () => {
    vi.stubEnv('ESPOCRM_WEBHOOK_SECRET', '')
    const w = janWorld()
    const ingest = vi.fn(w.webhook.store.ingestEspo)
    storeRef.current = { ...w.webhook.store, ingestEspo: ingest }
    const res = await POST(signed([{ id: CONTACT, lastName: 'Novák' }]))
    expect(res.status).toBe(401)
    expect(ingest).not.toHaveBeenCalled()
  })
})
