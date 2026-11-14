// The operator's data path for a quote (Phase 92, plan 92-08; QUOTE-01, QUOTE-06; D-04, D-07, D-09).
//
// Create a draft, save its lines, read one quote with its versions, events and bookings, list quotes with their
// effective status. Server only: the quote tables are deny-all (migration 091), so every read and write goes through
// the service client, which is created inside each function and never at module load.
//
// The server is the price authority. For every saved line whose price inputs changed, the distance and the suggested
// amount are computed here (lib/quotes/pricing.ts, D-04); the operator's amount is stored as the line price and
// price_overridden says it differs from the suggestion. A distance never comes from a request body.
//
// Errors and logs carry quote ids and database error codes only, never a name, an email, an address or a database
// message (it can echo a column value).

import { shiftIsoDate } from '@/lib/prague-date'
import { pragueDayStartMs } from '@/lib/prague-calendar'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { getPricingConfig, type PricingRates } from '@/lib/pricing-config'
import { normalizeSiteLocale, type AppLocale } from '@/i18n/locales'
import { appendQuoteEvent } from '@/lib/quotes/events'
import { allocateDeposit, depositMinorFor, lineMajorAmounts } from '@/lib/quotes/money'
import { priceLineStops, suggestLinePrice } from '@/lib/quotes/pricing'
import type { QuoteCreatePayload, QuoteDraftPayload, QuoteLinePayload } from '@/lib/quotes/schemas'
import { effectiveQuoteStatus } from '@/lib/quotes/status'
import { generateQuoteReference } from '@/lib/quotes/token'
import type { QuoteLineRow, QuoteRow, QuoteStopRow, QuoteVersionRow } from '@/lib/quotes/types'
import { QUOTE_STATUSES, type DepositKind, type QuoteCurrency, type QuoteStatus } from '@/lib/quotes/vocabulary'

export type QuoteEffectiveStatus = QuoteStatus | 'cancelled'

export interface QuoteActor {
  type: 'admin' | 'system'
  id: string | null
}

type Row = Record<string, unknown>

const UNIQUE_VIOLATION = '23505'
/** Most quotes one list request reads before the effective-status filter and the page cut (an operator's quotes, not a data lake). */
const LIST_FETCH_CEILING = 5000
const SEARCH_MAX = 100
const EVENTS_LIMIT = 50
const ID_CHUNK = 200

const num = (v: unknown): number => Number(v)
const numOrNull = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v))

/** Escapes % _ and \ so a search value is matched literally by LIKE / ILIKE. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&')
}

/** The Prague calendar day an operator picked as the last day of the link -> the last second of that day. */
export function endOfPragueDayIso(date: string): string {
  return new Date(pragueDayStartMs(shiftIsoDate(date, 1)) - 1000).toISOString()
}

// == list ==========================================================================================================

export interface QuoteListRow {
  id: string
  reference: string
  client_name: string
  client_email: string
  effective_status: QuoteEffectiveStatus
  first_pickup_date: string | null
  total_minor: number
  currency: QuoteCurrency
  updated_at: string
  version_no: number
}

const LIST_STATUS_FILTERS: ReadonlySet<string> = new Set<string>([...QUOTE_STATUSES, 'cancelled'])

/**
 * Quotes newest first with their effective status (D-02: expired is derived from the operator expiry, cancelled is
 * shown). The status filter is applied on the effective status, so "expired" finds a sent quote whose date passed.
 * The search is a reference prefix (when it starts with "Q-") or a contains match on the one column client_email; its
 * wildcards are escaped and it is never built into an or() string (T-92-27).
 */
