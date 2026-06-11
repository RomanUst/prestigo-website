/**
 * rate-limit.test.ts — guards the sliding-window limiter (code-review WR-01).
 *
 * Locks in that lib/rate-limit no longer behaves as a fixed window (which
 * permitted a ~2x burst across the window boundary). Exercises the in-memory
 * fallback path; the Upstash Lua path mirrors the same sliding-window-log
 * algorithm server-side.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { checkRateLimit } from '@/lib/rate-limit'

// Force the in-memory path: no Upstash env configured.
describe('sliding-window in-memory limiter', () => {
  beforeEach(() => {
    delete process.env.UPSTASH_REDIS_REST_URL
    delete process.env.UPSTASH_REDIS_REST_TOKEN
    vi.useFakeTimers()
  })
  afterEach(() => vi.useRealTimers())

  it('allows exactly `limit` (5) requests then denies the 6th within the window', async () => {
    const ip = '203.0.113.10'
    for (let i = 0; i < 5; i++) {
      const r = await checkRateLimit('/login', ip)
      expect(r.allowed).toBe(true)
    }
    const sixth = await checkRateLimit('/login', ip)
    expect(sixth.allowed).toBe(false)
    expect(sixth.remaining).toBe(0)
  })

  it('does NOT permit a 2x boundary burst (the fixed-window flaw)', async () => {
    const ip = '203.0.113.11'
    // t=0: spend the full budget near the end of a nominal minute
    vi.setSystemTime(new Date('2026-06-11T00:00:59.000Z'))
    for (let i = 0; i < 5; i++) {
      expect((await checkRateLimit('/login', ip)).allowed).toBe(true)
    }
    // t=+2s: a fixed window would reset and allow 5 more immediately.
    // A sliding window still sees the previous 5 within the trailing 60s → deny.
    vi.setSystemTime(new Date('2026-06-11T00:01:01.000Z'))
    expect((await checkRateLimit('/login', ip)).allowed).toBe(false)
  })

  it('lets requests through again only after the full window has elapsed', async () => {
    const ip = '203.0.113.12'
    vi.setSystemTime(new Date('2026-06-11T00:00:00.000Z'))
    for (let i = 0; i < 5; i++) await checkRateLimit('/login', ip)
    expect((await checkRateLimit('/login', ip)).allowed).toBe(false)
    // 61s later all earlier hits have aged out of the trailing window.
    vi.setSystemTime(new Date('2026-06-11T00:01:01.000Z'))
    expect((await checkRateLimit('/login', ip)).allowed).toBe(true)
  })
})
