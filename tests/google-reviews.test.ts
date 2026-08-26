import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }))

vi.mock('next/cache', () => ({
  unstable_cache: vi.fn((fn: () => unknown) => fn),
  revalidateTag: vi.fn(),
}))

vi.stubGlobal('fetch', fetchMock)

const ORIGINAL_ENV = { ...process.env }

// ── The reviews layer now uses OAuth (refresh-token) + the Google Business
//    Profile API (mybusiness.googleapis.com/v4/{location}/reviews), NOT the old
//    Places API New (v1) with an API key. Each getReviews() therefore issues TWO
//    fetches: the OAuth token exchange, then the reviews call. ──

const STAR: Record<number, string> = { 1: 'ONE', 2: 'TWO', 3: 'THREE', 4: 'FOUR', 5: 'FIVE' }

// helper: build a Business Profile API review object
function makeReview(overrides: {
  displayName?: string
  rating?: number
  text?: string
  createTime?: string
  photoUri?: string
}) {
  return {
    starRating: STAR[overrides.rating ?? 5],
    comment: overrides.text ?? 'Great service',
    createTime: overrides.createTime ?? '2026-01-01T00:00:00Z',
    reviewer: {
      displayName: overrides.displayName ?? 'Test User',
      profilePhotoUrl: overrides.photoUri ?? 'https://lh3.googleusercontent.com/photo.jpg',
    },
  }
}

// Queue the OAuth token response followed by a reviews response for one getReviews() call.
function queueGoogleFlow(reviews: unknown[]) {
  fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 'tok-123' }) })
  fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ reviews }) })
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.GOOGLE_OAUTH_CLIENT_ID = 'test-client-id'
  process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'test-client-secret'
  process.env.GOOGLE_OAUTH_REFRESH_TOKEN = 'test-refresh-token'
  process.env.GOOGLE_BUSINESS_LOCATION_NAME = 'accounts/111/locations/222'
})

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
})

import { getReviews, HARDCODED_TESTIMONIALS, MAX_POOL } from '@/lib/google-reviews'

// ─── GRVW-01: API call parameters ────────────────────────────────────────────

describe('GRVW-01: fetchGoogleReviews calls OAuth + Business Profile API with correct params', () => {
  it('exchanges the refresh token, then requests mybusiness.googleapis.com/.../reviews with a Bearer token', async () => {
    queueGoogleFlow([])

    await getReviews()

    expect(fetchMock).toHaveBeenCalledTimes(2)

    // 1st call: OAuth token exchange
    const oauthUrl = fetchMock.mock.calls[0][0] as string
    const oauthOpts = fetchMock.mock.calls[0][1] as RequestInit
    expect(oauthUrl).toBe('https://oauth2.googleapis.com/token')
    expect(oauthOpts.method).toBe('POST')

    // 2nd call: Business Profile reviews
    const reviewsUrl = fetchMock.mock.calls[1][0] as string
    const reviewsOpts = fetchMock.mock.calls[1][1] as RequestInit & { headers: Record<string, string> }
    expect(reviewsUrl).toMatch(/mybusiness\.googleapis\.com\/v4\/accounts\/111\/locations\/222\/reviews/)
    expect(reviewsOpts.headers.Authorization).toBe('Bearer tok-123')
    expect(reviewsOpts.cache).toBe('no-store')
  })
})

// ─── GRVW-01 + GRVW-03: rating and text filter ───────────────────────────────

