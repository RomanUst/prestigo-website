// The operator's two actions that finish the non-card remainder methods (Phase 92, plan 92-24; QUOTE-04; D-16, D-17, D-22).
//
//   markInvoicePaid   the operator received the invoice payment outside the site. The quote and its live quote-mode
//                     bookings get the invoice number and the paid time. It is a record: no invoice document is
//                     generated (D-17) and no money moves through Stripe (D-22: the saved card is never charged by the
//                     operator on an invoice quote).
//
//   requestRemainder  asks the client to pay what is left on a payment-link quote (D-16). A fresh quote link is minted
//                     with mintQuoteLink (only its hash is stored, so the URL exists in this email and nowhere else) and
//                     emailed in the quote's language with the amount due. The client pays on the quote page (92-23);
//                     nothing is charged here. No more than one request per 10 minutes, read from the event log.
//
// Exactly once: the quote update is a compare-and-set on `invoice_paid_at IS NULL`, so two calls give one change. The
// same number again is a success with no change (it only finishes bookings an interrupted call did not reach); a
// different number after the quote is marked is refused. The audit trail is an `admin_action` event written before the
// change and an `invoice_paid` event after it, both with the admin as actor.
//
// Server only. The service client is created inside each call. Logs and events carry ids, amounts and codes only: never
// the invoice number, an address or a name.

import { randomUUID } from 'node:crypto'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { renderQuoteRemainderDueEmail } from '@/lib/quotes/emails/remainder-due'
import { sendQuoteEmail } from '@/lib/quotes/emails/shell'
import { appendQuoteEvent, type QuoteEventInput } from '@/lib/quotes/events'
import { mintQuoteLink } from '@/lib/quotes/lifecycle'
import { remainderDueMinor } from '@/lib/quotes/money'
import { hashQuoteToken } from '@/lib/quotes/token'
import type { QuoteRow, QuoteVersionRow } from '@/lib/quotes/types'

type Row = Record<string, unknown>
type Supabase = ReturnType<typeof createSupabaseServiceClient>

export interface InvoiceActor {
  id: string
}

/** quotes.invoice_number CHECK (091): at most 60 characters. */
export const INVOICE_NUMBER_MAX = 60

/** One line of printable text: no control character (a line break, a tab), no line or paragraph separator. */
// eslint-disable-next-line no-control-regex
const SINGLE_LINE_RE = /^[^\u0000-\u001f\u007f-\u009f\u2028\u2029]+$/

/** True for a trimmed, non-empty, single-line invoice number of at most 60 characters. */
export function isValidInvoiceNumber(value: string): boolean {
  return value.length >= 1 && value.length <= INVOICE_NUMBER_MAX && value === value.trim() && SINGLE_LINE_RE.test(value)
}

export type MarkInvoicePaidResult =
  | { ok: true; changed: boolean }
  | { ok: false; code: 'not_found' | 'not_invoice' | 'not_paid' | 'number_conflict' }

const fail = (what: string, quoteId: string, code: string | null | undefined): never => {
  console.error('[quotes/invoice] database error', { quoteId, what, code: code ?? null })
  throw new Error(`quote invoice failed: ${what}`)
}

/** The audit trail never blocks an action that already happened: appendQuoteEvent logs its own failure. */
async function recordEvent(quoteId: string, event: QuoteEventInput): Promise<void> {
  try {
    await appendQuoteEvent(quoteId, event)
  } catch {
    // Logged inside appendQuoteEvent (ids and code only).
  }
}

async function readQuote(supabase: Supabase, quoteId: string): Promise<QuoteRow | null> {
  const { data, error } = await supabase.from('quotes').select('*').eq('id', quoteId).maybeSingle()
  if (error) fail('read quote', quoteId, error.code)
  return data ? (data as QuoteRow) : null
}

/** The version the client paid for: the accepted one, else the current one. */
async function readPaidVersion(supabase: Supabase, quote: QuoteRow): Promise<QuoteVersionRow | null> {
  const versionId = quote.accepted_version_id ?? quote.current_version_id
  if (!versionId) return null
  const { data, error } = await supabase.from('quote_versions').select('*').eq('id', versionId).eq('quote_id', quote.id).maybeSingle()
  if (error) fail('read version', quote.id, error.code)
  return data ? (data as QuoteVersionRow) : null
}

interface RemainderLine {
  id: string
  remainder_minor: number | null
}

interface RemainderBooking {
  quote_line_id: string | null
  status: string
  paid_at: string | null
  payment_mode: string
}

