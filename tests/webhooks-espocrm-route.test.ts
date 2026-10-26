// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createHmac } from 'node:crypto'
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

// ── Task 2: authentication edges, batches, dedup, retry discipline ──────────

function spyWorld() {
  const w = janWorld()
  const ingest = vi.fn(w.webhook.store.ingestEspo)
  storeRef.current = { ...w.webhook.store, ingestEspo: ingest }
  return { w, ingest }
}

const item = (n: number, over: Record<string, unknown> = {}) => ({
  id: `0123456789abcde${n.toString(16).padStart(2, '0')}`,
  lastName: `Name${n}`,
  ...over,
})

describe('POST /api/webhooks/espocrm: authentication', () => {
  it('a request carrying only the legacy X-Signature header is refused 401', async () => {
    const { ingest } = spyWorld()
    const body = JSON.stringify([item(1)])
    const legacy = createHmac('sha256', SECRET).update(body).digest('hex')
    const res = await POST(build(body, { 'X-Signature': legacy }))
    expect(res.status).toBe(401)
    expect(ingest).not.toHaveBeenCalled()
  })

  it('a signature for the wrong webhook id is refused 401 when ESPOCRM_WEBHOOK_ID is set', async () => {
    vi.stubEnv('ESPOCRM_WEBHOOK_ID', WEBHOOK_ID)
    const { ingest } = spyWorld()
    expect((await POST(signed([item(1)], SECRET, 'ffffffffffffffff0'))).status).toBe(401)
    expect(ingest).not.toHaveBeenCalled()
    // The right id passes.
    expect((await POST(signed([item(1)]))).status).toBe(200)
  })

  it('accepts the previous secret while it is configured (rotation)', async () => {
    vi.stubEnv('ESPOCRM_WEBHOOK_SECRET_PREVIOUS', 'unit-test-espo-secret-previous')
    spyWorld()
    expect((await POST(signed([item(1)], 'unit-test-espo-secret-previous'))).status).toBe(200)
    expect((await POST(signed([item(2)], 'unit-test-espo-secret-wrong'))).status).toBe(401)
  })

  it('the query string (?v=2 rotation marker) is ignored', async () => {
    spyWorld()
    const body = JSON.stringify([item(1)])
    const req = new Request('http://localhost/api/webhooks/espocrm?v=2', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...signEspo(body, SECRET, WEBHOOK_ID) },
      body,
    })
    expect((await POST(req)).status).toBe(200)
  })

  it('answers 413 above 1 MiB and 401 for a malformed signature header', async () => {
    spyWorld()
    const big = 'x'.repeat(1_048_577)
    const res = await POST(build(big, { ...signEspo(big, SECRET, WEBHOOK_ID), 'content-length': String(big.length) }))
    expect(res.status).toBe(413)
    expect((await POST(build([item(1)], { Signature: '***' }))).status).toBe(401)
  })
})

describe('POST /api/webhooks/espocrm: batches', () => {
  it('a JSON object instead of an array is 400', async () => {
    const { ingest } = spyWorld()
    expect((await POST(signed({ id: CONTACT, lastName: 'X' }))).status).toBe(400)
    expect(ingest).not.toHaveBeenCalled()
  })

  it('invalid JSON behind a valid signature is 400', async () => {
    spyWorld()
    expect((await POST(signed('{not json'))).status).toBe(400)
  })

  it('101 items are 400 and 100 items are accepted', async () => {
    const { ingest } = spyWorld()
    const many = (n: number) => Array.from({ length: n }, (_, i) => ({ id: item(i).id, description: 'only' }))
    expect((await POST(signed(many(101)))).status).toBe(400)
    const ok = await POST(signed(many(100)))
    expect(ok.status).toBe(200)
    expect(await ok.json()).toEqual({ received: 100 })
    // None of them touches name, phone or company: nothing is ingested.
    expect(ingest).not.toHaveBeenCalled()
  })

  it('an empty array is 200 { received: 0 }', async () => {
    spyWorld()
    const res = await POST(signed([]))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ received: 0 })
  })

  it('bad and irrelevant items are ignored with 200 and no ingest call', async () => {
    const { ingest } = spyWorld()
    const res = await POST(signed([{ lastName: 'no id' }, { id: CONTACT, description: 'x' }, 'str', null]))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ received: 4 })
    expect(ingest).not.toHaveBeenCalled()
  })

  it('ingests exactly one RPC per relevant item with the mask suffix and a content-hash delivery id', async () => {
    const { ingest } = spyWorld()
    await POST(signed([{ id: CONTACT, lastName: 'N', phoneNumber: '+420777123456' }, { id: CONTACT, description: 'x' }]))
    expect(ingest).toHaveBeenCalledTimes(1)
    expect(ingest.mock.calls[0][0]).toMatchObject({ espoContactId: CONTACT, fuseLimit: 20, bucketSeconds: 30, tagSuffix: 'm3' })
    expect(ingest.mock.calls[0][0].deliveryId).toMatch(/^e[0-9a-f]{64}$/)
  })
})

