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
