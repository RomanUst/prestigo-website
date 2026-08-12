import { describe, it, expect, beforeEach, vi } from 'vitest'

const { mockFetch } = vi.hoisted(() => ({ mockFetch: vi.fn() }))
vi.stubGlobal('fetch', mockFetch)

process.env.METRICOOL_API_TOKEN = 'mc-token'
process.env.METRICOOL_USER_ID = '5067926'
process.env.METRICOOL_BLOG_ID = '6581736'

import { createMetricoolPost, createMetricoolPosts } from '@/lib/content/metricool'

function ok(body: unknown) {
  return { ok: true, status: 200, json: async () => body, text: async () => '' }
}

/** Parsed JSON body of the Nth fetch call. */
function callBody(n = 0): Record<string, unknown> {
  return JSON.parse(mockFetch.mock.calls[n][1].body as string)
}

function callUrl(n = 0): string {
  return mockFetch.mock.calls[n][0] as string
}

function callHeaders(n = 0): Record<string, string> {
  return mockFetch.mock.calls[n][1].headers as Record<string, string>
}

describe('lib/content/metricool', () => {
  beforeEach(() => mockFetch.mockReset())

  it('creates a scheduled IG image post and returns the post id', async () => {
    mockFetch.mockResolvedValueOnce(ok({ data: { id: 356940931 } }))

    const res = await createMetricoolPost({
      channel: 'instagram',
      text: 'Caption #prague',
      mediaUrl: 'https://hcti.io/v1/image/abc',
      mediaKind: 'image',
      dueAt: '2026-06-10T09:00:00Z',
    })

    expect(res.postId).toBe('356940931')
    expect(callUrl()).toBe('https://app.metricool.com/api/v2/scheduler/posts?blogId=6581736&userId=5067926')
    expect(callHeaders()['X-Mc-Auth']).toBe('mc-token')
    const body = callBody()
    expect(body.providers).toEqual([{ network: 'instagram' }])
    expect(body.media).toEqual(['https://hcti.io/v1/image/abc'])
    expect(body.instagramData).toEqual({ type: 'POST', showReelOnFeed: true })
  })

  it('Facebook posts require a type (mirrors old Buffer requirement)', async () => {
    mockFetch.mockResolvedValueOnce(ok({ data: { id: 2 } }))
    await createMetricoolPost({ channel: 'facebook', text: 't', mediaUrl: 'u', mediaKind: 'image' })
    const body = callBody()
    expect(body.facebookData).toEqual({ type: 'POST' })
    expect(body.instagramData).toBeUndefined()
  })

  it('sends a reel as a video asset with REEL type', async () => {
    mockFetch.mockResolvedValueOnce(ok({ data: { id: 3 } }))
    await createMetricoolPost({
      channel: 'instagram',
      text: 'Reel',
      mediaUrl: 'https://store/video.mp4',
      mediaKind: 'video',
      format: 'reel',
    })
    const body = callBody()
    expect(body.media).toEqual(['https://store/video.mp4'])
    expect(body.instagramData).toEqual({ type: 'REEL', showReelOnFeed: true })
  })

  it('sends a story with STORY type', async () => {
    mockFetch.mockResolvedValueOnce(ok({ data: { id: 4 } }))
    await createMetricoolPost({
      channel: 'facebook',
      text: '',
      mediaUrl: 'https://hcti.io/v1/image/story',
      mediaKind: 'image',
      format: 'story',
    })
    const body = callBody()
    expect(body.facebookData).toEqual({ type: 'STORY' })
  })

  it('createMetricoolPosts fans out one call per channel', async () => {
    mockFetch
      .mockResolvedValueOnce(ok({ data: { id: 'ig' } }))
      .mockResolvedValueOnce(ok({ data: { id: 'fb' } }))

    const res = await createMetricoolPosts(['instagram', 'facebook'], {
      text: 't',
      mediaUrl: 'u',
      mediaKind: 'image',
    })
    expect(res.postIds).toEqual({ instagram: 'ig', facebook: 'fb' })
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it('throws with the Metricool error body on a non-OK response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => '{"message":"Access token is not valid"}',
    })
    await expect(
      createMetricoolPost({ channel: 'facebook', text: 't', mediaUrl: 'u', mediaKind: 'image' })
    ).rejects.toThrow(/Metricool API HTTP 401.*Access token is not valid/)
  })

  it('throws on a missing token env', async () => {
    const prev = process.env.METRICOOL_API_TOKEN
    delete process.env.METRICOOL_API_TOKEN
    await expect(
      createMetricoolPost({ channel: 'facebook', text: 't', mediaUrl: 'u', mediaKind: 'image' })
    ).rejects.toThrow(/METRICOOL_API_TOKEN/)
    process.env.METRICOOL_API_TOKEN = prev
  })
})
