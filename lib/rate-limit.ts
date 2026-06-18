/**
 * Sliding-window rate limiter.
 *
 * Uses Upstash Redis REST API directly (no SDK) when
 * UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN are set.
 * Falls back to an in-memory store otherwise.
 *
 * Both paths implement a true *sliding-window log*: each request is recorded
 * with its millisecond timestamp, entries older than the 60s window are
 * discarded, and the request is allowed only if fewer than `limit` entries
 * remain in the trailing 60s. This avoids the ~2× burst a fixed window permits
 * at the window boundary (end of window N + start of window N+1).
 *
 * The Upstash path uses a single atomic Lua EVAL over a sorted set
 * (ZREMRANGEBYSCORE + ZCARD + ZADD), which is sufficient for our traffic
 * volumes and does not require the @upstash/ratelimit SDK (which has
 * compatibility issues in some Vercel runtimes).
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
  '/login':                       5, // customer auth: prevent magic-link / password brute force
  '/api/check-flight':            5, // 5 checks per minute — protects FlightStats API quota
  '/api/corporate-contact':       5, // 5 corporate enquiries per minute per IP
  '/api/driver/respond':         10, // SEC-02: prevent token oracle enumeration
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

const WINDOW_MS = 60_000

/**
 * Atomic sliding-window log via Lua EVAL over a sorted set.
 *
 * The set holds one member per recent request, scored by its millisecond
 * timestamp. Each call drops members older than `now - WINDOW_MS`, counts what
 * remains, and only records the new request (ZADD) when still under `limit` —
 * so a denied request does not grow the set. PEXPIRE keeps idle keys from
 * lingering. Returns the trailing-window count and whether the request was
 * admitted; the whole script runs atomically so concurrent requests can't race
 * past the limit.
 */
async function checkUpstash(key: string, limit: number): Promise<RateLimitResult | null> {
  const url   = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null

  const luaScript = [
    'local now = tonumber(ARGV[1])',
    'local window = tonumber(ARGV[2])',
    'local limit = tonumber(ARGV[3])',
    'redis.call("ZREMRANGEBYSCORE", KEYS[1], 0, now - window)',
    'local count = redis.call("ZCARD", KEYS[1])',
    'local allowed = 0',
    'if count < limit then',
    '  redis.call("ZADD", KEYS[1], now, ARGV[4])',
    '  count = count + 1',
    '  allowed = 1',
    'end',
    'redis.call("PEXPIRE", KEYS[1], window)',
    'return {count, allowed}',
  ].join(' ')

  const now = Date.now()
  // Unique member per request so identical-millisecond requests don't collide
  // into a single sorted-set entry (which would under-count the window).
  const member = `${now}-${Math.random().toString(36).slice(2)}`

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      // Upstash REST API: send full Redis command as JSON array
      body: JSON.stringify([
        'EVAL', luaScript, 1, key,
        String(now), String(WINDOW_MS), String(limit), member,
      ]),
      // Tell Next.js not to cache this request
      cache: 'no-store',
    })

    if (!res.ok) {
      console.warn('[rate-limit] Upstash EVAL returned', res.status)
      return null
    }

    const data = await res.json() as { result: [number, number] }
    const [count, allowedFlag] = data.result
    const remaining = Math.max(0, limit - count)
    return { allowed: allowedFlag === 1, remaining, limit }
  } catch (err) {
    console.warn('[rate-limit] Upstash fetch failed:', err)
    return null
  }
}

// ── In-memory fallback (development / Redis unavailable) ─────────────────────

// Sliding-window log: per key we keep the timestamps (ms) of recent requests,
// bounded to at most `limit` entries since denied requests are not recorded.
const store = new Map<string, number[]>()
let lastPrune = 0

function maybePrune() {
  const now = Date.now()
  if (now - lastPrune < WINDOW_MS) return
  lastPrune = now
  const cutoff = now - WINDOW_MS
  for (const [key, hits] of store) {
    const fresh = hits.filter(t => t > cutoff)
    if (fresh.length === 0) store.delete(key)
    else store.set(key, fresh)
  }
}

function checkInMemory(pathname: string, ip: string, limit: number): RateLimitResult {
  maybePrune()
  const key = `${pathname}:${ip}`
  const now = Date.now()
  const cutoff = now - WINDOW_MS
  const hits = (store.get(key) ?? []).filter(t => t > cutoff)

  if (hits.length >= limit) {
    store.set(key, hits)
    return { allowed: false, remaining: 0, limit }
  }

  hits.push(now)
  store.set(key, hits)
  return { allowed: true, remaining: limit - hits.length, limit }
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

/**
 * Extract the best available client IP from a Next.js Request.
 *
 * SECURITY ASSUMPTION (IN-01): `x-forwarded-for` is client-spoofable in the
 * general case — a request can send an arbitrary value to rotate its rate-limit
 * key per request. This is safe ONLY because we run behind Vercel, which
 * overwrites `x-forwarded-for`/`x-real-ip` with the real edge-observed client
 * IP before our code runs. If this ever moves off a trusted proxy that
 * normalises these headers, switch to a platform-verified header
 * (e.g. Vercel's `x-vercel-forwarded-for`) before relying on the limiter.
 */
export function getClientIp(req: Request): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'
  )
}
