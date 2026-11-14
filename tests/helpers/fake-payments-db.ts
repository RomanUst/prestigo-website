/**
 * In-memory Supabase double for the Phase 88 payment engine (plan 88-01).
 *
 * It mirrors the SQL semantics of migration 085 so later plans can test engine code without a
 * database: the three payment RPCs (apply_payment_transition with the 086 status gate, append_payment_event,
 * claim_due_payment_work) and the bookings / booking_payment_events / booking_payment_consents /
 * pricing_globals tables behind a small supabase-js query-builder surface. Its own behaviour is
 * pinned in tests/payments-migration-085.test.ts next to the SQL text it mirrors.
 *
 * Time is virtual: `state.nowMs` drives every `now()`; tests move it to cross a lease or a hold_at.
 */

import { locales } from '@/i18n/locales'

type Row = Record<string, unknown>
type DbError = { message: string; code?: string }
type DbResult = { data: unknown; error: DbError | null; count?: number }

/** The vocabulary the fake enforces; tests/payments-migration-085.test.ts pins it to the latest CHECKs. */
export const FAKE_PAYMENT_VOCABULARY = {
  states: [
    'none',
    'checkout_pending',
    'card_saved',
    'placing_hold',
    'authorized',
    'capturing',
    'captured',
    'balance_due',
    'failed',
    'expired',
    'released',
    'cash_settled',
  ],
  kinds: [
    'setup_started',
    'setup_succeeded',
    'setup_failed',
    'hold_scheduled',
    'hold_started',
    'hold_authorized',
    'hold_failed',
    'hold_released',
    'hold_expired',
    'capture_started',
    'captured',
    'charge_succeeded',
    'charge_failed',
    'difference_charged',
    'difference_failed',
    'recovery_link_created',
    'recovery_paid',
    'alert_sent',
    'email_sent',
    'admin_action',
    'refund_observed',
    'refund_failed',
    'edit_reevaluated',
    'waived',
    'fee_opened',
    'cash_settled',
    'cash_reopened',
    // Migration 089 (Phase 91): the operator's extra charge to the saved card.
    'extra_charged',
    'extra_failed',
    // Migration 091 (Phase 92): the deposit and the remainder of a quote.
    'quote_deposit',
    'quote_remainder',
  ],
} as const

/** Columns apply_payment_transition may change besides payment_state (allow-list, as in SQL). */
const PATCH_COLUMNS = [
  'payment_currency',
  'payment_amount_minor',
  'stripe_customer_id',
  'stripe_payment_method_id',
  'setup_intent_id',
  'hold_at',
  'hold_payment_intent_id',
  'hold_amount_minor',
  'hold_placed_at',
  'capture_before',
  'hold_attempts',
  'charge_attempts',
  'payment_lease_until',
  'captured_amount_minor',
  'captured_at',
  'payment_failed_at',
  'payment_retry_at',
  'payment_retry_count',
  'last_payment_error',
  'recovery_link_id',
  'recovery_link_url',
  'payment_intent_id',
] as const

const ACTIVE_STATUSES = ['confirmed', 'assigned', 'en_route', 'on_location']
const LEASED = ['placing_hold', 'capturing']
const TABLES = [
  'bookings',
  'booking_payment_events',
  'booking_payment_consents',
  'pricing_globals',
  // Migration 087 (Phase 89): deny-all tables, reached only through the service client.
  'booking_fee_cases',
  'booking_manage_tokens',
  'booking_payment_notes',
  // Migration 089 (Phase 91): stops of a booking and the operator's extra charges, deny-all like the 087 tables.
  'booking_stops',
  'booking_extra_charges',
  // Migration 091 (Phase 92): the quote tables, deny-all like the tables above.
  'quotes',
  'quote_versions',
  'quote_version_lines',
  'quote_version_line_stops',
  'quote_links',
  'quote_acceptances',
  'quote_events',
  'quote_documents',
] as const
type TableName = (typeof TABLES)[number]

export interface FakePaymentsState {
  /** Virtual now() in epoch milliseconds. */
  nowMs: number
  bookings: Row[]
  booking_payment_events: Row[]
  booking_payment_consents: Row[]
  pricing_globals: Row[]
  booking_fee_cases: Row[]
  booking_manage_tokens: Row[]
  booking_payment_notes: Row[]
  booking_stops: Row[]
  booking_extra_charges: Row[]
  quotes: Row[]
  quote_versions: Row[]
  quote_version_lines: Row[]
  quote_version_line_stops: Row[]
  quote_links: Row[]
  quote_acceptances: Row[]
  quote_events: Row[]
  quote_documents: Row[]
}

export interface FakePaymentsSeed {
  bookings?: Row[]
  pricingGlobals?: Row
  /** Virtual now() in epoch milliseconds (default: the real current time). */
  nowMs?: number
}

let idCounter = 0
function nextUuid(): string {
  idCounter += 1
  const tail = idCounter.toString(16).padStart(12, '0')
  return `00000000-0000-4000-8000-${tail}`
}

function ms(v: unknown): number {
  return typeof v === 'string' ? Date.parse(v) : NaN
}

/** Compares two column values: timestamps numerically when both parse, otherwise naturally. */
function compare(a: unknown, b: unknown): number {
  const ta = ms(a)
  const tb = ms(b)
  if (!Number.isNaN(ta) && !Number.isNaN(tb)) return ta - tb
  if (typeof a === 'number' && typeof b === 'number') return a - b
  const sa = String(a)
  const sb = String(b)
  return sa < sb ? -1 : sa > sb ? 1 : 0
}

function bookingDefaults(): Row {
  return {
    status: 'confirmed',
    booking_source: 'web',
    leg: 'outbound',
    payment_mode: 'pay_now',
    payment_state: 'none',
    payment_currency: null,
    payment_amount_minor: null,
    stripe_customer_id: null,
    stripe_payment_method_id: null,
    setup_intent_id: null,
    hold_at: null,
    hold_payment_intent_id: null,
    hold_amount_minor: null,
    hold_placed_at: null,
    capture_before: null,
    hold_attempts: 0,
    charge_attempts: 0,
    payment_lease_until: null,
    captured_amount_minor: 0,
    captured_at: null,
    payment_failed_at: null,
    payment_retry_at: null,
    payment_retry_count: 0,
    last_payment_error: null,
    recovery_link_id: null,
    recovery_link_url: null,
    payment_intent_id: null,
    pickup_utc: null,
    // Migration 087: the policy snapshot and the fee case status mirror.
    cancel_policy_version: null,
    cancel_policy: null,
    fee_case_status: null,
    // Migration 091 (Phase 92): the link to the quote a booking was made from.
    quote_id: null,
    quote_line_id: null,
    quote_deposit_minor: null,
  }
}

