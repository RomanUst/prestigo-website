import { describe, it, expect, beforeEach, vi } from 'vitest'

const { mockGet, mockUpdate, mockBufferPosts, mockPublishBlog, mockFetch } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockUpdate: vi.fn(),
  mockBufferPosts: vi.fn(),
  mockPublishBlog: vi.fn(),
  mockFetch: vi.fn(),
}))

vi.mock('@/lib/content/store', () => ({
  getContentItem: mockGet,
  updateContentItem: mockUpdate,
}))
vi.mock('@/lib/content/buffer', () => ({ createBufferPosts: mockBufferPosts }))
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
    scheduled_at: null,
    headline: 'h',
    ...overrides,
  }
}

describe('lib/content/publish', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockUpdate.mockReset()
    mockBufferPosts.mockReset()
    mockPublishBlog.mockReset()
    mockFetch.mockReset()
    mockUpdate.mockImplementation(async (_id, patch) => ({ ...item(), ...patch }))
  })

  it('publishes a social post to Buffer with branded media + composed caption', async () => {
    mockGet.mockResolvedValueOnce(item())
    mockBufferPosts.mockResolvedValueOnce({ postIds: { instagram: 'ig', facebook: 'fb' } })

    const res = await approveContent('c1')

    expect(mockBufferPosts).toHaveBeenCalledWith(['instagram', 'facebook'], {
      text: 'Caption\n\n#prague',
      mediaUrl: 'https://hcti.io/v1/image/x',
      mediaKind: 'image',
      format: 'post',
      dueAt: undefined,
    })
    expect(res.status).toBe('published')
    expect(res.buffer_update_ids).toEqual({ instagram: 'ig', facebook: 'fb' })
  })

  it('marks status scheduled when scheduled_at is set', async () => {
    mockGet.mockResolvedValueOnce(item({ scheduled_at: '2026-07-01T09:00:00Z' }))
    mockBufferPosts.mockResolvedValueOnce({ postIds: { instagram: 'ig' } })
    const res = await approveContent('c1')
    expect(mockBufferPosts.mock.calls[0][1].dueAt).toBe('2026-07-01T09:00:00Z')
    expect(res.status).toBe('scheduled')
  })

  it('sends a reel as video with reel format', async () => {
    mockGet.mockResolvedValueOnce(
      item({ type: 'reel', media_kind: 'video', media_branded_url: 'https://store/v.mp4', channels: { instagram: true } })
    )
    mockBufferPosts.mockResolvedValueOnce({ postIds: { instagram: 'ig' } })
    await approveContent('c1')
    const call = mockBufferPosts.mock.calls[0][1]
    expect(call.mediaKind).toBe('video')
    expect(call.format).toBe('reel')
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
    mockBufferPosts.mockRejectedValueOnce(new Error('buffer down'))
    await expect(approveContent('c1')).rejects.toThrow('buffer down')
    const failPatch = mockUpdate.mock.calls.at(-1)![1]
    expect(failPatch.status).toBe('failed')
    expect(failPatch.error).toContain('buffer down')
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
