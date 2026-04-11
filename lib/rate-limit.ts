/**
 * Sliding-window rate limiter.
 *
 * Uses Upstash Redis REST API directly (no SDK) when
 * UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN are set.
 * Falls back to an in-memory Map otherwise.
 *
 * The Upstash path uses a Lua EVAL script for atomic fixed-window limiting,
 * which is sufficient for our traffic volumes and does not require the
 * @upstash/ratelimit SDK (which has compatibility issues in some Vercel runtimes).
 */

/** Max requests per IP per 60-second window, keyed by route pathname */
const LIMITS: Record<string, number> = {
  '/api/calculate-price':        30, // users recalculate several times while booking
  '/api/submit-quote':            5, // 5 quote submissions per minute is already suspicious
  '/api/submit-multiday-quote':   5, // same as /api/submit-quote — public quote endpoint
  '/api/contact':                 3, // 3 contact form submissions per minute
  '/api/create-payment-intent':  10, // prevent cost abuse and promo-code enumeration
  '/api/validate-promo':         20, // prevent promo code enumeration
  '/admin/login':                 5, // prevent brute force on admin credentials
}

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  limit: number
  /** True when the check fell back to in-memory or was forcibly denied (Upstash down). */
  degraded?: boolean
}

export interface RateLimitOptions {
  /**
   * If true and the distributed limiter (Upstash) is unavailable, the check
   * returns `{ allowed: false, degraded: true }` instead of silently falling
   * back to in-memory. Use for auth-critical paths like /admin/login where
   * a brief outage should NOT open a brute-force window across serverless
   * instances. For user-facing flows (calculate-price, contact), prefer the
   * default fail-open behaviour so transient Upstash issues don't break
   * the booking funnel.
   */
  failClosed?: boolean
}

// ── Upstash REST API (production) ─────────────────────────────────────────────

/**
 * Atomic fixed-window counter via Lua EVAL.
 * Returns { count, allowed } for the current 60-second window.
 */
async function checkUpstash(key: string, limit: number): Promise<RateLimitResult | null> {
  const url   = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null

  // Lua script: INCR + conditional EXPIRE (atomic)
  const luaScript = [
    'local c = redis.call("INCR", KEYS[1])',
    'if c == 1 then redis.call("EXPIRE", KEYS[1], 60) end',
    'return c',
  ].join(' ')

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      // Upstash REST API: send full Redis command as JSON array
      body: JSON.stringify(['EVAL', luaScript, 1, key]),
      // Tell Next.js not to cache this request
      cache: 'no-store',
    })

    if (!res.ok) {
      console.warn('[rate-limit] Upstash EVAL returned', res.status)
      return null
    }

    const data = await res.json() as { result: number }
    const count = data.result
    const remaining = Math.max(0, limit - count)
    return { allowed: count <= limit, remaining, limit }
  } catch (err) {
    console.warn('[rate-limit] Upstash fetch failed:', err)
    return null
  }
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
 * Fail-open by default: if Upstash is unreachable, falls through to an
 * in-memory per-instance counter. On Vercel this is per serverless instance,
 * so an attacker hitting N cold-started instances gets N × limit attempts.
 *
 * Pass `failClosed: true` for auth-critical paths to deny the request when
 * the distributed limiter is unavailable.
 */
export async function checkRateLimit(
  pathname: string,
  ip: string,
  options: RateLimitOptions = {}
): Promise<RateLimitResult> {
  const limit = LIMITS[pathname]
  if (!limit) return { allowed: true, remaining: Infinity, limit: Infinity }

  const key = `prestigo:rl:${pathname}:${ip}`
  const upstash = await checkUpstash(key, limit)
  if (upstash !== null) return upstash

  // Upstash is down. Log every fallback so repeated occurrences are visible
  // in Vercel logs (previously this was a single warn inside checkUpstash).
  console.error('[rate-limit] Upstash unavailable — fallback path', {
    pathname,
    failClosed: Boolean(options.failClosed),
  })

  if (options.failClosed) {
    return { allowed: false, remaining: 0, limit, degraded: true }
  }

  const result = checkInMemory(pathname, ip, limit)
  return { ...result, degraded: true }
}

/** Extract the best available client IP from a Next.js Request */
export function getClientIp(req: Request): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'
  )
}