export async function listQuotes(params: {
  page: number
  limit: number
  status: string | null
  search: string | null
}): Promise<{ quotes: QuoteListRow[]; total: number; page: number; limit: number }> {
  const page = Math.max(1, Math.floor(params.page) || 1)
  const limit = Math.min(100, Math.max(1, Math.floor(params.limit) || 1))
  const status = params.status && LIST_STATUS_FILTERS.has(params.status) ? params.status : null
  const search = params.search ? params.search.trim().slice(0, SEARCH_MAX) : ''

  const supabase = createSupabaseServiceClient()
  let query = supabase
    .from('quotes')
    .select(
      'id, reference, status, current_version_id, client_first_name, client_last_name, client_email, expires_at, cancelled_at, updated_at',
    )
    .order('updated_at', { ascending: false })
    .limit(LIST_FETCH_CEILING)
  if (search) {
    query = /^q-/i.test(search)
      ? query.ilike('reference', `${escapeLike(search)}%`)
      : query.ilike('client_email', `%${escapeLike(search)}%`)
  }

  const { data, error } = await query
  if (error) {
    console.error('[quotes/store] list failed', { code: error.code ?? null })
    throw new Error('quote list failed')
  }

  const nowMs = Date.now()
  const withStatus = ((data ?? []) as Row[]).map((row) => ({
    row,
    effective: effectiveQuoteStatus(
      {
        status: row.status as QuoteStatus,
        expires_at: (row.expires_at as string | null) ?? null,
        cancelled_at: (row.cancelled_at as string | null) ?? null,
      },
      nowMs,
    ),
  }))
  const filtered = status ? withStatus.filter((r) => r.effective === status) : withStatus
  const total = filtered.length
  const pageRows = filtered.slice((page - 1) * limit, page * limit)

  const versionIds = pageRows.map((r) => r.row.current_version_id).filter((v): v is string => typeof v === 'string')
  const versions = new Map<string, Row>()
  const firstPickup = new Map<string, string>()
  for (let i = 0; i < versionIds.length; i += ID_CHUNK) {
    const chunk = versionIds.slice(i, i + ID_CHUNK)
    const { data: vData, error: vError } = await supabase
      .from('quote_versions')
      .select('id, version_no, currency, total_minor')
      .in('id', chunk)
    if (vError) {
      console.error('[quotes/store] list versions failed', { code: vError.code ?? null })
      throw new Error('quote list failed')
    }
    for (const v of (vData ?? []) as Row[]) versions.set(String(v.id), v)

    const { data: lData, error: lError } = await supabase
      .from('quote_version_lines')
      .select('version_id, pickup_date')
      .in('version_id', chunk)
    if (lError) {
      console.error('[quotes/store] list lines failed', { code: lError.code ?? null })
      throw new Error('quote list failed')
    }
    for (const l of (lData ?? []) as Row[]) {
      const key = String(l.version_id)
      const date = String(l.pickup_date)
      const current = firstPickup.get(key)
      if (current === undefined || date < current) firstPickup.set(key, date)
    }
  }

  const quotes: QuoteListRow[] = pageRows.map(({ row, effective }) => {
    const version = typeof row.current_version_id === 'string' ? versions.get(row.current_version_id) : undefined
    return {
      id: String(row.id),
      reference: String(row.reference),
      client_name: `${String(row.client_first_name)} ${String(row.client_last_name)}`.trim(),
      client_email: String(row.client_email),
      effective_status: effective,
      first_pickup_date: typeof row.current_version_id === 'string' ? (firstPickup.get(row.current_version_id) ?? null) : null,
      total_minor: version ? num(version.total_minor) : 0,
      currency: (version?.currency as QuoteCurrency | undefined) ?? 'eur',
      updated_at: String(row.updated_at),
      version_no: version ? num(version.version_no) : 1,
    }
  })

  return { quotes, total, page, limit }
}

// == detail ========================================================================================================

export interface QuoteDetailLine extends QuoteLineRow {
  stops: QuoteStopRow[]
}

export interface QuoteDetailBooking {
  id: string
  booking_reference: string | null
  status: string
  payment_mode: string | null
  payment_state: string | null
  pickup_date: string | null
  pickup_time: string | null
  quote_line_id: string | null
}

export interface QuoteDetail {
  quote: QuoteRow
  version: QuoteVersionRow
  lines: QuoteDetailLine[]
  versions: Array<{ id: string; version_no: number; frozen_at: string | null }>
  events: Row[]
  bookings: QuoteDetailBooking[]
  effective_status: QuoteEffectiveStatus
  links_count: number
}

const LINE_NUMERIC_COLUMNS = [
  'position',
  'passengers',
  'luggage',
  'hours',
  'pickup_offset_min',
  'origin_lat',
  'origin_lng',
  'destination_lat',
  'destination_lng',
  'distance_km',
  'suggested_amount_minor',
  'amount_minor',
  'deposit_share_minor',
  'remainder_minor',
  'amount_eur',
  'amount_czk',
] as const

const STOP_NUMERIC_COLUMNS = ['position', 'lat', 'lng', 'wait_minutes', 'free_minutes', 'blocks', 'fee_per_block_eur', 'fee_eur'] as const

/** PostgREST returns numeric columns as strings: cast them once at the edge. */
function castNumbers(row: Row, columns: readonly string[]): Row {
  const out: Row = { ...row }
  for (const column of columns) out[column] = numOrNull(row[column])
  return out
}