/** Column defaults of booking_fee_cases (migration 087). */
function feeCaseDefaults(): Row {
  return {
    status: 'pending',
    decided_minor: null,
    charge_requested_at: null,
    free_until: null,
    evidence: {},
    reason: null,
    contact_note: null,
    opened_by: null,
    decided_at: null,
    decided_by: null,
  }
}

/** The 087 CHECKs of the three new tables that matter to code under test; returns the violated one or null. */
function checkNewTableRow(table: TableName, row: Row): string | null {
  if (table === 'booking_fee_cases') {
    if (!['late_cancel', 'no_show'].includes(row.kind as string)) return 'booking_fee_cases_kind_check'
    if (!['pending', 'charged', 'waived'].includes(row.status as string)) return 'booking_fee_cases_status_check'
    if (!['eur', 'czk'].includes(row.currency as string)) return 'booking_fee_cases_currency_check'
    const base = row.base_minor as number
    const proposed = row.proposed_minor as number
    if (!(typeof base === 'number' && base > 0)) return 'booking_fee_cases_base_minor_check'
    if (!(typeof proposed === 'number' && proposed > 0 && proposed <= base)) return 'booking_fee_cases_proposed_minor_check'
    const decided = row.decided_minor as number | null
    if (decided != null && !(decided > 0 && decided <= base)) return 'booking_fee_cases_decided_minor_check'
  }
  if (table === 'booking_manage_tokens') {
    if (typeof row.token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(row.token)) return 'booking_manage_tokens_token_check'
  }
  if (table === 'booking_payment_notes') {
    if (!['cash_card_charge', 'cash_reopen'].includes(row.kind as string)) return 'booking_payment_notes_kind_check'
    if (typeof row.note !== 'string' || row.note.length > 500) return 'booking_payment_notes_note_check'
  }
  return null
}

/** Column defaults of booking_stops (migration 089). */
function stopDefaults(createdAt: string): Row {
  return {
    address: null,
    lat: null,
    lng: null,
    wait_minutes: 0,
    blocks: 0,
    fee_per_block_eur: null,
    fee_eur: 0,
    created_at: createdAt,
  }
}

/** Column defaults of booking_extra_charges (migration 089). */
function extraChargeDefaults(now: string): Row {
  return {
    status: 'charging',
    minutes: null,
    blocks: null,
    rate_per_block_eur: null,
    description: null,
    attempt: 1,
    stripe_payment_intent_id: null,
    last_error_code: null,
    requested_by: null,
    requested_at: now,
    charged_at: null,
    updated_at: now,
  }
}

const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v)
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/** The 089 CHECKs of booking_stops and booking_extra_charges (Postgres auto-names: table_column_check). */
function checkStopsOrExtrasRow(table: 'booking_stops' | 'booking_extra_charges', row: Row): string | null {
  if (table === 'booking_stops') {
    if (!(isInt(row.position) && row.position >= 1 && row.position <= 5)) return 'booking_stops_position_check'
    const address = row.address
    if (address != null && !(typeof address === 'string' && address.length >= 1 && address.length <= 500)) {
      return 'booking_stops_address_check'
    }
    if (row.lat != null && !(isNum(row.lat) && row.lat >= -90 && row.lat <= 90)) return 'booking_stops_lat_check'
    if (row.lng != null && !(isNum(row.lng) && row.lng >= -180 && row.lng <= 180)) return 'booking_stops_lng_check'
    if (!(isInt(row.wait_minutes) && row.wait_minutes >= 0 && row.wait_minutes <= 120 && row.wait_minutes % 15 === 0)) {
      return 'booking_stops_wait_minutes_check'
    }
    if (!(isInt(row.free_minutes) && row.free_minutes >= 0)) return 'booking_stops_free_minutes_check'
    if (!(isInt(row.blocks) && row.blocks >= 0)) return 'booking_stops_blocks_check'
    if (row.fee_per_block_eur != null && !(isNum(row.fee_per_block_eur) && row.fee_per_block_eur > 0)) {
      return 'booking_stops_fee_per_block_eur_check'
    }
    if (!(isNum(row.fee_eur) && row.fee_eur >= 0)) return 'booking_stops_fee_eur_check'
    return null
  }
  if (!['waiting', 'other'].includes(row.kind as string)) return 'booking_extra_charges_kind_check'
  if (!['charging', 'charged', 'failed'].includes(row.status as string)) return 'booking_extra_charges_status_check'
  if (!['eur', 'czk'].includes(row.currency as string)) return 'booking_extra_charges_currency_check'
  if (!(isInt(row.amount_minor) && row.amount_minor > 0)) return 'booking_extra_charges_amount_minor_check'
  if (row.minutes != null && !(isInt(row.minutes) && row.minutes >= 1 && row.minutes <= 480)) {
    return 'booking_extra_charges_minutes_check'
  }
  if (row.blocks != null && !(isInt(row.blocks) && row.blocks >= 1)) return 'booking_extra_charges_blocks_check'
  if (row.rate_per_block_eur != null && !(isNum(row.rate_per_block_eur) && row.rate_per_block_eur > 0)) {
    return 'booking_extra_charges_rate_per_block_eur_check'
  }
  const description = row.description
  if (description != null && !(typeof description === 'string' && description.length >= 1 && description.length <= 200)) {
    return 'booking_extra_charges_description_check'
  }
  if (!(isInt(row.attempt) && row.attempt >= 1)) return 'booking_extra_charges_attempt_check'
  const code = row.last_error_code
  if (code != null && !(typeof code === 'string' && code.length <= 60)) return 'booking_extra_charges_last_error_code_check'
  return null
}

// == Migration 091 (Phase 92): the quote tables ==================================================================
// The fake enforces the CHECKs, the unique rules, the foreign keys and the guard triggers of 091 that code under test
// can run into. The guard bypass of the erasure function (prestigo.quote_erasure) is not modelled: the erasure SQL is
// proven by its text test, not by this double.

const QUOTE_TABLES = [
  'quotes',
  'quote_versions',
  'quote_version_lines',
  'quote_version_line_stops',
  'quote_links',
  'quote_acceptances',
  'quote_events',
  'quote_documents',
] as const
type QuoteTable = (typeof QUOTE_TABLES)[number]
const isQuoteTable = (t: string): t is QuoteTable => (QUOTE_TABLES as readonly string[]).includes(t)

