import type { CSSProperties } from 'react'
import { formatMinor, type PaymentCurrency } from '@/lib/payments/money'

// Phase 89-17: pure helpers and types shared by PaymentPanel and the fee / cash dialogs. Kept out of
// PaymentPanel.tsx so the dialogs never import the panel (no import cycle). No colour literal: tokens only
// (tests/admin-no-hardcoded-colors.test.ts).

// ── API contract ─────────────────────────────────────────────────────────────

export interface PaymentSnapshot {
  mode: string
  state: string
  currency: PaymentCurrency | null
  amount_minor: number | null
  hold_amount_minor: number | null
  captured_amount_minor: number
  hold_at: string | null
  capture_before: string | null
  card_saved: boolean
  last_payment_error: string | null
  payment_retry_at: string | null
  payment_retry_count: number
  recovery_link_url: string | null
  pickup_at: string | null
  status: string
  completed: boolean
  booking_reference: string
  client_email: string | null
}

/** The fee case of the admin GET (plan 89-12). Operator text (reason, contact_note) is admin-only. */
export interface FeeCaseFacts {
  kind: string
  status: string
  currency: string
  proposed_minor: number
  base_minor: number
  charged_minor: number | null
  charge_in_flight: boolean
  free_until: string | null
  opened_at: string
  decided_by: string | null
  decided_at: string | null
  reason: string | null
  contact_note: string | null
  evidence: Record<string, unknown>
}

export interface CashNote {
  kind: string
  note: string
  created_by: string | null
  created_at: string
}

/** The cash facts of a cash booking. `unconfirmed` is information only (D-21): no alarm, no count, no filter. */
export interface CashFacts {
  unconfirmed: boolean
  confirmed_by: 'driver' | 'admin' | 'system' | null
  confirmed_at: string | null
  notes: CashNote[]
}

// ── formatting ───────────────────────────────────────────────────────────────

const PRAGUE_TZ = 'Europe/Prague'

