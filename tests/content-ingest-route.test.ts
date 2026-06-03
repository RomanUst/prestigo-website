import { describe, it, expect, beforeEach, vi } from 'vitest'

const { mockBrandStill, mockInsert, mockSendApproval } = vi.hoisted(() => ({
  mockBrandStill: vi.fn(),
  mockInsert: vi.fn(),
  mockSendApproval: vi.fn(),
}))

vi.mock('@/lib/content/publish', () => ({ brandStill: mockBrandStill }))
vi.mock('@/lib/content/store', () => ({ insertContentItem: mockInsert }))
vi.mock('@/lib/content/telegram', () => ({ sendApprovalMessage: mockSendApproval }))

process.env.CONTENT_INGEST_SECRET = 'test-secret'
process.env.TELEGRAM_ADMIN_CHAT_ID = '12345'

import { POST } from '@/app/api/content/ingest/route'

function req(body: unknown, auth = 'Bearer test-secret') {
  return new Request('http://localhost/api/content/ingest', {
    method: 'POST',
    headers: { authorization: auth, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const validPost = {
  type: 'post',
  channels: { instagram: true },
  headline: 'Arrive in',
  headline_em: 'Prague',
  caption: 'Caption',
  media_raw_url: 'https://img/raw.jpg',
}

describe('POST /api/content/ingest', () => {
  beforeEach(() => {
    mockBrandStill.mockReset()
    mockInsert.mockReset()
    mockSendApproval.mockReset()
  })

  it('rejects a missing/incorrect bearer token with 401', async () => {
    const res = await POST(req(validPost, 'Bearer wrong'))
    expect(res.status).toBe(401)
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('returns 400 on an invalid payload', async () => {
    const res = await POST(req({ type: 'tweet' }))
    expect(res.status).toBe(400)
  })

  it('returns 422 when a post is missing media or headline', async () => {
    const res = await POST(req({ type: 'post', channels: { instagram: true }, headline: 'x' }))
    expect(res.status).toBe(422)
  })

  it('brands the still, inserts pending_approval, and notifies Telegram', async () => {
    mockBrandStill.mockResolvedValueOnce('https://hcti.io/v1/image/branded')
    mockInsert.mockResolvedValueOnce({
      id: 'new-1',
      status: 'pending_approval',
      type: 'post',
      topic: null,
      headline: 'Arrive in',
      headline_em: 'Prague',
      caption: 'Caption',
      media_branded_url: 'https://hcti.io/v1/image/branded',
      media_raw_url: 'https://img/raw.jpg',
    })
    mockSendApproval.mockResolvedValueOnce({ messageId: 7 })

    const res = await POST(req(validPost))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json).toMatchObject({ ok: true, id: 'new-1', status: 'pending_approval', approvalSent: true })
    // Branding ran with the raw url; insert received the branded url.
    expect(mockBrandStill).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'post', media_raw_url: 'https://img/raw.jpg' })
    )
    expect(mockInsert.mock.calls[0][0].media_branded_url).toBe('https://hcti.io/v1/image/branded')
    expect(mockSendApproval).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'new-1', imageUrl: 'https://hcti.io/v1/image/branded' })
    )
  })

  it('still succeeds (approvalSent=false) when Telegram notification fails', async () => {
    mockBrandStill.mockResolvedValueOnce('https://hcti.io/v1/image/branded')
    mockInsert.mockResolvedValueOnce({
      id: 'new-2',
      status: 'pending_approval',
      type: 'post',
      media_branded_url: 'https://hcti.io/v1/image/branded',
    })
    mockSendApproval.mockRejectedValueOnce(new Error('telegram down'))

    const res = await POST(req(validPost))
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.approvalSent).toBe(false)
  })

  it('returns 502 when branding fails', async () => {
    mockBrandStill.mockRejectedValueOnce(new Error('HCTI 500'))
    const res = await POST(req(validPost))
    expect(res.status).toBe(502)
    expect(mockInsert).not.toHaveBeenCalled()
  })
})
