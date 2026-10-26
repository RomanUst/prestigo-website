// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createHash, createHmac } from 'node:crypto'

const { ingestMock, publishJSONMock } = vi.hoisted(() => ({
  ingestMock: vi.fn(),
  publishJSONMock: vi.fn(),
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
  createWebhookStore: () => ({ ingest: ingestMock }),
}))

import { POST } from '@/app/api/webhooks/chatwoot/route'
import { OutboxStoreError } from '@/lib/outbox-store'
import { aggregateUuid, contactFingerprint } from '@/lib/sync-origin'

// Obviously fake secrets, carried as object properties.
const SECRETS = { current: 'unit-test-fake-secret-current', previous: 'unit-test-fake-secret-previous', wrong: 'unit-test-fake-secret-wrong' }
const DELIVERY = '5f0c1c2e-1111-4222-8333-944455556666'
const NOW_SEC = 1_729_950_000

function sign(secret: string, ts: string, body: Buffer): string {
  return 'sha256=' + createHmac('sha256', secret).update(Buffer.concat([Buffer.from(`${ts}.`), body])).digest('hex')
}

function incoming(overrides: Record<string, unknown> = {}) {
  return {
    event: 'message_created',
    message_type: 'incoming',
    private: false,
    content: 'hello',
    conversation: { id: 42 },
    sender: { id: 7, name: 'Ada', email: 'ada@example.com' },
    ...overrides,
  }
}

function build(
  payload: unknown | Buffer,
  opts: { secret?: string; tsOffset?: number; signature?: string; delivery?: string | null; skipHeaders?: boolean } = {},
): Request {
  const body = Buffer.isBuffer(payload) ? payload : Buffer.from(JSON.stringify(payload))
  const ts = String(NOW_SEC + (opts.tsOffset ?? 0))
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (!opts.skipHeaders) {
    headers['X-Chatwoot-Timestamp'] = ts
    headers['X-Chatwoot-Signature'] = opts.signature ?? sign(opts.secret ?? SECRETS.current, ts, body)
  }
  if (opts.delivery !== null) headers['X-Chatwoot-Delivery'] = opts.delivery ?? DELIVERY
  return new Request('http://localhost/api/webhooks/chatwoot', { method: 'POST', headers, body: new Uint8Array(body) })
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(NOW_SEC * 1000))
  vi.stubEnv('CHATWOOT_WEBHOOK_SECRET', SECRETS.current)
  vi.stubEnv('CHATWOOT_WEBHOOK_SECRET_PREVIOUS', '')
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://example.test')
  ingestMock.mockReset().mockResolvedValue('queued')
  publishJSONMock.mockReset().mockResolvedValue({ messageId: 'm1' })
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('POST /api/webhooks/chatwoot: tracer', () => {
  it('a signed incoming message becomes one hook.chat_intake row and one publish', async () => {
    const res = await POST(build(incoming()))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ received: true })

    expect(ingestMock).toHaveBeenCalledTimes(1)
    const input = ingestMock.mock.calls[0][0]
    expect(input).toMatchObject({
      source: 'chatwoot',
      deliveryId: DELIVERY,
      entityKey: 'cw:conv:42',
      fuseLimit: null,
      eventType: 'hook.chat_intake',
      aggregateType: 'chat_conversation',
      aggregateId: aggregateUuid('conversation', 42),
    })
    expect(input.key.endsWith(':c42')).toBe(true)
    expect(input.key.startsWith('hook.chat_intake:')).toBe(true)

    await Promise.resolve()
    expect(publishJSONMock).toHaveBeenCalledTimes(1)
    const call = publishJSONMock.mock.calls[0][0]
    expect(call.body).toEqual({ key: input.key })
    // publishOutboxDispatch sanitises ':' to '_' in the deduplication id; suffix 'w' marks the receiver.
    expect(call.deduplicationId.endsWith('_w')).toBe(true)
  })

  it('falls back to a body hash when the delivery header is absent or malformed', async () => {
    const payload = incoming()
    await POST(build(payload, { delivery: null }))
    const expected = 'b' + createHash('sha256').update(Buffer.from(JSON.stringify(payload))).digest('hex')
    expect(ingestMock.mock.calls[0][0].deliveryId).toBe(expected)

    ingestMock.mockClear()
    await POST(build(payload, { delivery: 'bad id with spaces' }))
    expect(ingestMock.mock.calls[0][0].deliveryId).toBe(expected)
  })

  it('accepts a request signed with the previous secret (rotation)', async () => {
    vi.stubEnv('CHATWOOT_WEBHOOK_SECRET_PREVIOUS', SECRETS.previous)
    const res = await POST(build(incoming(), { secret: SECRETS.previous }))
    expect(res.status).toBe(200)
    expect(ingestMock).toHaveBeenCalledTimes(1)
  })
})

