// The operator's lifecycle actions on a quote (Phase 92, plan 92-13; QUOTE-01, QUOTE-02, QUOTE-06, QUOTE-07; D-02, D-05,
// D-07, D-09, D-11, D-13).
//
//   sendQuote       freezes the draft version (money, cancellation snapshot, terms version), sets the quote to sent,
//                   mints a secret link and emails it in the quote's language. The URL is returned once.
//   mintQuoteLink   a fresh link for the current version ("Copy link"). Only the hash of a token is stored, so an old
//                   link can never be shown again; every call makes a new one and the earlier ones keep working.
//   reviseQuote     copies the current version into a new draft n+1 and makes it current. Every link of version n now
//                   resolves to nothing (the link's version is no longer current: derived, nothing to revoke).
//   voidQuote       the quote is voided; its links stop working at once.
//
// Every state change is a compare-and-set update in TypeScript (no lost race ever sends a second email or leaves two
// current versions): a lost race answers 'busy'. A live deposit PaymentIntent is cancelled before a revise or a void;
// one that is processing or succeeded blocks both ('deposit_in_flight', Pitfall 7).
//
// Server only. The service client is created inside each call. Logs and events carry ids and codes only: never the
// token, its hash, an address or a name.

import { getCancellationPolicy } from '@/lib/cancellation-settings'
import { QUOTE_CONSENT_VERSION } from '@/lib/payments/consent-text'
import { getPaymentsStripe, stripeKeys } from '@/lib/payments/stripe'
import { pickupInstantMs } from '@/lib/prague-date'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { renderQuoteSentEmail } from '@/lib/quotes/emails/sent'
import { sendQuoteEmail } from '@/lib/quotes/emails/shell'
import { appendQuoteEvent, type QuoteEventInput } from '@/lib/quotes/events'
import { depositMinorFor, lineMajorAmounts, validateVersionMoney } from '@/lib/quotes/money'
import { firstPickupMs } from '@/lib/quotes/status'
import { buildQuoteUrl, hashQuoteToken, newQuoteToken } from '@/lib/quotes/token'
import { resolveQuotePolicy } from '@/lib/quotes/terms'
import type { QuoteRow, QuoteVersionRow } from '@/lib/quotes/types'
import type { DepositKind, QuoteCurrency, RemainderMethod } from '@/lib/quotes/vocabulary'

type Row = Record<string, unknown>
type Supabase = ReturnType<typeof createSupabaseServiceClient>

export interface LifecycleActor {
  id: string
}

export type SendQuoteResult =
  | { ok: true; status: 'sent' | 'viewed' | 'accepted' | 'paid'; url: string; emailed: boolean }
  | {
      ok: false
      code: 'not_found' | 'not_sendable' | 'first_pickup_passed' | 'expired' | 'money_invalid' | 'distance_missing' | 'busy'
      reason?: string
    }

export type MintQuoteLinkResult = { ok: true; url: string } | { ok: false; code: 'not_found' | 'not_live' }

export type ReviseQuoteResult =
  | { ok: true; versionId: string }
  | { ok: false; code: 'not_found' | 'not_revisable' | 'deposit_in_flight' | 'busy' }

export type VoidQuoteResult =
  | { ok: true }
  | { ok: false; code: 'not_found' | 'already_paid' | 'deposit_in_flight' | 'busy' }

const num = (v: unknown): number => Number(v)
const numOrNull = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v))

/** Statuses whose link may be handed to the client. */
const LIVE_STATUSES: ReadonlySet<string> = new Set(['sent', 'viewed', 'accepted', 'paid'])
/** Statuses a quote can be revised or voided from (a draft has nothing to revise; paid is cancelled, not voided). */
const REVISABLE_STATUSES = ['sent', 'viewed', 'accepted'] as const
const VOIDABLE_STATUSES = ['draft', 'sent', 'viewed', 'accepted', 'expired'] as const

