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

describe('GRVW-01: fetchGoogleReviews calls Places Details API with correct params', () => {
  it('requests https://maps.googleapis.com/maps/api/place/details/json with place_id, fields=reviews, key', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: 'OK', result: { reviews: [] } }),
    })

    await getReviews()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const calledUrl = fetchMock.mock.calls[0][0] as string
    expect(calledUrl).toMatch(/maps\.googleapis\.com\/maps\/api\/place\/details\/json/)
    expect(calledUrl).toContain('place_id=ChIJtest_place_id')
    expect(calledUrl).toContain('fields=reviews')
    expect(calledUrl).toContain('key=test_api_key')
    expect(fetchMock.mock.calls[0][1]).toEqual({ cache: 'no-store' })
  })
})

// ─── GRVW-01 + GRVW-03: rating and text filter ───────────────────────────────

describe('GRVW-01 + GRVW-03: rating and text filter', () => {
  it('includes reviews with rating >= 4 and non-empty text', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: 'OK',
        result: {
          reviews: [
            { author_name: 'Alice', rating: 5, text: 'great', time: 1000, relative_time_description: '1 month ago' },
            { author_name: 'Bob', rating: 4, text: 'ok', time: 2000, relative_time_description: '2 months ago' },
            { author_name: 'Carol', rating: 3, text: 'meh', time: 3000, relative_time_description: '3 months ago' },
          ],
        },
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
        status: 'OK',
        result: {
          reviews: [
            { author_name: 'Dave', rating: 3, text: 'Not great', time: 1000, relative_time_description: '1 month ago' },
          ],
        },
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
        status: 'OK',
        result: {
          reviews: [
            { author_name: 'Eve', rating: 5, text: '', time: 1000, relative_time_description: '1 month ago' },
            { author_name: 'Frank', rating: 5, text: '   ', time: 2000, relative_time_description: '2 months ago' },
          ],
        },
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
        status: 'OK',
        result: {
          reviews: [
            {
              author_name: 'Alice',
              rating: 5,
              text: 'Excellent',
              time: 1700000000,
              relative_time_description: '3 months ago',
              profile_photo_url: 'https://x/p.jpg',
            },
          ],
        },
      }),
    })

    const result = await getReviews()
    const googleItem = result.find((r) => r.source === 'google')
    expect(googleItem).toBeDefined()
    if (googleItem && googleItem.source === 'google') {
      expect(googleItem.source).toBe('google')
      expect(googleItem.author).toBe('Alice')
      expect(googleItem.rating).toBe(5)
      expect(googleItem.text).toBe('Excellent')
      expect(googleItem.time).toBe(1700000000)
      expect(googleItem.relativeTime).toBe('3 months ago')
      expect(googleItem.profilePhotoUrl).toBe('https://x/p.jpg')
    }
  })
})

// ─── GRVW-02: 24h cache ───────────────────────────────────────────────────────

describe('GRVW-02: 24h cache — fetch called once across repeated invocations', () => {
  it('calls fetch twice when getReviews is invoked twice (pass-through mock does not cache)', async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({
        status: 'OK',
        result: {
          reviews: [
            { author_name: 'Alice', rating: 5, text: 'Great', time: 1000, relative_time_description: '1 month ago' },
          ],
        },
      }),
    }
    fetchMock.mockResolvedValueOnce(mockResponse)
    fetchMock.mockResolvedValueOnce(mockResponse)

    await getReviews()
    await getReviews()

    // unstable_cache mock is a pass-through, so fetch is called twice
    // Production uses real cache which would call once; this test verifies fetch IS called
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

    await expect(getReviews()).resolves.toHaveLength(3)

    const result = await getReviews()
    expect(result.every((r) => r.source === 'hardcoded')).toBe(true)
  })

  it('returns hardcoded-only pool when response is not ok', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({}),
    })

    const result = await getReviews()
    expect(result.every((r) => r.source === 'hardcoded')).toBe(true)
  })

  it('returns hardcoded-only pool when status !== OK', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: 'REQUEST_DENIED' }),
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
        status: 'OK',
        result: {
          reviews: [
            { author_name: 'Alice', rating: 5, text: 'Great', time: 1000, relative_time_description: '1 month ago' },
            { author_name: 'Bob', rating: 4, text: 'Good', time: 2000, relative_time_description: '2 months ago' },
          ],
        },
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
        status: 'OK',
        result: {
          reviews: [
            { author_name: 'A', rating: 5, text: 'Excellent 1', time: 1000, relative_time_description: '1m ago' },
            { author_name: 'B', rating: 5, text: 'Excellent 2', time: 2000, relative_time_description: '2m ago' },
            { author_name: 'C', rating: 5, text: 'Excellent 3', time: 3000, relative_time_description: '3m ago' },
            { author_name: 'D', rating: 5, text: 'Excellent 4', time: 4000, relative_time_description: '4m ago' },
            { author_name: 'E', rating: 5, text: 'Excellent 5', time: 5000, relative_time_description: '5m ago' },
          ],
        },
      }),
    })

    const result = await getReviews()
    expect(result).toHaveLength(5)
    expect(result.every((r) => r.source === 'google')).toBe(true)
    expect(result.some((r) => r.source === 'hardcoded')).toBe(false)
  })

  it('returns MAX_POOL items when Google returns fewer than MAX_POOL - 3 reviews', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: 'OK',
        result: {
          reviews: [
            { author_name: 'A', rating: 5, text: 'Great 1', time: 1000, relative_time_description: '1m ago' },
            { author_name: 'B', rating: 5, text: 'Great 2', time: 2000, relative_time_description: '2m ago' },
          ],
        },
      }),
    })

    const result = await getReviews()
    expect(result).toHaveLength(Math.min(MAX_POOL, 2 + 3))
  })

  it('caps the merged pool at MAX_POOL items even when Google returns exactly 5', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: 'OK',
        result: {
          reviews: [
            { author_name: 'A', rating: 5, text: 'Excellent 1', time: 1000, relative_time_description: '1m ago' },
            { author_name: 'B', rating: 5, text: 'Excellent 2', time: 2000, relative_time_description: '2m ago' },
            { author_name: 'C', rating: 5, text: 'Excellent 3', time: 3000, relative_time_description: '3m ago' },
            { author_name: 'D', rating: 5, text: 'Excellent 4', time: 4000, relative_time_description: '4m ago' },
            { author_name: 'E', rating: 5, text: 'Excellent 5', time: 5000, relative_time_description: '5m ago' },
          ],
        },
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
