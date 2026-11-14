// Small HTTP helpers shared by the admin quote routes (Phase 92, plan 92-08). The admin guard itself
// (getAdminUser) stays in each route so the guard order is visible where it runs.

import { NextResponse } from 'next/server'

export const NO_STORE = { 'Cache-Control': 'no-store' } as const

export const unauthorized = () => NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: NO_STORE })
export const forbidden = () => NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: NO_STORE })

/**
 * Reads the request body as text and parses it as JSON: 413 when it is longer than the cap (a chunked body carries no
 * content-length, so the real length is checked too), 400 for an unreadable body or malformed JSON.
 */
export async function readCappedJson(
  request: Request,
  maxBytes: number,
): Promise<{ ok: true; json: unknown } | { ok: false; response: NextResponse }> {
  let raw: string
  try {
    raw = await request.text()
  } catch {
    return { ok: false, response: NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  }
  if (raw.length > maxBytes) {
    return { ok: false, response: NextResponse.json({ error: 'Payload too large' }, { status: 413 }) }
  }
  try {
    return { ok: true, json: JSON.parse(raw) }
  } catch {
    return { ok: false, response: NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  }
}
