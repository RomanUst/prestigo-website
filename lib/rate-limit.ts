/**
 * In-memory sliding-window rate limiter.
 *
 * State lives in module scope and persists for the lifetime of a serverless
 * function instance (minutes–hours on Vercel depending on traffic). This is
 * sufficient for protecting low-volume public endpoints against abuse bursts.
 *
 * To upgrade to a distributed solution that shares state across all instances,
 * replace the Map with @upstash/ratelimit + @upstash/redis.
 */

const WINDOW_MS = 60_000 // 1 minute sliding window

/** Max requests per IP per window for each route */
const LIMITS: Record<string, number> = {
  '/api/calculate-price': 30, // real users recalculate several times
  '/api/submit-quote': 5,     // 5 quote submissions per minute is already suspicious
  '/api/contact': 3,          // 3 contact form submissions per minute
}

interface WindowEntry {
  count: number
  windowStart: number
}

const store = new Map<string, WindowEntry>()

// Periodically prune stale entries to prevent unbounded memory growth.
// Runs at most once per minute.
let lastPrune = 0
function maybePrune() {
  const now = Date.now()
  if (now - lastPrune < WINDOW_MS) return
  lastPrune = now
  for (const [key, entry] of store) {
    if (now - entry.windowStart > WINDOW_MS) store.delete(key)
  }
}

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  limit: number
}

/**
 * Check whether the given IP is within the rate limit for this route.
 * Returns `allowed: true` for routes that have no configured limit.
 */
export function checkRateLimit(pathname: string, ip: string): RateLimitResult {
  const limit = LIMITS[pathname]
  if (!limit) return { allowed: true, remaining: Infinity, limit: Infinity }

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

/** Extract the best available client IP from a Next.js Request */
export function getClientIp(req: Request): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'
  )
}