const QUOTE_VERSION_NUMERIC = ['version_no', 'total_minor', 'deposit_value', 'deposit_minor', 'cancel_free_hours', 'cancel_fee_percent'] as const
const QUOTE_NUMERIC = ['remainder_amount_minor', 'remainder_attempt', 'deposit_refunded_minor', 'remainder_refunded_minor'] as const

/** One quote with its current version, the lines and stops, every version, the latest events and the bookings made from it. */
export async function getQuoteDetail(id: string): Promise<QuoteDetail | null> {
  const supabase = createSupabaseServiceClient()
  const fail = (what: string, code: string | null | undefined): never => {
    console.error('[quotes/store] detail read failed', { quoteId: id, what, code: code ?? null })
    throw new Error('quote detail failed')
  }

  const { data: quoteData, error: quoteError } = await supabase.from('quotes').select('*').eq('id', id).maybeSingle()
  if (quoteError) fail('quote', quoteError.code)
  if (!quoteData) return null
  const quote = castNumbers(quoteData as Row, QUOTE_NUMERIC) as unknown as QuoteRow
  if (!quote.current_version_id) return null

  const { data: versionData, error: versionError } = await supabase
    .from('quote_versions')
    .select('*')
    .eq('id', quote.current_version_id)
    .maybeSingle()
  if (versionError) fail('version', versionError.code)
  if (!versionData) return null
  const version = castNumbers(versionData as Row, QUOTE_VERSION_NUMERIC) as unknown as QuoteVersionRow

  const { data: lineData, error: lineError } = await supabase
    .from('quote_version_lines')
    .select('*')
    .eq('version_id', version.id)
    .order('position', { ascending: true })
  if (lineError) fail('lines', lineError.code)
  const lineRows = (lineData ?? []) as Row[]

  const stopsByLine = new Map<string, QuoteStopRow[]>()
  if (lineRows.length > 0) {
    const { data: stopData, error: stopError } = await supabase
      .from('quote_version_line_stops')
      .select('*')
      .in('line_id', lineRows.map((l) => String(l.id)))
      .order('position', { ascending: true })
    if (stopError) fail('stops', stopError.code)
    for (const raw of (stopData ?? []) as Row[]) {
      const stop = castNumbers(raw, STOP_NUMERIC_COLUMNS) as unknown as QuoteStopRow
      const list = stopsByLine.get(stop.line_id)
      if (list) list.push(stop)
      else stopsByLine.set(stop.line_id, [stop])
    }
  }
  const lines: QuoteDetailLine[] = lineRows.map((raw) => {
    const line = castNumbers(raw, LINE_NUMERIC_COLUMNS) as unknown as QuoteLineRow
    return { ...line, stops: stopsByLine.get(line.id) ?? [] }
  })

  const { data: versionList, error: versionsError } = await supabase
    .from('quote_versions')
    .select('id, version_no, frozen_at')
    .eq('quote_id', id)
    .order('version_no', { ascending: true })
  if (versionsError) fail('versions', versionsError.code)

  const { data: eventData, error: eventError } = await supabase
    .from('quote_events')
    .select('*')
    .eq('quote_id', id)
    .order('created_at', { ascending: false })
    .limit(EVENTS_LIMIT)
  if (eventError) fail('events', eventError.code)

  const { data: bookingData, error: bookingError } = await supabase
    .from('bookings')
    .select('id, booking_reference, status, payment_mode, payment_state, pickup_date, pickup_time, quote_line_id')
    .eq('quote_id', id)
  if (bookingError) fail('bookings', bookingError.code)

  const { data: linkData, error: linkError } = await supabase
    .from('quote_links')
    .select('id')
    .eq('quote_id', id)
    .is('revoked_at', null)
  if (linkError) fail('links', linkError.code)

  return {
    quote,
    version,
    lines,
    versions: ((versionList ?? []) as Row[]).map((v) => ({
      id: String(v.id),
      version_no: num(v.version_no),
      frozen_at: (v.frozen_at as string | null) ?? null,
    })),
    events: (eventData ?? []) as Row[],
    bookings: (bookingData ?? []) as unknown as QuoteDetailBooking[],
    effective_status: effectiveQuoteStatus(quote, Date.now()),
    links_count: ((linkData ?? []) as Row[]).length,
  }
}

// == create ========================================================================================================

