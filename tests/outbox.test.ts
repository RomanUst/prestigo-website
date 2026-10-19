// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { publishJSONMock, afterMock, rpcMock, createClientMock } = vi.hoisted(() => ({
  publishJSONMock: vi.fn(),
  afterMock: vi.fn(),
  rpcMock: vi.fn(),
  createClientMock: vi.fn(),
}))

vi.mock('@upstash/qstash', () => ({
  Client: class {
    publishJSON = publishJSONMock
  },
}))
vi.mock('next/server', () => ({ after: afterMock }))
vi.mock('@/lib/supabase', () => ({ createSupabaseServiceClient: createClientMock }))

import {
  parseOutboxKey,
  inquiryOutboxKey,
  publishOutboxDispatch,
  dispatchAfterResponse,
  enqueueOutboxEvent,
  syncBucketKey,
} from '@/lib/outbox'

const ID = '0b9f2c1e-5d3a-4e8b-9c7d-1a2b3c4d5e6f'

describe('parseOutboxKey', () => {
  it('accepts the three key shapes', () => {
    expect(parseOutboxKey(`lead.inquiry:${ID}`)).toEqual({
      eventType: 'lead.inquiry',
      aggregateId: ID,
      leadStatus: null,
    })
    expect(parseOutboxKey(`lead.purge:${ID}`)).toEqual({
      eventType: 'lead.purge',
      aggregateId: ID,
      leadStatus: null,
    })
    for (const s of ['new', 'in_process', 'converted', 'dead']) {
      expect(parseOutboxKey(`lead.booking:${ID}:${s}`)).toEqual({
        eventType: 'lead.booking',
        aggregateId: ID,
        leadStatus: s,
      })
    }
  })

  it('rejects malformed keys', () => {
    expect(parseOutboxKey(`lead.inquiry:${ID.toUpperCase()}`)).toBeNull()
    expect(parseOutboxKey(`lead.other:${ID}`)).toBeNull()
    expect(parseOutboxKey('lead.inquiry:')).toBeNull()
    expect(parseOutboxKey('lead.inquiry')).toBeNull()
    expect(parseOutboxKey(`lead.booking:${ID}`)).toBeNull()
    expect(parseOutboxKey(`lead.booking:${ID}:bogus`)).toBeNull()
    expect(parseOutboxKey(`lead.inquiry:${ID}:extra`)).toBeNull()
    expect(parseOutboxKey(`lead.purge:${ID}:new`)).toBeNull()
    expect(parseOutboxKey('')).toBeNull()
  })

  it('inquiryOutboxKey round-trips through parseOutboxKey', () => {
    expect(parseOutboxKey(inquiryOutboxKey(ID))?.aggregateId).toBe(ID)
  })
})

describe('parseOutboxKey: Phase 82 sync keys', () => {
  it.each(['sync.booking', 'sync.signup', 'sync.espo', 'sync.chatwoot'] as const)(
    'round-trips %s with its bucket tag',
    (eventType) => {
      expect(parseOutboxKey(`${eventType}:${ID}:19650`)).toEqual({
        eventType,
        aggregateId: ID,
        leadStatus: null,
        tag: '19650',
      })
    },
  )

  it('accepts erase.person with no tag', () => {
    expect(parseOutboxKey(`erase.person:${ID}`)).toEqual({
      eventType: 'erase.person',
      aggregateId: ID,
      leadStatus: null,
      tag: null,
    })
  })

  it('leaves lead.* results without a tag property', () => {
    expect(parseOutboxKey(`lead.inquiry:${ID}`)).not.toHaveProperty('tag')
    expect(parseOutboxKey(`lead.booking:${ID}:new`)).not.toHaveProperty('tag')
  })

  it('rejects a sync key without a tag, with a bad tag, or with extra segments', () => {
    expect(parseOutboxKey(`sync.booking:${ID}`)).toBeNull()
    expect(parseOutboxKey(`sync.booking:${ID}:`)).toBeNull()
    expect(parseOutboxKey(`sync.booking:${ID}:UPPER`)).toBeNull()
    expect(parseOutboxKey(`sync.booking:${ID}:12:34`)).toBeNull()
    expect(parseOutboxKey(`sync.booking:${ID}:${'9'.repeat(25)}`)).toBeNull()
    expect(parseOutboxKey(`sync.other:${ID}:12`)).toBeNull()
    expect(parseOutboxKey(`sync.booking:${ID.toUpperCase()}:12`)).toBeNull()
    expect(parseOutboxKey(`erase.person:${ID}:12`)).toBeNull()
  })
})

