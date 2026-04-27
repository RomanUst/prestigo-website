// Phase 49: GNet Farm In webhook endpoint.
// Wave 0 stub — Plan 02 implements Basic Auth + Zod, Plan 03 implements QUOTE
// branch, Plan 04 implements BOOKING branch with idempotent DB insert.
//
// GNet protocol contract (CRITICAL):
//   - Any non-2xx response triggers retry storm from GNet partner.
//   - All business failures (unknown route, wrong providerId, invalid payload)
//     MUST return HTTP 200 with { success: false, message }.
//   - Only genuine technical errors (DB down, timeout) may return 5xx.

export const runtime = 'nodejs' // crypto.timingSafeEqual requires Node runtime
export const dynamic = 'force-dynamic'

export function GET(): Response {
  return Response.json({ success: true }, { status: 200 })
}

export function POST(): Response {
  return Response.json(
    { success: false, message: 'Not implemented (Wave 0 stub)' },
    { status: 501 },
  )
}
