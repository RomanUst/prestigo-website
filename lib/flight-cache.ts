/**
 * Flight status cache.
 *
 * Uses Upstash Redis REST API directly (no SDK) when
 * UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN are set.
 * Falls back to an in-memory Map with TTL otherwise (dev / test environments).
 */

const CACHE_TTL = 600 // 10 minutes (D-07 discretion)

// ── In-memory fallback ────────────────────────────────────────────────────────

const memCache = new Map<string, { value: unknown; expiresAt: number }>()

// ── Upstash REST helpers ──────────────────────────────────────────────────────

async function upstashGet(key: string): Promise<Record<string, unknown> | null> {
  const url   = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null

  try {
    const res = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })
    if (!res.ok) {
      console.warn('[flight-cache] Upstash GET returned', res.status)
      return null
    }
    const data = await res.json() as { result: string | null }
    if (!data.result) return null
    return JSON.parse(data.result) as Record<string, unknown>
  } catch (err) {
    console.warn('[flight-cache] Upstash GET failed:', err)
    return null
  }
}

async function upstashSet(key: string, value: unknown, ttlSeconds: number): Promise<boolean> {
  const url   = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return false

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(['SET', key, JSON.stringify(value), 'EX', ttlSeconds]),
      cache: 'no-store',
    })
    if (!res.ok) {
      console.warn('[flight-cache] Upstash SET returned', res.status)
      return false
    }
    return true
  } catch (err) {
    console.warn('[flight-cache] Upstash SET failed:', err)
    return false
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Get a cached flight result by key.
 * Returns null on cache miss or error.
 */
export async function getFlightCache(key: string): Promise<Record<string, unknown> | null> {
  // Try Upstash first
  const upstashResult = await upstashGet(key)
  if (upstashResult !== null) return upstashResult

  // In-memory fallback
  const entry = memCache.get(key)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) {
    memCache.delete(key)
    return null
  }
  return entry.value as Record<string, unknown>
}

/**
 * Store a flight result in cache with optional TTL (default 10 minutes).
 */
export async function setFlightCache(
  key: string,
  value: unknown,
  ttlSeconds = CACHE_TTL,
): Promise<void> {
  // Try Upstash first
  const stored = await upstashSet(key, value, ttlSeconds)
  if (stored) return

  // In-memory fallback
  memCache.set(key, {
    value,
    expiresAt: Date.now() + ttlSeconds * 1000,
  })
}
