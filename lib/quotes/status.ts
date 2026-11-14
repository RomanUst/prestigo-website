// The one link-validity rule of a quote (Phase 92, plan 92-02; QUOTE-02, QUOTE-06; D-02, D-05, D-10).
//
// Every later plan (public page, accept, pay, PDF, state polling) decides whether a link may show or take money
// through quoteLinkState and nothing else. Validity is derived from the current version, the operator expiry and the
// first pickup, never stored. Pure and client-safe; all dates go through pickupInstantMs (DST-safe).

import { pickupInstantMs } from '@/lib/prague-date'
import type { QuoteStatus } from '@/lib/quotes/vocabulary'

type PickupFields = { pickup_date: string; pickup_time: string }

function instants(lines: readonly PickupFields[]): number[] {
  const out: number[] = []
  for (const line of lines) {
    const ms = pickupInstantMs({ pickup_utc: null, pickup_date: line.pickup_date, pickup_time: line.pickup_time })
    if (ms !== null) out.push(ms)
  }
  return out
}

/** The earliest pickup instant over the lines (D-05, D-06). Null when no line has a readable pickup. */
export function firstPickupMs(lines: readonly PickupFields[]): number | null {
  const all = instants(lines)
  return all.length === 0 ? null : Math.min(...all)
}

/** The latest pickup instant over the lines. Null when no line has a readable pickup. */
export function lastPickupMs(lines: readonly PickupFields[]): number | null {
  const all = instants(lines)
  return all.length === 0 ? null : Math.max(...all)
}

function isPast(iso: string | null, nowMs: number): boolean {
  if (!iso) return false
  const ms = Date.parse(iso)
  return Number.isFinite(ms) && ms <= nowMs
}

/**
 * The status to show: 'expired' for a sent or viewed quote whose operator expiry has passed (D-02), 'cancelled' once
 * cancelled_at is set, else the stored status. An accepted or paid quote never expires.
 */
export function effectiveQuoteStatus(
  q: { status: QuoteStatus; expires_at: string | null; cancelled_at: string | null },
  nowMs: number,
): QuoteStatus | 'cancelled' {
  if (q.cancelled_at) return 'cancelled'
  if ((q.status === 'sent' || q.status === 'viewed') && isPast(q.expires_at, nowMs)) return 'expired'
  return q.status
}

/**
 * What a link may do right now.
 *   'offer' - the quote is sent, viewed or accepted, the link belongs to the current version and is not revoked, the
 *             operator expiry has not passed and the first pickup is still in the future (D-02, D-05).
 *   'paid'  - the quote is paid and not cancelled; stays readable after expiry and after the first pickup.
 *   null    - every other case (draft, voided, expired, superseded, revoked, cancelled, past first pickup); callers
 *             answer one identical "no longer available" view for all of them.
 */
export function quoteLinkState(input: {
  link: { version_id: string; revoked_at: string | null }
  quote: {
    status: QuoteStatus
    current_version_id: string | null
    expires_at: string | null
    cancelled_at: string | null
  }
  firstPickupMs: number | null
  nowMs: number
}): 'offer' | 'paid' | null {
  const { link, quote, nowMs } = input
  if (link.revoked_at) return null
  if (quote.current_version_id === null || link.version_id !== quote.current_version_id) return null
  if (quote.cancelled_at) return null

  if (quote.status === 'paid') return 'paid'

  if (quote.status !== 'sent' && quote.status !== 'viewed' && quote.status !== 'accepted') return null
  if (isPast(quote.expires_at, nowMs)) return null
  if (input.firstPickupMs === null || nowMs >= input.firstPickupMs) return null
  return 'offer'
}
