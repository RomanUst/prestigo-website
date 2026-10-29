import { NextResponse } from 'next/server'
import { z } from 'zod'
import { enforceMaxBody } from '@/lib/request-guards'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'
import { readEnv } from '@/lib/env'
import { PANEL_CHATWOOT_AUTH_HEADER, isPlausibleOperatorToken, verifyOperator } from '@/lib/chatwoot-operator'
import { buildNoContactResponse, buildPanelResponse, createPanelBookingsStore } from '@/lib/panel-bookings'
import type { PanelErrorCode } from '@/lib/panel-dto'

// Chatwoot Dashboard App API (Phase 84, PANEL-01 / PANEL-02). READ-ONLY and cookie-less by design:
//  - The only credential is the operator's own Chatwoot token in the `api-access-token` header
//    (D-02); it is verified against Chatwoot on every request (D-01), there is no admin-session
//    check and no agent allowlist (D-04). This file never reads cookies and imports no cookie-session
//    Supabase module (tests/dashboard-app-isolation-guard.test.ts enforces it).
//  - The body carries exactly one key, conversationId (D-03). The lookup email/phone come only from
//    the contact of that conversation as Chatwoot returned it to this operator, never from the client;
//    there is no search parameter of any kind (D-12).
//  - Never writes: one read-only RPC (panel_bookings); a payment link is returned, never created (D-09).
//  - Every response carries Cache-Control no-store and Referrer-Policy no-referrer. Each request logs
//    one line with an outcome and a status code, never the token, a header, the body, an email or a phone.
//  - no_access and not_found share one 403 body so the endpoint is no conversation-existence oracle.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 10

const MAX_BODY_BYTES = 2000

// Strict: an unknown key (email, phone, contact, ...) is a 400, so no lookup key can be supplied.
const bodySchema = z
  .object({ conversationId: z.number().int().positive().max(2147483647) })
  .strict()

function respond(body: Record<string, unknown>, status: number, outcome: string): NextResponse {
  console.log(`[panel] outcome=${outcome} code=${status}`)
  return harden(NextResponse.json(body, { status }))
}

function harden(res: NextResponse): NextResponse {
  res.headers.set('Cache-Control', 'no-store')
  res.headers.set('Referrer-Policy', 'no-referrer')
  return res
}

function fail(code: PanelErrorCode, status: number, outcome: string = code): NextResponse {
  return respond({ error: code }, status, outcome)
}

function tooLarge(): NextResponse {
  console.log('[panel] outcome=too_large code=413')
  return harden(
    NextResponse.json(
      { error: 'Payload too large' },
      { status: 413, headers: { 'X-Max-Body-Bytes': String(MAX_BODY_BYTES) } },
    ),
  )
}

export async function POST(request: Request): Promise<NextResponse> {
  const oversized = enforceMaxBody(request, MAX_BODY_BYTES)
  if (oversized) {
    console.log('[panel] outcome=too_large code=413')
    return harden(oversized)
  }

  const limit = await checkRateLimit('/api/chatwoot/dashboard-app', getClientIp(request), { failClosed: true })
  if (!limit.allowed) {
    return limit.degraded ? fail('rate_limited', 503, 'limiter_degraded') : fail('rate_limited', 429)
  }

  // Shape check before any network call: a malformed token never reaches Chatwoot.
  const token = request.headers.get(PANEL_CHATWOOT_AUTH_HEADER)
  if (!isPlausibleOperatorToken(token)) return fail('invalid_token', 401, 'missing_token')

  let raw: string
  try {
    raw = await request.text()
  } catch {
    return fail('bad_request', 400, 'bad_body')
  }
  // content-length can be absent or wrong: enforce the cap on the bytes actually read.
  if (Buffer.byteLength(raw, 'utf8') > MAX_BODY_BYTES) return tooLarge()

  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    return fail('bad_request', 400, 'bad_json')
  }
  const parsed = bodySchema.safeParse(json)
  if (!parsed.success) return fail('bad_request', 400, 'bad_shape')
  const { conversationId } = parsed.data

  let verdict: Awaited<ReturnType<typeof verifyOperator>>
  try {
    verdict = await verifyOperator(token, conversationId)
  } catch {
    return fail('unavailable', 502)
  }
  if (!verdict.ok) {
    switch (verdict.reason) {
      case 'invalid_token':
        return fail('invalid_token', 401)
      case 'no_access':
      case 'not_found':
        // One body for both: no conversation-existence oracle.
        return fail('no_access', 403, verdict.reason)
      case 'unavailable':
        return fail('unavailable', 502)
      case 'not_configured':
        return fail('not_configured', 503)
      default:
        return fail('internal', 500)
    }
  }

  const now = new Date()
  const { contact } = verdict
  if (contact.email === null && contact.phone === null) {
    return respond({ ...buildNoContactResponse(contact, now) }, 200, 'no_contact')
  }

  try {
    const rpc = await createPanelBookingsStore().load({
      email: contact.email,
      phone: contact.phone,
      conversationId,
    })
    const response = buildPanelResponse(rpc, contact, now, { espoBaseUrl: readEnv('ESPOCRM_BASE_URL') ?? null })
    return respond({ ...response }, 200, 'ok')
  } catch {
    return fail('internal', 500, 'store_error')
  }
}
