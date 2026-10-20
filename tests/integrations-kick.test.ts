// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const { mockPublish } = vi.hoisted(() => ({ mockPublish: vi.fn() }))

vi.mock('@/lib/outbox', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/outbox')>()
  return { ...actual, publishOutboxDispatch: mockPublish }
})

import { POST } from '@/app/api/integrations/kick/route'

const SECRET = 'kick_SECRET_0123456789abcdef'
const ID = '0b9f2c1e-5d3a-4e8b-9c7d-1a2b3c4d5e6f'
const KEY = `lead.booking:${ID}:new`
const URL_ = 'https://rideprestigo.com/api/integrations/kick'

function req(body: string, headers: Record<string, string> = { Authorization: `Bearer ${SECRET}` }) {
  return new Request(URL_, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body })
}

describe('POST /api/integrations/kick', () => {
  const saved = process.env.OUTBOX_KICK_SECRET

  beforeEach(() => {
    mockPublish.mockReset().mockResolvedValue(true)
    process.env.OUTBOX_KICK_SECRET = SECRET
  })

  afterEach(() => {
    if (saved === undefined) delete process.env.OUTBOX_KICK_SECRET
    else process.env.OUTBOX_KICK_SECRET = saved
  })

  it('401 without an Authorization header', async () => {
    const res = await POST(req(JSON.stringify({ key: KEY }), {}))
    expect(res.status).toBe(401)
    expect(mockPublish).not.toHaveBeenCalled()
  })

  it('401 with a wrong bearer', async () => {
    const res = await POST(req(JSON.stringify({ key: KEY }), { Authorization: 'Bearer nope' }))
    expect(res.status).toBe(401)
    expect(mockPublish).not.toHaveBeenCalled()
  })

  it('401 with a bearer of the right length but wrong content', async () => {
    const wrong = `Bearer ${'x'.repeat(SECRET.length)}`
    const res = await POST(req(JSON.stringify({ key: KEY }), { Authorization: wrong }))
    expect(res.status).toBe(401)
    expect(mockPublish).not.toHaveBeenCalled()
  })

  it('401 when OUTBOX_KICK_SECRET is unset, even for an "empty" bearer (fail closed)', async () => {
    delete process.env.OUTBOX_KICK_SECRET
    for (const header of ['Bearer undefined', 'Bearer ', `Bearer ${SECRET}`]) {
      const res = await POST(req(JSON.stringify({ key: KEY }), { Authorization: header }))
      expect(res.status).toBe(401)
    }
    expect(mockPublish).not.toHaveBeenCalled()
  })

  it('400 for a key that is not a lead.booking key', async () => {
    const res = await POST(req(JSON.stringify({ key: `lead.inquiry:${ID}` })))
    expect(res.status).toBe(400)
    expect(mockPublish).not.toHaveBeenCalled()
  })

  it.each([
    ['sync.booking', `sync.booking:${ID}:19650`],
    ['sync.signup', `sync.signup:${ID}:19650`],
  ])('200 and a 90 s delayed, deduplicated dispatch for a valid %s key', async (_name, key) => {
    const res = await POST(req(JSON.stringify({ key })))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, published: true })
    expect(mockPublish).toHaveBeenCalledTimes(1)
    expect(mockPublish).toHaveBeenCalledWith(key, { delaySeconds: 90, dedupSuffix: 'k' })
  })

  it.each([
    ['sync.espo', `sync.espo:${ID}:19650`],
    ['sync.chatwoot', `sync.chatwoot:${ID}:19650`],
    ['erase.person', `erase.person:${ID}`],
    ['lead.inquiry', `lead.inquiry:${ID}`],
    ['lead.purge', `lead.purge:${ID}`],
    ['a sync.booking key without a tag', `sync.booking:${ID}`],
  ])('400 for %s (not a capture key)', async (_name, key) => {
    const res = await POST(req(JSON.stringify({ key })))
    expect(res.status).toBe(400)
    expect(mockPublish).not.toHaveBeenCalled()
  })

  it('400 for a lead.booking key with an unknown status suffix', async () => {
    const res = await POST(req(JSON.stringify({ key: `lead.booking:${ID}:bogus` })))
    expect(res.status).toBe(400)
  })

  it('400 for malformed JSON, a missing key and extra fields', async () => {
    expect((await POST(req('{not json'))).status).toBe(400)
    expect((await POST(req('{}'))).status).toBe(400)
    expect((await POST(req(JSON.stringify({ key: KEY, extra: 1 })))).status).toBe(400)
    expect(mockPublish).not.toHaveBeenCalled()
  })

  it('200 and a 90 s delayed, deduplicated dispatch for a valid booking key', async () => {
    const res = await POST(req(JSON.stringify({ key: KEY })))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, published: true })
    expect(mockPublish).toHaveBeenCalledTimes(1)
    expect(mockPublish).toHaveBeenCalledWith(KEY, { delaySeconds: 90, dedupSuffix: 'k' })
  })

  it('reports published:false (still 200) when the publish failed', async () => {
    mockPublish.mockResolvedValue(false)
    const res = await POST(req(JSON.stringify({ key: KEY })))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, published: false })
  })

  it('413 for a body over 512 bytes (content-length header)', async () => {
    const res = await POST(req('x', { Authorization: `Bearer ${SECRET}`, 'content-length': '2048' }))
    expect(res.status).toBe(413)
    expect(mockPublish).not.toHaveBeenCalled()
  })

  it('413 for a measured body over 512 bytes', async () => {
    const res = await POST(req(JSON.stringify({ key: KEY, pad: 'x'.repeat(600) })))
    expect(res.status).toBe(413)
    expect(mockPublish).not.toHaveBeenCalled()
  })
})
