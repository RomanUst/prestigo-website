// The in-browser draft of a quote and of one quote line (Phase 92, plan 92-15; QUOTE-01, D-04).
//
// The builder (QuoteBuilder, plan 92-19) holds a QuoteDraft; QuoteLineEditor edits one QuoteLineDraft. Money is typed by
// the operator as text (`amountInput`) and only turned into integer minor units at the edge (parseAmountToMinor), so no
// amount is ever computed or typed in code. The server prices and validates again (92-08): the payload of a line never
// carries a distance or a suggestion, only the operator's amount.
//
// Pure and client-safe: no I/O.

import { parseAmountToMinor, minorToInput, CURRENCY_DECIMALS } from '@/components/admin/paymentShared'
import { depositMinorFor, validateVersionMoney } from '@/lib/quotes/money'
import type { QuoteDraftPayload, QuoteLinePayload, QuotePriceLinePayload } from '@/lib/quotes/schemas'
import type { QuoteDetail } from '@/lib/quotes/store'
import type { QuoteLineRow, QuoteStopRow } from '@/lib/quotes/types'
import { QUOTE_MAX_LINES, type QuoteCurrency, type DepositKind, type RemainderMethod } from '@/lib/quotes/vocabulary'

export type QuoteTripType = 'transfer' | 'hourly' | 'daily'
export type QuoteVehicleClass = 'business' | 'first_class' | 'business_van'

export interface QuotePlace {
  address: string
  lat: number
  lng: number
}

export interface QuoteStopDraft {
  key: string
  /** Empty address means no place chosen yet (lat / lng are then 0 and meaningless). */
  address: string
  lat: number
  lng: number
  wait_minutes: number
}

export interface QuoteLandingDraft {
  date: string
  time: string
  offset_min: number
}

export interface QuoteLineDraft {
  key: string
  trip_type: QuoteTripType
  pickup_date: string
  pickup_time: string
  origin: QuotePlace | null
  destination: QuotePlace | null
  stops: QuoteStopDraft[]
  landing: QuoteLandingDraft | null
  vehicle_class: QuoteVehicleClass
  passengers: number
  luggage: number
  hours: number | null
  return_date: string | null
  flight_number: string
  terminal: string
  special_requests: string
  extra_child_seat: boolean
  extra_meet_greet: boolean
  extra_luggage: boolean
  /** The operator's amount as typed ("324.00"); the authority for the price (D-04). */
  amountInput: string
  /** What the live tariffs proposed, in minor units; shown, never sent. */
  suggestedMinor: number | null
  /** Server distance of the last suggestion, for display only; never sent. */
  distanceKm: number | null
}

export interface QuoteDraft {
  client: { first_name: string; last_name: string; email: string; phone: string }
  lead_channel: string
  locale: string
  currency: QuoteCurrency
  expires_at: string | null
  /** No kind and no value until the operator chooses them (D-07: there is no default deposit). */
  deposit: { kind: DepositKind | null; valueInput: string }
  remainder_method: RemainderMethod | null
  cancel_free_hours: string
  cancel_fee_percent: string
  billing: { name: string; address: string; company_id: string; vat_id: string; note: string }
  lines: QuoteLineDraft[]
}

let keyCounter = 0
/** A stable React key for a line or a stop that has no database id yet. */
export function newKey(prefix = 'k'): string {
  keyCounter += 1
  return `${prefix}${Date.now().toString(36)}${keyCounter}`
}

export function emptyLine(): QuoteLineDraft {
  return {
    key: newKey('line'),
    trip_type: 'transfer',
    pickup_date: '',
    pickup_time: '',
    origin: null,
    destination: null,
    stops: [],
    landing: null,
    vehicle_class: 'business',
    passengers: 1,
    luggage: 0,
    hours: null,
    return_date: null,
    flight_number: '',
    terminal: '',
    special_requests: '',
    extra_child_seat: false,
    extra_meet_greet: false,
    extra_luggage: false,
    amountInput: '',
    suggestedMinor: null,
    distanceKm: null,
  }
}

