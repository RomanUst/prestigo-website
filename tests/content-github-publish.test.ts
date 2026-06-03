import { describe, it, expect, beforeEach, vi } from 'vitest'

const { mockFetch } = vi.hoisted(() => ({ mockFetch: vi.fn() }))
vi.stubGlobal('fetch', mockFetch)

process.env.GITHUB_TOKEN = 'gh-test-token'
process.env.GITHUB_REPO = 'acme/site'
process.env.GITHUB_BRANCH = 'main'

import { publishBlogToGitHub } from '@/lib/content/github-publish'

function ok(body: unknown) {
  return { ok: true, status: 200, json: async () => body, text: async () => '' }
}

describe('lib/content/github-publish', () => {
  beforeEach(() => mockFetch.mockReset())

  it('creates one atomic commit (blob→tree→commit→ref) and returns the sha', async () => {
    mockFetch
      .mockResolvedValueOnce(ok({ object: { sha: 'HEAD_SHA' } })) // get ref
      .mockResolvedValueOnce(ok({ tree: { sha: 'BASE_TREE' } })) // get commit
      .mockResolvedValueOnce(ok({ sha: 'BLOB_MDX' })) // blob (mdx)
      .mockResolvedValueOnce(ok({ sha: 'NEW_TREE' })) // create tree
      .mockResolvedValueOnce(ok({ sha: 'NEW_COMMIT' })) // create commit
      .mockResolvedValueOnce(ok({})) // patch ref

    const res = await publishBlogToGitHub({ slug: 'prague-vienna', mdx: '---\ntitle: x\n---\nbody' })

    expect(res.commitSha).toBe('NEW_COMMIT')
    expect(mockFetch).toHaveBeenCalledTimes(6)

    // Blob carries the mdx at the right path via the tree call.
    const treeCall = mockFetch.mock.calls[3]
    expect(treeCall[0]).toContain('/git/trees')
    const treeBody = JSON.parse(treeCall[1].body)
    expect(treeBody.base_tree).toBe('BASE_TREE')
    expect(treeBody.tree[0].path).toBe('content/blog/prague-vienna.mdx')

    // Commit parents off the head.
    const commitBody = JSON.parse(mockFetch.mock.calls[4][1].body)
    expect(commitBody.parents).toEqual(['HEAD_SHA'])
    expect(commitBody.tree).toBe('NEW_TREE')
  })

  it('commits the cover image as a second base64 blob under /public', async () => {
    mockFetch
      .mockResolvedValueOnce(ok({ object: { sha: 'HEAD_SHA' } }))
      .mockResolvedValueOnce(ok({ tree: { sha: 'BASE_TREE' } }))
      .mockResolvedValueOnce(ok({ sha: 'BLOB_MDX' }))
      .mockResolvedValueOnce(ok({ sha: 'BLOB_IMG' }))
      .mockResolvedValueOnce(ok({ sha: 'NEW_TREE' }))
      .mockResolvedValueOnce(ok({ sha: 'NEW_COMMIT' }))
      .mockResolvedValueOnce(ok({}))

    await publishBlogToGitHub({
      slug: 'prague-vienna',
      mdx: 'x',
      cover: { fileName: 'prague-vienna-cover.jpg', base64: 'AAAA' },
    })

    // Two blob POSTs.
    const blobCalls = mockFetch.mock.calls.filter((c) => String(c[0]).endsWith('/git/blobs'))
    expect(blobCalls).toHaveLength(2)
    const imgBlob = JSON.parse(blobCalls[1][1].body)
    expect(imgBlob.encoding).toBe('base64')

    const treeBody = JSON.parse(
      mockFetch.mock.calls.find((c) => String(c[0]).endsWith('/git/trees'))![1].body
    )
    const paths = treeBody.tree.map((t: { path: string }) => t.path)
    expect(paths).toContain('public/prague-vienna-cover.jpg')
  })

  it('throws a descriptive error on a GitHub failure', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404, text: async () => 'Not Found' })
    await expect(publishBlogToGitHub({ slug: 's', mdx: 'x' })).rejects.toThrow(/GitHub GET .*\(404\)/)
  })
})
