/**
 * In-memory Stripe double for the whole Phase 88 card-on-file flow (plan 88-08).
 *
 * Every later plan (webhook, hold, settle, recovery, edits, cancel) imports createFakeStripe and
 * injects `stripe` through vi.mock of getPaymentsStripe. It models only what the flow uses, with the
 * Stripe behaviours the flow depends on:
 *
 *  - customers.create / update / retrieve
 *  - setupIntents.create / retrieve
 *  - paymentIntents.create / retrieve / capture / cancel / search. Off-session confirm outcomes are
 *    scripted per payment method id: 'pm_ok' succeeds, 'pm_decline_insufficient' throws a card
 *    error (insufficient_funds), 'pm_auth_required' throws authentication_required with the
 *    PaymentIntent left in requires_action.
 *  - paymentLinks.create / update
 *  - refunds.create (full or partial refund of a succeeded PaymentIntent; amount_refunded is tracked on it) and
 *    refunds.list (by payment_intent, newest first)
 *  - an idempotency store: the same key with the same params replays the saved result (thrown errors
 *    included), the same key with different params throws a StripeIdempotencyError, and a connection
 *    failure is never stored.
 *
 * Errors are plain Errors carrying the stripe-node `type` / `code` / `decline_code` / `statusCode`
 * fields, which is exactly what lib/payments/stripe.ts classifyStripeError reads. This file imports
 * nothing from the stripe package, so it works whether or not a test mocks that module.
 */

type Params = Record<string, unknown>
type Options = { idempotencyKey?: string } | undefined
type Obj = Record<string, unknown> & { id: string }

export type FakeStripeErrorType =
  | 'StripeCardError'
  | 'StripeConnectionError'
  | 'StripeInvalidRequestError'
  | 'StripeIdempotencyError'
  | 'StripeAPIError'
  | 'StripeAuthenticationError'
  | 'StripePermissionError'
  | 'StripeRateLimitError'

export class FakeStripeError extends Error {
  type: FakeStripeErrorType
  code?: string
  decline_code?: string
  statusCode?: number
  payment_intent?: Obj
  constructor(
    type: FakeStripeErrorType,
    message: string,
    extra: { code?: string; decline_code?: string; statusCode?: number; payment_intent?: Obj } = {},
  ) {
    super(message)
    this.name = type
    this.type = type
    Object.assign(this, extra)
  }
}

export interface FakeStripeCall {
  /** 'customers.create', 'setupIntents.create', ... */
  method: string
  /** The create params, or the update params. For retrieve / capture / cancel: the params after the id. */
  params: Params
  /** The object id for retrieve / update / capture / cancel; null for create / search. */
  targetId: string | null
  idempotencyKey: string | undefined
  /** Replayed from the idempotency store instead of executed. */
  replayed: boolean
}

export interface FakeStripeState {
  customers: Map<string, Obj>
  setupIntents: Map<string, Obj>
  paymentIntents: Map<string, Obj>
  paymentLinks: Map<string, Obj>
  refunds: Map<string, Obj>
  /** key -> saved outcome. Connection failures never land here. */
  idempotency: Map<string, { fingerprint: string; outcome: { ok: true; value: unknown } | { ok: false; error: FakeStripeError } }>
}

export interface FakeStripeOptions {
  /** Virtual clock in epoch seconds (default: real time). */
  nowSec?: () => number
}

const clone = <T,>(v: T): T => (v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T))

function matchesQuery(obj: Obj, query: string): boolean {
  // Supports the shapes the flow uses: metadata['k']:'v' clauses joined by AND, and status:'x'.
  const clauses = query.split(/\s+AND\s+/i).map((c) => c.trim()).filter(Boolean)
  return clauses.every((clause) => {
    const meta = /^metadata\[['"]([^'"]+)['"]\]:['"]([^'"]*)['"]$/.exec(clause)
    if (meta) return ((obj.metadata as Record<string, string> | undefined) ?? {})[meta[1]] === meta[2]
    const field = /^([a-z_]+):['"]([^'"]*)['"]$/.exec(clause)
    if (field) return String(obj[field[1]]) === field[2]
    throw new FakeStripeError('StripeInvalidRequestError', `fake-stripe: unsupported search clause ${clause}`, {
      code: 'query_invalid',
      statusCode: 400,
    })
  })
}

