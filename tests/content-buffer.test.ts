import { describe, it, expect, beforeEach, vi } from 'vitest'

const { mockFetch } = vi.hoisted(() => ({ mockFetch: vi.fn() }))
vi.stubGlobal('fetch', mockFetch)

process.env.BUFFER_ACCESS_TOKEN = 'buf-token'
process.env.BUFFER_PROFILE_IG = 'IG_CHANNEL'
process.env.BUFFER_PROFILE_FB = 'FB_CHANNEL'

import { createBufferPost, createBufferPosts, deleteBufferPost } from '@/lib/content/buffer'

function gql(body: unknown) {
  return { ok: true, status: 200, json: async () => ({ data: body }), text: async () => '' }
}

/** Parse the GraphQL JSON body of the Nth fetch call. */
function callBody(n = 0): { query: string; variables: { input: Record<string, unknown> } } {
  return JSON.parse(mockFetch.mock.calls[n][1].body as string)
}

describe('lib/content/buffer', () => {
  beforeEach(() => mockFetch.mockReset())

  it('creates a scheduled IG image post and returns the post id', async () => {
    mockFetch.mockResolvedValueOnce(
      gql({ createPost: { __typename: 'PostActionSuccess', post: { id: 'p1' } } })
    )

    const res = await createBufferPost({
      channel: 'instagram',
      text: 'Caption #prague',
      mediaUrl: 'https://hcti.io/v1/image/abc',
      mediaKind: 'image',
      dueAt: '2026-06-10T09:00:00Z',
    })

    expect(res.postId).toBe('p1')
    const { variables } = callBody()
    const input = variables.input as Record<string, unknown>
    expect(input.channelId).toBe('IG_CHANNEL')
    expect(input.mode).toBe('customScheduled')
    expect(input.dueAt).toBe('2026-06-10T09:00:00Z')
    expect(input.assets).toEqual([
      { image: { url: 'https://hcti.io/v1/image/abc', thumbnailUrl: 'https://hcti.io/v1/image/abc' } },
    ])
    expect(input.metadata).toEqual({ instagram: { type: 'post', shouldShareToFeed: true } })
  })

  it('queues (addToQueue) when no dueAt is given', async () => {
    mockFetch.mockResolvedValueOnce(
      gql({ createPost: { __typename: 'PostActionSuccess', post: { id: 'p2' } } })
    )
    await createBufferPost({
      channel: 'facebook',
      text: 't',
      mediaUrl: 'u',
      mediaKind: 'image',
    })
    const input = callBody().variables.input as Record<string, unknown>
    expect(input.mode).toBe('addToQueue')
    // Buffer rejects FB posts without a type, even for a plain post.
    expect(input.metadata).toEqual({ facebook: { type: 'post' } })
  })

  it('sends a reel as a video asset with reel type', async () => {
    mockFetch.mockResolvedValueOnce(
      gql({ createPost: { __typename: 'PostActionSuccess', post: { id: 'p3' } } })
    )
    await createBufferPost({
      channel: 'instagram',
      text: 'Reel',
      mediaUrl: 'https://store/video.mp4',
      mediaKind: 'video',
      format: 'reel',
    })
    const input = callBody().variables.input as Record<string, unknown>
    expect(input.assets).toEqual([
      { video: { url: 'https://store/video.mp4', thumbnailUrl: 'https://store/video.mp4' } },
    ])
    expect(input.metadata).toEqual({ instagram: { type: 'reel', shouldShareToFeed: true } })
  })

  it('createBufferPosts fans out one call per channel', async () => {
    mockFetch
      .mockResolvedValueOnce(gql({ createPost: { __typename: 'PostActionSuccess', post: { id: 'ig' } } }))
      .mockResolvedValueOnce(gql({ createPost: { __typename: 'PostActionSuccess', post: { id: 'fb' } } }))

    const res = await createBufferPosts(['instagram', 'facebook'], {
      text: 't',
      mediaUrl: 'u',
      mediaKind: 'image',
    })
    expect(res.postIds).toEqual({ instagram: 'ig', facebook: 'fb' })
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it('throws with the Buffer error typename on a non-success union member', async () => {
    mockFetch.mockResolvedValueOnce(
      gql({ createPost: { __typename: 'InvalidInputError', message: 'bad media' } })
    )
    await expect(
      createBufferPost({ channel: 'facebook', text: 't', mediaUrl: 'u', mediaKind: 'image' })
    ).rejects.toThrow(/InvalidInputError.*bad media/)
  })

  it('surfaces top-level GraphQL errors', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ errors: [{ message: 'unauthorized' }] }),
      text: async () => '',
    })
    await expect(
      createBufferPost({ channel: 'instagram', text: 't', mediaUrl: 'u', mediaKind: 'image' })
    ).rejects.toThrow(/Buffer GraphQL error: unauthorized/)
  })

  it('deleteBufferPost succeeds on PostActionSuccess', async () => {
    mockFetch.mockResolvedValueOnce(
      gql({ deletePost: { __typename: 'PostActionSuccess', post: { id: 'p1' } } })
    )
    await expect(deleteBufferPost('p1')).resolves.toBeUndefined()
  })

  it('throws on a missing profile env', async () => {
    const prev = process.env.BUFFER_PROFILE_FB
    delete process.env.BUFFER_PROFILE_FB
    await expect(
      createBufferPost({ channel: 'facebook', text: 't', mediaUrl: 'u', mediaKind: 'image' })
    ).rejects.toThrow(/BUFFER_PROFILE_FB/)
    process.env.BUFFER_PROFILE_FB = prev
  })
})