const CONTACT_FIELDS = { name: 'Grace Hopper', email: 'grace@example.com', phone_number: '+420777888999', identifier: null }

function contactUpdated(overrides: Record<string, unknown> = {}) {
  return {
    event: 'contact_updated',
    id: 7,
    ...CONTACT_FIELDS,
    custom_attributes: {},
    changed_attributes: [{ email: { previous_value: null, current_value: 'grace@example.com' } }],
    ...overrides,
  }
}

describe('POST /api/webhooks/chatwoot: contact_updated (tracer, HOOK-04 receiver layer)', () => {
  it('an operator email edit becomes one bucketed hook.chat_contact row with fuse limit 20', async () => {
    const res = await POST(build(contactUpdated()))
    expect(res.status).toBe(200)
    expect(ingestMock).toHaveBeenCalledTimes(1)
    const input = ingestMock.mock.calls[0][0]
    const bucket = Math.floor(NOW_SEC / 30)
    expect(input).toMatchObject({
      source: 'chatwoot',
      eventType: 'hook.chat_contact',
      aggregateType: 'chat_contact',
      aggregateId: aggregateUuid('contact', 7),
      entityKey: 'cw:contact:7',
      fuseLimit: 20,
    })
    expect(input.key.endsWith(`:c7b${bucket}`)).toBe(true)

    await Promise.resolve()
    expect(publishJSONMock).toHaveBeenCalledTimes(1)
    const call = publishJSONMock.mock.calls[0][0]
    expect(call.body).toEqual({ key: input.key })
    expect(call.delay ?? 0).toBeGreaterThanOrEqual(0)
    expect(call.delay ?? 0).toBeLessThanOrEqual(30)
    expect(call.deduplicationId.endsWith('_w')).toBe(true)
  })

  it('the site\'s own fingerprinted write is dropped as echo before the database', async () => {
    const echo = contactUpdated({ custom_attributes: { site_sync_fp: contactFingerprint(CONTACT_FIELDS) } })
    const res = await POST(build(echo))
    expect(res.status).toBe(200)
    expect(ingestMock).not.toHaveBeenCalled()
    await Promise.resolve()
    expect(publishJSONMock).not.toHaveBeenCalled()
    const logged = vi.mocked(console.log).mock.calls.map((c) => c.join(' ')).join('\n')
    expect(logged).toContain('outcome=ignored code=echo')
  })

  it('the same fingerprinted payload with a changed email is ingested', async () => {
    const edited = contactUpdated({
      email: 'grace.new@example.com',
      custom_attributes: { site_sync_fp: contactFingerprint(CONTACT_FIELDS) },
    })
    await POST(build(edited))
    expect(ingestMock).toHaveBeenCalledTimes(1)
  })

  it('an irrelevant contact change is ignored without a database call', async () => {
    const res = await POST(build(contactUpdated({ changed_attributes: [{ last_activity_at: {} }] })))
    expect(res.status).toBe(200)
    expect(ingestMock).not.toHaveBeenCalled()
  })

  it('a fused outcome answers 200, publishes nothing and logs exactly one ALERT line with ids only', async () => {
    ingestMock.mockResolvedValue('fused')
    const res = await POST(build(contactUpdated()))
    expect(res.status).toBe(200)
    await Promise.resolve()
    expect(publishJSONMock).not.toHaveBeenCalled()

    expect(console.error).toHaveBeenCalledTimes(1)
    const line = String(vi.mocked(console.error).mock.calls[0].join(' '))
    expect(line).toContain('ALERT webhook_loop_fused')
    expect(line).toContain('source=chatwoot')
    expect(line).toContain('entity=cw:contact:7')
    for (const secretValue of ['Grace', 'grace@example.com', '+420777888999']) {
      expect(line).not.toContain(secretValue)
    }
  })

  it('message events send no fuse limit and raise no ALERT line', async () => {
    await POST(build(incoming()))
    expect(ingestMock.mock.calls[0][0].fuseLimit).toBeNull()
    expect(console.error).not.toHaveBeenCalled()
  })
})