/** D-09: the language of the client's latest booking with this email, else en. A language the site lacks is en. */
async function latestBookingLocale(email: string): Promise<AppLocale> {
  try {
    const { data, error } = await createSupabaseServiceClient()
      .from('bookings')
      .select('locale')
      .ilike('client_email', escapeLike(email))
      .order('created_at', { ascending: false })
      .limit(1)
    if (error) return 'en'
    const first = ((data ?? []) as Row[])[0]
    return normalizeSiteLocale(first?.locale)
  } catch {
    return 'en'
  }
}

/** Creates the quote header and its unfrozen version 1. Returns the new quote id. */
export async function createQuoteDraft(input: QuoteCreatePayload, actor: QuoteActor): Promise<{ id: string }> {
  const supabase = createSupabaseServiceClient()
  const email = input.client.email.trim()
  const locale = await latestBookingLocale(email)

  let quoteId: string | null = null
  for (let attempt = 0; attempt < 2 && quoteId === null; attempt += 1) {
    const { data, error } = await supabase
      .from('quotes')
      .insert({
        reference: generateQuoteReference(),
        status: 'draft',
        client_first_name: input.client.first_name.trim(),
        client_last_name: input.client.last_name.trim(),
        client_email: email,
        client_phone: input.client.phone?.trim() ? input.client.phone.trim() : null,
        lead_channel: input.lead_channel,
        created_by: actor.id,
      })
      .select('id')
      .single()
    if (!error && data) {
      quoteId = String((data as Row).id)
    } else if (error?.code === UNIQUE_VIOLATION) {
      continue // a reference collision: one more random reference
    } else {
      console.error('[quotes/store] create failed', { code: error?.code ?? null })
      throw new Error('quote create failed')
    }
  }
  if (quoteId === null) {
    console.error('[quotes/store] create failed', { code: UNIQUE_VIOLATION })
    throw new Error('quote create failed')
  }

  const { data: version, error: versionError } = await supabase
    .from('quote_versions')
    .insert({ quote_id: quoteId, version_no: 1, locale, currency: input.currency, created_by: actor.id })
    .select('id')
    .single()
  if (versionError || !version) {
    console.error('[quotes/store] create version failed', { quoteId, code: versionError?.code ?? null })
    await supabase.from('quotes').delete().eq('id', quoteId)
    throw new Error('quote create failed')
  }
  const versionId = String((version as Row).id)

  const { error: pointerError } = await supabase.from('quotes').update({ current_version_id: versionId }).eq('id', quoteId)
  if (pointerError) {
    console.error('[quotes/store] create pointer failed', { quoteId, code: pointerError.code ?? null })
    await supabase.from('quotes').delete().eq('id', quoteId)
    throw new Error('quote create failed')
  }

  try {
    await appendQuoteEvent(quoteId, {
      key: 'created',
      kind: 'created',
      versionId,
      actor: { type: actor.type, id: actor.id },
    })
  } catch {
    // The ledger line is an audit trail, not part of the quote: a failed write is logged by appendQuoteEvent.
  }
  return { id: quoteId }
}

// == save a draft ==================================================================================================

export type SaveQuoteDraftResult =
  | { ok: true }
  | {
      ok: false
      code: 'not_found' | 'version_frozen' | 'pricing_unavailable' | 'invalid_lines' | 'action_not_allowed'
      reason?: string
    }

type DepositRefusal = 'deposit_zero' | 'deposit_above_total'

/** Why a deposit is not valid for this total (D-07: never 0, never above the total), or null when it is. */
function depositRefusal(kind: DepositKind, value: number, totalMinor: number): DepositRefusal | null {
  if (!Number.isFinite(value) || value <= 0) return 'deposit_zero'
  if (totalMinor <= 0) return null
  if (kind === 'percent') {
    if (value > 100) return 'deposit_above_total'
    return Math.round((totalMinor * value) / 100) <= 0 ? 'deposit_zero' : null
  }
  return value > totalMinor ? 'deposit_above_total' : null
}

/** What decides a line's price, written so a stored line and a payload line produce the same string when nothing changed. */
function priceKey(input: {
  currency: string
  trip_type: string
  pickup_date: string
  pickup_time: string
  origin: [number | null, number | null]
  destination: [number | null, number | null] | null
  stops: Array<[number | null, number | null, number]>
  vehicle_class: string
  hours: number | null
  return_date: string | null
  landing: [string, string, number] | null
  extras: [boolean, boolean, boolean]
}): string {
  return JSON.stringify(input)
}