/** What is still due on a quote: the remainders of its live, unpaid quote-mode bookings (PostgREST sends bigint as text). */
export async function readRemainderDue(supabase: Supabase, quoteId: string, versionId: string): Promise<number> {
  const { data: lineData, error: lineError } = await supabase
    .from('quote_version_lines')
    .select('id, remainder_minor')
    .eq('version_id', versionId)
  if (lineError) fail('read lines', quoteId, lineError.code)
  const lines: RemainderLine[] = ((lineData ?? []) as Row[]).map((l) => ({
    id: String(l.id),
    remainder_minor: l.remainder_minor === null || l.remainder_minor === undefined ? null : Number(l.remainder_minor),
  }))

  const { data: bookingData, error: bookingError } = await supabase
    .from('bookings')
    .select('quote_line_id, status, paid_at, payment_mode')
    .eq('quote_id', quoteId)
  if (bookingError) fail('read bookings', quoteId, bookingError.code)
  const bookings = ((bookingData ?? []) as Row[]).map(
    (b): RemainderBooking => ({
      quote_line_id: (b.quote_line_id as string | null) ?? null,
      status: String(b.status),
      paid_at: (b.paid_at as string | null) ?? null,
      payment_mode: String(b.payment_mode),
    }),
  )
  return remainderDueMinor(lines, bookings)
}

/**
 * Marks an invoice paid (D-17): the quote gets `invoice_number` and `invoice_paid_at`, and each of its quote-mode
 * bookings that is not cancelled gets `paid_at` and `invoice_number`. Refused for a quote whose remainder method is not
 * invoice (`not_invoice`) and for one that is not paid or is cancelled (`not_paid`).
 */
export async function markInvoicePaid(input: {
  quoteId: string
  invoiceNumber: string
  actor: InvoiceActor
}): Promise<MarkInvoicePaidResult> {
  const { quoteId, invoiceNumber, actor } = input
  if (!isValidInvoiceNumber(invoiceNumber)) throw new Error('markInvoicePaid: invalid invoice number')

  const supabase = createSupabaseServiceClient()
  const quote = await readQuote(supabase, quoteId)
  if (!quote) return { ok: false, code: 'not_found' }
  const version = await readPaidVersion(supabase, quote)
  if (!version) return { ok: false, code: 'not_found' }

  if (version.remainder_method !== 'invoice') return { ok: false, code: 'not_invoice' }
  if (quote.status !== 'paid' || quote.cancelled_at) return { ok: false, code: 'not_paid' }

  // Already marked: the same number is a success, another one is a conflict. Either way the first number stands.
  if (quote.invoice_paid_at) {
    if (quote.invoice_number !== invoiceNumber) return { ok: false, code: 'number_conflict' }
    const repaired = await settleBookings(supabase, quote, version, invoiceNumber, quote.invoice_paid_at, actor)
    return { ok: true, changed: repaired }
  }

  await recordEvent(quoteId, {
    key: `admin:invoice-paid:${quoteId}`,
    kind: 'admin_action',
    versionId: version.id,
    actor: { type: 'admin', id: actor.id },
  })

  const paidAt = new Date().toISOString()
  const { data, error } = await supabase
    .from('quotes')
    .update({ invoice_number: invoiceNumber, invoice_paid_at: paidAt, updated_at: paidAt })
    .eq('id', quoteId)
    .eq('status', 'paid')
    .is('invoice_paid_at', null)
    .is('cancelled_at', null)
    .select('id')
  if (error) fail('mark invoice paid', quoteId, error.code)

  if (!Array.isArray(data) || data.length === 0) {
    // Lost a race: the same number is fine, another number or a cancellation is not.
    const latest = await readQuote(supabase, quoteId)
    if (!latest) return { ok: false, code: 'not_found' }
    if (latest.invoice_paid_at) {
      if (latest.invoice_number !== invoiceNumber) return { ok: false, code: 'number_conflict' }
      return { ok: true, changed: false }
    }
    return { ok: false, code: 'not_paid' }
  }

  await settleBookings(supabase, quote, version, invoiceNumber, paidAt, actor)
  return { ok: true, changed: true }
}

/**
 * Writes paid_at and the number on the live quote-mode bookings that are not paid yet and records invoice_paid (its key
 * makes a repeat harmless). Returns true when at least one booking changed. Used by the first call and by a replay: a
 * call interrupted after the quote update is finished by repeating it with the same number.
 */
async function settleBookings(
  supabase: Supabase,
  quote: QuoteRow,
  version: QuoteVersionRow,
  invoiceNumber: string,
  paidAt: string,
  actor: InvoiceActor,
): Promise<boolean> {
  const due = await readRemainderDue(supabase, quote.id, version.id)

  const { data, error } = await supabase
    .from('bookings')
    .update({ paid_at: paidAt, invoice_number: invoiceNumber })
    .eq('quote_id', quote.id)
    .eq('payment_mode', 'quote')
    .neq('status', 'cancelled')
    .is('paid_at', null)
    .select('id')
  if (error) fail('mark bookings paid', quote.id, error.code)

  await recordEvent(quote.id, {
    key: `invoice_paid:${quote.id}`,
    kind: 'invoice_paid',
    versionId: version.id,
    amountMinor: due > 0 ? due : null,
    currency: due > 0 ? version.currency : null,
    actor: { type: 'admin', id: actor.id },
  })
  return Array.isArray(data) && data.length > 0
}