describe('POST /api/webhooks/chatwoot: conversation events', () => {
  it('a signed resolved status event becomes one hook.chat_resolve row keyed by the resolve moment', async () => {
    const res = await POST(
      build({ event: 'conversation_status_changed', id: 42, status: 'resolved', updated_at: NOW_SEC - 5 + 0.4 }),
    )
    expect(res.status).toBe(200)
    expect(ingestMock).toHaveBeenCalledTimes(1)
    const input = ingestMock.mock.calls[0][0]
    expect(input).toMatchObject({
      eventType: 'hook.chat_resolve',
      aggregateType: 'chat_conversation',
      aggregateId: aggregateUuid('conversation', 42),
      entityKey: 'cw:conv:42',
      fuseLimit: null,
    })
    expect(input.key.endsWith(`:c42r${NOW_SEC - 5}`)).toBe(true)
  })

  it('a no-lead label update becomes one hook.chat_label row', async () => {
    await POST(build({ event: 'conversation_updated', id: 42, labels: ['no-lead'] }))
    expect(ingestMock).toHaveBeenCalledTimes(1)
    expect(ingestMock.mock.calls[0][0]).toMatchObject({ eventType: 'hook.chat_label', fuseLimit: null })
  })

  it.each([
    ['an open status event', { event: 'conversation_status_changed', id: 42, status: 'open' }],
    ['a conversation_updated without the no-lead label', { event: 'conversation_updated', id: 42, labels: ['vip'] }],
    ['an unsubscribed event', { event: 'webwidget_triggered', id: 42 }],
  ])('%s answers 200 and never calls the database', async (_name, payload) => {
    const res = await POST(build(payload))
    expect(res.status).toBe(200)
    expect(ingestMock).not.toHaveBeenCalled()
    expect(publishJSONMock).not.toHaveBeenCalled()
  })
})

describe('POST /api/webhooks/chatwoot: authentication (401 before parsing or any database call)', () => {
  it('rejects a tampered body', async () => {
    const original = Buffer.from(JSON.stringify(incoming()))
    const ts = String(NOW_SEC)
    const signature = sign(SECRETS.current, ts, original)
    const tampered = Buffer.from(JSON.stringify(incoming({ conversation: { id: 43 } })))
    const res = await POST(build(tampered, { signature }))
    expect(res.status).toBe(401)
    expect(ingestMock).not.toHaveBeenCalled()
  })

  it('rejects a wrong secret', async () => {
    const res = await POST(build(incoming(), { secret: SECRETS.wrong }))
    expect(res.status).toBe(401)
    expect(ingestMock).not.toHaveBeenCalled()
  })

  it('rejects a timestamp 301 s old (and accepts 300 s)', async () => {
    const stale = await POST(build(incoming(), { tsOffset: -301 }))
    expect(stale.status).toBe(401)
    expect(ingestMock).not.toHaveBeenCalled()
    const edge = await POST(build(incoming(), { tsOffset: -300 }))
    expect(edge.status).toBe(200)
  })

  it('rejects a short signature with 401, never 500', async () => {
    const res = await POST(build(incoming(), { signature: 'sha256=ab' }))
    expect(res.status).toBe(401)
    expect(ingestMock).not.toHaveBeenCalled()
  })

  it('rejects missing signature headers', async () => {
    const res = await POST(build(incoming(), { skipHeaders: true }))
    expect(res.status).toBe(401)
    expect(ingestMock).not.toHaveBeenCalled()
  })

  it('fails closed when no secret is configured', async () => {
    vi.stubEnv('CHATWOOT_WEBHOOK_SECRET', '')
    vi.stubEnv('CHATWOOT_WEBHOOK_SECRET_PREVIOUS', '')
    const res = await POST(build(incoming()))
    expect(res.status).toBe(401)
    expect(ingestMock).not.toHaveBeenCalled()
  })
})