/** The operator's amount in minor units, or null while the text is empty or not a valid positive amount. */
export function lineAmountMinor(line: QuoteLineDraft, currency: QuoteCurrency): number | null {
  const parsed = parseAmountToMinor(line.amountInput, CURRENCY_DECIMALS[currency])
  return parsed.ok ? parsed.minor : null
}

/** True when the operator's amount is a valid amount that differs from the live-tariff suggestion (D-04). */
export function isManualPrice(line: QuoteLineDraft, currency: QuoteCurrency): boolean {
  const minor = lineAmountMinor(line, currency)
  return line.suggestedMinor !== null && minor !== null && minor !== line.suggestedMinor
}

const trimmedOrNull = (value: string): string | null => {
  const t = value.trim()
  return t === '' ? null : t
}

const NO_PLACE: QuotePlace = { address: '', lat: 0, lng: 0 }

/**
 * The line as the price route and the draft save accept it, without the amount. Fields that do not belong to the trip
 * type are left out (the server schema refuses them). A missing place becomes an empty placeholder the server rejects;
 * the editor does not offer "Suggest price" until the places are chosen.
 */
export function lineToPriceRequest(line: QuoteLineDraft): QuotePriceLinePayload {
  const transfer = line.trip_type === 'transfer'
  const place = (p: QuotePlace | null): QuotePlace => (p ? { address: p.address, lat: p.lat, lng: p.lng } : NO_PLACE)
  return {
    trip_type: line.trip_type,
    pickup_date: line.pickup_date,
    pickup_time: line.pickup_time,
    origin: place(line.origin),
    destination: transfer && line.destination ? place(line.destination) : null,
    stops: transfer
      ? line.stops.map((s) => ({ address: s.address, lat: s.lat, lng: s.lng, wait_minutes: s.wait_minutes }))
      : [],
    landing:
      transfer && line.landing
        ? { date: line.landing.date, time: line.landing.time, offset_min: line.landing.offset_min }
        : null,
    vehicle_class: line.vehicle_class,
    passengers: line.passengers,
    luggage: line.luggage,
    hours: line.trip_type === 'hourly' ? line.hours : null,
    return_date: line.trip_type === 'daily' ? line.return_date : null,
    flight_number: trimmedOrNull(line.flight_number),
    terminal: trimmedOrNull(line.terminal),
    special_requests: trimmedOrNull(line.special_requests),
    extra_child_seat: line.extra_child_seat,
    extra_meet_greet: line.extra_meet_greet,
    extra_luggage: line.extra_luggage,
  }
}

/**
 * One line of the draft save. `amount_minor` comes from the operator's text by parseAmountToMinor; an empty or invalid
 * amount becomes 0, which the server refuses (amount_minor is at least 1), so it can never be saved by accident. There
 * is no distance and no suggestion key (T-92-48).
 */
export function lineToPayload(line: QuoteLineDraft, currency: QuoteCurrency): QuoteLinePayload {
  return { ...lineToPriceRequest(line), amount_minor: lineAmountMinor(line, currency) ?? 0 }
}

const clock = (value: string | null | undefined): string => (typeof value === 'string' ? value.slice(0, 5) : '')

const placeOf = (address: string | null, lat: number | null, lng: number | null): QuotePlace | null =>
  address ? { address, lat: lat ?? 0, lng: lng ?? 0 } : null