const PRAGUE_FORMAT = new Intl.DateTimeFormat('en-GB', {
  timeZone: PRAGUE_TZ,
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

function pragueStamp(iso: string | null | undefined, withWeekday: boolean): string | null {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  const parts: Record<string, string> = {}
  for (const p of PRAGUE_FORMAT.formatToParts(date)) parts[p.type] = p.value
  const day = `${parts.day} ${parts.month}`
  return `${withWeekday ? `${parts.weekday} ` : ''}${day}, ${parts.hour}:${parts.minute}`
}

/** "Thu 12 Nov, 14:05" (Prague). */
export function formatPragueFull(iso: string | null | undefined): string | null {
  return pragueStamp(iso, true)
}

/** "12 Nov, 14:05" (Prague). */
export function formatPragueShort(iso: string | null | undefined): string | null {
  return pragueStamp(iso, false)
}

export function toCurrency(currency: string | null | undefined): PaymentCurrency {
  return currency === 'czk' ? 'czk' : 'eur'
}

export function money(amountMinor: number, currency: string | null | undefined): string {
  return formatMinor(amountMinor, toCurrency(currency))
}

// ── amount text <-> integer minor units (T-89-57) ────────────────────────────

/** Decimals of the currency's minor unit. Both payment currencies use 100 minor units to the major unit. */
export const CURRENCY_DECIMALS: Record<PaymentCurrency, number> = { eur: 2, czk: 2 }

export type AmountParse =
  | { ok: true; minor: number }
  | { ok: false; reason: 'empty' | 'format' | 'decimals' | 'zero' }

/**
 * Typed decimal text -> integer minor units, by string handling only (no float arithmetic, no rounding drift).
 * "10.10" is 1010. More fraction digits than the currency allows ("10.101") is refused, never rounded. A comma is
 * accepted as the decimal separator. The server stays the authority (cap, currency, lock).
 */
export function parseAmountToMinor(text: string, decimals = 2): AmountParse {
  const t = text.trim()
  if (t === '') return { ok: false, reason: 'empty' }
  const match = /^(\d{1,12})(?:[.,](\d*))?$/.exec(t)
  if (!match) return { ok: false, reason: 'format' }
  const frac = match[2] ?? ''
  if (frac.length > decimals) return { ok: false, reason: 'decimals' }
  const minor = Number(match[1]) * 10 ** decimals + Number(frac.padEnd(decimals, '0') || '0')
  if (!Number.isSafeInteger(minor)) return { ok: false, reason: 'format' }
  if (minor <= 0) return { ok: false, reason: 'zero' }
  return { ok: true, minor }
}

/** Integer minor units -> input text ("4000" -> "40.00"), by string handling. */
export function minorToInput(minor: number, decimals = 2): string {
  const factor = 10 ** decimals
  const whole = Math.floor(minor / factor)
  const frac = String(minor % factor).padStart(decimals, '0')
  return decimals > 0 ? `${whole}.${frac}` : String(whole)
}

/** "40" or "33.3": the share of the booking amount the typed fee is. */
export function percentOf(minor: number, baseMinor: number): string {
  if (baseMinor <= 0) return '0'
  return String(Math.round((minor / baseMinor) * 1000) / 10)
}

// ── where the money of a fee comes from ──────────────────────────────────────

export type FeeCollection =
  | { kind: 'hold'; heldMinor: number | null; captureBefore: string | null }
  | { kind: 'paid'; paidMinor: number }
  | { kind: 'card' }

/** Mirrors lib/payments/fee.ts collectedForCase for display only; the server decides. */
export function feeCollection(p: PaymentSnapshot, feeCase: FeeCaseFacts): FeeCollection {
  if (p.mode === 'pay_now') return { kind: 'paid', paidMinor: feeCase.base_minor }
  if (p.state === 'captured' || p.state === 'balance_due') {
    const paid = p.captured_amount_minor > 0 ? p.captured_amount_minor : (p.amount_minor ?? feeCase.base_minor)
    return { kind: 'paid', paidMinor: paid }
  }
  if (p.state === 'authorized') {
    return { kind: 'hold', heldMinor: p.hold_amount_minor, captureBefore: p.capture_before }
  }
  return { kind: 'card' }
}

// ── request helper ───────────────────────────────────────────────────────────

export interface FeeRouteAnswer {
  status: number
  body: { outcome?: string; error?: string } | null
}

/** POST /api/admin/bookings/[id]/fee. Throws only when the network fails. */
export async function postFeeAction(bookingId: string, payload: Record<string, unknown>): Promise<FeeRouteAnswer> {
  const res = await fetch(`/api/admin/bookings/${bookingId}/fee`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const body: FeeRouteAnswer['body'] = await res.json().catch(() => null)
  return { status: res.status, body }
}

// ── copy shared by every decision dialog ─────────────────────────────────────

export const COPY_BUSY = 'Payment is being processed. Wait a moment and try again.'
export const COPY_GENERIC = 'Could not complete the action. Nothing was changed. Try again.'
// A 5xx (or a lost answer) may come after part of the action ran: never claim that nothing changed.
export const COPY_PARTIAL = 'The action may have partly completed. The panel now shows the current state.'
export const COPY_SESSION = 'Your session has ended. Sign in again.'
export const COPY_GONE = 'That action is no longer available. The panel shows the current state.'
export const COPY_DECISION_GONE = 'That decision is no longer available. The panel shows the current state.'
export const COPY_AMOUNT_LOCKED = 'A charge for another amount is already in progress. Wait for it to finish.'
export const COPY_AMOUNT_OVER_CAP = 'The amount is more than the money still held for this booking.'
export const COPY_NOTE_MISSING = 'Add a note about how you tried to reach the passenger.'
export const COPY_REFUND_FAILED_CHARGE =
  'The refund of the part above the fee did not go through, so the case stays open. Press Charge again to retry: only what is still missing is refunded, also after a refund you made in the Stripe Dashboard. If the Stripe answer was lost, another amount or a waive is possible after 10 minutes. The operator alert was emailed to you.'
export const COPY_REFUND_FAILED_WAIVE =
  'The refund did not go through, so the case stays open. Press Waive fee again to retry: only what is still missing is refunded, also after a refund you made in the Stripe Dashboard. If you settled it another way, use Close: refunded by hand. The operator alert was emailed to you.'

/** What a dialog does with an answer of the fee route. */
export type DialogOutcome =
  | { kind: 'done'; ok: boolean; text: string }
  | { kind: 'stay'; text: string; field?: 'amount' | 'note'; refetch?: boolean }
  | { kind: 'gone'; text: string }

/** The error rows every dialog shares (401/403, 409, 422 not allowed, 5xx). Dialog-specific rows are handled first. */
export function commonFeeError(answer: FeeRouteAnswer): DialogOutcome {
  const { status, body } = answer
  if (status === 401 || status === 403) return { kind: 'stay', text: COPY_SESSION }
  if (status === 409 && body?.error === 'payment_busy') return { kind: 'stay', text: COPY_BUSY }
  if (status === 409 && body?.error === 'amount_locked') return { kind: 'stay', text: COPY_AMOUNT_LOCKED }
  if (status === 422) return { kind: 'gone', text: COPY_DECISION_GONE }
  if (status >= 500) return { kind: 'stay', text: COPY_PARTIAL, refetch: true }
  return { kind: 'stay', text: COPY_GENERIC }
}

// ── styles (tokens only) ─────────────────────────────────────────────────────

export const FONT = 'var(--font-montserrat)'

export const labelStyle: CSSProperties = {
  fontFamily: FONT,
  fontSize: 'var(--admin-fs-label)',
  color: 'var(--admin-text-muted)',
}

export const bodyStyle: CSSProperties = {
  fontFamily: FONT,
  fontSize: 'var(--admin-fs-body)',
  color: 'var(--admin-text)',
}

export const amountStyle: CSSProperties = {
  whiteSpace: 'nowrap',
  fontVariantNumeric: 'tabular-nums',
}

export const outlineButtonStyle: CSSProperties = {
  minHeight: '44px',
  padding: '0 24px',
  background: 'transparent',
  border: '1px solid var(--admin-border-strong)',
  borderRadius: 'var(--admin-radius-md)',
  color: 'var(--admin-text)',
  fontFamily: FONT,
  fontSize: 'var(--admin-fs-body)',
  fontWeight: 'var(--admin-fw-strong)',
  cursor: 'pointer',
}