function payloadPriceKey(line: QuoteLinePayload, currency: string): string {
  return priceKey({
    currency,
    trip_type: line.trip_type,
    pickup_date: line.pickup_date,
    pickup_time: line.pickup_time,
    origin: [line.origin.lat, line.origin.lng],
    destination: line.destination ? [line.destination.lat, line.destination.lng] : null,
    stops: line.stops.map((s) => [s.lat, s.lng, s.wait_minutes]),
    vehicle_class: line.vehicle_class,
    hours: line.hours ?? null,
    return_date: line.return_date ?? null,
    landing: line.landing ? [line.landing.date, line.landing.time, line.landing.offset_min] : null,
    extras: [line.extra_child_seat, line.extra_meet_greet, line.extra_luggage],
  })
}

function storedPriceKey(line: Row, stops: Row[], currency: string): string {
  const hasDestination = line.destination_lat != null || line.destination_lng != null
  return priceKey({
    currency,
    trip_type: String(line.trip_type),
    pickup_date: String(line.pickup_date),
    pickup_time: String(line.pickup_time),
    origin: [numOrNull(line.origin_lat), numOrNull(line.origin_lng)],
    destination: hasDestination ? [numOrNull(line.destination_lat), numOrNull(line.destination_lng)] : null,
    stops: stops.map((s) => [numOrNull(s.lat), numOrNull(s.lng), num(s.wait_minutes)]),
    vehicle_class: String(line.vehicle_class),
    hours: numOrNull(line.hours),
    return_date: (line.return_date as string | null) ?? null,
    landing:
      line.landing_date != null && line.landing_time != null && line.pickup_offset_min != null
        ? [String(line.landing_date), String(line.landing_time), num(line.pickup_offset_min)]
        : null,
    extras: [Boolean(line.extra_child_seat), Boolean(line.extra_meet_greet), Boolean(line.extra_luggage)],
  })
}

interface PricedLine {
  distanceKm: number | null
  suggestedMinor: number
  stops: Array<{ blocks: number; free_minutes: number; fee_per_block_eur: number | null; fee_eur: number }>
}

class WriteFailure extends Error {
  constructor(
    readonly code: string | null,
    readonly frozen: boolean,
  ) {
    super('quote draft save failed')
  }
}

const optionalText = (v: string | null | undefined): string | null => {
  const t = (v ?? '').trim()
  return t === '' ? null : t
}

/**
 * Saves the header fields and, when `lines` is present, replaces ALL lines and stops of the unfrozen current version.
 * Only a draft is editable: a voided, paid or cancelled quote is action_not_allowed, a frozen version is
 * version_frozen (QUOTE-06). For every line whose price inputs changed against the stored line the server computes the
 * distance through all stops and the suggestion (D-04); a changed transfer whose route cannot be computed is
 * pricing_unavailable and NOTHING is written (Phase 91 rule). An unchanged line keeps its stored distance, suggestion
 * and stop snapshot, so re-saving a draft costs no routing call.
 */