/** A stored line (with its stops) as an editable draft. */
export function lineFromDetail(
  row: QuoteLineRow & { stops: QuoteStopRow[] },
  currency: QuoteCurrency,
): QuoteLineDraft {
  const landing =
    row.landing_date && row.landing_time
      ? { date: row.landing_date, time: clock(row.landing_time), offset_min: row.pickup_offset_min ?? 0 }
      : null
  return {
    key: row.id || newKey('line'),
    trip_type: row.trip_type,
    pickup_date: row.pickup_date,
    pickup_time: clock(row.pickup_time),
    origin: placeOf(row.origin_address, row.origin_lat, row.origin_lng),
    destination: placeOf(row.destination_address, row.destination_lat, row.destination_lng),
    stops: [...row.stops]
      .sort((a, b) => a.position - b.position)
      .map((s) => ({
        key: s.id || newKey('stop'),
        address: s.address,
        lat: s.lat ?? 0,
        lng: s.lng ?? 0,
        wait_minutes: s.wait_minutes,
      })),
    landing,
    vehicle_class: row.vehicle_class,
    passengers: row.passengers,
    luggage: row.luggage,
    hours: row.hours,
    return_date: row.return_date,
    flight_number: row.flight_number ?? '',
    terminal: row.terminal ?? '',
    special_requests: row.special_requests ?? '',
    extra_child_seat: row.extra_child_seat,
    extra_meet_greet: row.extra_meet_greet,
    extra_luggage: row.extra_luggage,
    amountInput: minorToInput(Number(row.amount_minor), CURRENCY_DECIMALS[currency]),
    suggestedMinor: row.suggested_amount_minor === null ? null : Number(row.suggested_amount_minor),
    distanceKm: row.distance_km === null ? null : Number(row.distance_km),
  }
}

// == the whole draft (plan 92-19) ==================================================================================

/** The Prague calendar day (YYYY-MM-DD) of an instant; the operator's expiry is "the last day of the link" (D-02). */
export function pragueDay(iso: string | null | undefined): string {
  if (!iso) return ''
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return ''
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Prague',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(t))
}

/** The stored quote as an editable draft. The deposit and the remainder method stay empty when the operator never chose them. */
export function draftFromDetail(detail: QuoteDetail): QuoteDraft {
  const { quote, version } = detail
  const currency = version.currency
  const hasDeposit = version.deposit_kind !== null && version.deposit_value !== null
  return {
    client: {
      first_name: quote.client_first_name,
      last_name: quote.client_last_name,
      email: quote.client_email,
      phone: quote.client_phone ?? '',
    },
    lead_channel: quote.lead_channel,
    locale: version.locale,
    currency,
    expires_at: quote.expires_at ? pragueDay(quote.expires_at) : null,
    deposit: hasDeposit
      ? {
          kind: version.deposit_kind,
          valueInput:
            version.deposit_kind === 'percent'
              ? String(version.deposit_value)
              : minorToInput(Number(version.deposit_value), CURRENCY_DECIMALS[currency]),
        }
      : { kind: null, valueInput: '' },
    remainder_method: version.remainder_method,
    cancel_free_hours: version.cancel_free_hours === null ? '' : String(version.cancel_free_hours),
    cancel_fee_percent: version.cancel_fee_percent === null ? '' : String(version.cancel_fee_percent),
    billing: {
      name: version.billing_name ?? '',
      address: version.billing_address ?? '',
      company_id: version.billing_company_id ?? '',
      vat_id: version.billing_vat_id ?? '',
      note: version.billing_note ?? '',
    },
    lines: detail.lines.map((l) => lineFromDetail(l, currency)),
  }
}

export type DepositParse =
  | { ok: true; kind: DepositKind; value: number }
  | { ok: false; reason: 'kind' | 'empty' | 'zero' | 'format' | 'percent_range' }

/**
 * The deposit as the server takes it: a whole percent 1..100, or a fixed amount in minor units. Nothing is assumed:
 * no kind, an empty value and 0 are all refusals (D-07).
 */
