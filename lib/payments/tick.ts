// The payment tick (Phase 88, plan 88-11; HOLD-02, D-08).
//
// One idempotent catch-up pass with two triggers (app/api/cron/payment-tick: the daily Vercel cron and the
// 15-minute QStash schedule). Selection is always "due", never "due exactly now": hold_at <= now() with a
// SKIP LOCKED claim and a lease, so a missed run is caught up by the next one and two overlapping runs can
// never place the same hold twice.
//
// Steps are isolated like the outbox sweep: a step that throws adds its code to `errors` and the next step still
// runs. This plan registers step A (place due holds) and step E (reconcile stuck checkouts); later plans add
// C (settle sweep), B (auto-retry) and D (alerts) to TICK_STEPS.
//
// Nothing here asks whether the client-facing card flow is switched on: bookings that already hold a card keep
// their lifecycle whatever the owner's switch says now (D-09a, tests/payment-state-writers-gate.test.ts).

import type Stripe from 'stripe'
import { createSupabaseServiceClient } from '@/lib/supabase'
import {
  CHECKOUT_RECONCILE_MAX_AGE_MS,
  HOLD_CLAIM_LIMIT,
  LEASE_SECONDS,
  STALE_CHECKOUT_MS,
} from '@/lib/payments/config'
import { placeHold } from '@/lib/payments/hold'
import { claimDueHolds, type LedgerActor } from '@/lib/payments/state'
import { getPaymentsStripe } from '@/lib/payments/stripe'
import { applyHoldNowAuthorized, applySetupSucceeded } from '@/lib/stripe-webhook/card-confirm'

export type TickStepCode = 'A' | 'B' | 'C' | 'D' | 'E'

export type TickCounts = Record<string, number>

export interface TickContext {
  now: Date
  /** A step records a per-row problem here without aborting the rest of its rows. */
  errors: Set<string>
}

export interface TickStep {
  code: TickStepCode
  run: (ctx: TickContext) => Promise<Partial<TickCounts>>
}

export type TickResult = { ok: true; placed: number; failed: number; reconciled: number; errors: string[] } & Record<
  string,
  number | string[] | true
>

const TICK_ACTOR: LedgerActor = { type: 'system', id: 'payment_tick' }
const RECONCILE_ACTOR: LedgerActor = { type: 'system', id: 'tick_reconcile' }
/** Checkouts examined per run (oldest first); the rest wait for the next run. */
const RECONCILE_LIMIT = 50

/** Step A: claim the due holds and place them one after the other (sequential Stripe calls, T-88-34). */
const stepA: TickStep = {
  code: 'A',
  async run(ctx) {
    const rows = await claimDueHolds(HOLD_CLAIM_LIMIT, LEASE_SECONDS)
    let placed = 0
    let failed = 0
    for (const row of rows) {
      try {
        const result = await placeHold(row, TICK_ACTOR, ctx.now)
        if (result.outcome === 'authorized') placed += 1
        else if (result.outcome === 'failed') failed += 1
      } catch {
        // One booking's problem never stops the others; its lease expires and the next run re-claims it.
        console.error('[payment-tick] hold failed unexpectedly', { bookingId: typeof row.id === 'string' ? row.id : null })
        ctx.errors.add('A')
      }
    }
    return { placed, failed }
  },
}

/**
 * Step E: a checkout_pending booking older than STALE_CHECKOUT_MS and younger than CHECKOUT_RECONCILE_MAX_AGE_MS
 * is looked up in Stripe; when the SetupIntent succeeded (or the hold-now PaymentIntent reached requires_capture)
 * the booking is confirmed by the very code the webhook runs. Covers a webhook that never arrived.
 */
const stepE: TickStep = {
  code: 'E',
  async run(ctx) {
    const nowMs = ctx.now.getTime()
    const { data, error } = await createSupabaseServiceClient()
      .from('bookings')
      .select('id, setup_intent_id, hold_payment_intent_id, created_at')
      .eq('payment_state', 'checkout_pending')
      .eq('payment_mode', 'card_hold')
      .lt('created_at', new Date(nowMs - STALE_CHECKOUT_MS).toISOString())
      .gt('created_at', new Date(nowMs - CHECKOUT_RECONCILE_MAX_AGE_MS).toISOString())
      .order('created_at', { ascending: true })
      .limit(RECONCILE_LIMIT)
    if (error) throw new Error('checkout reconcile lookup failed')

    const rows = (Array.isArray(data) ? data : []) as Array<{
      id: string
      setup_intent_id?: string | null
      hold_payment_intent_id?: string | null
    }>

    let reconciled = 0
    for (const row of rows) {
      try {
        const stripe = getPaymentsStripe()
        if (row.hold_payment_intent_id) {
          const pi = (await stripe.paymentIntents.retrieve(row.hold_payment_intent_id)) as Stripe.PaymentIntent
          if (pi.status === 'requires_capture') {
            await applyHoldNowAuthorized(pi, RECONCILE_ACTOR)
            reconciled += 1
            continue
          }
        }
        if (row.setup_intent_id) {
          const si = (await stripe.setupIntents.retrieve(row.setup_intent_id)) as Stripe.SetupIntent
          if (si.status === 'succeeded') {
            await applySetupSucceeded(si, RECONCILE_ACTOR)
            reconciled += 1
          }
        }
      } catch {
        console.error('[payment-tick] checkout reconcile failed', { bookingId: row.id })
        ctx.errors.add('E')
      }
    }
    return { reconciled }
  },
}

export const TICK_STEPS: TickStep[] = [stepA, stepE]

/** Never throws: every step is isolated and the result always carries the counts and the failed step codes. */
export async function runPaymentTick(now: Date = new Date()): Promise<TickResult> {
  const ctx: TickContext = { now, errors: new Set<string>() }
  const counts: TickCounts = { placed: 0, failed: 0, reconciled: 0 }

  for (const step of TICK_STEPS) {
    try {
      const out = await step.run(ctx)
      for (const [key, value] of Object.entries(out)) {
        if (typeof value === 'number') counts[key] = (counts[key] ?? 0) + value
      }
    } catch {
      console.error('[payment-tick] step failed', { step: step.code })
      ctx.errors.add(step.code)
    }
  }

  return { ok: true, ...counts, errors: [...ctx.errors] } as TickResult
}
