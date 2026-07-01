import { describe, it, expect, beforeEach, vi } from 'vitest'

const { mockUpload, mockGetPublicUrl } = vi.hoisted(() => ({
  mockUpload: vi.fn(),
  mockGetPublicUrl: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({
  createSupabaseServiceClient: () => ({
    storage: {
      from: () => ({ upload: mockUpload, getPublicUrl: mockGetPublicUrl }),
    },
  }),
}))

process.env.CONTENT_INGEST_SECRET = 'test-secret'

import { POST } from '@/app/api/content/upload-media/route'

// Build a Request-like object whose formData() returns the prepared FormData
// directly — the jsdom/undici Request<->multipart round-trip drops binary parts.
function req(form: FormData | null, auth = 'Bearer test-secret') {
  return {
    headers: { get: (k: string) => (k.toLowerCase() === 'authorization' ? auth : null) },
    formData: async () => {
      if (!form) throw new Error('not multipart')
      return form
    },
  } as unknown as Request
}

function fileForm(bytes: number, type: string, extra: Record<string, string> = {}) {
  const f = new FormData()
  f.set('file', new Blob([new Uint8Array(bytes)], { type }))
  for (const [k, v] of Object.entries(extra)) f.set(k, v)
  return f
}

describe('POST /api/content/upload-media', () => {
  beforeEach(() => {
    mockUpload.mockReset()
    mockGetPublicUrl.mockReset()
    mockUpload.mockResolvedValue({ error: null })
    mockGetPublicUrl.mockReturnValue({ data: { publicUrl: 'https://x.supabase.co/storage/v1/object/public/content-media/reels/a.mp4' } })
  })

  it('rejects a bad bearer token', async () => {
    const res = await POST(req(fileForm(10, 'video/mp4'), 'Bearer wrong'))
    expect(res.status).toBe(401)
    expect(mockUpload).not.toHaveBeenCalled()
  })

  it('422 when no file', async () => {
    const res = await POST(req(new FormData()))
    expect(res.status).toBe(422)
  })

  it('422 on unsupported content type', async () => {
    const res = await POST(req(fileForm(10, 'application/zip')))
    expect(res.status).toBe(422)
  })

  it('uploads an mp4 and returns the public url', async () => {
    const res = await POST(req(fileForm(1024, 'video/mp4')))
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.ok).toBe(true)
    expect(json.url).toContain('/content-media/')
    // uploaded with the right content type
    expect(mockUpload.mock.calls[0][2]).toMatchObject({ contentType: 'video/mp4', upsert: true })
    // generated a reels/*.mp4 path
    expect(mockUpload.mock.calls[0][0]).toMatch(/^reels\/.*\.mp4$/)
  })

  it('honours a provided kebab path', async () => {
    await POST(req(fileForm(1024, 'video/mp4', { path: 'reels/hotel-arrival.mp4' })))
    expect(mockUpload.mock.calls[0][0]).toBe('reels/hotel-arrival.mp4')
  })

  it('returns 502 when storage upload fails', async () => {
    mockUpload.mockResolvedValueOnce({ error: { message: 'boom' } })
    const res = await POST(req(fileForm(1024, 'video/mp4')))
    expect(res.status).toBe(502)
  })
})