describe('syncBucketKey', () => {
  it('tags by 30 s bucket and is available only when the bucket has closed', () => {
    const { key, availableAt } = syncBucketKey('sync.espo', ID, 30_000 * 7 + 5)
    expect(key).toBe(`sync.espo:${ID}:7`)
    expect(availableAt.getTime()).toBe(240_000)
  })

  it('honours a custom bucket size', () => {
    const { key, availableAt } = syncBucketKey('sync.chatwoot', ID, 90_000 * 3 + 89_999, 90)
    expect(key).toBe(`sync.chatwoot:${ID}:3`)
    expect(availableAt.getTime()).toBe(90_000 * 4)
  })

  it('two instants in one bucket share a key, the next bucket gets a new one', () => {
    const a = syncBucketKey('sync.espo', ID, 60_000)
    const b = syncBucketKey('sync.espo', ID, 89_999)
    const c = syncBucketKey('sync.espo', ID, 90_000)
    expect(a.key).toBe(b.key)
    expect(c.key).not.toBe(a.key)
  })

  it('produces a key that parseOutboxKey accepts and that fits the 120-character column check', () => {
    const { key } = syncBucketKey('sync.chatwoot', ID, Date.now())
    expect(key.length).toBeLessThanOrEqual(120)
    expect(parseOutboxKey(key)?.eventType).toBe('sync.chatwoot')
  })
})

describe('publishOutboxDispatch', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    publishJSONMock.mockReset()
    publishJSONMock.mockResolvedValue({ messageId: 'm1' })
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    process.env.NEXT_PUBLIC_SITE_URL = 'https://example.test'
  })

  afterEach(() => {
    errorSpy.mockRestore()
    delete process.env.NEXT_PUBLIC_SITE_URL
  })

  it('publishes { key } to the dispatcher URL', async () => {
    expect(await publishOutboxDispatch(`lead.inquiry:${ID}`)).toBe(true)
    expect(publishJSONMock).toHaveBeenCalledTimes(1)
    const arg = publishJSONMock.mock.calls[0][0]
    expect(arg.url).toBe('https://example.test/api/integrations/dispatch')
    expect(arg.body).toEqual({ key: `lead.inquiry:${ID}` })
  })

  it('returns false without publishing when the site URL is missing', async () => {
    delete process.env.NEXT_PUBLIC_SITE_URL
    expect(await publishOutboxDispatch(`lead.inquiry:${ID}`)).toBe(false)
    expect(publishJSONMock).not.toHaveBeenCalled()
  })

  it('returns false and does not throw on a publish error, logging no payload', async () => {
    publishJSONMock.mockRejectedValue(new Error('boom lead.inquiry'))
    expect(await publishOutboxDispatch(`lead.inquiry:${ID}`)).toBe(false)
    expect(errorSpy.mock.calls.join(' ')).not.toContain(ID)
  })

  it('logs the HTTP status and error class of a QStash failure, never its message', async () => {
    class QstashError extends Error {
      status: number
      constructor(message: string, status: number) {
        super(message)
        this.name = 'QstashError'
        this.status = status
      }
    }
    publishJSONMock.mockRejectedValue(new QstashError(`unauthorized lead.inquiry:${ID}`, 401))
    expect(await publishOutboxDispatch(`lead.inquiry:${ID}`)).toBe(false)
    const logged = errorSpy.mock.calls.join(' ')
    expect(logged).toContain('code=publish_error status=401 error=QstashError')
    expect(logged).not.toContain(ID)
    expect(logged).not.toContain('unauthorized')
  })

  it('trims a stray newline from NEXT_PUBLIC_SITE_URL so the signed URL matches the receiver', async () => {
    const prev = process.env.NEXT_PUBLIC_SITE_URL
    process.env.NEXT_PUBLIC_SITE_URL = 'https://rideprestigo.com\n'
    try {
      await publishOutboxDispatch(`lead.inquiry:${ID}`)
      expect(publishJSONMock.mock.calls[0][0].url).toBe('https://rideprestigo.com/api/integrations/dispatch')
    } finally {
      process.env.NEXT_PUBLIC_SITE_URL = prev
    }
  })

  it('builds a sanitised deduplicationId from dedupSuffix', async () => {
    await publishOutboxDispatch(`lead.inquiry:${ID}`, { dedupSuffix: 'p' })
    const arg = publishJSONMock.mock.calls[0][0]
    expect(arg.deduplicationId).toBe(`lead.inquiry_${ID}_p`)
    expect(arg.deduplicationId).toMatch(/^[A-Za-z0-9._-]+$/)
  })

  it('omits deduplicationId when no suffix is given', async () => {
    await publishOutboxDispatch(`lead.inquiry:${ID}`)
    expect(publishJSONMock.mock.calls[0][0]).not.toHaveProperty('deduplicationId')
  })

  it('clamps the delay to 0..604800', async () => {
    await publishOutboxDispatch(`lead.inquiry:${ID}`, { delaySeconds: 10_000_000 })
    expect(publishJSONMock.mock.calls[0][0].delay).toBe(604_800)
    publishJSONMock.mockClear()
    await publishOutboxDispatch(`lead.inquiry:${ID}`, { delaySeconds: -5 })
    expect(publishJSONMock.mock.calls[0][0]).not.toHaveProperty('delay')
    publishJSONMock.mockClear()
    await publishOutboxDispatch(`lead.inquiry:${ID}`, { delaySeconds: 90 })
    expect(publishJSONMock.mock.calls[0][0].delay).toBe(90)
  })
})

