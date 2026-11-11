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
          Object.assign(r, this.payload as Row)
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
