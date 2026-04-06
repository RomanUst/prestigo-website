/**
 * Sliding-window rate limiter.
 *
 * Uses Upstash Redis when UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN
 * are set (production / staging). Falls back to an in-memory Map for local
 * development or if Redis is unavailable — state is per-instance only, but
 * that is acceptable for a single dev server.
 *
 * All calls are async so they work transparently with both backends.
 */

import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

/** Max requests per IP per 60-second sliding window, keyed by route pathname */
const LIMITS: Record<string, number> = {
  '/api/calculate-price':       30, // users recalculate several times while booking
  '/api/submit-quote':           5, // 5 quote submissions per minute is already suspicious
  '/api/contact':                3, // 3 contact form submissions per minute
  '/api/create-payment-intent': 10, // prevent cost abuse and promo-code enumeration
}

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  limit: number
}

// ── Upstash distributed backend (production) ─────────────────────────────────

let redis: Redis | null = null
const upstashLimiters = new Map<string, Ratelimit>()

function getRedis(): Redis | null {
  if (redis) return redis
  const url  = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null
  redis = new Redis({ url, token })
  return redis
}

function getUpstashLimiter(pathname: string, maxRequests: number): Ratelimit | null {
  const r = getRedis()
  if (!r) return null

  if (!upstashLimiters.has(pathname)) {
    upstashLimiters.set(pathname, new Ratelimit({
      redis: r,
      limiter: Ratelimit.slidingWindow(maxRequests, '60 s'),
      prefix: `prestigo:rl`,
    }))
  }
  return upstashLimiters.get(pathname)!
}

// ── In-memory fallback (development / Redis unavailable) ─────────────────────

const WINDOW_MS = 60_000

interface WindowEntry {
  count: number
  windowStart: number
}

const store = new Map<string, WindowEntry>()
let lastPrune = 0

function maybePrune() {
  const now = Date.now()
  if (now - lastPrune < WINDOW_MS) return
  lastPrune = now
  for (const [key, entry] of store) {
    if (now - entry.windowStart > WINDOW_MS) store.delete(key)
  }
}

function checkInMemory(pathname: string, ip: string, limit: number): RateLimitResult {
  maybePrune()
  const key = `${pathname}:${ip}`
  const now = Date.now()
  const entry = store.get(key)

  if (!entry || now - entry.windowStart > WINDOW_MS) {
    store.set(key, { count: 1, windowStart: now })
    return { allowed: true, remaining: limit - 1, limit }
  }

  if (entry.count >= limit) {
    return { allowed: false, remaining: 0, limit }
  }

  entry.count++
  return { allowed: true, remaining: limit - entry.count, limit }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Check whether the given IP is within the rate limit for this route.
 * Returns `allowed: true` for routes that have no configured limit.
 *
 * Uses Upstash Redis in production (shared across all serverless instances).
 * Degrades gracefully to in-memory if Redis is not configured or unavailable.
 */
export async function checkRateLimit(pathname: string, ip: string): Promise<RateLimitResult> {
  const limit = LIMITS[pathname]
  if (!limit) return { allowed: true, remaining: Infinity, limit: Infinity }

  const limiter = getUpstashLimiter(pathname, limit)

  if (limiter) {
    try {
      const result = await limiter.limit(`${pathname}:${ip}`)
      return {
        allowed:   result.success,
        remaining: result.remaining,
        limit:     result.limit,
      }
    } catch (err) {
      // Redis unavailable → degrade gracefully to in-memory for this request
      console.warn('[rate-limit] Upstash request failed, falling back to in-memory:', err)
    }
  }

  return checkInMemory(pathname, ip, limit)
}

/** Extract the best available client IP from a Next.js Request */
export function getClientIp(req: Request): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'
  )
}
