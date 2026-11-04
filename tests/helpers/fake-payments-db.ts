/**
 * In-memory Supabase double for the Phase 88 payment engine (plan 88-01).
 *
 * It mirrors the SQL semantics of migration 085 so later plans can test engine code without a
 * database: the three payment RPCs (apply_payment_transition, append_payment_event,
 * claim_due_payment_work) and the bookings / booking_payment_events / booking_payment_consents /
 * pricing_globals tables behind a small supabase-js query-builder surface. Its own behaviour is
 * pinned in tests/payments-migration-085.test.ts next to the SQL text it mirrors.
 *
 * Time is virtual: `state.nowMs` drives every `now()`; tests move it to cross a lease or a hold_at.
 */

type Row = Record<string, unknown>
type DbError = { message: string; code?: string }
type DbResult = { data: unknown; error: DbError | null }

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
const TABLES = ['bookings', 'booking_payment_events', 'booking_payment_consents', 'pricing_globals'] as const
type TableName = (typeof TABLES)[number]

export interface FakePaymentsState {
  /** Virtual now() in epoch milliseconds. */
  nowMs: number
  bookings: Row[]
  booking_payment_events: Row[]
  booking_payment_consents: Row[]
  pricing_globals: Row[]
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
  }
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
        ...(seed.pricingGlobals ?? {}),
      },
    ],
  }

  let eventSeq = 0
  const nowIso = () => new Date(state.nowMs).toISOString()
  const findBooking = (id: unknown) => state.bookings.find((b) => b.id === id)

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
    private singleMode: 'single' | 'maybe' | null = null

    constructor(private readonly table: TableName) {}

    select(_columns?: string): this {
      this.wantsRows = true
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
          const base = this.table === 'bookings' ? { ...bookingDefaults(), id: nextUuid() } : { id: nextUuid() }
          const row = { ...base, ...input }
          rows.push(row)
          inserted.push(row)
        }
        out = inserted
      } else if (this.mode === 'update') {
        if (this.table === 'booking_payment_events') return err('booking_payment_events is append-only')
        const targets = this.matches()
        for (const r of targets) Object.assign(r, this.payload as Row)
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
      return { data: copy, error: null }
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