describe('GRVW-01 + GRVW-03: rating and text filter', () => {
  it('includes reviews with rating >= 4 and non-empty text', async () => {
    queueGoogleFlow([
      makeReview({ displayName: 'Alice', rating: 5, text: 'great' }),
      makeReview({ displayName: 'Bob', rating: 4, text: 'ok' }),
      makeReview({ displayName: 'Carol', rating: 3, text: 'meh' }),
    ])

    const result = await getReviews()
    const googleItems = result.filter((r) => r.source === 'google')
    expect(googleItems).toHaveLength(2)
    const ratings = googleItems.map((r) => (r.source === 'google' ? r.rating : null))
    expect(ratings).toEqual([5, 4])
  })

  it('excludes reviews with rating < 4', async () => {
    queueGoogleFlow([makeReview({ displayName: 'Dave', rating: 3, text: 'Not great' })])

    const result = await getReviews()
    const googleItems = result.filter((r) => r.source === 'google')
    expect(googleItems).toHaveLength(0)
  })

  it('excludes reviews with empty or whitespace-only text', async () => {
    queueGoogleFlow([
      makeReview({ displayName: 'Eve', rating: 5, text: '' }),
      makeReview({ displayName: 'Frank', rating: 5, text: '   ' }),
    ])

    const result = await getReviews()
    const googleItems = result.filter((r) => r.source === 'google')
    expect(googleItems).toHaveLength(0)
  })

  it('maps response fields to GoogleReview shape', async () => {
    queueGoogleFlow([
      makeReview({
        displayName: 'Alice',
        rating: 5,
        text: 'Excellent',
        photoUri: 'https://x/p.jpg',
        createTime: '2025-10-01T00:00:00Z',
      }),
    ])

    const result = await getReviews()
    const googleItem = result.find((r) => r.source === 'google')
    expect(googleItem).toBeDefined()
    if (googleItem && googleItem.source === 'google') {
      expect(googleItem.author).toBe('Alice')
      expect(googleItem.rating).toBe(5)
      expect(googleItem.text).toBe('Excellent')
      // relativeTime is computed from createTime (not taken from the response)
      expect(typeof googleItem.relativeTime).toBe('string')
      expect(googleItem.relativeTime).toMatch(/ago$/)
      expect(googleItem.profilePhotoUrl).toBe('https://x/p.jpg')
      expect(typeof googleItem.time).toBe('number')
    }
  })
})

// ─── GRVW-02: 24h cache ───────────────────────────────────────────────────────

describe('GRVW-02: 24h cache — fetch not re-issued in production', () => {
  it('issues two fetches (OAuth + reviews) per getReviews when the cache is a pass-through', async () => {
    queueGoogleFlow([makeReview({ displayName: 'Alice', rating: 5, text: 'Great' })])
    queueGoogleFlow([makeReview({ displayName: 'Alice', rating: 5, text: 'Great' })])

    await getReviews()
    await getReviews()

    // unstable_cache is mocked as a pass-through, so each call hits the network:
    // 2 getReviews × (OAuth + reviews) = 4 fetches. Production's real cache would
    // collapse repeated invocations within the TTL.
    expect(fetchMock.mock.calls.length).toBe(4)
  })
})

describe('GRVW-02: unstable_cache wraps fetchGoogleReviews', () => {
  it('source file contains unstable_cache( and revalidate: 60 * 60 * 24 or 86400', () => {
    const src = readFileSync(resolve(__dirname, '../lib/google-reviews.ts'), 'utf-8')
    expect(src).toMatch(/unstable_cache\(/)
    expect(src).toMatch(/60 \* 60 \* 24|86400/)
  })
})

// ─── GRVW-04: graceful fallback ───────────────────────────────────────────────

describe('GRVW-04: graceful fallback', () => {
  it('returns hardcoded-only pool with no fetch when OAuth credentials are unset', async () => {
    delete process.env.GOOGLE_OAUTH_REFRESH_TOKEN

    const result = await getReviews()

    expect(fetchMock.mock.calls.length).toBe(0)
    expect(result).toHaveLength(3)
    expect(result.every((r) => r.source === 'hardcoded')).toBe(true)
  })

  it('returns hardcoded-only pool when the business location name is unset', async () => {
    delete process.env.GOOGLE_BUSINESS_LOCATION_NAME
    // OAuth still resolves; the reviews call is skipped once no location is present.
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 'tok-123' }) })

    const result = await getReviews()

    expect(result).toHaveLength(3)
    expect(result.every((r) => r.source === 'hardcoded')).toBe(true)
  })

  it('returns hardcoded-only pool when the OAuth exchange throws', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network down'))

    const result = await getReviews()
    expect(result.every((r) => r.source === 'hardcoded')).toBe(true)
  })

  it('returns hardcoded-only pool when the reviews response is not ok', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 'tok-123' }) })
    fetchMock.mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({}) })

    const result = await getReviews()
    expect(result.every((r) => r.source === 'hardcoded')).toBe(true)
  })

  it('returns hardcoded-only pool when the reviews array is absent', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 'tok-123' }) })
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({}) })

    const result = await getReviews()
    expect(result.every((r) => r.source === 'hardcoded')).toBe(true)
  })
})

