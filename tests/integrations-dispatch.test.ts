// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest'

const { mockVerify, mockDispatch, receiverCtor } = vi.hoisted(() => ({
  mockVerify: vi.fn(),
  mockDispatch: vi.fn(),
  receiverCtor: vi.fn(),
}))

vi.mock('@upstash/qstash', () => ({
  // Regular function so `new Receiver(...)` works.
  Receiver: vi.fn().mockImplementation(function (cfg: unknown) {
    receiverCtor(cfg)
    return { verify: mockVerify }
  }),
}))

vi.mock('@/lib/lead-sync', () => ({ dispatchOutboxKey: mockDispatch }))

import { POST, maxDuration } from '@/app/api/integrations/dispatch/route'

const KEY = 'lead.inquiry:0b9f2c1e-5d3a-4e8b-9c7d-1a2b3c4d5e6f'
const URL_ = 'https://rideprestigo.com/api/integrations/dispatch'

function req(body: string, headers: Record<string, string> = { 'Upstash-Signature': 'sig' }) {
  return new Request(URL_, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body })
}

describe('POST /api/integrations/dispatch', () => {
  beforeEach(() => {
    mockVerify.mockReset().mockResolvedValue(true)
    mockDispatch.mockReset().mockResolvedValue({ outcome: 'sent' })
    process.env.NEXT_PUBLIC_SITE_URL = 'https://rideprestigo.com'
  })

  it('exports maxDuration 60', () => {
    expect(maxDuration).toBe(60)
  })

  it('returns 401 when the signature is invalid', async () => {
    mockVerify.mockResolvedValue(false)
    const res = await POST(req(JSON.stringify({ key: KEY })))
    expect(res.status).toBe(401)
    expect(mockDispatch).not.toHaveBeenCalled()
  })

  it('returns 401 when the signature verification throws', async () => {
    mockVerify.mockRejectedValue(new Error('boom'))
    const res = await POST(req(JSON.stringify({ key: KEY })))
    expect(res.status).toBe(401)
    expect(mockDispatch).not.toHaveBeenCalled()
  })

  it('returns 401 when the Upstash-Signature header is absent', async () => {
    const res = await POST(req(JSON.stringify({ key: KEY }), {}))
    expect(res.status).toBe(401)
    expect(mockDispatch).not.toHaveBeenCalled()
  })

  it('verifies over the raw body with the expected URL', async () => {
    const raw = JSON.stringify({ key: KEY })
    await POST(req(raw))
    expect(mockVerify).toHaveBeenCalledWith({ signature: 'sig', body: raw, url: URL_ })
  })

  it('returns 413 for a body over 1 KB (content-length header)', async () => {
    const res = await POST(req('x', { 'Upstash-Signature': 'sig', 'content-length': '2048' }))
    expect(res.status).toBe(413)
    expect(mockDispatch).not.toHaveBeenCalled()
  })

  it('returns 413 for a body over 1 KB even without a content-length header', async () => {
    const res = await POST(req(JSON.stringify({ key: 'a'.repeat(2048) })))
    expect(res.status).toBe(413)
    expect(mockDispatch).not.toHaveBeenCalled()
  })

  it('returns 400 for a body that is not JSON (valid signature)', async () => {
    const res = await POST(req('not json'))
    expect(res.status).toBe(400)
    expect(mockDispatch).not.toHaveBeenCalled()
  })

  it('returns 400 when the body has extra properties', async () => {
    const res = await POST(req(JSON.stringify({ key: KEY, extra: 1 })))
    expect(res.status).toBe(400)
    expect(mockDispatch).not.toHaveBeenCalled()
  })

  it('returns 400 for a key longer than 120 characters', async () => {
    const res = await POST(req(JSON.stringify({ key: 'k'.repeat(121) })))
    expect(res.status).toBe(400)
    expect(mockDispatch).not.toHaveBeenCalled()
  })

  it('returns 400 for an empty key and for a non-string key', async () => {
    expect((await POST(req(JSON.stringify({ key: '' })))).status).toBe(400)
    expect((await POST(req(JSON.stringify({ key: 5 })))).status).toBe(400)
  })

  it('returns 200 with the dispatcher result for a valid call', async () => {
    mockDispatch.mockResolvedValue({ outcome: 'rescheduled', code: 'crm_unreachable' })
    const res = await POST(req(JSON.stringify({ key: KEY })))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ outcome: 'rescheduled', code: 'crm_unreachable' })
    expect(mockDispatch).toHaveBeenCalledWith(KEY)
  })

  it('returns 500 dispatch_failed when the dispatcher throws', async () => {
    mockDispatch.mockRejectedValue(new Error('store down'))
    const res = await POST(req(JSON.stringify({ key: KEY })))
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'dispatch_failed' })
  })
})