export function parseDeposit(deposit: QuoteDraft['deposit'], currency: QuoteCurrency): DepositParse {
  const text = deposit.valueInput.trim()
  if (deposit.kind === null) return { ok: false, reason: 'kind' }
  if (text === '') return { ok: false, reason: 'empty' }
  if (deposit.kind === 'percent') {
    if (!/^\d{1,3}$/.test(text)) return { ok: false, reason: 'format' }
    const value = Number(text)
    if (value === 0) return { ok: false, reason: 'zero' }
    if (value > 100) return { ok: false, reason: 'percent_range' }
    return { ok: true, kind: 'percent', value }
  }
  const parsed = parseAmountToMinor(text, CURRENCY_DECIMALS[currency])
  if (!parsed.ok) return { ok: false, reason: parsed.reason === 'zero' ? 'zero' : 'format' }
  return { ok: true, kind: 'fixed', value: parsed.minor }
}

export interface DraftTotals {
  /** Sum of the lines that have a valid amount. */
  totalMinor: number
  /** Lines without a valid positive amount. */
  missingAmounts: number
  /** Null until the deposit is valid and not above the total. */
  depositMinor: number | null
  remainderMinor: number | null
}

/** Total, deposit and remainder with the pure money functions (the server computes them again on save). */
export function draftTotals(draft: QuoteDraft): DraftTotals {
  const amounts = draft.lines.map((l) => lineAmountMinor(l, draft.currency))
  const valid = amounts.filter((a): a is number => a !== null)
  const totalMinor = valid.reduce((a, b) => a + b, 0)
  const parsed = parseDeposit(draft.deposit, draft.currency)
  const depositMinor = parsed.ok ? depositMinorFor(parsed.kind, parsed.value, totalMinor) : null
  return {
    totalMinor,
    missingAmounts: amounts.length - valid.length,
    depositMinor,
    remainderMinor: depositMinor === null ? null : totalMinor - depositMinor,
  }
}

/** The inline sentence of a deposit that cannot be saved, or null when it can. */
export function depositProblem(draft: QuoteDraft): string | null {
  const parsed = parseDeposit(draft.deposit, draft.currency)
  if (!parsed.ok) {
    switch (parsed.reason) {
      case 'kind':
        return 'Choose percent or a fixed amount for the deposit.'
      case 'empty':
        return 'Enter the deposit.'
      case 'zero':
        return 'The deposit cannot be 0.'
      case 'percent_range':
        return 'A percent deposit is 1 to 100.'
      default:
        return draft.deposit.kind === 'percent'
          ? 'Enter the deposit as a whole percent, 1 to 100.'
          : 'Enter the deposit as an amount, for example 150.00.'
    }
  }
  const { totalMinor } = draftTotals(draft)
  if (totalMinor > 0 && depositMinorFor(parsed.kind, parsed.value, totalMinor) === null) {
    return 'The deposit cannot be more than the total.'
  }
  return null
}

/** The inline sentences of the terms fields, or null. Empty fields mean the standard policy (D-06). */
export function termsProblems(draft: QuoteDraft): { hours: string | null; fee: string | null } {
  const hoursText = draft.cancel_free_hours.trim()
  const feeText = draft.cancel_fee_percent.trim()
  let hours: string | null = null
  let fee: string | null = null
  if (hoursText !== '' && (!/^\d{1,4}$/.test(hoursText) || Number(hoursText) > 720)) {
    hours = 'Free cancellation is 0 to 720 hours (30 days).'
  }
  if (feeText !== '' && (!/^\d{1,3}$/.test(feeText) || Number(feeText) < 1 || Number(feeText) > 100)) {
    fee = 'The fee is 1 to 100 percent.'
  }
  return { hours, fee }
}

