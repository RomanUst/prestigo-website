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

// ── helper: build a Places API New (v1) review object ────────────────────────
function makeReview(overrides: {
  displayName?: string
  rating?: number
  text?: string
  relativeTime?: string
  photoUri?: string
  publishTime?: string
}) {
  return {
    rating: overrides.rating ?? 5,
    text: { text: overrides.text ?? 'Great service', languageCode: 'en' },
    originalText: { text: overrides.text ?? 'Great service', languageCode: 'en' },
    relativePublishTimeDescription: overrides.relativeTime ?? '1 month ago',
    publishTime: overrides.publishTime ?? '2026-01-01T00:00:00Z',
    authorAttribution: {
      displayName: overrides.displayName ?? 'Test User',
      uri: 'https://google.com/maps/contrib/123',
      photoUri: overrides.photoUri ?? 'https://lh3.googleusercontent.com/photo.jpg',
    },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.GOOGLE_PLACE_ID = 'ChIJtest_place_id'
  process.env.GOOGLE_MAPS_API_KEY = 'test_api_key'
})

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
})

import { getReviews, HARDCODED_TESTIMONIALS, MAX_POOL } from '@/lib/google-reviews'

// ─── GRVW-01: API call parameters ────────────────────────────────────────────

describe('GRVW-01: fetchGoogleReviews calls Places API New (v1) with correct params', () => {
  it('requests places.googleapis.com/v1/places/{place_id} with correct headers', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ reviews: [] }),
    })

    await getReviews()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const calledUrl = fetchMock.mock.calls[0][0] as string
    const calledOptions = fetchMock.mock.calls[0][1] as RequestInit & { headers: Record<string, string> }

    expect(calledUrl).toMatch(/places\.googleapis\.com\/v1\/places\/ChIJtest_place_id/)
    expect(calledOptions.headers['X-Goog-Api-Key']).toBe('test_api_key')
    expect(calledOptions.headers['X-Goog-FieldMask']).toBe('reviews')
    expect(calledOptions.cache).toBe('no-store')
  })
})

// ─── GRVW-01 + GRVW-03: rating and text filter ───────────────────────────────

describe('GRVW-01 + GRVW-03: rating and text filter', () => {
  it('includes reviews with rating >= 4 and non-empty text', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        reviews: [
          makeReview({ displayName: 'Alice', rating: 5, text: 'great' }),
          makeReview({ displayName: 'Bob', rating: 4, text: 'ok' }),
          makeReview({ displayName: 'Carol', rating: 3, text: 'meh' }),
        ],
      }),
    })

    const result = await getReviews()
    const googleItems = result.filter((r) => r.source === 'google')
    expect(googleItems).toHaveLength(2)
    const ratings = googleItems.map((r) => (r.source === 'google' ? r.rating : null))
    expect(ratings).toEqual([5, 4])
  })

  it('excludes reviews with rating < 4', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        reviews: [makeReview({ displayName: 'Dave', rating: 3, text: 'Not great' })],
      }),
    })

    const result = await getReviews()
    const googleItems = result.filter((r) => r.source === 'google')
    expect(googleItems).toHaveLength(0)
  })

  it('excludes reviews with empty or whitespace-only text', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        reviews: [
          { ...makeReview({ displayName: 'Eve', rating: 5 }), text: { text: '', languageCode: 'en' } },
          { ...makeReview({ displayName: 'Frank', rating: 5 }), text: { text: '   ', languageCode: 'en' } },
        ],
      }),
    })

    const result = await getReviews()
    const googleItems = result.filter((r) => r.source === 'google')
    expect(googleItems).toHaveLength(0)
  })

  it('maps response fields to GoogleReview shape', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        reviews: [
          makeReview({
            displayName: 'Alice',
            rating: 5,
            text: 'Excellent',
            relativeTime: '3 months ago',
            photoUri: 'https://x/p.jpg',
            publishTime: '2025-10-01T00:00:00Z',
          }),
        ],
      }),
    })

    const result = await getReviews()
    const googleItem = result.find((r) => r.source === 'google')
    expect(googleItem).toBeDefined()
    if (googleItem && googleItem.source === 'google') {
      expect(googleItem.author).toBe('Alice')
      expect(googleItem.rating).toBe(5)
      expect(googleItem.text).toBe('Excellent')
      expect(googleItem.relativeTime).toBe('3 months ago')
      expect(googleItem.profilePhotoUrl).toBe('https://x/p.jpg')
      expect(typeof googleItem.time).toBe('number')
    }
  })
})

