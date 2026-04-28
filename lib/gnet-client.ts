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

function gnetBaseUrl(): string {
  const base = process.env.GNET_API_URL?.replace(/\\n$/, '').trim() ?? 'https://api.grdd.net/Platform.svc'
  return base.replace(/\/$/, '')
}

const GNET_API_VERSION = '1'

async function postOnce(
  token: string,
  gnetResNo: string,
  status: GnetStatus,
  totalAmount: string,
  griddID: string,
): Promise<Response> {
  // Per GRDD docs: POST /providerUpdateStatusByResNo/{griddID}/{resNo}/{version}
  // Headers: token (NOT Bearer). Body: { status, totalAmount, resNo, griddID }.
  const url = `${gnetBaseUrl()}/providerUpdateStatusByResNo/${encodeURIComponent(griddID)}/${encodeURIComponent(gnetResNo)}/${GNET_API_VERSION}`
  try {
    return await fetch(url, {
      method: 'POST',
      headers: {
        token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status, totalAmount, resNo: gnetResNo, griddID }),
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
export async function pushGnetStatus(
  gnetResNo: string,
  status: GnetStatus,
  totalAmount: string,
): Promise<void> {
  const griddID = process.env.GNET_GRIDDID?.replace(/\\n$/, '').trim()
  if (!griddID) {
    throw new GnetClientError('AUTH_FAILED', 'GNET_GRIDDID env var is not set')
  }

  // First attempt — cached token path. GnetTokenError propagates without wrapping.
  let token: string
  try {
    token = await getGnetToken()
  } catch (err) {
    if (err instanceof GnetTokenError) throw err
    throw new GnetClientError('AUTH_FAILED', 'getGnetToken failed', undefined, err)
  }

  let res = await postOnce(token, gnetResNo, status, totalAmount, griddID)

  if (res.status === 401) {
    // Single retry with forced fresh token (Pitfall 2 — no recursion, no loop)
    let freshToken: string
    try {
      freshToken = await getGnetToken(true)
    } catch (err) {
      if (err instanceof GnetTokenError) throw err
      throw new GnetClientError('AUTH_FAILED', 'getGnetToken (retry) failed', undefined, err)
    }
    res = await postOnce(freshToken, gnetResNo, status, totalAmount, griddID)
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
 * Phase 52 (STATUS-04-EXT) extended the map with assigned/en_route/on_location.
 * Returns null for any unmapped status (e.g. 'pending') — caller MUST exit silently on null.
 */
const PRESTIGO_TO_GNET_STATUS: Record<string, GnetStatus> = {
  confirmed:   'CONFIRMED',
  assigned:    'ASSIGNED',
  en_route:    'EN_ROUTE',
  on_location: 'ON_LOCATION',
  completed:   'COMPLETE',
  cancelled:   'CANCEL',
}

export function prestigoToGnetStatus(status: string): GnetStatus | null {
  return PRESTIGO_TO_GNET_STATUS[status] ?? null
}
