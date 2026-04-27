/**
 * GNet auth token cache (CLIENT-01).
 * Server-only. Uses Upstash Redis REST API directly (no SDK), mirroring lib/flight-cache.ts.
 * In-memory fallback when Upstash env vars are unset.
 */

const TOKEN_KEY = 'prestigo:gnet:token'
const TOKEN_TTL = 3500 // seconds — 100s safety margin under GNet's 3600s TTL

export type GnetTokenErrorCode =
  | 'MISSING_CREDENTIALS'
  | 'AUTH_FAILED'
  | 'NETWORK_ERROR'
  | 'PARSE_ERROR'

export class GnetTokenError extends Error {
  public readonly code: GnetTokenErrorCode
  public readonly cause?: unknown
  constructor(code: GnetTokenErrorCode, message: string, cause?: unknown) {
    super(message)
    this.name = 'GnetTokenError'
    this.code = code
    this.cause = cause
  }
}

// ── In-memory fallback ──────────────────────────────────────────────────────
let memToken: { token: string; expiresAt: number } | null = null

// ── Upstash REST helpers (copied pattern from lib/flight-cache.ts) ──────────
async function upstashGet(key: string): Promise<string | null> {
  const url   = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null
  try {
    const res = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })
    if (!res.ok) return null
    const data = await res.json() as { result: string | null }
    return data.result ?? null
  } catch {
    return null
  }
}

async function upstashSet(key: string, value: string, ttl: number): Promise<boolean> {
  const url   = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return false
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(['SET', key, value, 'EX', ttl]),
      cache: 'no-store',
    })
    return res.ok
  } catch {
    return false
  }
}

async function fetchNewToken(): Promise<string> {
  const uid = process.env.GNET_UID?.replace(/\\n$/, '').trim()
  const pw  = process.env.GNET_PW?.replace(/\\n$/, '').trim()
  if (!uid || !pw) {
    throw new GnetTokenError('MISSING_CREDENTIALS', 'GNET_UID and GNET_PW must be set')
  }
  const url = process.env.GNET_AUTH_URL?.replace(/\\n$/, '').trim() ?? 'https://api.grdd.net/api/getToken2'
  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid, pw }),
      cache: 'no-store',
    })
  } catch (err) {
    throw new GnetTokenError('NETWORK_ERROR', 'GNet auth fetch failed', err)
  }
  if (!res.ok) {
    throw new GnetTokenError('AUTH_FAILED', `GNet auth returned ${res.status}`)
  }
  let body: unknown
  try {
    body = await res.json()
  } catch (err) {
    throw new GnetTokenError('PARSE_ERROR', 'GNet auth response was not JSON', err)
  }
  const token = (body as { token?: unknown }).token
  if (typeof token !== 'string' || token.length === 0) {
    throw new GnetTokenError('PARSE_ERROR', 'GNet auth response missing token')
  }
  return token
}

/**
 * Get a GNet auth token. Returns cached value when available.
 * Pass `force = true` to bypass cache (used by retry-on-401 in callers).
 */
export async function getGnetToken(force = false): Promise<string> {
  if (!force) {
    const upstashHit = await upstashGet(TOKEN_KEY)
    if (upstashHit) return upstashHit
    if (memToken && memToken.expiresAt > Date.now()) return memToken.token
  }
  const fresh = await fetchNewToken()
  const wroteUpstash = await upstashSet(TOKEN_KEY, fresh, TOKEN_TTL)
  if (!wroteUpstash) {
    memToken = { token: fresh, expiresAt: Date.now() + TOKEN_TTL * 1000 }
  }
  console.info('[gnet-token] token refreshed')
  return fresh
}