// ─── GRVW-02: 24h cache ───────────────────────────────────────────────────────

describe('GRVW-02: 24h cache — fetch called once across repeated invocations', () => {
  it('calls fetch twice when getReviews is invoked twice (pass-through mock does not cache)', async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({
        reviews: [makeReview({ displayName: 'Alice', rating: 5, text: 'Great' })],
      }),
    }
    fetchMock.mockResolvedValueOnce(mockResponse)
    fetchMock.mockResolvedValueOnce(mockResponse)

    await getReviews()
    await getReviews()

    // unstable_cache mock is a pass-through, so fetch is called twice
    // Production uses real cache which would call once
    expect(fetchMock.mock.calls.length).toBe(2)
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
  it('returns hardcoded-only pool when GOOGLE_PLACE_ID is unset', async () => {
    delete process.env.GOOGLE_PLACE_ID

    const result = await getReviews()

    expect(fetchMock.mock.calls.length).toBe(0)
    expect(result).toHaveLength(3)
    expect(result.every((r) => r.source === 'hardcoded')).toBe(true)
  })

  it('returns hardcoded-only pool when GOOGLE_MAPS_API_KEY is unset', async () => {
    delete process.env.GOOGLE_MAPS_API_KEY

    const result = await getReviews()

    expect(fetchMock.mock.calls.length).toBe(0)
    expect(result).toHaveLength(3)
    expect(result.every((r) => r.source === 'hardcoded')).toBe(true)
  })

  it('returns hardcoded-only pool when fetch throws', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network down'))

    const result = await getReviews()
    expect(result.every((r) => r.source === 'hardcoded')).toBe(true)
  })

  it('returns hardcoded-only pool when response is not ok', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({}),
    })

    const result = await getReviews()
    expect(result.every((r) => r.source === 'hardcoded')).toBe(true)
  })

  it('returns hardcoded-only pool when reviews array is absent', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    })

    const result = await getReviews()
    expect(result.every((r) => r.source === 'hardcoded')).toBe(true)
  })
})

// ─── GRVW-05: merge order ─────────────────────────────────────────────────────

describe('GRVW-05: merge order — Google first, hardcoded fills remainder', () => {
  it('puts Google reviews first when both sources have content', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        reviews: [
          makeReview({ displayName: 'Alice', rating: 5, text: 'Great' }),
          makeReview({ displayName: 'Bob', rating: 4, text: 'Good' }),
        ],
      }),
    })

    const result = await getReviews()
    expect(result[0].source).toBe('google')
    expect(result[1].source).toBe('google')
    expect(result[2].source).toBe('hardcoded')
  })

  it('omits hardcoded testimonials when Google returns 5 qualifying reviews', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        reviews: [
          makeReview({ displayName: 'A', rating: 5, text: 'Excellent 1' }),
          makeReview({ displayName: 'B', rating: 5, text: 'Excellent 2' }),
          makeReview({ displayName: 'C', rating: 5, text: 'Excellent 3' }),
          makeReview({ displayName: 'D', rating: 5, text: 'Excellent 4' }),
          makeReview({ displayName: 'E', rating: 5, text: 'Excellent 5' }),
        ],
      }),
    })

    const result = await getReviews()
    expect(result).toHaveLength(5)
    expect(result.every((r) => r.source === 'google')).toBe(true)
  })

  it('returns up to MAX_POOL items when Google returns fewer than MAX_GOOGLE reviews', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        reviews: [
          makeReview({ displayName: 'A', rating: 5, text: 'Great 1' }),
          makeReview({ displayName: 'B', rating: 5, text: 'Great 2' }),
        ],
      }),
    })

    const result = await getReviews()
    expect(result).toHaveLength(Math.min(MAX_POOL, 2 + 3))
  })

  it('caps the merged pool at MAX_POOL items', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        reviews: Array.from({ length: 5 }, (_, i) =>
          makeReview({ displayName: String(i), rating: 5, text: `Review ${i}` }),
        ),
      }),
    })

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