const HEX64 = /^[0-9a-f]{64}$/
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const CLOCK = /^\d{2}:\d{2}$/
const inList = (v: unknown, list: readonly string[]) => typeof v === 'string' && list.includes(v)
const lenBetween = (v: unknown, min: number, max: number) => typeof v === 'string' && v.length >= min && v.length <= max
const nullOr = (v: unknown, ok: (x: unknown) => boolean) => v == null || ok(v)
const intBetween = (v: unknown, min: number, max: number) => isInt(v) && v >= min && v <= max

/** The five lead channels of a quote (same list as the bookings CHECK). */
const QUOTE_LEAD_CHANNELS = ['whatsapp', 'phone', 'email', 'partner', 'other'] as const

/** Column defaults of the quote tables (migration 091). */
function quoteDefaults(table: QuoteTable, now: string): Row {
  switch (table) {
    case 'quotes':
      return {
        status: 'draft',
        current_version_id: null,
        client_phone: null,
        user_id: null,
        source_inquiry_id: null,
        expires_at: null,
        stripe_customer_id: null,
        stripe_payment_method_id: null,
        deposit_payment_intent_id: null,
        accepted_version_id: null,
        accepted_at: null,
        paid_at: null,
        remainder_payment_intent_id: null,
        remainder_amount_minor: null,
        remainder_attempt: 0,
        remainder_paid_at: null,
        invoice_requested_at: null,
        invoice_number: null,
        invoice_paid_at: null,
        voided_at: null,
        voided_by: null,
        cancelled_at: null,
        cancel_initiator: null,
        cancel_outcome: null,
        deposit_refunded_minor: 0,
        remainder_refunded_minor: 0,
        anonymised_at: null,
        created_by: null,
        created_at: now,
        updated_at: now,
      }
    case 'quote_versions':
      return {
        frozen_at: null,
        total_minor: 0,
        deposit_kind: null,
        deposit_value: null,
        deposit_minor: null,
        remainder_method: null,
        cancel_free_hours: null,
        cancel_fee_percent: null,
        cancel_policy: null,
        cancel_policy_version: null,
        terms_version: null,
        billing_name: null,
        billing_address: null,
        billing_company_id: null,
        billing_vat_id: null,
        billing_note: null,
        created_by: null,
        created_at: now,
      }
    case 'quote_version_lines':
      return {
        landing_date: null,
        landing_time: null,
        pickup_offset_min: null,
        origin_lat: null,
        origin_lng: null,
        destination_address: null,
        destination_lat: null,
        destination_lng: null,
        luggage: 0,
        hours: null,
        return_date: null,
        distance_km: null,
        flight_number: null,
        terminal: null,
        special_requests: null,
        extra_child_seat: false,
        extra_meet_greet: false,
        extra_luggage: false,
        suggested_amount_minor: null,
        price_overridden: false,
        deposit_share_minor: null,
        remainder_minor: null,
        amount_eur: null,
        amount_czk: null,
      }
    case 'quote_version_line_stops':
      return stopDefaults(now)
    case 'quote_links':
      return { created_at: now, created_by: null, revoked_at: null }
    case 'quote_acceptances':
      return {
        link_id: null,
        accepted_at: now,
        ip: null,
        user_agent: null,
        hold_lead_hours: null,
        payment_intent_id: null,
        confirmed_at: null,
      }
    case 'quote_events':
      return {
        version_id: null,
        stripe_object_id: null,
        amount_minor: null,
        currency: null,
        actor_id: null,
        error_code: null,
        created_at: now,
      }
    case 'quote_documents':
      return { created_at: now }
  }
}