describe('POST /api/webhooks/chatwoot: body handling', () => {
  it('answers 413 for a declared Content-Length over 1 MiB', async () => {
    const req = new Request('http://localhost/api/webhooks/chatwoot', {
      method: 'POST',
      headers: { 'content-length': '2000000', 'X-Chatwoot-Timestamp': String(NOW_SEC), 'X-Chatwoot-Signature': 'sha256=ab' },
      body: 'x',
    })
    const res = await POST(req)
    expect(res.status).toBe(413)
    expect(ingestMock).not.toHaveBeenCalled()
  })

  it('answers 413 for a body that is over 1 MiB after reading', async () => {
    const big = Buffer.alloc(1_048_577, 0x61)
    const res = await POST(build(big))
    expect(res.status).toBe(413)
    expect(ingestMock).not.toHaveBeenCalled()
  })

  it('answers 400 for a valid signature over non-JSON bytes', async () => {
    const res = await POST(build(Buffer.from('this is not json')))
    expect(res.status).toBe(400)
    expect(ingestMock).not.toHaveBeenCalled()
  })
})

describe('POST /api/webhooks/chatwoot: filtering and outcomes', () => {
  it.each([
    ['outgoing string', { message_type: 'outgoing' }],
    ['outgoing integer', { message_type: 1 }],
    ['private note', { private: true }],
  ])('ignores %s without a database call', async (_name, overrides) => {
    const res = await POST(build(incoming(overrides)))
    expect(res.status).toBe(200)
    expect(ingestMock).not.toHaveBeenCalled()
    expect(publishJSONMock).not.toHaveBeenCalled()
  })

  it('tolerates the integer message_type 0 as incoming', async () => {
    await POST(build(incoming({ message_type: 0 })))
    expect(ingestMock).toHaveBeenCalledTimes(1)
  })

  it('ignores an event the classifier does not handle, without a database call', async () => {
    const res = await POST(build({ event: 'conversation_created', id: 1 }))
    expect(res.status).toBe(200)
    expect(ingestMock).not.toHaveBeenCalled()
  })

  it('answers 200 for an invalid payload and logs key names only', async () => {
    const res = await POST(build({ event: 'message_created', secret_note: 'do not log me' }))
    expect(res.status).toBe(200)
    expect(ingestMock).not.toHaveBeenCalled()
    const logged = vi.mocked(console.log).mock.calls.map((c) => c.join(' ')).join('\n')
    expect(logged).toContain('keys=event,secret_note')
    expect(logged).not.toContain('do not log me')
  })

  it.each(['exists', 'duplicate', 'off', 'fused'])('outcome %s answers 200 and publishes nothing', async (outcome) => {
    ingestMock.mockResolvedValue(outcome)
    const res = await POST(build(incoming()))
    expect(res.status).toBe(200)
    await Promise.resolve()
    expect(publishJSONMock).not.toHaveBeenCalled()
  })

  it('answers 500 when the store fails', async () => {
    ingestMock.mockRejectedValue(new OutboxStoreError('db_error'))
    const res = await POST(build(incoming()))
    expect(res.status).toBe(500)
    expect(publishJSONMock).not.toHaveBeenCalled()
  })

  it('logs one line per request with source, event, outcome and code, and no personal data', async () => {
    await POST(build(incoming()))
    const lines = vi.mocked(console.log).mock.calls.map((c) => c.join(' ')).filter((l) => l.startsWith('[webhook]'))
    expect(lines).toEqual(['[webhook] source=chatwoot event=message_created outcome=queued code=ok'])
    const all = JSON.stringify([...vi.mocked(console.log).mock.calls, ...vi.mocked(console.error).mock.calls])
    expect(all).not.toContain('ada@example.com')
    expect(all).not.toContain('hello')
  })

  it('a second incoming message of the same conversation hits the existing outbox key (exists)', async () => {
    await POST(build(incoming(), { delivery: 'delivery-aaaa-0001' }))
    ingestMock.mockResolvedValue('exists')
    await POST(build(incoming(), { delivery: 'delivery-aaaa-0002' }))
    expect(ingestMock).toHaveBeenCalledTimes(2)
    expect(ingestMock.mock.calls[0][0].key).toBe(ingestMock.mock.calls[1][0].key)
    expect(ingestMock.mock.calls[0][0].deliveryId).not.toBe(ingestMock.mock.calls[1][0].deliveryId)
    await Promise.resolve()
    expect(publishJSONMock).toHaveBeenCalledTimes(1)
  })
})

