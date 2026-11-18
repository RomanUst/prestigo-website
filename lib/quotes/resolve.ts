// Public quote link resolver (Phase 92, plan 92-09; QUOTE-02, QUOTE-06; D-02, D-05, D-10; T-92-29, T-92-30, T-92-32).
//
// resolveQuoteToken turns the secret token of a quote link into the CURRENT version of its quote, or into null. The
// answer is one identical null for every failure (malformed, unknown, revoked, superseded, draft, voided, cancelled,
// expired, past the first pickup, anonymised, read problem), so the link is no oracle for which quotes exist.
//
// The resolver only READS. The page GET calls it, and mail scanners prefetch links, so it never writes: no
// last_used_at, no status change. "Viewed" is recorded by markQuoteViewed, called only by POST /api/quote/view.
//
// Only the SHA-256 of the token is compared (quote_links.token_hash). Neither the token nor its hash, nor a database
// message (it can echo a value), is ever logged.
//
// Server only. The service client is created inside each call, never at module load.

import { createSupabaseServiceClient } from '@/lib/supabase'
import { appendQuoteEvent } from '@/lib/quotes/events'
import { quoteLinkState, firstPickupMs } from '@/lib/quotes/status'
import { QUOTE_TOKEN_RE, hashQuoteToken } from '@/lib/quotes/token'
import type { QuoteLineRow, QuoteRow, QuoteStopRow, QuoteVersionRow } from '@/lib/quotes/types'

export interface ResolvedQuote {
  quote: QuoteRow
  version: QuoteVersionRow
  lines: Array<QuoteLineRow & { stops: QuoteStopRow[] }>
  linkId: string
  state: 'offer' | 'paid'
  bookings: Array<{
    booking_reference: string
    quote_line_id: string
    status: string
    payment_mode: string
    paid_at: string | null
  }>
}

type Row = Record<string, unknown>

/** A read that failed or returned nothing is the same outcome as an invalid link. */
class NotResolved extends Error {}

function rows<T>(res: { data: unknown; error: unknown }): T[] {
  if (res.error) throw new NotResolved()
  return Array.isArray(res.data) ? (res.data as T[]) : []
}

function one<T>(res: { data: unknown; error: unknown }): T {
  if (res.error || !res.data || typeof res.data !== 'object') throw new NotResolved()
  return res.data as T
}

/**
 * The current version of the quote behind a token, with its lines and stops, or null. Reads only.
 * `nowMs` is injectable for tests; production calls pass nothing.
 */
export async function resolveQuoteToken(token: unknown, nowMs: number = Date.now()): Promise<ResolvedQuote | null> {
  if (typeof token !== 'string' || !QUOTE_TOKEN_RE.test(token)) return null
  try {
    const supabase = createSupabaseServiceClient()

    const link = one<Row & { id: string; quote_id: string; version_id: string; revoked_at: string | null }>(
      await supabase
        .from('quote_links')
        .select('id, quote_id, version_id, revoked_at')
        .eq('token_hash', hashQuoteToken(token))
        .maybeSingle(),
    )

    const quote = one<QuoteRow>(await supabase.from('quotes').select('*').eq('id', link.quote_id).maybeSingle())
    if (quote.anonymised_at) return null

    const version = one<QuoteVersionRow>(
      await supabase.from('quote_versions').select('*').eq('id', link.version_id).eq('quote_id', quote.id).maybeSingle(),
    )
    if (!version.frozen_at) return null

    const lines = rows<QuoteLineRow>(
      await supabase.from('quote_version_lines').select('*').eq('version_id', version.id).order('position', { ascending: true }),
    )
    if (lines.length === 0) return null

    const state = quoteLinkState({
      link: { version_id: link.version_id, revoked_at: link.revoked_at },
      quote: {
        status: quote.status,
        current_version_id: quote.current_version_id,
        expires_at: quote.expires_at,
        cancelled_at: quote.cancelled_at,
      },
      firstPickupMs: firstPickupMs(lines),
      nowMs,
    })
    if (state === null) return null

    const stops = rows<QuoteStopRow>(
      await supabase
        .from('quote_version_line_stops')
        .select('*')
        .in(
          'line_id',
          lines.map((l) => l.id),
        )
        .order('position', { ascending: true }),
    )

    let bookings: ResolvedQuote['bookings'] = []
    if (state === 'paid') {
      bookings = rows<ResolvedQuote['bookings'][number]>(
        await supabase
          .from('bookings')
          .select('booking_reference, quote_line_id, status, payment_mode, paid_at')
          .eq('quote_id', quote.id),
      )
    }

    return {
      quote,
      version,
      lines: lines.map((l) => ({ ...l, stops: stops.filter((s) => s.line_id === l.id) })),
      linkId: link.id,
      state,
      bookings,
    }
  } catch (e) {
    // No token, hash or database message in the log (T-92-32); an expected "not found" is silent.
    if (!(e instanceof NotResolved)) console.error('[quote-resolve] resolve failed')
    return null
  }
}

/**
 * Records that the client opened the quote (D-10): compare-and-set sent -> viewed, then one 'viewed' event keyed by the
 * version. Called only by POST /api/quote/view, never by a GET. Informational: it never gates money. A repeat, or a
 * quote that is no longer 'sent', changes nothing. Throws on a database error (the route answers 200 regardless).
 */
export async function markQuoteViewed(resolved: ResolvedQuote): Promise<void> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('quotes')
    .update({ status: 'viewed' })
    .eq('id', resolved.quote.id)
    .eq('status', 'sent')
    .eq('current_version_id', resolved.version.id)
    .select('id')
  if (error) throw new Error('quote viewed write failed')
  if (!Array.isArray(data) || data.length === 0) return

  await appendQuoteEvent(resolved.quote.id, {
    key: `viewed:${resolved.version.id}`,
    kind: 'viewed',
    versionId: resolved.version.id,
    actor: { type: 'client' },
  })
}