export async function saveQuoteDraft(id: string, payload: QuoteDraftPayload, actor: QuoteActor): Promise<SaveQuoteDraftResult> {
  const supabase = createSupabaseServiceClient()
  const readFail = (what: string, code: string | null | undefined): never => {
    console.error('[quotes/store] save read failed', { quoteId: id, what, code: code ?? null })
    throw new Error('quote draft save failed')
  }

  const { data: quoteData, error: quoteError } = await supabase.from('quotes').select('*').eq('id', id).maybeSingle()
  if (quoteError) readFail('quote', quoteError.code)
  if (!quoteData) return { ok: false, code: 'not_found' }
  const quote = quoteData as Row

  if (quote.cancelled_at) return { ok: false, code: 'action_not_allowed', reason: 'quote_cancelled' }
  if (quote.status === 'voided') return { ok: false, code: 'action_not_allowed', reason: 'quote_voided' }
  if (quote.status === 'paid') return { ok: false, code: 'action_not_allowed', reason: 'quote_paid' }
  if (typeof quote.current_version_id !== 'string') return { ok: false, code: 'not_found' }

  const { data: versionData, error: versionError } = await supabase
    .from('quote_versions')
    .select('*')
    .eq('id', quote.current_version_id)
    .maybeSingle()
  if (versionError) readFail('version', versionError.code)
  if (!versionData) return { ok: false, code: 'not_found' }
  const version = versionData as Row
  if (version.frozen_at) return { ok: false, code: 'version_frozen' }
  const versionId = String(version.id)

  // The header and version values after this save.
  let expiresAtIso: string | null | undefined
  if (payload.expires_at !== undefined) {
    expiresAtIso = payload.expires_at === null ? null : endOfPragueDayIso(payload.expires_at)
    if (expiresAtIso !== null && Date.parse(expiresAtIso) <= Date.now()) {
      return { ok: false, code: 'action_not_allowed', reason: 'expiry_in_past' }
    }
  }
  const currency = (payload.currency ?? (version.currency as QuoteCurrency)) as QuoteCurrency
  const oldCurrency = String(version.currency)
  const currencyChanged = currency !== oldCurrency

  const { data: oldLineData, error: oldLineError } = await supabase
    .from('quote_version_lines')
    .select('*')
    .eq('version_id', versionId)
    .order('position', { ascending: true })
  if (oldLineError) readFail('lines', oldLineError.code)
  const oldLines = (oldLineData ?? []) as Row[]
  const oldStopsByLine = new Map<string, Row[]>()
  let oldStops: Row[] = []
  if (oldLines.length > 0) {
    const { data: stopData, error: stopError } = await supabase
      .from('quote_version_line_stops')
      .select('*')
      .in('line_id', oldLines.map((l) => String(l.id)))
      .order('position', { ascending: true })
    if (stopError) readFail('stops', stopError.code)
    oldStops = (stopData ?? []) as Row[]
    for (const stop of oldStops) {
      const list = oldStopsByLine.get(String(stop.line_id))
      if (list) list.push(stop)
      else oldStopsByLine.set(String(stop.line_id), [stop])
    }
  }

  // Lines after this save: the payload's, or the stored ones when the body carries none.
  const replacing = payload.lines !== undefined
  if (replacing && payload.lines!.length === 0) return { ok: false, code: 'invalid_lines', reason: 'no_lines' }
  if (!replacing && currencyChanged && oldLines.length > 0) {
    // The operator's amounts are in the old currency: changing it without re-entering them would reprice nothing.
    return { ok: false, code: 'invalid_lines', reason: 'currency_needs_lines' }
  }

  // 1. Price every changed line BEFORE any write, so a failing route leaves the stored draft untouched.
  const priced: Array<PricedLine | null> = []
  let amounts: number[]
  if (replacing) {
    const lines = payload.lines!
    let rates: PricingRates | null = null
    const needsRates = lines.some((line, i) => !canReuse(line, oldLines[i], oldStopsByLine, currency, oldCurrency))
    if (needsRates) {
      try {
        rates = await getPricingConfig()
      } catch {
        console.error('[quotes/store] pricing config unavailable', { quoteId: id })
        return { ok: false, code: 'pricing_unavailable' }
      }
    }
    const results = await Promise.all(
      lines.map(async (line, i): Promise<PricedLine | 'unavailable'> => {
        const stored = oldLines[i]
        if (stored && canReuse(line, stored, oldStopsByLine, currency, oldCurrency)) {
          const storedStops = oldStopsByLine.get(String(stored.id)) ?? []
          return {
            distanceKm: numOrNull(stored.distance_km),
            suggestedMinor: num(stored.suggested_amount_minor),
            stops: storedStops.map((s) => ({
              blocks: num(s.blocks),
              free_minutes: num(s.free_minutes),
              fee_per_block_eur: numOrNull(s.fee_per_block_eur),
              fee_eur: num(s.fee_eur),
            })),
          }
        }
        const suggestion = await suggestLinePrice(line, { rates: rates as PricingRates, currency })
        if (!suggestion.ok) return 'unavailable'
        return {
          distanceKm: suggestion.distanceKm,
          suggestedMinor: suggestion.suggestedMinor,
          stops: priceLineStops(line, rates as PricingRates).map((s) => ({
            blocks: s.blocks,
            free_minutes: s.freeMinutes,
            fee_per_block_eur: s.feePerBlockEur,
            fee_eur: s.feeEur,
          })),
        }
      }),
    )
    if (results.includes('unavailable')) return { ok: false, code: 'pricing_unavailable' }
    for (const r of results) priced.push(r as PricedLine)
    amounts = lines.map((l) => l.amount_minor)
  } else {
    amounts = oldLines.map((l) => num(l.amount_minor))
  }
  const totalMinor = amounts.reduce((a, b) => a + b, 0)

  // 2. The deposit (D-07): the operator's kind and value; the shares follow the amounts.
  let depositKind: DepositKind | null
  let depositValue: number | null
  if (payload.deposit === undefined) {
    depositKind = (version.deposit_kind as DepositKind | null) ?? null
    depositValue = numOrNull(version.deposit_value)
  } else {
    depositKind = payload.deposit?.kind ?? null
    depositValue = payload.deposit?.value ?? null
  }
  let depositMinor: number | null = null
  let shares: number[] | null = null
  if (depositKind !== null && depositValue !== null) {
    const refusal = depositRefusal(depositKind, depositValue, totalMinor)
    if (refusal) return { ok: false, code: 'action_not_allowed', reason: refusal }
    if (totalMinor > 0) {
      depositMinor = depositMinorFor(depositKind, depositValue, totalMinor)
      if (depositMinor === null) return { ok: false, code: 'action_not_allowed', reason: 'deposit_above_total' }
      shares = allocateDeposit(amounts, depositMinor)
    }
  }

  // 3. The writes. Each successful step registers its undo; a failure runs them in reverse, so a half-saved draft is
  // put back as it was.
  const undo: Array<() => PromiseLike<unknown>> = []
  const step = async (run: () => PromiseLike<{ error: { code?: string | null; message?: string } | null }>): Promise<void> => {
    const { error } = await run()
    if (error) throw new WriteFailure(error.code ?? null, Boolean(error.message?.includes('quote_version_frozen')))
  }

  try {
    if (replacing) {
      const lines = payload.lines!
      if (oldLines.length > 0) {
        if (oldStops.length > 0) {
          await step(() => supabase.from('quote_version_line_stops').delete().in('line_id', oldLines.map((l) => String(l.id))))
          undo.push(() => supabase.from('quote_version_line_stops').insert(oldStops))
        }
        await step(() => supabase.from('quote_version_lines').delete().eq('version_id', versionId))
        undo.push(() => supabase.from('quote_version_lines').insert(oldLines))
      }

      const lineRows = lines.map((line, i) => {
        const p = priced[i] as PricedLine
        const { amountEur, amountCzk } = lineMajorAmounts(line.amount_minor, currency)
        return {
          version_id: versionId,
          position: i + 1,
          trip_type: line.trip_type,
          pickup_date: line.pickup_date,
          pickup_time: line.pickup_time,
          landing_date: line.landing?.date ?? null,
          landing_time: line.landing?.time ?? null,
          pickup_offset_min: line.landing?.offset_min ?? null,
          origin_address: line.origin.address,
          origin_lat: line.origin.lat,
          origin_lng: line.origin.lng,
          destination_address: line.destination?.address ?? null,
          destination_lat: line.destination?.lat ?? null,
          destination_lng: line.destination?.lng ?? null,
          vehicle_class: line.vehicle_class,
          passengers: line.passengers,
          luggage: line.luggage,
          hours: line.hours ?? null,
          return_date: line.return_date ?? null,
          distance_km: p.distanceKm,
          flight_number: optionalText(line.flight_number),
          terminal: optionalText(line.terminal),
          special_requests: optionalText(line.special_requests),
          extra_child_seat: line.extra_child_seat,
          extra_meet_greet: line.extra_meet_greet,
          extra_luggage: line.extra_luggage,
          suggested_amount_minor: p.suggestedMinor,
          amount_minor: line.amount_minor,
          price_overridden: line.amount_minor !== p.suggestedMinor,
          deposit_share_minor: shares ? shares[i] : null,
          remainder_minor: shares ? line.amount_minor - shares[i] : null,
          amount_eur: amountEur,
          amount_czk: amountCzk,
        }
      })

      const { data: inserted, error: insertError } = await supabase.from('quote_version_lines').insert(lineRows).select('id, position')
      if (insertError) throw new WriteFailure(insertError.code ?? null, Boolean(insertError.message?.includes('quote_version_frozen')))
      undo.push(() => supabase.from('quote_version_lines').delete().eq('version_id', versionId))
      const idByPosition = new Map<number, string>(((inserted ?? []) as Row[]).map((r) => [num(r.position), String(r.id)]))

      const stopRows = lines.flatMap((line, i) =>
        line.stops.map((stop, j) => {
          const snapshot = (priced[i] as PricedLine).stops[j]
          return {
            line_id: idByPosition.get(i + 1),
            position: j + 1,
            address: stop.address,
            lat: stop.lat,
            lng: stop.lng,
            wait_minutes: stop.wait_minutes,
            free_minutes: snapshot.free_minutes,
            blocks: snapshot.blocks,
            fee_per_block_eur: snapshot.fee_per_block_eur,
            fee_eur: snapshot.fee_eur,
          }
        }),
      )
      if (stopRows.length > 0) {
        await step(() => supabase.from('quote_version_line_stops').insert(stopRows))
        undo.push(() =>
          supabase
            .from('quote_version_line_stops')
            .delete()
            .in('line_id', [...idByPosition.values()]),
        )
      }
    } else if (shares !== null || oldLines.some((l) => l.deposit_share_minor != null)) {
      // No new lines, but the deposit changed: the stored lines get their new shares.
      for (let i = 0; i < oldLines.length; i += 1) {
        const line = oldLines[i]
        const share = shares ? shares[i] : null
        const remainder = shares ? num(line.amount_minor) - shares[i] : null
        if (numOrNull(line.deposit_share_minor) === share && numOrNull(line.remainder_minor) === remainder) continue
        await step(() => supabase.from('quote_version_lines').update({ deposit_share_minor: share, remainder_minor: remainder }).eq('id', line.id))
        undo.push(() =>
          supabase
            .from('quote_version_lines')
            .update({ deposit_share_minor: line.deposit_share_minor ?? null, remainder_minor: line.remainder_minor ?? null })
            .eq('id', line.id),
        )
      }
    }

    const versionPatch: Row = {
      total_minor: totalMinor,
      deposit_kind: depositKind,
      deposit_value: depositKind === null ? null : depositValue,
      deposit_minor: depositMinor,
    }
    if (payload.locale !== undefined) versionPatch.locale = payload.locale
    if (payload.currency !== undefined) versionPatch.currency = payload.currency
    if (payload.remainder_method !== undefined) versionPatch.remainder_method = payload.remainder_method
    if (payload.cancel_free_hours !== undefined) versionPatch.cancel_free_hours = payload.cancel_free_hours
    if (payload.cancel_fee_percent !== undefined) versionPatch.cancel_fee_percent = payload.cancel_fee_percent
    if (payload.billing !== undefined) {
      versionPatch.billing_name = optionalText(payload.billing?.name)
      versionPatch.billing_address = optionalText(payload.billing?.address)
      versionPatch.billing_company_id = optionalText(payload.billing?.company_id)
      versionPatch.billing_vat_id = optionalText(payload.billing?.vat_id)
      versionPatch.billing_note = optionalText(payload.billing?.note)
    }
    const oldVersionValues = Object.fromEntries(Object.keys(versionPatch).map((k) => [k, version[k] ?? null]))
    await step(() => supabase.from('quote_versions').update(versionPatch).eq('id', versionId))
    undo.push(() => supabase.from('quote_versions').update(oldVersionValues).eq('id', versionId))

    const quotePatch: Row = { updated_at: new Date().toISOString() }
    if (payload.client) {
      quotePatch.client_first_name = payload.client.first_name.trim()
      quotePatch.client_last_name = payload.client.last_name.trim()
      quotePatch.client_email = payload.client.email.trim()
      quotePatch.client_phone = optionalText(payload.client.phone)
    }
    if (payload.lead_channel !== undefined) quotePatch.lead_channel = payload.lead_channel
    if (expiresAtIso !== undefined) quotePatch.expires_at = expiresAtIso
    await step(() => supabase.from('quotes').update(quotePatch).eq('id', id))
  } catch (err) {
    for (const run of undo.reverse()) {
      try {
        await run()
      } catch {
        // Best effort: the original failure is what the caller must see.
      }
    }
    const failure = err instanceof WriteFailure ? err : null
    console.error('[quotes/store] save failed', { quoteId: id, adminId: actor.id, code: failure?.code ?? null })
    if (failure?.frozen) return { ok: false, code: 'version_frozen' }
    throw new Error('quote draft save failed')
  }

  return { ok: true }
}

/** True when the stored line at this position priced the same inputs and still holds its server distance and suggestion. */
function canReuse(
  line: QuoteLinePayload,
  stored: Row | undefined,
  stopsByLine: Map<string, Row[]>,
  currency: string,
  storedCurrency: string,
): boolean {
  if (!stored) return false
  if (stored.suggested_amount_minor == null) return false
  if (line.trip_type === 'transfer' && stored.distance_km == null) return false
  const storedStops = stopsByLine.get(String(stored.id)) ?? []
  if (storedStops.length !== line.stops.length) return false
  // The stored suggestion is in the currency the version had when it was priced.
  return payloadPriceKey(line, currency) === storedPriceKey(stored, storedStops, storedCurrency)
}