describe('dispatchAfterResponse', () => {
  beforeEach(() => {
    afterMock.mockReset()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  it('does not throw when after() throws (no request scope)', () => {
    afterMock.mockImplementation(() => {
      throw new Error('after() was called outside a request scope')
    })
    expect(() => dispatchAfterResponse(`lead.inquiry:${ID}`)).not.toThrow()
  })

  it('registers one callback with after()', () => {
    dispatchAfterResponse(`lead.inquiry:${ID}`)
    expect(afterMock).toHaveBeenCalledTimes(1)
    expect(typeof afterMock.mock.calls[0][0]).toBe('function')
  })
})

describe('enqueueOutboxEvent', () => {
  const input = {
    eventType: 'lead.inquiry',
    aggregateType: 'inquiry',
    aggregateId: ID,
    idempotencyKey: `lead.inquiry:${ID}`,
    availableAt: new Date('2026-10-18T10:00:00.000Z'),
  }

  beforeEach(() => {
    rpcMock.mockReset()
    createClientMock.mockReset()
    createClientMock.mockReturnValue({ rpc: rpcMock })
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('calls the outbox_enqueue RPC with mapped params', async () => {
    rpcMock.mockResolvedValue({ data: true, error: null })
    expect(await enqueueOutboxEvent(input)).toBe(true)
    expect(rpcMock).toHaveBeenCalledWith('outbox_enqueue', {
      p_event_type: 'lead.inquiry',
      p_aggregate_type: 'inquiry',
      p_aggregate_id: ID,
      p_key: `lead.inquiry:${ID}`,
      p_available_at: '2026-10-18T10:00:00.000Z',
    })
  })

  it('returns false when the row already existed', async () => {
    rpcMock.mockResolvedValue({ data: false, error: null })
    expect(await enqueueOutboxEvent(input)).toBe(false)
  })

  it('returns false on an RPC error', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { code: '42501', message: 'denied' } })
    expect(await enqueueOutboxEvent(input)).toBe(false)
  })

  it('returns false when the client factory throws', async () => {
    createClientMock.mockImplementation(() => {
      throw new Error('supabaseUrl is required')
    })
    expect(await enqueueOutboxEvent(input)).toBe(false)
  })
})
