/**
 * GNet outbound client (CLIENT-02).
 * Server-only. Wraps providerUpdateStatusByResNo with typed errors and retry-on-401.
 */

import { getGnetToken, GnetTokenError } from '@/lib/gnet-token'

export type GnetStatus =
  | 'CONFIRMED'
  | 'ASSIGNED'
  | 'EN_ROUTE'
  | 'ON_LOCATION'
  | 'COMPLETE'
  | 'CANCEL'

export type GnetClientErrorCode =
  | 'API_ERROR'
  | 'NETWORK_ERROR'
  | 'PARSE_ERROR'
  | 'AUTH_FAILED'

export class GnetClientError extends Error {
  public readonly code: GnetClientErrorCode
  public readonly status?: number
  public readonly cause?: unknown
  constructor(code: GnetClientErrorCode, message: string, status?: number, cause?: unknown) {
    super(message)
    this.name = 'GnetClientError'
    this.code = code
    this.status = status
    this.cause = cause
  }
}

function gnetUrl(path: string): string {
  const base = process.env.GNET_API_URL ?? 'https://api.grdd.net/api'
  return `${base.replace(/\/$/, '')}/${path.replace(/^\//, '')}`
}

async function postOnce(token: string, gnetResNo: string, status: GnetStatus): Promise<Response> {
  try {
    return await fetch(gnetUrl('providerUpdateStatusByResNo'), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ gnetResNo, status }),
      cache: 'no-store',
    })
  } catch (err) {
    throw new GnetClientError('NETWORK_ERROR', 'GNet status push fetch failed', undefined, err)
  }
}

/**
 * Push a status update to GNet for a given reservation.
 * Retries exactly once with a force-refreshed token on 401.
 * Throws GnetClientError on non-2xx; rethrows GnetTokenError unchanged.
 */
export async function pushGnetStatus(gnetResNo: string, status: GnetStatus): Promise<void> {
  // First attempt — cached token path. GnetTokenError propagates without wrapping.
  let token: string
  try {
    token = await getGnetToken()
  } catch (err) {
    if (err instanceof GnetTokenError) throw err
    throw new GnetClientError('AUTH_FAILED', 'getGnetToken failed', undefined, err)
  }

  let res = await postOnce(token, gnetResNo, status)

  if (res.status === 401) {
    // Single retry with forced fresh token (Pitfall 2 — no recursion, no loop)
    let freshToken: string
    try {
      freshToken = await getGnetToken(true)
    } catch (err) {
      if (err instanceof GnetTokenError) throw err
      throw new GnetClientError('AUTH_FAILED', 'getGnetToken (retry) failed', undefined, err)
    }
    res = await postOnce(freshToken, gnetResNo, status)
    if (res.status === 401) {
      throw new GnetClientError('AUTH_FAILED', 'GNet auth rejected after token refresh', 401)
    }
  }

  if (!res.ok) {
    throw new GnetClientError('API_ERROR', `GNet returned ${res.status}`, res.status)
  }
}

/**
 * Map a Prestigo booking status string to its GNet equivalent.
 * Per D-01 (Phase 50), only confirmed/completed/cancelled are mapped in this phase.
 * assigned/en_route/on_location are deferred to Phase 51 (depends on driver UI).
 * Returns null for any unmapped status — caller MUST exit silently on null.
 */
const PRESTIGO_TO_GNET_STATUS: Record<string, GnetStatus> = {
  confirmed: 'CONFIRMED',
  completed: 'COMPLETE',
  cancelled: 'CANCEL',
}

export function prestigoToGnetStatus(status: string): GnetStatus | null {
  return PRESTIGO_TO_GNET_STATUS[status] ?? null
}