/** The 091 CHECKs (Postgres auto-names: table_column_check). Returns the violated constraint name, or null. */
function checkQuoteRow(table: QuoteTable, row: Row): string | null {
  switch (table) {
    case 'quotes': {
      if (typeof row.reference !== 'string' || !/^Q-[0-9]{8}-[A-Z0-9]{6}$/.test(row.reference)) return 'quotes_reference_check'
      if (!inList(row.status, ['draft', 'sent', 'viewed', 'accepted', 'paid', 'expired', 'voided'])) return 'quotes_status_check'
      if (!lenBetween(row.client_first_name, 1, 100)) return 'quotes_client_first_name_check'
      if (!lenBetween(row.client_last_name, 1, 100)) return 'quotes_client_last_name_check'
      if (!lenBetween(row.client_email, 3, 200)) return 'quotes_client_email_check'
      if (!nullOr(row.client_phone, (v) => lenBetween(v, 0, 50))) return 'quotes_client_phone_check'
      if (!inList(row.lead_channel, QUOTE_LEAD_CHANNELS)) return 'quotes_lead_channel_check'
      if (!nullOr(row.remainder_amount_minor, (v) => isInt(v) && v > 0)) return 'quotes_remainder_amount_minor_check'
      if (!(isInt(row.remainder_attempt) && row.remainder_attempt >= 0)) return 'quotes_remainder_attempt_check'
      if (!nullOr(row.invoice_number, (v) => lenBetween(v, 0, 60))) return 'quotes_invoice_number_check'
      if (!nullOr(row.cancel_initiator, (v) => inList(v, ['admin_client', 'admin_prestigo']))) return 'quotes_cancel_initiator_check'
      if (!nullOr(row.cancel_outcome, (v) => inList(v, ['free', 'late']))) return 'quotes_cancel_outcome_check'
      if (!(isInt(row.deposit_refunded_minor) && row.deposit_refunded_minor >= 0)) return 'quotes_deposit_refunded_minor_check'
      if (!(isInt(row.remainder_refunded_minor) && row.remainder_refunded_minor >= 0)) return 'quotes_remainder_refunded_minor_check'
      return null
    }
    case 'quote_versions': {
      if (!(isInt(row.version_no) && row.version_no >= 1)) return 'quote_versions_version_no_check'
      if (!inList(row.locale, locales)) return 'quote_versions_locale_check'
      if (!inList(row.currency, ['eur', 'czk'])) return 'quote_versions_currency_check'
      if (!(isInt(row.total_minor) && row.total_minor >= 0)) return 'quote_versions_total_minor_check'
      if (!nullOr(row.deposit_kind, (v) => inList(v, ['percent', 'fixed']))) return 'quote_versions_deposit_kind_check'
      if (!nullOr(row.deposit_value, (v) => isInt(v) && v > 0)) return 'quote_versions_deposit_value_check'
      if (!nullOr(row.deposit_minor, (v) => isInt(v) && v > 0)) return 'quote_versions_deposit_minor_check'
      if (!nullOr(row.remainder_method, (v) => inList(v, ['saved_card', 'payment_link', 'cash', 'invoice']))) {
        return 'quote_versions_remainder_method_check'
      }
      if (!nullOr(row.cancel_free_hours, (v) => intBetween(v, 0, 720))) return 'quote_versions_cancel_free_hours_check'
      if (!nullOr(row.cancel_fee_percent, (v) => intBetween(v, 1, 100))) return 'quote_versions_cancel_fee_percent_check'
      if (row.deposit_kind === 'percent' && !(isInt(row.deposit_value) && row.deposit_value >= 1 && row.deposit_value <= 100)) {
        // CHECK (deposit_kind IS DISTINCT FROM 'percent' OR deposit_value BETWEEN 1 AND 100): NULL value is not BETWEEN, so it fails too.
        return 'quote_versions_deposit_percent_check'
      }
      if (row.frozen_at != null) {
        const complete =
          row.deposit_kind != null &&
          row.deposit_value != null &&
          row.deposit_minor != null &&
          row.remainder_method != null &&
          isNum(row.total_minor) &&
          row.total_minor > 0 &&
          isNum(row.deposit_minor) &&
          row.deposit_minor <= row.total_minor &&
          row.cancel_policy != null &&
          row.terms_version != null
        if (!complete) return 'quote_versions_frozen_complete'
      }
      return null
    }
    case 'quote_version_lines': {
      if (!intBetween(row.position, 1, 20)) return 'quote_version_lines_position_check'
      if (!inList(row.trip_type, ['transfer', 'hourly', 'daily'])) return 'quote_version_lines_trip_type_check'
      if (typeof row.pickup_date !== 'string' || !ISO_DATE.test(row.pickup_date)) return 'quote_version_lines_pickup_date_check'
      if (typeof row.pickup_time !== 'string' || !CLOCK.test(row.pickup_time)) return 'quote_version_lines_pickup_time_check'
      if (!nullOr(row.landing_date, (v) => typeof v === 'string' && ISO_DATE.test(v))) return 'quote_version_lines_landing_date_check'
      if (!nullOr(row.landing_time, (v) => typeof v === 'string' && CLOCK.test(v))) return 'quote_version_lines_landing_time_check'
      if (!nullOr(row.pickup_offset_min, (v) => [0, 15, 30, 45, 60, 90].includes(v as number))) return 'quote_version_lines_pickup_offset_min_check'
      if ((row.landing_date == null) !== (row.landing_time == null) || (row.landing_time == null) !== (row.pickup_offset_min == null)) {
        return 'quote_version_lines_landing_complete_check'
      }
      if (!lenBetween(row.origin_address, 1, 500)) return 'quote_version_lines_origin_address_check'
      if (!inList(row.vehicle_class, ['business', 'first_class', 'business_van'])) return 'quote_version_lines_vehicle_class_check'
      if (!intBetween(row.passengers, 1, 20)) return 'quote_version_lines_passengers_check'
      if (!intBetween(row.luggage, 0, 20)) return 'quote_version_lines_luggage_check'
      if (!nullOr(row.hours, (v) => intBetween(v, 1, 24))) return 'quote_version_lines_hours_check'
      if (!nullOr(row.suggested_amount_minor, (v) => isInt(v) && v > 0)) return 'quote_version_lines_suggested_amount_minor_check'
      if (!(isInt(row.amount_minor) && row.amount_minor > 0)) return 'quote_version_lines_amount_minor_check'
      if (!nullOr(row.deposit_share_minor, (v) => isInt(v) && v >= 0)) return 'quote_version_lines_deposit_share_minor_check'
      if (!nullOr(row.remainder_minor, (v) => isInt(v) && v >= 0)) return 'quote_version_lines_remainder_minor_check'
      if (
        row.deposit_share_minor != null &&
        row.remainder_minor != null &&
        (row.deposit_share_minor as number) + (row.remainder_minor as number) !== row.amount_minor
      ) {
        return 'quote_version_lines_deposit_split_check'
      }
      return null
    }
    case 'quote_version_line_stops': {
      const violated = checkStopsOrExtrasRow('booking_stops', row)
      return violated ? violated.replace(/^booking_stops_/, 'quote_version_line_stops_') : null
    }
    case 'quote_links':
      return typeof row.token_hash === 'string' && HEX64.test(row.token_hash) ? null : 'quote_links_token_hash_check'
    case 'quote_acceptances': {
      if (!nullOr(row.ip, (v) => lenBetween(v, 0, 64))) return 'quote_acceptances_ip_check'
      if (!nullOr(row.user_agent, (v) => lenBetween(v, 0, 300))) return 'quote_acceptances_user_agent_check'
      if (typeof row.terms_sha256 !== 'string' || !HEX64.test(row.terms_sha256)) return 'quote_acceptances_terms_sha256_check'
      if (!lenBetween(row.terms_rendered, 1, 4000)) return 'quote_acceptances_terms_rendered_check'
      if (!(isInt(row.deposit_minor) && row.deposit_minor > 0)) return 'quote_acceptances_deposit_minor_check'
      if (!inList(row.currency, ['eur', 'czk'])) return 'quote_acceptances_currency_check'
      if (!nullOr(row.hold_lead_hours, (v) => intBetween(v, 6, 96))) return 'quote_acceptances_hold_lead_hours_check'
      return null
    }
    case 'quote_events': {
      if (!lenBetween(row.event_key, 1, 200)) return 'quote_events_event_key_check'
      if (!inList(row.kind, QUOTE_EVENT_KINDS_FAKE)) return 'quote_events_kind_check'
      if (!inList(row.actor_type, ['admin', 'webhook', 'system', 'client'])) return 'quote_events_actor_type_check'
      if (!nullOr(row.error_code, (v) => lenBetween(v, 0, 60))) return 'quote_events_error_code_check'
      return null
    }
    case 'quote_documents': {
      if (typeof row.sha256 !== 'string' || !HEX64.test(row.sha256)) return 'quote_documents_sha256_check'
      if (!(isInt(row.byte_size) && row.byte_size > 0)) return 'quote_documents_byte_size_check'
      return null
    }
  }
}

