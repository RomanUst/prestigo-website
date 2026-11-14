import type Stripe from 'stripe'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { generateBookingReference } from '@/lib/booking-reference'
import { pickupInstantMs } from '@/lib/prague-date'
import { DEFAULT_HOLD_LEAD_HOURS } from '@/lib/payments/config'
import { computeHoldAt } from '@/lib/payments/timing'
import { convertQuoteToBookings, type LedgerActor } from '@/lib/payments/state'
import type { QuoteAcceptanceRow, QuoteLineRow, QuoteRow, QuoteVersionRow } from '@/lib/quotes/types'

/**
 * Phase 92 (QUOTE-03, QUOTE-04, QUOTE-05; D-15, D-18): the conversion core. One function turns a succeeded deposit
 * PaymentIntent of a quote into one booking per line, exactly once; the Stripe webhook route and the tick reconcile that
 * call it are plan 92-31.
 *
 * Decision order (the order is the safety of the money path, tests/quote-convert.test.ts pins every step):
 *   1. a PaymentIntent that is not a succeeded quote deposit (any other status or kind, bad metadata, unknown quote)
 *      is ignored;
 *   2. RECORDED (W2): the intent is the one the quote recorded (deposit_payment_intent_id) and the quote is paid
 *      (paid_at set): 'replayed' with the booking ids, whatever cancelled_at, voided_at or current_version_id say now,
 *      and no Stripe call, ever. Only the quote cancel and the refund dialog return deposit money, never a replay;
 *   3. OWNED: the recorded intent of the current version of a live quote: the lines are built (a fresh booking reference
 *      per line, hold_at for a saved-card line with a remainder) and the wrapper convertQuoteToBookings makes the
 *      bookings in one transaction; first_time false is 'replayed'.
 * The wrapper in lib/payments/state.ts is the only caller of the database function.
 *
 * Server only. Errors and logs carry ids and codes, never a client name, an email or an address.
 */