// ─── GRVW-05: merge order ─────────────────────────────────────────────────────

describe('GRVW-05: merge order — Google first, hardcoded fills remainder', () => {
  it('puts Google reviews first when both sources have content', async () => {
    queueGoogleFlow([
      makeReview({ displayName: 'Alice', rating: 5, text: 'Great' }),
      makeReview({ displayName: 'Bob', rating: 4, text: 'Good' }),
    ])

    const result = await getReviews()
    expect(result[0].source).toBe('google')
    expect(result[1].source).toBe('google')
    expect(result[2].source).toBe('hardcoded')
  })

  it('omits hardcoded testimonials when Google returns 5 qualifying reviews', async () => {
    queueGoogleFlow([
      makeReview({ displayName: 'A', rating: 5, text: 'Excellent 1' }),
      makeReview({ displayName: 'B', rating: 5, text: 'Excellent 2' }),
      makeReview({ displayName: 'C', rating: 5, text: 'Excellent 3' }),
      makeReview({ displayName: 'D', rating: 5, text: 'Excellent 4' }),
      makeReview({ displayName: 'E', rating: 5, text: 'Excellent 5' }),
    ])

    const result = await getReviews()
    expect(result).toHaveLength(5)
    expect(result.every((r) => r.source === 'google')).toBe(true)
  })

  it('returns up to MAX_POOL items when Google returns fewer than MAX_GOOGLE reviews', async () => {
    queueGoogleFlow([
      makeReview({ displayName: 'A', rating: 5, text: 'Great 1' }),
      makeReview({ displayName: 'B', rating: 5, text: 'Great 2' }),
    ])

    const result = await getReviews()
    expect(result).toHaveLength(Math.min(MAX_POOL, 2 + 3))
  })

  it('caps the merged pool at MAX_POOL items', async () => {
    queueGoogleFlow(
      Array.from({ length: 5 }, (_, i) => makeReview({ displayName: String(i), rating: 5, text: `Review ${i}` })),
    )

    const result = await getReviews()
    expect(result.length).toBeLessThanOrEqual(MAX_POOL)
  })
})

// ─── HARDCODED_TESTIMONIALS export ───────────────────────────────────────────

describe('HARDCODED_TESTIMONIALS export matches legacy Testimonials content', () => {
  it('exposes exactly 3 hardcoded testimonials', () => {
    expect(HARDCODED_TESTIMONIALS).toHaveLength(3)
  })

  it('preserves the three legacy quotes verbatim', () => {
    const michael = HARDCODED_TESTIMONIALS.find((t) => t.name === 'Michael H.')
    expect(michael).toBeDefined()
    expect(michael!.quote).toContain('cleared customs')

    const stepan = HARDCODED_TESTIMONIALS.find((t) => t.name === 'Štěpán N.')
    expect(stepan).toBeDefined()
    expect(stepan!.quote).toContain('Prague–Vienna')

    const linh = HARDCODED_TESTIMONIALS.find((t) => t.name === 'Linh C.')
    expect(linh).toBeDefined()
    expect(linh!.quote).toContain('corporate account')
  })

  it('every hardcoded item has source === "hardcoded"', () => {
    expect(HARDCODED_TESTIMONIALS.every((t) => t.source === 'hardcoded')).toBe(true)
  })
})