describe('POST /api/webhooks/espocrm: duplicate delivery and 503 retry', () => {
  it('the same signed batch twice queues once; the second time every item is a duplicate', async () => {
    const { w } = spyWorld()
    const batch = [{ id: CONTACT, lastName: 'Novák' }]
    await POST(signed(batch))
    await Promise.resolve()
    expect(publishJSONMock).toHaveBeenCalledTimes(1)

    const again = await POST(signed(batch))
    expect(again.status).toBe(200)
    await Promise.resolve()
    expect(publishJSONMock).toHaveBeenCalledTimes(1)
    expect(w.outbox.rows.size).toBe(1)
    const logged = vi.mocked(console.log).mock.calls.map((c) => c.join(' ')).join('\n')
    expect(logged).toContain('items=1 queued=0')
  })

  it('a store failure on the 2nd of 3 items answers 503 and the retry ingests the 2nd and 3rd, the 1st is a duplicate', async () => {
    const w = makeWorld({ espo: { records: { Contact: [] } } })
    const contacts = [1, 2, 3].map((n) => item(n).id)
    contacts.forEach((c) => w.identity.seed({ email: `p${c}@x.example`, espoContactId: c, chatwootContactId: null }))
    let calls = 0
    let failSecond = true
    const results: string[] = []
    storeRef.current = {
      ...w.webhook.store,
      ingestEspo: async (input: Parameters<typeof w.webhook.store.ingestEspo>[0]) => {
        calls += 1
        if (failSecond && input.espoContactId === contacts[1]) throw new Error('store down')
        const r = await w.webhook.store.ingestEspo(input)
        results.push(`${input.espoContactId}:${r.outcome}`)
        return r
      },
    }
    const batch = [1, 2, 3].map((n) => item(n))
    const first = await POST(signed(batch))
    expect(first.status).toBe(503)
    // The 3rd item was never attempted.
    expect(calls).toBe(2)
    expect(results).toEqual([`${contacts[0]}:queued`])

    failSecond = false
    results.length = 0
    const retry = await POST(signed(batch))
    expect(retry.status).toBe(200)
    expect(results).toEqual([`${contacts[0]}:duplicate`, `${contacts[1]}:queued`, `${contacts[2]}:queued`])
    expect(w.outbox.rows.size).toBe(3)
  })
})

describe('POST /api/webhooks/espocrm: status discipline (never 410)', () => {
  const outcomes = ['unlinked', 'erasing', 'off', 'exists', 'duplicate', 'fused'] as const

  it.each(outcomes)('ingest outcome %s answers 200, never 410', async (outcome) => {
    storeRef.current = { ingestEspo: async () => ({ outcome, key: null, availableAt: null }) }
    const res = await POST(signed([item(1)]))
    expect(res.status).toBe(200)
    expect(res.status).not.toBe(410)
    expect(publishJSONMock).not.toHaveBeenCalled()
  })

  it('a fused outcome writes exactly one ALERT line with ids only', async () => {
    storeRef.current = { ingestEspo: async () => ({ outcome: 'fused', key: null, availableAt: null }) }
    await POST(signed([item(1, { firstName: 'Secretname', phoneNumber: '+420777123456' })]))
    const errors = vi.mocked(console.error).mock.calls.map((c) => c.join(' '))
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('webhook_loop_fused')
    expect(errors[0]).not.toContain('Secretname')
    expect(errors[0]).not.toContain('420777')
  })

  it('answers 401/400/413/503/200 only: no response of any failure path is 410', async () => {
    const statuses: number[] = []
    storeRef.current = {
      ingestEspo: async () => {
        throw new Error('down')
      },
    }
    statuses.push((await POST(signed([item(1)]))).status) // 503
    statuses.push((await POST(build([item(1)], {}))).status) // 401
    statuses.push((await POST(signed('nope'))).status) // 400
    vi.stubEnv('ESPOCRM_WEBHOOK_SECRET', '')
    statuses.push((await POST(signed([item(1)]))).status) // 401 unconfigured
    expect(statuses).toEqual([503, 401, 400, 401])
    expect(statuses).not.toContain(410)
  })

  it('log lines carry no name, phone or email from the items', async () => {
    spyWorld()
    await POST(signed([{ id: CONTACT, firstName: 'Secretname', phoneNumber: '+420777123456', emailAddress: 'secret@x.example' }]))
    const logged = [...vi.mocked(console.log).mock.calls, ...vi.mocked(console.error).mock.calls, ...vi.mocked(console.warn).mock.calls]
      .map((c) => c.join(' '))
      .join('\n')
    expect(logged).toContain('[webhook] source=espocrm')
    expect(logged).not.toMatch(/Secretname|420777|secret@x\.example/)
  })
})