describe('POST /api/webhooks/chatwoot: secret rotation (HOOK-03)', () => {
  it('a request signed with the previous secret passes while it is set and fails once it is unset', async () => {
    vi.stubEnv('CHATWOOT_WEBHOOK_SECRET_PREVIOUS', SECRETS.previous)
    const body = Buffer.from(JSON.stringify(incoming()))
    const passing = await POST(build(body, { secret: SECRETS.previous }))
    expect(passing.status).toBe(200)
    expect(ingestMock).toHaveBeenCalledTimes(1)

    vi.stubEnv('CHATWOOT_WEBHOOK_SECRET_PREVIOUS', '')
    ingestMock.mockClear()
    const failing = await POST(build(body, { secret: SECRETS.previous }))
    expect(failing.status).toBe(401)
    expect(ingestMock).not.toHaveBeenCalled()
  })

  it('the current secret keeps working while the previous one is set', async () => {
    vi.stubEnv('CHATWOOT_WEBHOOK_SECRET_PREVIOUS', SECRETS.previous)
    const res = await POST(build(incoming(), { secret: SECRETS.current }))
    expect(res.status).toBe(200)
  })

  it('an empty-string previous secret is never used as a key', async () => {
    vi.stubEnv('CHATWOOT_WEBHOOK_SECRET_PREVIOUS', '')
    const res = await POST(build(incoming(), { secret: '' }))
    expect(res.status).toBe(401)
    expect(ingestMock).not.toHaveBeenCalled()

    vi.stubEnv('CHATWOOT_WEBHOOK_SECRET_PREVIOUS', '   ')
    const blank = await POST(build(incoming(), { secret: '' }))
    expect(blank.status).toBe(401)
    expect(ingestMock).not.toHaveBeenCalled()
  })

  it('a timestamp 301 s in the future is rejected and 300 s ahead passes', async () => {
    const ahead = await POST(build(incoming(), { tsOffset: 301 }))
    expect(ahead.status).toBe(401)
    expect(ingestMock).not.toHaveBeenCalled()
    const edge = await POST(build(incoming(), { tsOffset: 300 }))
    expect(edge.status).toBe(200)
  })

  it('a non-numeric timestamp fails closed with 401', async () => {
    const body = Buffer.from(JSON.stringify(incoming()))
    const req = new Request('http://localhost/api/webhooks/chatwoot', {
      method: 'POST',
      headers: { 'X-Chatwoot-Timestamp': 'abc', 'X-Chatwoot-Signature': sign(SECRETS.current, 'abc', body) },
      body: new Uint8Array(body),
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
    expect(ingestMock).not.toHaveBeenCalled()
  })
})

describe('POST /api/webhooks/chatwoot: delivery id', () => {
  const expectedBodyHash = (payload: unknown) =>
    'b' + createHash('sha256').update(Buffer.from(JSON.stringify(payload))).digest('hex')

  it('a missing X-Chatwoot-Delivery header yields a 65-char body-hash id starting with b', async () => {
    await POST(build(incoming(), { delivery: null }))
    const id = ingestMock.mock.calls[0][0].deliveryId as string
    expect(id).toHaveLength(65)
    expect(id.startsWith('b')).toBe(true)
    expect(id).toBe(expectedBodyHash(incoming()))
  })

  it.each(['has spaces in it', 'semi;colon-1234', 'short', 'x'.repeat(65), 'unicode-ééééé'])(
    'a delivery header %j outside [A-Za-z0-9-]{8,64} falls back to the same body-hash id',
    async (delivery) => {
      await POST(build(incoming(), { delivery }))
      expect(ingestMock.mock.calls[0][0].deliveryId).toBe(expectedBodyHash(incoming()))
    },
  )

  it('a well-formed delivery header is used as is', async () => {
    await POST(build(incoming(), { delivery: 'Abc-1234-XYZ' }))
    expect(ingestMock.mock.calls[0][0].deliveryId).toBe('Abc-1234-XYZ')
  })
})

describe('POST /api/webhooks/chatwoot: log hygiene (T-83-55)', () => {
  const PRIVATE_VALUES = ['Grace Hopper', 'grace@example.com', '+420777888999', 'Ada', 'ada@example.com', 'hello', 'secret customer sentence']

  it('no log line from an intake, contact, invalid and fused request carries payload data', async () => {
    await POST(build(incoming({ content: 'secret customer sentence' })))

    await POST(build(contactUpdated()))

    // invalid: valid HMAC, wrong shape; key names only
    await POST(build({ event: 'message_created', content: 'secret customer sentence', sender: { email: 'grace@example.com' } }))

    ingestMock.mockResolvedValue('fused')
    await POST(build(contactUpdated()))

    const lines = [...vi.mocked(console.log).mock.calls, ...vi.mocked(console.error).mock.calls, ...vi.mocked(console.warn).mock.calls]
      .map((c) => c.map(String).join(' '))
    expect(lines.length).toBeGreaterThanOrEqual(4)
    for (const line of lines) {
      for (const value of PRIVATE_VALUES) expect(line).not.toContain(value)
    }
  })

  it('an invalid payload logs its top-level key names only', async () => {
    await POST(build({ event: 'message_created', content: 'secret customer sentence', sender: { email: 'grace@example.com' } }))
    const lines = vi.mocked(console.log).mock.calls.map((c) => c.map(String).join(' '))
    expect(lines).toEqual([
      '[webhook] source=chatwoot event=message_created outcome=ignored code=invalid_payload keys=event,content,sender',
    ])
  })

  it('key names outside a safe charset are dropped from the log line', async () => {
    await POST(build({ event: 'message_created', 'grace@example.com': 1, 'a b': 2, ok_key: 3 }))
    const logged = vi.mocked(console.log).mock.calls.map((c) => c.map(String).join(' ')).join('\n')
    expect(logged).toContain('keys=event,ok_key')
    expect(logged).not.toContain('grace@example.com')
  })

  it('the unauthorized path logs a code only', async () => {
    await POST(build(incoming(), { secret: SECRETS.wrong }))
    const lines = vi.mocked(console.log).mock.calls.map((c) => c.map(String).join(' '))
    expect(lines).toEqual(['[webhook] source=chatwoot event=none outcome=rejected code=bad_signature'])
  })

  it('an event name that is not on the allowlist is logged as other', async () => {
    await POST(build({ event: 'grace@example.com', id: 1 }))
    const logged = vi.mocked(console.log).mock.calls.map((c) => c.map(String).join(' ')).join('\n')
    expect(logged).toContain('event=other')
    expect(logged).not.toContain('grace@example.com')
  })
})

describe('receiver isolation (D-15)', () => {
  it('imports no CRM client, dispatcher or handler module', async () => {
    const { readFileSync } = await import('node:fs')
    const src = readFileSync('app/api/webhooks/chatwoot/route.ts', 'utf8')
    expect(src).not.toMatch(/from '@\/lib\/(lead-sync|chatwoot-client|espocrm-client|crm-sync|chatwoot-sync|hook-dispatch)'/)
  })
})
