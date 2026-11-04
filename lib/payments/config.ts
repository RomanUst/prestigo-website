// Card-on-file settings and engine constants (Phase 88, plan 88-06; PAYF-05, D-01, D-09, D-09a, D-19).
//
// This is the ONLY reader of pricing_globals.card_flow_mode. The eligibility decision is made at the
// client-facing edge (the card-checkout routes) and nowhere else: the tick, hold, settle, recovery and
// webhook code never ask whether a client "may" use the card flow, so a booking that already holds a
// card can not be stranded by the owner switching the canary off (tests/payment-state-writers-gate.test.ts).
//
// Fail closed: any read problem, a missing value or an unknown mode means pay-now for everybody.

import { createSupabaseServiceClient } from '@/lib/supabase'

// Timing constants live in the client-safe timing module and are re-exported here for the engine.
export {
  MIN_BOOKING_LEAD_MS,
  RETRY_DELAY_MS,
  RETRY_MIN_GAP_MS,
  RETRY_BEFORE_PICKUP_MS,
  REPLACE_MARGIN_MS,
  HOLD_DAY_CUTOFF_PRAGUE,
} from '@/lib/payments/timing'

const MINUTE_MS = 60_000
const HOUR_MS = 3_600_000

/** Trip types that may use the card flow. round_trip and daily keep pay-now (D-19); multi-day is a quote (D-03). */
export const CARD_FLOW_TRIP_TYPES = ['transfer', 'hourly'] as const

/** Bookings claimed per tick run. */
export const HOLD_CLAIM_LIMIT = 20
/** How long a claimed booking stays leased to one tick run. */
export const LEASE_SECONDS = 300
/** Alert when a booking inside this window before pickup still has no valid hold. */
export const NO_VALID_HOLD_ALERT_MS = 24 * HOUR_MS
/** Alert when an authorized hold expires within this window and has not been replaced. */
export const EXPIRING_HOLD_ALERT_MS = 12 * HOUR_MS
/** A checkout_pending booking older than this is reconciled against Stripe. */
export const STALE_CHECKOUT_MS = 10 * MINUTE_MS
/** Checkout reconciliation ignores bookings older than this. */
export const CHECKOUT_RECONCILE_MAX_AGE_MS = 48 * HOUR_MS
/** The lease search looks at bookings whose hold is due within this window. */
export const LEASE_SEARCH_AFTER_MS = 20 * HOUR_MS

export const DEFAULT_HOLD_LEAD_HOURS = 72
export const MIN_HOLD_LEAD_HOURS = 6
export const MAX_HOLD_LEAD_HOURS = 96

export interface PaymentSettings {
  mode: 'off' | 'canary'
  leadHours: number
  canaryEmails: string[]
}

const FAIL_CLOSED: PaymentSettings = { mode: 'off', leadHours: DEFAULT_HOLD_LEAD_HOURS, canaryEmails: [] }

/** Trim + lower-case. Emails are compared exactly after this, never by prefix or substring. */
export function normalizeEmail(s: string): string {
  return s.trim().toLowerCase()
}

/** pricing_globals id 1. Any error, missing row or invalid value falls back to off / 72 / empty. */
export async function getPaymentSettings(): Promise<PaymentSettings> {
  try {
    const { data, error } = await createSupabaseServiceClient()
      .from('pricing_globals')
      .select('payment_hold_lead_hours, card_flow_mode, card_flow_canary_emails')
      .eq('id', 1)
      .single()
    if (error || !data) return { ...FAIL_CLOSED, canaryEmails: [] }
    const row = data as {
      payment_hold_lead_hours?: unknown
      card_flow_mode?: unknown
      card_flow_canary_emails?: unknown
    }
    const lead = row.payment_hold_lead_hours
    const leadHours =
      typeof lead === 'number' && Number.isInteger(lead) && lead >= MIN_HOLD_LEAD_HOURS && lead <= MAX_HOLD_LEAD_HOURS
        ? lead
        : DEFAULT_HOLD_LEAD_HOURS
    const canaryEmails = Array.isArray(row.card_flow_canary_emails)
      ? row.card_flow_canary_emails
          .filter((e): e is string => typeof e === 'string')
          .map(normalizeEmail)
          .filter((e) => e.length > 0)
      : []
    return { mode: row.card_flow_mode === 'canary' ? 'canary' : 'off', leadHours, canaryEmails }
  } catch {
    return { ...FAIL_CLOSED, canaryEmails: [] }
  }
}

/**
 * The client may see the card flow only when the owner runs the canary, the (normalised) email is on
 * the allowlist exactly, and the trip is a transfer or hourly. An empty allowlist is nobody.
 */
export function isCardFlowEligible(s: PaymentSettings, input: { email: string; tripType: string }): boolean {
  if (s.mode !== 'canary') return false
  if (!(CARD_FLOW_TRIP_TYPES as readonly string[]).includes(input.tripType)) return false
  const email = normalizeEmail(input.email)
  if (!email) return false
  return s.canaryEmails.some((allowed) => normalizeEmail(allowed) === email)
}