/** quote_events_kind_check of 091; tests/migration-091.test.ts pins it to the SQL, lib/quotes/events.ts mirrors it. */
const QUOTE_EVENT_KINDS_FAKE = [
  'created',
  'sent',
  'link_minted',
  'viewed',
  'revised',
  'voided',
  'accepted',
  'deposit_started',
  'deposit_paid',
  'deposit_failed',
  'deposit_canceled',
  'converted',
  'convert_failed',
  'orphan_refunded',
  'dispute_opened',
  'email_sent',
  'email_failed',
  'alert_sent',
  'reminder_scheduled',
  'invoice_requested',
  'invoice_paid',
  'remainder_requested',
  'remainder_started',
  'remainder_paid',
  'remainder_failed',
  'cancelled',
  'deposit_refunded',
  'remainder_refunded',
  'refund_failed',
  'refund_observed',
  'admin_action',
] as const

function err(message: string, code?: string): DbResult {
  return { data: null, error: { message, code } }
}

class RpcError extends Error {
  constructor(message: string, readonly code?: string) {
    super(message)
  }
}

export function createFakePaymentsDb(seed: FakePaymentsSeed = {}) {
  const state: FakePaymentsState = {
    nowMs: seed.nowMs ?? Date.now(),
    bookings: (seed.bookings ?? []).map((b) => ({ ...bookingDefaults(), id: nextUuid(), ...b })),
    booking_payment_events: [],
    booking_payment_consents: [],
    pricing_globals: [
      {
        id: 1,
        payment_hold_lead_hours: 72,
        card_flow_mode: 'off',
        card_flow_canary_emails: [],
        // Migration 087 policy settings.
        cancel_free_km_threshold: 100,
        cancel_free_hours_short: 1,
        cancel_free_hours_long: 12,
        cancel_free_hours_hourly: 12,
        cancel_fee_percent: 100,
        ...(seed.pricingGlobals ?? {}),
      },
    ],
    booking_fee_cases: [],
    booking_manage_tokens: [],
    booking_payment_notes: [],
    booking_stops: [],
    booking_extra_charges: [],
    quotes: [],
    quote_versions: [],
    quote_version_lines: [],
    quote_version_line_stops: [],
    quote_links: [],
    quote_acceptances: [],
    quote_events: [],
    quote_documents: [],
  }

  let eventSeq = 0
  const nowIso = () => new Date(state.nowMs).toISOString()
  const findBooking = (id: unknown) => state.bookings.find((b) => b.id === id)

  /** Trigger booking_fee_cases_sync_status (087): bookings.fee_case_status always equals the case status. */
  function mirrorFeeCaseStatus(row: Row): void {
    const booking = findBooking(row.booking_id)
    if (booking) booking.fee_case_status = row.status as string
  }

  /**
   * booking_stops / booking_extra_charges (089): foreign key, CHECKs and the two unique rules. `self` is the row being
   * updated (excluded from the unique scan); null on insert. Returns the error result, or null when the row is valid.
   */
  function validateStopsOrExtras(
    table: 'booking_stops' | 'booking_extra_charges',
    row: Row,
    self: Row | null,
  ): DbResult | null {
    if (!findBooking(row.booking_id)) return err('violates foreign key constraint on booking_id', '23503')
    const violated = checkStopsOrExtrasRow(table, row)
    if (violated) return err(`new row violates check constraint "${violated}"`, '23514')
    const others = state[table].filter((r) => r !== self && r.booking_id === row.booking_id)
    if (table === 'booking_stops' && others.some((r) => r.position === row.position)) {
      return err('duplicate key value violates unique constraint "booking_stops_booking_position_key"', '23505')
    }
    if (table === 'booking_extra_charges' && row.status === 'charging' && others.some((r) => r.status === 'charging')) {
      return err('duplicate key value violates unique constraint "booking_extra_charges_one_charging"', '23505')
    }
    return null
  }

  const quoteVersionFrozen = (versionId: unknown): boolean => {
    const v = state.quote_versions.find((x) => x.id === versionId)
    return v != null && v.frozen_at != null
  }
  /** The version a line or a stop belongs to (a stop reaches it through its line). */
  const versionOfChild = (table: QuoteTable, row: Row): unknown =>
    table === 'quote_version_lines' ? row.version_id : state.quote_version_lines.find((l) => l.id === row.line_id)?.version_id

  /**
   * The BEFORE triggers of 091 (quote_versions_guard, quote_children_guard, quote_log_guard), which run before the CHECKs.
   * `before` is the old row (update, delete), `after` the new row (insert, update). Returns the error result or null.
   */
  function quoteGuard(table: QuoteTable, op: 'insert' | 'update' | 'delete', before: Row | null, after: Row | null): DbResult | null {
    const frozen = () => err('quote_version_frozen', 'P0001')
    const appendOnly = () => err('quote_log_append_only', 'P0001')
    if (table === 'quote_versions' && before && before.frozen_at != null) return frozen()
    if (table === 'quote_version_lines' || table === 'quote_version_line_stops') {
      if (before && quoteVersionFrozen(versionOfChild(table, before))) return frozen()
      if (after && quoteVersionFrozen(versionOfChild(table, after))) return frozen()
    }
    if (table === 'quote_events' && op !== 'insert') return appendOnly()
    if (table === 'quote_acceptances') {
      if (op === 'delete') return appendOnly()
      if (op === 'update' && before && after) {
        const lateColumns = ['payment_intent_id', 'confirmed_at']
        const changedOther = Object.keys({ ...before, ...after }).some(
          (k) => !lateColumns.includes(k) && JSON.stringify(before[k]) !== JSON.stringify(after[k]),
        )
        const rewritten = lateColumns.some((k) => before[k] != null && after[k] !== before[k])
        if (changedOther || rewritten) return appendOnly()
      }
    }
    return null
  }

  /** The foreign keys, CHECKs and unique rules of one quote table row. `self` is the row being updated; null on insert. */
  function validateQuoteTable(table: QuoteTable, row: Row, self: Row | null): DbResult | null {
    const violated = checkQuoteRow(table, row)
    if (violated) return err(`new row violates check constraint "${violated}"`, '23514')
    const exists = (rows: Row[], key: unknown) => rows.some((r) => r.id === key)
    const fkFail = (col: string) => err(`violates foreign key constraint on ${col}`, '23503')
    if (table === 'quote_versions' && !exists(state.quotes, row.quote_id)) return fkFail('quote_id')
    if (table === 'quote_version_lines' && !exists(state.quote_versions, row.version_id)) return fkFail('version_id')
    if (table === 'quote_version_line_stops' && !exists(state.quote_version_lines, row.line_id)) return fkFail('line_id')
    if (table === 'quote_links' && !(exists(state.quotes, row.quote_id) && exists(state.quote_versions, row.version_id))) {
      return fkFail('quote_id / version_id')
    }
    if (
      table === 'quote_acceptances' &&
      !(
        exists(state.quotes, row.quote_id) &&
        exists(state.quote_versions, row.version_id) &&
        (row.link_id == null || exists(state.quote_links, row.link_id))
      )
    ) {
      return fkFail('quote_id / version_id / link_id')
    }
    if (table === 'quote_events' && !exists(state.quotes, row.quote_id)) return fkFail('quote_id')
    if (table === 'quote_documents' && !exists(state.quote_versions, row.version_id)) return fkFail('version_id')

    const others = state[table].filter((r) => r !== self)
    const dup = (name: string) => err(`duplicate key value violates unique constraint "${name}"`, '23505')
    if (table === 'quotes' && others.some((r) => r.reference === row.reference)) return dup('quotes_reference_key')
    if (table === 'quote_versions' && others.some((r) => r.quote_id === row.quote_id && r.version_no === row.version_no)) {
      return dup('quote_versions_quote_version_no_key')
    }
    if (table === 'quote_version_lines' && others.some((r) => r.version_id === row.version_id && r.position === row.position)) {
      return dup('quote_version_lines_version_position_key')
    }
    if (table === 'quote_version_line_stops' && others.some((r) => r.line_id === row.line_id && r.position === row.position)) {
      return dup('quote_version_line_stops_line_position_key')
    }
    if (table === 'quote_links' && others.some((r) => r.token_hash === row.token_hash)) return dup('quote_links_token_hash_key')
    if (table === 'quote_events' && others.some((r) => r.quote_id === row.quote_id && r.event_key === row.event_key)) {
      return dup('quote_events_quote_key_unique')
    }
    if (table === 'quote_documents' && others.some((r) => r.version_id === row.version_id)) return dup('quote_documents_pkey')
    return null
  }

  /** bookings.quote_line_id: the unique partial index of 091 (the exactly-once guard of the conversion). */
  const quoteLineClash = (row: Row, self: Row | null): DbResult | null =>
    row.quote_line_id != null && state.bookings.some((b) => b !== self && b.quote_line_id === row.quote_line_id)
      ? err('duplicate key value violates unique constraint "bookings_quote_line_id_key"', '23505')
      : null

  /** Builds a ledger row from a p_event object, enforcing the table CHECKs that matter. */
  function buildEventRow(bookingId: string, event: Row, fromState: string | null, toState: string | null): Row {
    const key = event.key
    const kind = event.kind
    const actorType = event.actor_type
    if (typeof key !== 'string' || key.length < 1 || key.length > 200 || typeof kind !== 'string' || typeof actorType !== 'string') {
      throw new RpcError('invalid payment event')
    }
    if (!(FAKE_PAYMENT_VOCABULARY.kinds as readonly string[]).includes(kind)) {
      throw new RpcError('new row for relation "booking_payment_events" violates check constraint "booking_payment_events_kind_check"', '23514')
    }
    if (!['system', 'webhook', 'admin'].includes(actorType)) {
      throw new RpcError('violates check constraint on actor_type', '23514')
    }
    if (typeof event.actor_id === 'string' && event.actor_id.length > 64) {
      throw new RpcError('violates check constraint on actor_id', '23514')
    }
    if (typeof event.error_code === 'string' && event.error_code.length > 60) {
      throw new RpcError('violates check constraint on error_code', '23514')
    }
    eventSeq += 1
    return {
      id: eventSeq,
      booking_id: bookingId,
      event_key: key,
      kind,
      stripe_object_id: event.stripe_object_id ?? null,
      amount_minor: event.amount_minor ?? null,
      currency: event.currency ?? null,
      from_state: fromState,
      to_state: toState,
      actor_type: actorType,
      actor_id: event.actor_id ?? null,
      error_code: event.error_code ?? null,
      created_at: nowIso(),
    }
  }

  const eventExists = (bookingId: string, key: unknown) =>
    state.booking_payment_events.some((e) => e.booking_id === bookingId && e.event_key === key)

  function applyPaymentTransition(args: Row): Row {
    const bookingId = args.p_booking_id as string
    const from = args.p_from as string[] | null
    const to = args.p_to as string | null
    const patch = (args.p_patch as Row | null) ?? {}
    const event = (args.p_event as Row | null) ?? {}

    if (!to || !(FAKE_PAYMENT_VOCABULARY.states as readonly string[]).includes(to)) {
      throw new RpcError('invalid payment state')
    }
    if (!Array.isArray(from) || from.length === 0) throw new RpcError('invalid from states')
    if (event.key == null || event.kind == null || event.actor_type == null) {
      throw new RpcError('invalid payment event')
    }
    if ('payment_intent_id' in patch && to !== 'captured' && to !== 'balance_due') {
      throw new RpcError('payment_intent_id is set only when money is collected')
    }

    const booking = findBooking(bookingId)
    if (!booking) return { applied: false, current_state: null }
    const prev = booking.payment_state as string

    if (eventExists(bookingId, event.key)) {
      return { applied: false, duplicate: true, current_state: prev }
    }

    // Migration 086: the optional booking status gate, checked under the same lock as the payment state.
    const requireStatus = args.p_require_status as string[] | null | undefined
    if (Array.isArray(requireStatus) && !requireStatus.includes(booking.status as string)) {
      return { applied: false, status_blocked: true, current_state: prev, current_status: booking.status ?? null }
    }

    const lease = booking.payment_lease_until
    const leaseHeld = typeof lease === 'string' && ms(lease) > state.nowMs
    const blockedByLease = LEASED.includes(prev) && LEASED.includes(to) && leaseHeld
    if (!from.includes(prev) || blockedByLease) {
      return { applied: false, current_state: prev }
    }

    // Build everything first so a failing ledger row leaves the booking untouched (SQL rolls back).
    const eventRow = buildEventRow(bookingId, event, prev, to)
    booking.payment_state = to
    for (const col of PATCH_COLUMNS) {
      if (col in patch) booking[col] = patch[col] ?? null
    }
    state.booking_payment_events.push(eventRow)
    return { applied: true, previous_state: prev, booking: { ...booking } }
  }

  function appendPaymentEvent(args: Row): Row {
    const bookingId = args.p_booking_id as string
    const event = (args.p_event as Row | null) ?? {}
    if (event.key == null || event.kind == null || event.actor_type == null) {
      throw new RpcError('invalid payment event')
    }
    const booking = findBooking(bookingId)
    if (!booking) throw new RpcError('booking not found')
    if (eventExists(bookingId, event.key)) return { inserted: false }
    const row = buildEventRow(bookingId, event, booking.payment_state as string, booking.payment_state as string)
    state.booking_payment_events.push(row)
    return { inserted: true }
  }

  function claimDuePaymentWork(args: Row): Row[] {
    const limit = Math.min(Math.max(Number(args.p_limit ?? 1) || 1, 1), 50)
    const leaseSeconds = Math.min(Math.max(Number(args.p_lease_seconds ?? 60) || 60, 1), 86400)
    const due = state.bookings
      .filter((b) => {
        if (b.payment_mode !== 'card_hold') return false
        if (!ACTIVE_STATUSES.includes(b.status as string)) return false
        if (!(ms(b.pickup_utc) > state.nowMs)) return false
        if (b.payment_state === 'card_saved') return ms(b.hold_at) <= state.nowMs
        if (b.payment_state === 'placing_hold') return ms(b.payment_lease_until) <= state.nowMs
        return false
      })
      .sort((a, b) => compare(a.hold_at, b.hold_at) || compare(a.id, b.id))
      .slice(0, limit)

    const claimed: Row[] = []
    for (const b of due) {
      const prev = b.payment_state as string
      b.payment_state = 'placing_hold'
      b.payment_lease_until = new Date(state.nowMs + leaseSeconds * 1000).toISOString()
      const key = `hold_started:${b.hold_attempts}:${state.nowMs / 1000}`
      if (!eventExists(b.id as string, key)) {
        const row = buildEventRow(
          b.id as string,
          {
            key,
            kind: 'hold_started',
            amount_minor: b.payment_amount_minor ?? null,
            currency: b.payment_currency ?? null,
            actor_type: 'system',
            actor_id: 'claim_due_payment_work',
          },
          prev,
          'placing_hold',
        )
        state.booking_payment_events.push(row)
      }
      claimed.push({ ...b })
    }
    return claimed
  }

  async function rpc(name: string, args: Row = {}): Promise<DbResult> {
    try {
      switch (name) {
        case 'apply_payment_transition':
          return { data: applyPaymentTransition(args), error: null }
        case 'append_payment_event':
          return { data: appendPaymentEvent(args), error: null }
        case 'claim_due_payment_work':
          return { data: claimDuePaymentWork(args), error: null }
        default:
          return err(`function public.${name} does not exist`, '42883')
      }
    } catch (e) {
      if (e instanceof RpcError) return err(e.message, e.code)
      throw e
    }
  }

  // ── supabase-js query-builder surface ──────────────────────────────────────────

  type Filter = (row: Row) => boolean
  type Mode = 'select' | 'insert' | 'update' | 'delete'

  class Query implements PromiseLike<DbResult> {
    private mode: Mode = 'select'
    private payload: Row | Row[] | null = null
    private filters: Filter[] = []
    private orders: Array<{ col: string; asc: boolean }> = []
    private max: number | null = null
    private wantsRows = false
    private wantsCount = false
    private singleMode: 'single' | 'maybe' | null = null

    constructor(private readonly table: TableName) {}

    select(_columns?: string, opts?: { count?: 'exact' | 'planned' | 'estimated'; head?: boolean }): this {
      this.wantsRows = true
      // supabase-js count: the number of matching rows before limit(), returned next to data.
      if (opts?.count) this.wantsCount = true
      return this
    }
    insert(rows: Row | Row[]): this {
      this.mode = 'insert'
      this.payload = rows
      return this
    }
    update(patch: Row): this {
      this.mode = 'update'
      this.payload = patch
      return this
    }
    delete(): this {
      this.mode = 'delete'
      return this
    }
    eq(col: string, val: unknown): this {
      this.filters.push((r) => r[col] === val)
      return this
    }
    neq(col: string, val: unknown): this {
      this.filters.push((r) => r[col] !== val)
      return this
    }
    in(col: string, vals: unknown[]): this {
      this.filters.push((r) => vals.includes(r[col]))
      return this
    }
    is(col: string, val: unknown): this {
      this.filters.push((r) => (val === null ? r[col] == null : r[col] === val))
      return this
    }
    not(col: string, op: string, val: unknown): this {
      if (op === 'is') this.filters.push((r) => !(val === null ? r[col] == null : r[col] === val))
      else if (op === 'eq') this.filters.push((r) => r[col] !== val)
      else throw new Error(`fake-payments-db: not(${op}) is not supported`)
      return this
    }
    /**
     * PostgREST ilike: case-insensitive LIKE where % and _ are wildcards and a backslash escapes the next character
     * (Postgres' default LIKE escape), so tests can prove an escaped search value never widens the match.
     */
    ilike(col: string, pattern: string): this {
      let source = ''
      for (let i = 0; i < pattern.length; i += 1) {
        const ch = pattern[i]
        if (ch === '\\' && i + 1 < pattern.length) {
          i += 1
          source += pattern[i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        } else if (ch === '%') source += '[\\s\\S]*'
        else if (ch === '_') source += '[\\s\\S]'
        else source += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      }
      const re = new RegExp(`^${source}$`, 'i')
      this.filters.push((r) => typeof r[col] === 'string' && re.test(r[col] as string))
      return this
    }
    lt(col: string, val: unknown): this {
      this.filters.push((r) => r[col] != null && compare(r[col], val) < 0)
      return this
    }
    lte(col: string, val: unknown): this {
      this.filters.push((r) => r[col] != null && compare(r[col], val) <= 0)
      return this
    }
    gt(col: string, val: unknown): this {
      this.filters.push((r) => r[col] != null && compare(r[col], val) > 0)
      return this
    }
    gte(col: string, val: unknown): this {
      this.filters.push((r) => r[col] != null && compare(r[col], val) >= 0)
      return this
    }
    order(col: string, opts?: { ascending?: boolean }): this {
      this.orders.push({ col, asc: opts?.ascending !== false })
      return this
    }
    limit(n: number): this {
      this.max = n
      return this
    }
    single(): this {
      this.singleMode = 'single'
      return this
    }
    maybeSingle(): this {
      this.singleMode = 'maybe'
      return this
    }

    private matches(): Row[] {
      return state[this.table].filter((r) => this.filters.every((f) => f(r)))
    }

    private run(): DbResult {
      const rows = state[this.table]
      let out: Row[] = []

      if (this.mode === 'insert') {
        const list = Array.isArray(this.payload) ? this.payload : [this.payload as Row]
        const inserted: Row[] = []
        for (const input of list) {
          if (this.table === 'booking_payment_events') {
            const row = this.insertEvent(input)
            if ('error' in row) return err(row.error, '23505')
            inserted.push(row.row)
            continue
          }
          if (isQuoteTable(this.table)) {
            const quoteRow: Row = {
              ...quoteDefaults(this.table, nowIso()),
              ...(this.table === 'quote_documents' ? {} : { id: nextUuid() }),
              ...input,
            }
            const blocked = quoteGuard(this.table, 'insert', null, quoteRow)
            if (blocked) return blocked
            const failure = validateQuoteTable(this.table, quoteRow, null)
            if (failure) return failure
            rows.push(quoteRow)
            inserted.push(quoteRow)
            continue
          }
          const base =
            this.table === 'bookings'
              ? { ...bookingDefaults(), id: nextUuid() }
              : this.table === 'booking_fee_cases'
                ? { ...feeCaseDefaults(), id: nextUuid(), opened_at: nowIso() }
                : this.table === 'booking_manage_tokens'
                  ? { created_at: nowIso(), last_used_at: null, revoked_at: null }
                  : this.table === 'booking_payment_notes'
                    ? { id: nextUuid(), created_by: null, created_at: nowIso() }
                    : this.table === 'booking_stops'
                      ? { ...stopDefaults(nowIso()), id: nextUuid() }
                      : this.table === 'booking_extra_charges'
                        ? { ...extraChargeDefaults(nowIso()), id: nextUuid() }
                        : { id: nextUuid() }
          const row: Row = { ...base, ...input }
          if (this.table === 'bookings') {
            const clash = quoteLineClash(row, null)
            if (clash) return clash
          }
          if (this.table === 'booking_stops' || this.table === 'booking_extra_charges') {
            const failure = validateStopsOrExtras(this.table, row, null)
            if (failure) return failure
          }
          if (this.table === 'booking_fee_cases' || this.table === 'booking_manage_tokens' || this.table === 'booking_payment_notes') {
            if (!findBooking(row.booking_id)) return err('violates foreign key constraint on booking_id', '23503')
            const violated = checkNewTableRow(this.table, row)
            if (violated) return err(`new row violates check constraint "${violated}"`, '23514')
            const clash =
              this.table === 'booking_fee_cases' || this.table === 'booking_manage_tokens'
                ? rows.some((r) => r.booking_id === row.booking_id) ||
                  (this.table === 'booking_manage_tokens' && rows.some((r) => r.token === row.token))
                : false
            if (clash) return err(`duplicate key value violates unique constraint on ${this.table}`, '23505')
          }
          rows.push(row)
          if (this.table === 'booking_fee_cases') mirrorFeeCaseStatus(row)
          inserted.push(row)
        }
        out = inserted
      } else if (this.mode === 'update') {
        if (this.table === 'booking_payment_events') return err('booking_payment_events is append-only')
        const targets = this.matches()
        for (const r of targets) {
          const before = { ...r }
          if (isQuoteTable(this.table)) {
            const blocked = quoteGuard(this.table, 'update', before, { ...r, ...(this.payload as Row) })
            if (blocked) return blocked
          }
          Object.assign(r, this.payload as Row)
          if (isQuoteTable(this.table)) {
            const failure = validateQuoteTable(this.table, r, r)
            if (failure) {
              Object.assign(r, before)
              return failure
            }
          }
          if (this.table === 'bookings') {
            const clash = quoteLineClash(r, r)
            if (clash) {
              Object.assign(r, before)
              return clash
            }
          }
          if (this.table === 'booking_fee_cases') {
            const violated = checkNewTableRow(this.table, r)
            if (violated) {
              Object.assign(r, before)
              return err(`new row violates check constraint "${violated}"`, '23514')
            }
            if ('status' in (this.payload as Row)) mirrorFeeCaseStatus(r)
          }
          if (this.table === 'booking_stops' || this.table === 'booking_extra_charges') {
            const failure = validateStopsOrExtras(this.table, r, r)
            if (failure) {
              Object.assign(r, before)
              return failure
            }
          }
        }
        out = targets
      } else if (this.mode === 'delete') {
        if (this.table === 'booking_payment_events') return err('booking_payment_events is append-only')
        const targets = this.matches()
        if (isQuoteTable(this.table)) {
          for (const r of targets) {
            const blocked = quoteGuard(this.table, 'delete', r, null)
            if (blocked) return blocked
          }
        }
        for (const r of targets) rows.splice(rows.indexOf(r), 1)
        out = targets
      } else {
        out = this.matches()
      }

      for (const o of [...this.orders].reverse()) {
        out = [...out].sort((a, b) => (o.asc ? 1 : -1) * compare(a[o.col], b[o.col]))
      }
      const totalMatched = out.length
      if (this.max !== null) out = out.slice(0, this.max)
      const copy = out.map((r) => ({ ...r }))

      if (this.singleMode === 'single') {
        if (copy.length !== 1) return err('JSON object requested, multiple (or no) rows returned', 'PGRST116')
        return { data: copy[0], error: null }
      }
      if (this.singleMode === 'maybe') {
        if (copy.length > 1) return err('JSON object requested, multiple (or no) rows returned', 'PGRST116')
        return { data: copy[0] ?? null, error: null }
      }
      if (this.mode !== 'select' && !this.wantsRows) return { data: null, error: null }
      return this.wantsCount ? { data: copy, error: null, count: totalMatched } : { data: copy, error: null }
    }

    private insertEvent(input: Row): { row: Row } | { error: string } {
      const bookingId = input.booking_id as string
      const key = input.event_key
      if (!findBooking(bookingId)) return { error: 'violates foreign key constraint on booking_id' }
      if (eventExists(bookingId, key)) return { error: 'duplicate key value violates unique constraint "booking_payment_events_key_unique"' }
      eventSeq += 1
      const row = { id: eventSeq, created_at: nowIso(), ...input }
      state.booking_payment_events.push(row)
      return { row }
    }

    then<T1 = DbResult, T2 = never>(
      onfulfilled?: ((value: DbResult) => T1 | PromiseLike<T1>) | null,
      onrejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null,
    ): PromiseLike<T1 | T2> {
      return Promise.resolve().then(() => this.run()).then(onfulfilled, onrejected)
    }
  }

  const client = {
    rpc,
    from(table: string) {
      if (!(TABLES as readonly string[]).includes(table)) {
        throw new Error(`fake-payments-db: table ${table} is not modelled`)
      }
      return new Query(table as TableName)
    },
  }

  return { client, state }
}

export type FakePaymentsDb = ReturnType<typeof createFakePaymentsDb>