/** One short sentence per problem that would make the server refuse the save with a bare 400 or 422. Empty = ready. */
export function draftProblems(draft: QuoteDraft): string[] {
  const out: string[] = []
  if (draft.lines.length === 0) out.push('Add at least one trip.')
  if (draft.lines.length > QUOTE_MAX_LINES) out.push(`A quote has at most ${QUOTE_MAX_LINES} trips.`)
  draft.lines.forEach((line, i) => {
    const n = i + 1
    if (lineAmountMinor(line, draft.currency) === null) out.push(`Trip ${n}: enter an amount greater than 0.`)
    if (!line.pickup_date) out.push(`Trip ${n}: choose the pickup date.`)
    if (!line.pickup_time) out.push(`Trip ${n}: choose the pickup time.`)
    if (!line.origin?.address) out.push(`Trip ${n}: choose the pickup address.`)
    if (line.trip_type === 'transfer' && !line.destination?.address) out.push(`Trip ${n}: choose the destination.`)
    if (line.stops.some((s) => !s.address)) out.push(`Trip ${n}: choose an address for every stop or remove the stop.`)
    if (line.trip_type === 'hourly' && !line.hours) out.push(`Trip ${n}: choose the number of hours.`)
    if (line.trip_type === 'daily' && !line.return_date) out.push(`Trip ${n}: choose the return date.`)
  })
  const deposit = depositProblem(draft)
  if (deposit) out.push(deposit)
  if (draft.remainder_method === null) out.push('Choose how the remainder is paid.')
  const terms = termsProblems(draft)
  if (terms.hours) out.push(terms.hours)
  if (terms.fee) out.push(terms.fee)
  if (draft.expires_at && draft.expires_at < pragueDay(new Date().toISOString())) out.push('The expiry date is in the past.')
  return out
}

/**
 * A non-blocking heads-up from the freeze rules (Stripe minimums, Pitfall 11): the quote can be saved, but sending it
 * would be refused. Null when everything reaches the minimums or the draft is not complete enough to tell.
 */
export function sendWarning(draft: QuoteDraft): string | null {
  const totals = draftTotals(draft)
  if (draft.remainder_method === null || totals.depositMinor === null || totals.missingAmounts > 0 || draft.lines.length === 0) {
    return null
  }
  const amounts = draft.lines.map((l) => lineAmountMinor(l, draft.currency) as number)
  const check = validateVersionMoney({
    currency: draft.currency,
    remainderMethod: draft.remainder_method,
    lineAmounts: amounts,
    depositMinor: totals.depositMinor,
  })
  if (check.ok) return null
  if (check.reason === 'deposit_below_minimum') {
    return 'The deposit is below the smallest amount a card can be charged. Raise it before sending.'
  }
  if (check.reason === 'remainder_below_minimum') {
    return 'A remainder is below the smallest amount a card can be charged. Change the deposit or the amounts before sending.'
  }
  return null
}

const numberOrNull = (text: string): number | null => (text.trim() === '' ? null : Number(text.trim()))

/**
 * The PATCH body of a whole draft. The client and the lead channel are fixed when the quote is created, so they are not
 * sent. The expiry is sent only when the operator changed it, so a date that has since passed does not block every save.
 * Billing is sent only for the invoice method. Call only when draftProblems is empty.
 */
export function draftToPayload(draft: QuoteDraft, savedExpiry: string | null): QuoteDraftPayload {
  const deposit = parseDeposit(draft.deposit, draft.currency)
  const invoice = draft.remainder_method === 'invoice'
  const trimmed = (v: string): string => v.trim()
  return {
    locale: draft.locale as QuoteDraftPayload['locale'],
    currency: draft.currency,
    ...((draft.expires_at ?? null) !== (savedExpiry ?? null) ? { expires_at: draft.expires_at || null } : {}),
    deposit: deposit.ok ? { kind: deposit.kind, value: deposit.value } : null,
    remainder_method: draft.remainder_method,
    cancel_free_hours: numberOrNull(draft.cancel_free_hours),
    cancel_fee_percent: numberOrNull(draft.cancel_fee_percent),
    billing: invoice
      ? {
          name: trimmed(draft.billing.name),
          address: trimmed(draft.billing.address),
          company_id: trimmed(draft.billing.company_id),
          vat_id: trimmed(draft.billing.vat_id),
          note: trimmed(draft.billing.note),
        }
      : null,
    lines: draft.lines.map((l) => lineToPayload(l, draft.currency)),
  }
}