// == remainder request ===============================================================================================

/** One request per quote per 10 minutes (T-92-78). */
export const REMAINDER_REPEAT_MS = 10 * 60 * 1000

export type RequestRemainderResult =
  | { ok: true; amountMinor: number }
  | { ok: false; code: 'not_found' | 'not_payment_link' | 'not_paid' | 'nothing_due' | 'recently_sent' | 'email_failed' }

/** True when the latest remainder_requested event of the quote is younger than the repeat guard. */
async function requestedRecently(supabase: Supabase, quoteId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('quote_events')
    .select('created_at')
    .eq('quote_id', quoteId)
    .eq('kind', 'remainder_requested')
    .order('created_at', { ascending: false })
    .limit(1)
  if (error) fail('read remainder events', quoteId, error.code)
  const latest = ((data ?? []) as Row[])[0]
  if (!latest) return false
  const at = Date.parse(String(latest.created_at))
  return Number.isFinite(at) && Date.now() - at < REMAINDER_REPEAT_MS
}

/**
 * Asks the client to pay the remainder of a paid payment-link quote: mints a fresh link and emails it with the amount
 * still due. Refused for a quote whose method is not payment link, one that is not paid or is cancelled, one with
 * nothing due, and one asked less than 10 minutes ago. `remainder_requested` is recorded only after the email went out,
 * so a failed send never blocks the retry. The link of a failed send exists but was never delivered.
 */
export async function requestRemainder(input: { quoteId: string; actor: InvoiceActor }): Promise<RequestRemainderResult> {
  const { quoteId, actor } = input
  const supabase = createSupabaseServiceClient()
  const quote = await readQuote(supabase, quoteId)
  if (!quote) return { ok: false, code: 'not_found' }
  const version = await readPaidVersion(supabase, quote)
  if (!version) return { ok: false, code: 'not_found' }

  if (version.remainder_method !== 'payment_link') return { ok: false, code: 'not_payment_link' }
  if (quote.status !== 'paid' || quote.cancelled_at) return { ok: false, code: 'not_paid' }

  const amountMinor = await readRemainderDue(supabase, quoteId, version.id)
  if (!(amountMinor > 0)) return { ok: false, code: 'nothing_due' }

  if (await requestedRecently(supabase, quoteId)) return { ok: false, code: 'recently_sent' }

  await recordEvent(quoteId, {
    key: `admin:remainder-request:${randomUUID()}`,
    kind: 'admin_action',
    versionId: version.id,
    amountMinor,
    currency: version.currency,
    actor: { type: 'admin', id: actor.id },
  })

  const minted = await mintQuoteLink(quoteId, { id: actor.id })
  if (!minted.ok) return { ok: false, code: minted.code === 'not_found' ? 'not_found' : 'not_paid' }

  // The link id is not returned by mintQuoteLink and the raw token must not become a key: a hash of the URL is unique
  // per mint and reveals nothing.
  const mintKey = hashQuoteToken(minted.url).slice(0, 32)
  const emailEvent = { key: `email:remainder:${mintKey}`, versionId: version.id, actor: { type: 'system' as const } }

  let rendered: { subject: string; html: string }
  try {
    rendered = await renderQuoteRemainderDueEmail({ quote, version, amountMinor, url: minted.url })
  } catch {
    console.error('[quotes/invoice] remainder email render failed', { quoteId })
    await recordEvent(quoteId, { ...emailEvent, kind: 'email_failed', errorCode: 'render_failed' })
    return { ok: false, code: 'email_failed' }
  }

  const outcome = await sendQuoteEmail({
    to: quote.client_email,
    subject: rendered.subject,
    html: rendered.html,
    idempotencyKey: `quote-remainder:${quoteId}:${mintKey}`,
  })
  if (outcome !== 'sent') {
    await recordEvent(quoteId, { ...emailEvent, kind: 'email_failed', errorCode: 'send_failed' })
    return { ok: false, code: 'email_failed' }
  }

  await recordEvent(quoteId, { ...emailEvent, kind: 'email_sent' })
  await recordEvent(quoteId, {
    key: `remainder_requested:${quoteId}:${mintKey}`,
    kind: 'remainder_requested',
    versionId: version.id,
    amountMinor,
    currency: version.currency,
    actor: { type: 'admin', id: actor.id },
  })
  return { ok: true, amountMinor }
}