const fail = (what: string, quoteId: string, code: string | null | undefined): never => {
  console.error('[quotes/lifecycle] database error', { quoteId, what, code: code ?? null })
  throw new Error(`quote lifecycle failed: ${what}`)
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

async function readVersion(supabase: Supabase, quoteId: string, versionId: string): Promise<QuoteVersionRow | null> {
  const { data, error } = await supabase.from('quote_versions').select('*').eq('id', versionId).eq('quote_id', quoteId).maybeSingle()
  if (error) fail('read version', quoteId, error.code)
  return data ? (data as QuoteVersionRow) : null
}

async function readLines(supabase: Supabase, quoteId: string, versionId: string): Promise<Row[]> {
  const { data, error } = await supabase.from('quote_version_lines').select('*').eq('version_id', versionId).order('position', { ascending: true })
  if (error) fail('read lines', quoteId, error.code)
  return (data ?? []) as Row[]
}

// == links ===========================================================================================================

/** Mints one link of a version: the raw token exists only in the returned URL; only its hash is inserted. */
async function insertLink(
  supabase: Supabase,
  quote: Pick<QuoteRow, 'id'>,
  version: Pick<QuoteVersionRow, 'id' | 'locale'>,
  actor: LifecycleActor,
): Promise<{ linkId: string; url: string }> {
  const token = newQuoteToken()
  const { data, error } = await supabase
    .from('quote_links')
    .insert({ quote_id: quote.id, version_id: version.id, token_hash: hashQuoteToken(token), created_by: actor.id })
    .select('id')
    .single()
  if (error || !data) fail('insert link', quote.id, error?.code)
  const linkId = String((data as Row).id)
  await recordEvent(quote.id, {
    key: `link:${linkId}`,
    kind: 'link_minted',
    versionId: version.id,
    actor: { type: 'admin', id: actor.id },
  })
  return { linkId, url: buildQuoteUrl(token, version.locale) }
}

/**
 * A fresh secret link for the current version of a sent, viewed, accepted or paid quote. A draft (nothing to open), a
 * voided or a cancelled quote has no live link to give. Whether the link still opens an offer is decided by the page
 * (expiry, first pickup), not here.
 */
export async function mintQuoteLink(quoteId: string, actor: LifecycleActor): Promise<MintQuoteLinkResult> {
  const supabase = createSupabaseServiceClient()
  const quote = await readQuote(supabase, quoteId)
  if (!quote || !quote.current_version_id) return { ok: false, code: 'not_found' }
  if (quote.cancelled_at || !LIVE_STATUSES.has(quote.status)) return { ok: false, code: 'not_live' }

  const version = await readVersion(supabase, quoteId, quote.current_version_id)
  if (!version) return { ok: false, code: 'not_found' }
  if (!version.frozen_at) return { ok: false, code: 'not_live' }

  const { url } = await insertLink(supabase, quote, version, actor)
  return { ok: true, url }
}

// == send ============================================================================================================

/** The email of a freshly minted link. Never throws; false when it could not be rendered or sent. */
async function emailQuoteLink(quote: QuoteRow, version: QuoteVersionRow, linkId: string, url: string): Promise<boolean> {
  const eventBase = { key: `email:sent:${linkId}`, versionId: version.id, actor: { type: 'system' as const } }
  let rendered: { subject: string; html: string }
  try {
    // 92-20 attaches the PDF here and passes pdfAttached true; until then the email carries the link sentence.
    rendered = await renderQuoteSentEmail({ quote, version, url, pdfAttached: false })
  } catch {
    console.error('[quotes/lifecycle] email render failed', { quoteId: quote.id, linkId })
    await recordEvent(quote.id, { ...eventBase, kind: 'email_failed', errorCode: 'render_failed' })
    return false
  }
  const outcome = await sendQuoteEmail({
    to: quote.client_email,
    subject: rendered.subject,
    html: rendered.html,
    idempotencyKey: `quote-sent:${linkId}`,
  })
  await recordEvent(
    quote.id,
    outcome === 'sent' ? { ...eventBase, kind: 'email_sent' } : { ...eventBase, kind: 'email_failed', errorCode: 'send_failed' },
  )
  return outcome === 'sent'
}

type Verdict = { ok: true } | { ok: false; code: 'money_invalid'; reason: string }

/**
 * Sends a quote. A draft is frozen (shares, remainders, euro and crown amounts per line, the resolved cancellation
 * snapshot, the terms version), set to sent, given a link and emailed. With `resend` a sent, viewed, accepted or paid
 * quote gets one more link and one more email (the earlier links keep working). Refused before anything is written
 * when the first pickup is not in the future (D-05), the operator's last day has passed (D-02), a transfer has no
 * server distance, or the money is invalid (D-07 floors).
 */
export async function sendQuote(quoteId: string, actor: LifecycleActor, opts: { resend: boolean }): Promise<SendQuoteResult> {
  const supabase = createSupabaseServiceClient()
  const quote = await readQuote(supabase, quoteId)
  if (!quote || !quote.current_version_id) return { ok: false, code: 'not_found' }

  const isDraft = quote.status === 'draft'
  if (quote.cancelled_at || quote.status === 'voided' || quote.status === 'expired') return { ok: false, code: 'not_sendable' }
  if (!isDraft && (!opts.resend || !LIVE_STATUSES.has(quote.status))) return { ok: false, code: 'not_sendable' }

  const version = await readVersion(supabase, quoteId, quote.current_version_id)
  if (!version) return { ok: false, code: 'not_found' }
  const lines = await readLines(supabase, quoteId, version.id)
  const nowMs = Date.now()

  if (!isDraft && !version.frozen_at) return { ok: false, code: 'not_sendable' }

  // D-02, D-05: a paid quote stays readable whatever the date; everything else must still be an open offer.
  if (quote.status !== 'paid') {
    if (lines.length === 0) return { ok: false, code: 'money_invalid', reason: 'no_lines' }
    if (quote.expires_at && Date.parse(quote.expires_at) <= nowMs) return { ok: false, code: 'expired' }
    const first = firstPickupMs(lines as unknown as Array<{ pickup_date: string; pickup_time: string }>)
    if (first === null || first <= nowMs) return { ok: false, code: 'first_pickup_passed' }
  }

  let status: 'sent' | 'viewed' | 'accepted' | 'paid' = 'sent'
  if (isDraft) {
    const verdict = await freezeVersion(supabase, quote, version, lines, nowMs)
    if (!verdict.ok) {
      return verdict.code === 'money_invalid' ? verdict : { ok: false, code: verdict.code }
    }
    // The freeze may have been done by a concurrent send; only one caller wins the status change below.
    const { data, error } = await supabase
      .from('quotes')
      .update({ status: 'sent', updated_at: new Date().toISOString() })
      .eq('id', quoteId)
      .eq('status', 'draft')
      .eq('current_version_id', version.id)
      .select('id')
    if (error) fail('set sent', quoteId, error.code)
    if (!Array.isArray(data) || data.length === 0) return { ok: false, code: 'busy' }
    await recordEvent(quoteId, { key: `sent:${version.id}`, kind: 'sent', versionId: version.id, actor: { type: 'admin', id: actor.id } })
  } else {
    status = quote.status as 'sent' | 'viewed' | 'accepted' | 'paid'
  }

  const frozen = (await readVersion(supabase, quoteId, version.id)) ?? version
  const { linkId, url } = await insertLink(supabase, quote, frozen, actor)
  const emailed = await emailQuoteLink(quote, frozen, linkId, url)
  return { ok: true, status, url, emailed }
}

/** Why a deposit that depositMinorFor refused is invalid. */
function depositRefusal(kind: DepositKind, value: number, total: number): string {
  return kind === 'fixed' && value > total ? 'deposit_above_total' : 'deposit_zero'
}

type FreezeResult = Verdict | { ok: false; code: 'distance_missing' }

/**
 * Validates the money and the terms of a draft version and writes them. The money of the lines is written first (a draft
 * may still change), then the version is frozen by a compare-and-set on frozen_at: another caller that froze it first
 * leaves nothing for this one to do. A version that is already frozen (an earlier send stopped before the status change)
 * is only validated.
 */
async function freezeVersion(
  supabase: Supabase,
  quote: QuoteRow,
  version: QuoteVersionRow,
  lines: Row[],
  nowMs: number,
): Promise<FreezeResult> {
  if (lines.some((l) => l.trip_type === 'transfer' && !(numOrNull(l.distance_km) !== null && Number.isFinite(num(l.distance_km))))) {
    return { ok: false, code: 'distance_missing' }
  }

  const kind = (version.deposit_kind ?? null) as DepositKind | null
  const value = numOrNull(version.deposit_value)
  const method = (version.remainder_method ?? null) as RemainderMethod | null
  if (kind === null || value === null) return { ok: false, code: 'money_invalid', reason: 'deposit_missing' }
  if (method === null) return { ok: false, code: 'money_invalid', reason: 'remainder_method_missing' }

  const currency = version.currency as QuoteCurrency
  const amounts = lines.map((l) => num(l.amount_minor))
  const total = amounts.reduce((a, b) => a + b, 0)
  const depositMinor = depositMinorFor(kind, value, total)
  if (depositMinor === null) return { ok: false, code: 'money_invalid', reason: depositRefusal(kind, value, total) }
  const money = validateVersionMoney({ currency, remainderMethod: method, lineAmounts: amounts, depositMinor })
  if (!money.ok) return { ok: false, code: 'money_invalid', reason: money.reason }

  if (version.frozen_at) return { ok: true }

  // The free window runs from the first trip (D-06).
  let first = lines[0]
  let firstMs = Number.POSITIVE_INFINITY
  for (const l of lines) {
    const ms = pickupInstantMs({ pickup_utc: null, pickup_date: String(l.pickup_date), pickup_time: String(l.pickup_time) })
    if (ms !== null && ms < firstMs) {
      firstMs = ms
      first = l
    }
  }
  let policy: ReturnType<typeof resolveQuotePolicy>
  try {
    policy = resolveQuotePolicy({
      customFreeHours: numOrNull(version.cancel_free_hours),
      customFeePercent: numOrNull(version.cancel_fee_percent),
      globalPolicy: await getCancellationPolicy(),
      firstLine: { trip_type: String(first.trip_type), distance_km: numOrNull(first.distance_km) },
    })
  } catch (e) {
    if (!(e instanceof RangeError)) throw e
    return { ok: false, code: 'money_invalid', reason: 'terms_invalid' }
  }

  let frozenByAnother = false
  const results = await Promise.all(
    lines.map((l, i) => {
      const { amountEur, amountCzk } = lineMajorAmounts(amounts[i], currency)
      return supabase
        .from('quote_version_lines')
        .update({ deposit_share_minor: money.shares[i], remainder_minor: money.remainders[i], amount_eur: amountEur, amount_czk: amountCzk })
        .eq('id', l.id as string)
    }),
  )
  for (const { error } of results) {
    if (!error) continue
    if (error.message?.includes('quote_version_frozen')) frozenByAnother = true
    else fail('write line money', quote.id, error.code)
  }
  if (frozenByAnother) return { ok: true }

  const { error } = await supabase
    .from('quote_versions')
    .update({
      total_minor: total,
      deposit_minor: depositMinor,
      cancel_policy: policy.snapshot,
      cancel_policy_version: policy.version,
      terms_version: QUOTE_CONSENT_VERSION,
      frozen_at: new Date(nowMs).toISOString(),
    })
    .eq('id', version.id)
    .is('frozen_at', null)
    .select('id')
  if (error && !error.message?.includes('quote_version_frozen')) fail('freeze version', quote.id, error.code)
  return { ok: true }
}

// == the deposit PaymentIntent =======================================================================================

/**
 * Cancels the live deposit PaymentIntent of a quote so no payment can land on a version that is going away.
 *   'none'      no intent, or it is already cancelled
 *   'canceled'  it was waiting for the client's card and is now cancelled (a deposit_canceled event is written)
 *   'in_flight' it is processing or already succeeded: the caller must stop (409 deposit_in_flight)
 */
export async function cancelLiveDepositIntent(quote: QuoteRow, actor?: LifecycleActor): Promise<'none' | 'canceled' | 'in_flight'> {
  const piId = quote.deposit_payment_intent_id
  if (!piId) return 'none'

  const stripe = getPaymentsStripe()
  const pi = await stripe.paymentIntents.retrieve(piId)
  if (pi.status === 'canceled') return 'none'
  if (pi.status === 'processing' || pi.status === 'succeeded') return 'in_flight'

  try {
    await stripe.paymentIntents.cancel(piId, { cancellation_reason: 'abandoned' }, { idempotencyKey: stripeKeys.quoteDepositVoid(piId) })
  } catch (error) {
    // The client may have paid between the read and the cancel: look again before giving up.
    const again = await stripe.paymentIntents.retrieve(piId)
    if (again.status === 'processing' || again.status === 'succeeded') return 'in_flight'
    if (again.status !== 'canceled') throw error
  }
  await recordEvent(quote.id, {
    key: `deposit_canceled:${piId}`,
    kind: 'deposit_canceled',
    stripeObjectId: piId,
    actor: actor ? { type: 'admin', id: actor.id } : { type: 'system' },
  })
  return 'canceled'
}

// == revise ==========================================================================================================

/** Removes a version that was created by a revise that did not complete (stops, lines, then the version). */
async function discardVersion(supabase: Supabase, versionId: string): Promise<void> {
  try {
    const { data } = await supabase.from('quote_version_lines').select('id').eq('version_id', versionId)
    const lineIds = ((data ?? []) as Row[]).map((l) => String(l.id))
    if (lineIds.length > 0) await supabase.from('quote_version_line_stops').delete().in('line_id', lineIds)
    await supabase.from('quote_version_lines').delete().eq('version_id', versionId)
    await supabase.from('quote_versions').delete().eq('id', versionId)
  } catch {
    // Best effort: the caller already answers busy or throws the original failure; a leftover unfrozen version is reused by the next revise.
  }
}

/** Copies the lines and stops of one version into another. */
async function copyLines(supabase: Supabase, quoteId: string, fromVersionId: string, toVersionId: string): Promise<void> {
  const lines = await readLines(supabase, quoteId, fromVersionId)
  if (lines.length === 0) return

  const { data: stopData, error: stopError } = await supabase
    .from('quote_version_line_stops')
    .select('*')
    .in('line_id', lines.map((l) => String(l.id)))
    .order('position', { ascending: true })
  if (stopError) fail('read stops', quoteId, stopError.code)
  const stops = (stopData ?? []) as Row[]

  const lineRows = lines.map((l) => {
    const { id: _id, ...rest } = l
    void _id
    return { ...rest, version_id: toVersionId }
  })
  const { data: inserted, error: lineError } = await supabase.from('quote_version_lines').insert(lineRows).select('id, position')
  if (lineError) fail('copy lines', quoteId, lineError.code)
  const newIdByPosition = new Map<number, string>(((inserted ?? []) as Row[]).map((r) => [num(r.position), String(r.id)]))

  const oldPositionById = new Map<string, number>(lines.map((l) => [String(l.id), num(l.position)]))
  const stopRows = stops.map((s) => {
    const { id: _id, created_at: _createdAt, ...rest } = s
    void _id
    void _createdAt
    return { ...rest, line_id: newIdByPosition.get(oldPositionById.get(String(s.line_id)) as number) }
  })
  if (stopRows.length > 0) {
    const { error } = await supabase.from('quote_version_line_stops').insert(stopRows)
    if (error) fail('copy stops', quoteId, error.code)
  }
}

/**
 * Revises a sent, viewed or accepted quote: version n is copied into a new unfrozen version n+1 (same lines, stops and
 * money fields), which becomes current while the quote goes back to draft. The links of version n stop working by
 * derivation. A live deposit intent is cancelled first; one that is processing or succeeded refuses the revise. An
 * unfrozen n+1 left behind by a crash is reused.
 */
export async function reviseQuote(quoteId: string, actor: LifecycleActor): Promise<ReviseQuoteResult> {
  const supabase = createSupabaseServiceClient()
  const quote = await readQuote(supabase, quoteId)
  if (!quote || !quote.current_version_id) return { ok: false, code: 'not_found' }
  if (quote.cancelled_at || !(REVISABLE_STATUSES as readonly string[]).includes(quote.status)) return { ok: false, code: 'not_revisable' }

  const current = await readVersion(supabase, quoteId, quote.current_version_id)
  if (!current) return { ok: false, code: 'not_found' }
  const nextNo = num(current.version_no) + 1

  // Pitfall 7: nothing is edited while the client is paying.
  const deposit = await cancelLiveDepositIntent(quote, actor)
  if (deposit === 'in_flight') return { ok: false, code: 'deposit_in_flight' }

  let newVersionId: string
  // Only a version created by THIS call may be discarded: a reused leftover can be the winner of a concurrent revise.
  let createdHere = false
  const { data: leftover, error: leftoverError } = await supabase
    .from('quote_versions')
    .select('id, frozen_at')
    .eq('quote_id', quoteId)
    .eq('version_no', nextNo)
    .maybeSingle()
  if (leftoverError) fail('read next version', quoteId, leftoverError.code)

  if (leftover) {
    const left = leftover as Row
    if (left.frozen_at || String(left.id) === quote.current_version_id) return { ok: false, code: 'busy' }
    newVersionId = String(left.id)
    if ((await readLines(supabase, quoteId, newVersionId)).length === 0) {
      try {
        await copyLines(supabase, quoteId, current.id, newVersionId)
      } catch (e) {
        // A half-copied leftover must never be reused as a complete version.
        await discardVersion(supabase, newVersionId)
        throw e
      }
    }
  } else {
    const { data: created, error } = await supabase
      .from('quote_versions')
      .insert({
        quote_id: quoteId,
        version_no: nextNo,
        locale: current.locale,
        currency: current.currency,
        total_minor: current.total_minor,
        deposit_kind: current.deposit_kind,
        deposit_value: current.deposit_value,
        deposit_minor: current.deposit_minor,
        remainder_method: current.remainder_method,
        cancel_free_hours: current.cancel_free_hours,
        cancel_fee_percent: current.cancel_fee_percent,
        billing_name: current.billing_name,
        billing_address: current.billing_address,
        billing_company_id: current.billing_company_id,
        billing_vat_id: current.billing_vat_id,
        billing_note: current.billing_note,
        created_by: actor.id,
      })
      .select('id')
      .single()
    // The unique (quote_id, version_no) answers a double revise.
    if (error?.code === '23505') return { ok: false, code: 'busy' }
    if (error || !created) fail('insert version', quoteId, error?.code)
    newVersionId = String((created as Row).id)
    createdHere = true
    try {
      await copyLines(supabase, quoteId, current.id, newVersionId)
    } catch (e) {
      await discardVersion(supabase, newVersionId)
      throw e
    }
  }

  const { data: moved, error: moveError } = await supabase
    .from('quotes')
    .update({ status: 'draft', current_version_id: newVersionId, updated_at: new Date().toISOString() })
    .eq('id', quoteId)
    .eq('current_version_id', current.id)
    .in('status', [...REVISABLE_STATUSES])
    .select('id')
  if (moveError) {
    if (createdHere) await discardVersion(supabase, newVersionId)
    fail('make version current', quoteId, moveError.code)
  }
  if (!Array.isArray(moved) || moved.length === 0) {
    if (createdHere) await discardVersion(supabase, newVersionId)
    return { ok: false, code: 'busy' }
  }

  await recordEvent(quoteId, { key: `revised:${newVersionId}`, kind: 'revised', versionId: newVersionId, actor: { type: 'admin', id: actor.id } })
  return { ok: true, versionId: newVersionId }
}

// == void ============================================================================================================

/**
 * Voids a quote at once: every link stops working. A paid quote is cancelled, not voided. A live deposit intent is
 * cancelled first; one that is processing or succeeded refuses the void. Voiding a voided quote is a success.
 */
export async function voidQuote(quoteId: string, actor: LifecycleActor): Promise<VoidQuoteResult> {
  const supabase = createSupabaseServiceClient()
  const quote = await readQuote(supabase, quoteId)
  if (!quote) return { ok: false, code: 'not_found' }
  if (quote.status === 'voided') return { ok: true }
  if (quote.status === 'paid') return { ok: false, code: 'already_paid' }

  const deposit = await cancelLiveDepositIntent(quote, actor)
  if (deposit === 'in_flight') return { ok: false, code: 'deposit_in_flight' }

  const nowIso = new Date().toISOString()
  const { data, error } = await supabase
    .from('quotes')
    .update({ status: 'voided', voided_at: nowIso, voided_by: actor.id, updated_at: nowIso })
    .eq('id', quoteId)
    .in('status', [...VOIDABLE_STATUSES])
    .select('id')
  if (error) fail('void', quoteId, error.code)
  if (!Array.isArray(data) || data.length === 0) {
    // Lost a race: another void is fine, a payment that landed meanwhile is not.
    const latest = await readQuote(supabase, quoteId)
    if (latest?.status === 'voided') return { ok: true }
    if (latest?.status === 'paid') return { ok: false, code: 'already_paid' }
    return { ok: false, code: 'busy' }
  }

  await recordEvent(quoteId, { key: `voided:${quoteId}`, kind: 'voided', actor: { type: 'admin', id: actor.id } })
  return { ok: true }
}