export interface QuoteDepositOutcome {
  outcome: 'converted' | 'replayed' | 'orphan_refunded' | 'ignored'
  bookingIds?: string[]
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DEPOSIT_KIND = 'card_quote_deposit'

const idOf = (v: string | { id?: string } | null | undefined): string | null =>
  typeof v === 'string' ? v : v && typeof v.id === 'string' ? v.id : null

/** One quote-table read; a database error throws (the webhook answers 500 and Stripe retries). */
async function readOne<T>(table: string, column: string, value: string): Promise<T | null> {
  const { data, error } = await createSupabaseServiceClient().from(table).select('*').eq(column, value).maybeSingle()
  if (error) throw new Error(`quote ${table} lookup failed`)
  return (data as T | null) ?? null
}

async function readMany<T>(table: string, column: string, value: string, orderBy: string): Promise<T[]> {
  const { data, error } = await createSupabaseServiceClient()
    .from(table)
    .select('*')
    .eq(column, value)
    .order(orderBy, { ascending: true })
  if (error) throw new Error(`quote ${table} lookup failed`)
  return (Array.isArray(data) ? data : []) as T[]
}

/** The booking ids of a converted quote, in line order. */
async function bookingIdsOfQuote(quoteId: string): Promise<string[]> {
  const { data, error } = await createSupabaseServiceClient().from('bookings').select('id, quote_line_id').eq('quote_id', quoteId)
  if (error) throw new Error('quote bookings lookup failed')
  const bookings = (Array.isArray(data) ? data : []) as Array<{ id: string; quote_line_id: string | null }>
  const lineIds = bookings.map((b) => b.quote_line_id).filter((id): id is string => typeof id === 'string')
  if (lineIds.length === 0) return bookings.map((b) => b.id)
  const lines = await createSupabaseServiceClient().from('quote_version_lines').select('id, position').in('id', lineIds)
  if (lines.error) throw new Error('quote lines lookup failed')
  const position = new Map(((lines.data ?? []) as Array<{ id: string; position: number }>).map((l) => [l.id, l.position]))
  return [...bookings]
    .sort((a, b) => (position.get(a.quote_line_id ?? '') ?? 0) - (position.get(b.quote_line_id ?? '') ?? 0))
    .map((b) => b.id)
}

/** A booking reference per line, unique inside the call (the database enforces uniqueness across bookings). */
function freshReferences(count: number): string[] {
  const out = new Set<string>()
  while (out.size < count) out.add(generateBookingReference())
  return [...out]
}

/**
 * Applies one succeeded deposit PaymentIntent to its quote. Returns what happened; throws (so the caller answers 500 and
 * Stripe delivers the event again) when money arrived and the conversion could not be completed.
 */
export async function applyQuoteDepositPaid(pi: Stripe.PaymentIntent, actor: LedgerActor): Promise<QuoteDepositOutcome> {
  // 1. Only a succeeded quote deposit with well-formed ids is ours to handle.
  if (pi.status !== 'succeeded') return { outcome: 'ignored' }
  const meta = pi.metadata ?? {}
  const quoteId = meta.quoteId
  const metaVersionId = meta.versionId
  if (meta.kind !== DEPOSIT_KIND || !quoteId || !UUID_RE.test(quoteId) || !metaVersionId || !UUID_RE.test(metaVersionId)) {
    console.warn('[quote-convert] not a quote deposit', { stripeObjectId: pi.id })
    return { outcome: 'ignored' }
  }
  const quote = await readOne<QuoteRow>('quotes', 'id', quoteId)
  if (!quote) {
    console.error('[quote-convert] deposit for an unknown quote', { stripeObjectId: pi.id, quoteId })
    return { outcome: 'ignored' }
  }

  // 2. RECORDED (W2): a deposit this quote already recorded is never decided again, whatever became of the quote since.
  if (quote.deposit_payment_intent_id === pi.id && quote.paid_at) {
    return { outcome: 'replayed', bookingIds: await bookingIdsOfQuote(quote.id) }
  }

  // 3. OWNED: the recorded intent of the current version of a quote that is neither voided nor cancelled.
  const owned =
    quote.deposit_payment_intent_id === pi.id &&
    metaVersionId === quote.current_version_id &&
    !quote.voided_at &&
    !quote.cancelled_at &&
    quote.status !== 'voided'
  if (!owned) throw new Error('quote deposit not owned: not handled yet')

  const version = await readOne<QuoteVersionRow>('quote_versions', 'id', metaVersionId)
  const acceptance = await readAcceptance(quote.id, pi.id)
  const lines = await readMany<QuoteLineRow>('quote_version_lines', 'version_id', metaVersionId, 'position')
  const leadHours = acceptance?.hold_lead_hours ?? DEFAULT_HOLD_LEAD_HOURS
  const cardHold = version?.remainder_method === 'saved_card'
  const references = freshReferences(lines.length)

  const result = await convertQuoteToBookings({
    quoteId: quote.id,
    versionId: metaVersionId,
    paymentIntentId: pi.id,
    customerId: idOf(pi.customer as string | { id?: string } | null),
    paymentMethodId: idOf(pi.payment_method as string | { id?: string } | null),
    lines: lines.map((line, i) => ({
      position: line.position,
      bookingReference: references[i],
      holdAt: cardHold && (line.remainder_minor ?? 0) > 0 ? holdAtFor(line, leadHours) : null,
    })),
    actor,
  })
  if (!result.converted) throw new Error(`quote conversion refused: ${result.reason}`)
  return { outcome: result.firstTime ? 'converted' : 'replayed', bookingIds: result.bookingIds }
}

async function readAcceptance(quoteId: string, paymentIntentId: string): Promise<QuoteAcceptanceRow | null> {
  const { data, error } = await createSupabaseServiceClient()
    .from('quote_acceptances')
    .select('*')
    .eq('quote_id', quoteId)
    .eq('payment_intent_id', paymentIntentId)
    .maybeSingle()
  if (error) throw new Error('quote acceptance lookup failed')
  return (data as QuoteAcceptanceRow | null) ?? null
}

/** The instant the tick places the hold: computeHoldAt of the pickup instant, or null when the pickup does not parse. */
function holdAtFor(line: QuoteLineRow, leadHours: number): string | null {
  const pickupMs = pickupInstantMs({ pickup_utc: null, pickup_date: line.pickup_date, pickup_time: line.pickup_time })
  if (pickupMs === null) return null
  return new Date(computeHoldAt(pickupMs, leadHours).holdAtMs).toISOString()
}
