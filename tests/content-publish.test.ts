import { describe, it, expect, beforeEach, vi } from 'vitest'

const { mockGet, mockUpdate, mockMetricoolPost, mockPublishBlog, mockFetch } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockUpdate: vi.fn(),
  mockMetricoolPost: vi.fn(),
  mockPublishBlog: vi.fn(),
  mockFetch: vi.fn(),
}))

vi.mock('@/lib/content/store', () => ({
  getContentItem: mockGet,
  updateContentItem: mockUpdate,
}))
vi.mock('@/lib/content/metricool', () => ({ createMetricoolPost: mockMetricoolPost }))
vi.mock('@/lib/content/github-publish', () => ({ publishBlogToGitHub: mockPublishBlog }))
vi.stubGlobal('fetch', mockFetch)

import { approveContent, rejectContent } from '@/lib/content/publish'

function item(overrides: Record<string, unknown> = {}) {
  return {
    id: 'c1',
    type: 'post',
    status: 'pending_approval',
    channels: { instagram: true, facebook: true },
    caption: 'Caption',
    hashtags: '#prague',
    media_branded_url: 'https://hcti.io/v1/image/x',
    media_raw_url: 'https://img/raw.jpg',
    media_variants: {},
    scheduled_at: null,
    headline: 'h',
    ...overrides,
  }
}

/** Find the createMetricoolPost call for a given channel. */
function callFor(channel: string) {
  return mockMetricoolPost.mock.calls.map((c) => c[0]).find((a) => a.channel === channel)
}

describe('lib/content/publish', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockUpdate.mockReset()
    mockMetricoolPost.mockReset()
    mockPublishBlog.mockReset()
    mockFetch.mockReset()
    mockUpdate.mockImplementation(async (_id, patch) => ({ ...item(), ...patch }))
    // Default: return a postId derived from the channel.
    mockMetricoolPost.mockImplementation(async ({ channel }) => ({
      postId: channel === 'instagram' ? 'ig' : 'fb',
    }))
  })

  it('creates one Metricool post per channel with branded media + composed caption', async () => {
    mockGet.mockResolvedValueOnce(item())

    const res = await approveContent('c1')

    expect(mockMetricoolPost).toHaveBeenCalledTimes(2)
    expect(callFor('instagram')).toMatchObject({
      channel: 'instagram',
      text: 'Caption\n\n#prague',
      mediaUrl: 'https://hcti.io/v1/image/x',
      mediaKind: 'image',
      format: 'post',
      dueAt: undefined,
    })
    expect(callFor('facebook').mediaUrl).toBe('https://hcti.io/v1/image/x')
    expect(res.status).toBe('published')
    expect(res.buffer_update_ids).toEqual({ instagram: 'ig', facebook: 'fb' })
  })

  it('routes per-channel media variants (IG square / FB landscape)', async () => {
    mockGet.mockResolvedValueOnce(
      item({
        media_variants: {
          instagram: 'https://hcti.io/v1/image/ig-1080',
          facebook: 'https://hcti.io/v1/image/fb-1200x630',
        },
      })
    )

    await approveContent('c1')

    expect(callFor('instagram').mediaUrl).toBe('https://hcti.io/v1/image/ig-1080')
    expect(callFor('facebook').mediaUrl).toBe('https://hcti.io/v1/image/fb-1200x630')
  })

  it('falls back to media_branded_url for a channel without a variant', async () => {
    mockGet.mockResolvedValueOnce(
      item({ media_variants: { instagram: 'https://hcti.io/v1/image/ig-only' } })
    )
    await approveContent('c1')
    expect(callFor('instagram').mediaUrl).toBe('https://hcti.io/v1/image/ig-only')
    expect(callFor('facebook').mediaUrl).toBe('https://hcti.io/v1/image/x') // generic fallback
  })

  it('marks status scheduled when scheduled_at is set', async () => {
    mockGet.mockResolvedValueOnce(item({ scheduled_at: '2026-07-01T09:00:00Z', channels: { instagram: true } }))
    const res = await approveContent('c1')
    expect(callFor('instagram').dueAt).toBe('2026-07-01T09:00:00Z')
    expect(res.status).toBe('scheduled')
  })

  it('sends a reel as video with reel format', async () => {
    mockGet.mockResolvedValueOnce(
      item({ type: 'reel', media_kind: 'video', media_branded_url: 'https://store/v.mp4', channels: { instagram: true } })
    )
    await approveContent('c1')
    expect(callFor('instagram').mediaKind).toBe('video')
    expect(callFor('instagram').format).toBe('reel')
  })

  it('sends an empty caption for stories (Metricool stories carry no text of their own)', async () => {
    mockGet.mockResolvedValueOnce(
      item({ type: 'story', media_branded_url: 'https://hcti.io/v1/image/story', channels: { instagram: true } })
    )
    await approveContent('c1')
    expect(callFor('instagram').text).toBe('')
    expect(callFor('instagram').format).toBe('story')
  })

  it('publishes a blog item to GitHub (fetches cover) and stores the commit sha', async () => {
    mockGet.mockResolvedValueOnce(
      item({ type: 'blog', channels: { blog: true }, blog_slug: 'prague-vienna', blog_mdx: '---\n---\nbody', media_branded_url: 'https://hcti.io/v1/image/cover' })
    )
    mockFetch.mockResolvedValueOnce({ ok: true, arrayBuffer: async () => new ArrayBuffer(4) })
    mockPublishBlog.mockResolvedValueOnce({ commitSha: 'SHA123' })

    const res = await approveContent('c1')

    expect(mockPublishBlog).toHaveBeenCalledTimes(1)
    const arg = mockPublishBlog.mock.calls[0][0]
    expect(arg.slug).toBe('prague-vienna')
    expect(arg.cover.fileName).toBe('prague-vienna-cover.jpg')
    expect(res.github_commit_sha).toBe('SHA123')
    expect(res.status).toBe('published')
  })

  it('marks the item failed and rethrows when publishing errors', async () => {
    mockGet.mockResolvedValueOnce(item())
    mockMetricoolPost.mockRejectedValueOnce(new Error('metricool down'))
    await expect(approveContent('c1')).rejects.toThrow('metricool down')
    const failPatch = mockUpdate.mock.calls.at(-1)![1]
    expect(failPatch.status).toBe('failed')
    expect(failPatch.error).toContain('metricool down')
  })

  it('refuses to approve an item not in an approvable status', async () => {
    mockGet.mockResolvedValueOnce(item({ status: 'published' }))
    await expect(approveContent('c1')).rejects.toThrow(/cannot approve/)
  })

  it('rejectContent sets status rejected', async () => {
    await rejectContent('c1')
    expect(mockUpdate).toHaveBeenCalledWith('c1', { status: 'rejected' })
  })
})