export function createFakeStripe(opts: FakeStripeOptions = {}) {
  const nowSec = opts.nowSec ?? (() => Math.floor(Date.now() / 1000))
  const state: FakeStripeState = {
    customers: new Map(),
    setupIntents: new Map(),
    paymentIntents: new Map(),
    paymentLinks: new Map(),
    refunds: new Map(),
    idempotency: new Map(),
  }
  const calls: FakeStripeCall[] = []
  const failures: Array<{ method: string; kind: 'connection' | 'error'; error?: FakeStripeError }> = []
  let seq = 0
  const nextId = (prefix: string) => {
    seq += 1
    return `${prefix}_${String(seq).padStart(6, '0')}`
  }

  function badRequest(message: string, code: string): FakeStripeError {
    return new FakeStripeError('StripeInvalidRequestError', message, { code, statusCode: 400 })
  }

  /**
   * One Stripe request: record it, honour a scripted connection failure, replay or execute
   * through the idempotency store.
   */
  function request<T>(
    method: string,
    targetId: string | null,
    params: Params,
    options: Options,
    run: () => T,
  ): T {
    const key = options?.idempotencyKey
    const call: FakeStripeCall = { method, params: clone(params), targetId, idempotencyKey: key, replayed: false }
    calls.push(call)

    const idx = failures.findIndex((f) => f.method === method)
    if (idx >= 0) {
      const [failure] = failures.splice(idx, 1)
      // Nothing executed, nothing stored: a retry with the same key runs for real.
      if (failure.kind === 'error' && failure.error) throw failure.error
      throw new FakeStripeError('StripeConnectionError', 'An error occurred with our connection to Stripe.')
    }

    if (key) {
      const fingerprint = JSON.stringify([method, targetId, params])
      const saved = state.idempotency.get(key)
      if (saved) {
        if (saved.fingerprint !== fingerprint) {
          throw new FakeStripeError(
            'StripeIdempotencyError',
            'Keys for idempotent requests can only be used with the same parameters they were first used with.',
            { code: 'idempotency_key_in_use', statusCode: 400 },
          )
        }
        call.replayed = true
        if (!saved.outcome.ok) throw saved.outcome.error
        return clone(saved.outcome.value) as T
      }
      try {
        const value = run()
        state.idempotency.set(key, { fingerprint, outcome: { ok: true, value: clone(value) } })
        return value
      } catch (e) {
        if (e instanceof FakeStripeError && e.type !== 'StripeConnectionError') {
          state.idempotency.set(key, { fingerprint, outcome: { ok: false, error: e } })
        }
        throw e
      }
    }
    return run()
  }

  // ── customers ──────────────────────────────────────────────────────────────
  const customers = {
    create: async (params: Params, options?: Options) =>
      request('customers.create', null, params, options, () => {
        const c: Obj = { id: nextId('cus'), object: 'customer', created: nowSec(), metadata: {}, ...clone(params) }
        state.customers.set(c.id, c)
        return clone(c)
      }),
    retrieve: async (id: string, params: Params = {}, options?: Options) =>
      request('customers.retrieve', id, params, options, () => {
        const c = state.customers.get(id)
        if (!c) throw badRequest(`No such customer: '${id}'`, 'resource_missing')
        return clone(c)
      }),
    update: async (id: string, params: Params, options?: Options) =>
      request('customers.update', id, params, options, () => {
        const c = state.customers.get(id)
        if (!c) throw badRequest(`No such customer: '${id}'`, 'resource_missing')
        Object.assign(c, clone(params))
        return clone(c)
      }),
  }

  // ── setup intents ──────────────────────────────────────────────────────────
  const setupIntents = {
    create: async (params: Params, options?: Options) =>
      request('setupIntents.create', null, params, options, () => {
        const id = nextId('seti')
        const si: Obj = {
          id,
          object: 'setup_intent',
          created: nowSec(),
          status: 'requires_payment_method',
          client_secret: `${id}_secret_fake`,
          payment_method: null,
          metadata: {},
          ...clone(params),
        }
        state.setupIntents.set(id, si)
        return clone(si)
      }),
    retrieve: async (id: string, params: Params = {}, options?: Options) =>
      request('setupIntents.retrieve', id, params, options, () => {
        const si = state.setupIntents.get(id)
        if (!si) throw badRequest(`No such setupintent: '${id}'`, 'resource_missing')
        return clone(si)
      }),
  }

  // ── payment intents ────────────────────────────────────────────────────────
  const paymentIntents = {
    create: async (params: Params, options?: Options) =>
      request('paymentIntents.create', null, params, options, () => {
        const amount = params.amount
        if (typeof amount !== 'number' || !Number.isInteger(amount) || amount <= 0) {
          throw badRequest('Invalid positive integer', 'parameter_invalid_integer')
        }
        const id = nextId('pi')
        const manual = params.capture_method === 'manual'
        const pi: Obj = {
          id,
          object: 'payment_intent',
          created: nowSec(),
          status: 'requires_payment_method',
          client_secret: `${id}_secret_fake`,
          capture_method: manual ? 'manual' : 'automatic',
          amount_capturable: 0,
          amount_received: 0,
          cancellation_reason: null,
          latest_charge: null,
          metadata: {},
          ...clone(params),
        }
        state.paymentIntents.set(id, pi)

        if (params.confirm === true && typeof params.payment_method === 'string') {
          const pm = params.payment_method
          if (pm === 'pm_ok') {
            if (manual) {
              pi.status = 'requires_capture'
              pi.amount_capturable = amount
            } else {
              pi.status = 'succeeded'
              pi.amount_received = amount
            }
            pi.latest_charge = nextId('ch')
          } else if (pm === 'pm_decline_insufficient') {
            pi.status = 'requires_payment_method'
            throw new FakeStripeError('StripeCardError', 'Your card has insufficient funds.', {
              code: 'card_declined',
              decline_code: 'insufficient_funds',
              statusCode: 402,
              payment_intent: clone(pi),
            })
          } else if (pm === 'pm_auth_required') {
            pi.status = 'requires_action'
            throw new FakeStripeError('StripeCardError', 'This payment requires authentication.', {
              code: 'authentication_required',
              decline_code: 'authentication_required',
              statusCode: 402,
              payment_intent: clone(pi),
            })
          } else {
            throw badRequest(`No such PaymentMethod: '${pm}'`, 'resource_missing')
          }
        }
        return clone(pi)
      }),
    retrieve: async (id: string, params: Params = {}, options?: Options) =>
      request('paymentIntents.retrieve', id, params, options, () => {
        const pi = state.paymentIntents.get(id)
        if (!pi) throw badRequest(`No such payment_intent: '${id}'`, 'resource_missing')
        return clone(pi)
      }),
    capture: async (id: string, params: Params = {}, options?: Options) =>
      request('paymentIntents.capture', id, params, options, () => {
        const pi = state.paymentIntents.get(id)
        if (!pi) throw badRequest(`No such payment_intent: '${id}'`, 'resource_missing')
        if (pi.status !== 'requires_capture') {
          throw badRequest(
            `This PaymentIntent could not be captured because it has a status of ${String(pi.status)}.`,
            'payment_intent_unexpected_state',
          )
        }
        const capturable = pi.amount_capturable as number
        const want = params.amount_to_capture === undefined ? capturable : params.amount_to_capture
        if (typeof want !== 'number' || !Number.isInteger(want) || want <= 0 || want > capturable) {
          throw badRequest('amount_to_capture must be a positive amount not above amount_capturable.', 'amount_too_large')
        }
        // One capture only: the remainder of the authorization is released.
        pi.status = 'succeeded'
        pi.amount_received = want
        pi.amount_capturable = 0
        return clone(pi)
      }),
    cancel: async (id: string, params: Params = {}, options?: Options) =>
      request('paymentIntents.cancel', id, params, options, () => {
        const pi = state.paymentIntents.get(id)
        if (!pi) throw badRequest(`No such payment_intent: '${id}'`, 'resource_missing')
        if (pi.status === 'succeeded' || pi.status === 'canceled') {
          throw badRequest(
            `You cannot cancel this PaymentIntent because it has a status of ${String(pi.status)}.`,
            'payment_intent_unexpected_state',
          )
        }
        pi.status = 'canceled'
        pi.amount_capturable = 0
        pi.cancellation_reason = typeof params.cancellation_reason === 'string' ? params.cancellation_reason : 'requested_by_customer'
        return clone(pi)
      }),
    list: async (params: { customer?: string; limit?: number }, options?: Options) =>
      request('paymentIntents.list', null, params, options, () => {
        const data = [...state.paymentIntents.values()]
          .filter((pi) => params.customer === undefined || pi.customer === params.customer)
          .reverse()
          .slice(0, params.limit ?? 10)
          .map(clone)
        return { object: 'list', data, has_more: false }
      }),
    search: async (params: { query: string; limit?: number }, options?: Options) =>
      request('paymentIntents.search', null, params, options, () => {
        const data = [...state.paymentIntents.values()]
          .filter((pi) => matchesQuery(pi, params.query))
          .slice(0, params.limit ?? 10)
          .map(clone)
        return { object: 'search_result', data, has_more: false }
      }),
  }

  // ── payment links ──────────────────────────────────────────────────────────
  const paymentLinks = {
    create: async (params: Params, options?: Options) =>
      request('paymentLinks.create', null, params, options, () => {
        const id = nextId('plink')
        const link: Obj = {
          id,
          object: 'payment_link',
          active: true,
          url: `https://buy.stripe.test/${id}`,
          metadata: {},
          ...clone(params),
        }
        state.paymentLinks.set(id, link)
        return clone(link)
      }),
    update: async (id: string, params: Params, options?: Options) =>
      request('paymentLinks.update', id, params, options, () => {
        const link = state.paymentLinks.get(id)
        if (!link) throw badRequest(`No such payment_link: '${id}'`, 'resource_missing')
        Object.assign(link, clone(params))
        return clone(link)
      }),
  }

  // ── refunds ────────────────────────────────────────────────────────────────
  const refunds = {
    create: async (params: Params, options?: Options) =>
      request('refunds.create', null, params, options, () => {
        const piId = params.payment_intent
        const pi = typeof piId === 'string' ? state.paymentIntents.get(piId) : undefined
        if (!pi) throw badRequest(`No such payment_intent: '${String(piId)}'`, 'resource_missing')
        if (pi.status !== 'succeeded') {
          throw badRequest('This PaymentIntent does not have a successful charge to refund.', 'charge_not_refundable')
        }
        const received = (pi.amount_received as number) ?? 0
        const already = typeof pi.amount_refunded === 'number' ? pi.amount_refunded : 0
        const amount = params.amount === undefined ? received - already : params.amount
        if (typeof amount !== 'number' || !Number.isInteger(amount) || amount <= 0 || already + amount > received) {
          throw badRequest('The refund amount is greater than the unrefunded amount.', 'charge_already_refunded')
        }
        pi.amount_refunded = already + amount
        const refund: Obj = {
          id: nextId('re'),
          object: 'refund',
          status: 'succeeded',
          metadata: {},
          ...clone(params),
          amount,
          payment_intent: piId as string,
        }
        state.refunds.set(refund.id, refund)
        return clone(refund)
      }),
    list: async (params: Params, options?: Options) =>
      request('refunds.list', null, params, options, () => {
        const data = [...state.refunds.values()]
          .filter((r) => params.payment_intent === undefined || r.payment_intent === params.payment_intent)
          .reverse()
          .slice(0, typeof params.limit === 'number' ? params.limit : 10)
          .map(clone)
        return { object: 'list', data, has_more: false }
      }),
  }

  const stripe = { customers, setupIntents, paymentIntents, paymentLinks, refunds }

  return {
    stripe,
    state,
    calls,
    /** Calls to one method, e.g. callsTo('setupIntents.create'). */
    callsTo: (method: string) => calls.filter((c) => c.method === method),
    /** Calls that actually executed (not replayed from the idempotency store). */
    executed: (method: string) => calls.filter((c) => c.method === method && !c.replayed).length,
    /**
     * An uncaptured authorization lapses: the PaymentIntent is canceled with the given reason.
     * 'expired' and 'automatic' both end canceled; the reason is kept for webhook tests.
     */
    expireHold(piId: string, reason: 'expired' | 'automatic') {
      const pi = state.paymentIntents.get(piId)
      if (!pi) throw new Error(`fake-stripe: no payment intent ${piId}`)
      pi.status = 'canceled'
      pi.amount_capturable = 0
      pi.cancellation_reason = reason
      return clone(pi)
    },
    /** A refund made outside the site (the Stripe Dashboard): no metadata and no idempotency key. */
    manualRefund(piId: string, amount: number) {
      const pi = state.paymentIntents.get(piId)
      if (!pi) throw new Error(`fake-stripe: no payment intent ${piId}`)
      pi.amount_refunded = (typeof pi.amount_refunded === 'number' ? pi.amount_refunded : 0) + amount
      const refund: Obj = { id: nextId('re'), object: 'refund', status: 'succeeded', metadata: {}, amount, payment_intent: piId }
      state.refunds.set(refund.id, refund)
      return clone(refund)
    },
    /** The next call to `method` throws a connection error (executes nothing, stores nothing). */
    failNextWith(method: string, kind: 'connection') {
      failures.push({ method, kind })
    },
    /**
     * The next call to `method` throws this scripted Stripe error without executing or storing anything (a 409 for a
     * key still in flight, a 401 for a revoked key, ...).
     */
    failNextWithError(method: string, error: FakeStripeError) {
      failures.push({ method, kind: 'error', error })
    },
    /** A Stripe webhook event envelope around an object (signature handling is the route test's job). */
    buildEvent(type: string, object: Record<string, unknown>) {
      seq += 1
      return {
        id: `evt_${String(seq).padStart(6, '0')}`,
        object: 'event',
        api_version: '2025-01-01',
        created: nowSec(),
        livemode: false,
        type,
        data: { object: clone(object) },
      }
    },
  }
}

export type FakeStripe = ReturnType<typeof createFakeStripe>
