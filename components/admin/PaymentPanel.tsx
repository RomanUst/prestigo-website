'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Copy, LoaderCircle, TriangleAlert } from 'lucide-react'
import { copyPaymentLinkToClipboard } from '@/lib/ui/payment-link-display'
import { CashCardChargeModal } from './CashCardChargeModal'
import { FeeChargeModal } from './FeeChargeModal'
import { FeeDecisionBanner } from './FeeDecisionBanner'
import { FeeWaiveModal } from './FeeWaiveModal'
import { MarkCashModal } from './MarkCashModal'
import { ReopenCashModal } from './ReopenCashModal'
import { FeeCloseRefundedModal } from './FeeCloseRefundedModal'
import { FeeOpenCaseModal } from './FeeOpenCaseModal'
import { Modal } from './Modal'
import { AlertBanner, type BannerSpec, type DecisionResult } from './paymentParts'
import {
  amountStyle,
  bodyStyle,
  formatPragueFull,
  formatPragueShort,
  labelStyle,
  money,
  outlineButtonStyle,
  FONT,
  COPY_BUSY,
  COPY_GENERIC,
  COPY_GONE,
  COPY_PARTIAL,
  COPY_SESSION,
  type CashFacts,
  type FeeCaseFacts,
  type PaymentSnapshot,
} from './paymentShared'
import { CashChip, PaymentStateBadge, RefundFailedBadge } from './PaymentStateBadge'

// Phase 88-07 (HOLD-07, PAYF-01, D-14, D-20): self-contained admin payment panel. It fetches
// GET /api/admin/bookings/[id]/payment itself (route built in plan 88-15) so Phase 90's
// BookingDetailPanel extraction only moves it. No polling: it refetches on mount, when
// `refreshKey` changes (a trip edit) and after any action.
//
// Phase 89-17: the fee decision block, the cash vocabulary and the five fee / cash dialogs. Buttons come only from the
// server's allowed_actions; the server re-checks everything (T-89-58).
//
// Colour comes only from var(--admin-*) / var(--status-*) tokens (tests/admin-no-hardcoded-colors).

export { formatPragueFull }
export type { PaymentSnapshot, FeeCaseFacts, CashFacts }

// ── API contract ─────────────────────────────────────────────────────────────

/** The five executable actions of POST /payment, and the display names executed by POST /fee (plan 89-12). */
export type PaymentActionName =
  | 'capture' | 'retry' | 'release' | 'waive' | 'send_link'
  | 'charge_fee' | 'waive_fee' | 'charge_saved_card' | 'mark_cash_settled' | 'reopen_cash' | 'close_refunded' | 'open_fee_case'

export interface PaymentEventRow {
  id: number
  created_at: string
  kind: string
  amount_minor: number | null
  currency: string | null
  actor_type: 'system' | 'webhook' | 'admin'
  actor_id: string | null
  error_code: string | null
}

export interface PaymentResponse {
  payment: PaymentSnapshot
  allowed_actions: PaymentActionName[]
  refund_failed: boolean
  events: PaymentEventRow[]
  events_total: number
  /** Phase 89: the late-cancel / no-show case, null when the booking has none. */
  fee_case?: FeeCaseFacts | null
  /** Phase 89: the cash facts of a cash booking, null for other modes. */
  cash?: CashFacts | null
}

interface PaymentPanelProps {
  bookingId: string
  /** Bump to refetch (TripEditPanel.onUpdated). */
  refreshKey?: number
  /**
   * The payment mode the booking list already knows (null when the row has none). Anything but
   * 'card_hold' keeps a slow or failed load silent: only a refund_failed answer renders (D-20).
   * Omit it to treat the booking as a card booking.
   */
  paymentMode?: string | null
  /**
   * 88-REVIEW C-WR-04: told the payment state every time the panel (re)loads, so the booking list can keep its row badge
   * in step with an action taken here (release, capture, waive, ...).
   */
  onPaymentState?: (state: string) => void
}

// ── formatting ───────────────────────────────────────────────────────────────

const HISTORY_PREVIEW = 5

// ── copy tables ──────────────────────────────────────────────────────────────

const EVENT_LABELS: Record<string, string> = {
  setup_started: 'Card setup started',
  setup_succeeded: 'Card saved',
  setup_failed: 'Card setup failed',
  hold_scheduled: 'Hold scheduled',
  hold_started: 'Placing hold',
  hold_authorized: 'Hold placed',
  hold_failed: 'Hold failed',
  hold_released: 'Hold released',
  hold_expired: 'Hold expired',
  capture_started: 'Capture started',
  captured: 'Captured',
  charge_succeeded: 'Card charged',
  charge_failed: 'Charge failed',
  difference_charged: 'Price difference charged',
  difference_failed: 'Price difference declined',
  recovery_link_created: 'Payment link created',
  recovery_paid: 'Payment link paid',
  alert_sent: 'Operator alert sent',
  email_sent: 'Client email sent',
  admin_action: 'Operator action',
  refund_observed: 'Refund seen in Stripe',
  edit_reevaluated: 'Booking edited, payment re-checked',
  waived: 'Balance waived',
  refund_failed: 'Refund failed',
  // Phase 89 (UI-SPEC 5.6). `waived` reads "Fee waived" when the booking has a fee case (see eventLabel).
  fee_opened: 'Fee decision opened',
  cash_settled: 'Paid in cash',
  cash_reopened: 'Cash confirmation reversed',
}

const ERROR_TEXT: Record<string, string> = {
  card_declined: 'Card declined',
  insufficient_funds: 'Insufficient funds',
  expired_card: 'Card expired',
  authentication_required: 'Bank needs 3D Secure, so the client must pay through the link',
  processing_error: 'Bank processing error',
}

const ACTOR_LABEL: Record<PaymentEventRow['actor_type'], string> = {
  system: 'System',
  webhook: 'Stripe',
  admin: 'Admin',
}

/** `waived` is "Fee waived" on a booking with a fee case and "Balance waived" otherwise (the balance_due write-off). */
function eventLabel(kind: string, hasFeeCase: boolean): string {
  if (kind === 'waived' && hasFeeCase) return 'Fee waived'
  return Object.prototype.hasOwnProperty.call(EVENT_LABELS, kind) ? EVENT_LABELS[kind] : kind
}

function friendlyError(code: string): string {
  return Object.prototype.hasOwnProperty.call(ERROR_TEXT, code) ? ERROR_TEXT[code] : 'Payment error'
}

// ── shared styles (tokens only) ──────────────────────────────────────────────

// ── facts ────────────────────────────────────────────────────────────────────

interface Fact {
  key: string
  caption: string
  value: React.ReactNode
}

interface LinkCopyState {
  copied: boolean
  /** The clipboard was unavailable: the link is shown so the operator can select it. */
  manual: boolean
  onCopy: () => void
  fallbackId: string
}

const CASH_NOTE_LABEL: Record<string, string> = {
  cash_card_charge: 'Why the card was charged',
  cash_reopen: 'Why the cash confirmation was reversed',
}

const CASH_CONFIRMER_LABEL: Record<NonNullable<CashFacts['confirmed_by']>, string> = {
  driver: 'By driver',
  admin: 'By admin',
  system: 'By the system',
}

function buildFacts(p: PaymentSnapshot, link: LinkCopyState, cash: CashFacts | null = null): Fact[] {
  const facts: Fact[] = []
  const isCash = p.mode === 'cash_guarantee'
  const cur = p.currency
  const push = (key: string, caption: string, value: React.ReactNode | null) => {
    if (value !== null && value !== undefined) facts.push({ key, caption, value })
  }

  if (p.amount_minor !== null) {
    push('booked', 'Booked amount', <span style={amountStyle}>{money(p.amount_minor, cur)}</span>)
  }
  push('card', 'Card on file', p.card_saved ? 'Saved' : 'Not saved')
  // UI-SPEC 5.2: no hold is ever placed on a cash booking, so no hold facts.
  if (isCash && p.amount_minor !== null && (p.state === 'card_saved' || p.state === 'failed')) {
    push('cash_due', 'Cash to collect', <span style={amountStyle}>{money(p.amount_minor, cur)}</span>)
  }
  if (isCash && p.state === 'cash_settled') {
    const who = cash?.confirmed_by ? CASH_CONFIRMER_LABEL[cash.confirmed_by] : null
    const when = formatPragueFull(cash?.confirmed_at)
    push('cash_confirmed', 'Cash confirmed', [who, when].filter(Boolean).join(', ') || null)
  }
  if (!isCash && p.state === 'card_saved') push('hold_at', 'Hold planned for', formatPragueFull(p.hold_at))
  if (!isCash && p.hold_amount_minor !== null) {
    push('held', 'Held amount', <span style={amountStyle}>{money(p.hold_amount_minor, cur)}</span>)
  }
  if (!isCash && p.state === 'authorized') {
    const when = formatPragueFull(p.capture_before)
    push('expires', 'Hold expires', when ? `${when} (Prague time)` : null)
  }
  if (p.captured_amount_minor > 0) {
    push('captured', 'Captured', <span style={amountStyle}>{money(p.captured_amount_minor, cur)}</span>)
  }
  if (!isCash && ['captured', 'balance_due', 'failed'].includes(p.state) && p.amount_minor !== null) {
    const due = p.amount_minor - p.captured_amount_minor
    if (due > 0) push('balance', 'Balance due', <span style={amountStyle}>{money(due, cur)}</span>)
  }
  if (p.last_payment_error) {
    push('error', 'Last error', (
      <span style={{ overflowWrap: 'anywhere' }}>
        {friendlyError(p.last_payment_error)}{' '}
        <span style={{ color: 'var(--admin-text-muted)' }}>({p.last_payment_error})</span>
      </span>
    ))
  }
  if (p.state === 'failed') {
    // D-13: one automatic retry is scheduled while payment_retry_count is 0 and a time is set.
    const scheduled = p.payment_retry_at && p.payment_retry_count < 1 ? formatPragueFull(p.payment_retry_at) : null
    push('retry', 'Automatic retry', scheduled ? `Once, at ${scheduled}` : 'No more automatic retries')
  }
  // Operator notes about the cash decisions: admin-only, shown here and never in the payment history.
  if (cash && cash.notes.length > 0) {
    push('cash_notes', 'Notes', (
      <ul aria-label="Cash notes" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {cash.notes.map((n, i) => (
          <li key={`${n.created_at}-${i}`} style={{ overflowWrap: 'anywhere' }}>
            <span style={labelStyle}>{CASH_NOTE_LABEL[n.kind] ?? n.kind}: </span>
            {n.note}
          </li>
        ))}
      </ul>
    ))
  }
  if (p.recovery_link_url) {
    push('link', 'Payment link', (
      <span style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
        <span>Sent</span>
        <button type="button" onClick={link.onCopy} style={{ ...outlineButtonStyle, display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '0 16px' }}>
          {link.copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
          <span aria-live="polite">{link.copied ? 'Copied' : 'Copy link'}</span>
        </button>
        {link.manual && (
          <span id={link.fallbackId} style={{ ...labelStyle, flexBasis: '100%', overflowWrap: 'anywhere', userSelect: 'all' }}>
            {p.recovery_link_url}
          </span>
        )}
      </span>
    ))
  }
  return facts
}

function FactsGrid({ facts }: { facts: Fact[] }) {
  if (facts.length === 0) return null
  return (
    <dl className="grid grid-cols-1 sm:grid-cols-2" style={{ gap: '16px', margin: '16px 0 0' }}>
      {facts.map(f => (
        <div key={f.key} style={{ minWidth: 0 }}>
          <dt style={{ ...labelStyle, marginBottom: '4px' }}>{f.caption}</dt>
          <dd style={{ ...bodyStyle, margin: 0, minWidth: 0 }}>{f.value}</dd>
        </div>
      ))}
    </dl>
  )
}

// ── history ──────────────────────────────────────────────────────────────────

function HistoryList({ events, total, hasFeeCase }: { events: PaymentEventRow[]; total: number; hasFeeCase: boolean }) {
  const [showAll, setShowAll] = useState(false)
  const count = Math.max(total, events.length)
  const visible = showAll ? events : events.slice(0, HISTORY_PREVIEW)
  const canToggle = count > HISTORY_PREVIEW

  return (
    <div style={{ marginTop: '16px' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '8px' }}>
        <h4 style={{
          margin: 0, fontFamily: FONT, fontSize: 'var(--admin-fs-label)',
          fontWeight: 'var(--admin-fw-strong)', color: 'var(--admin-text)',
        }}>
          Payment history
        </h4>
        <span style={labelStyle}>Append-only. Entries cannot be edited.</span>
      </div>

      {events.length === 0 ? (
        <p style={{ ...bodyStyle, color: 'var(--admin-text-muted)', margin: '8px 0 0' }}>No payment events yet.</p>
      ) : (
        <ul aria-label="Payment history" style={{ listStyle: 'none', margin: '8px 0 0', padding: 0 }}>
          {visible.map(ev => {
            const when = formatPragueShort(ev.created_at)
            const actor = ACTOR_LABEL[ev.actor_type] ?? ev.actor_type
            return (
              <li
                key={ev.id}
                className="grid grid-cols-[1fr_auto] sm:grid-cols-[8rem_1fr_7rem_12rem]"
                style={{ columnGap: '8px', rowGap: '4px', padding: '8px 0', borderTop: '1px solid var(--admin-border)', alignItems: 'baseline' }}
              >
                <span className="order-3 sm:order-none" style={{ ...labelStyle, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                  {when ?? ''}
                </span>
                <span className="order-1 sm:order-none" style={{ ...bodyStyle, minWidth: 0, overflowWrap: 'anywhere' }}>
                  {eventLabel(ev.kind, hasFeeCase)}
                  {ev.error_code && (
                    <span style={{ ...labelStyle, marginInlineStart: '8px' }}>{ev.error_code}</span>
                  )}
                </span>
                <span className="order-2 sm:order-none" style={{ ...bodyStyle, ...amountStyle, textAlign: 'right' }}>
                  {ev.amount_minor !== null ? money(ev.amount_minor, ev.currency) : ''}
                </span>
                <span
                  className="order-4 sm:order-none"
                  style={{ ...labelStyle, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'right' }}
                >
                  <span style={{ color: 'var(--admin-text)' }}>{actor}</span>
                  {ev.actor_type === 'admin' && ev.actor_id && <span> {ev.actor_id}</span>}
                </span>
              </li>
            )
          })}
        </ul>
      )}

      {canToggle && (
        <button
          type="button"
          aria-expanded={showAll}
          onClick={() => setShowAll(v => !v)}
          style={{
            minHeight: '44px', padding: '0 8px', background: 'transparent', border: 'none',
            color: 'var(--admin-accent-text)', fontFamily: FONT, fontSize: 'var(--admin-fs-body)',
            fontWeight: 'var(--admin-fw-strong)', cursor: 'pointer',
          }}
        >
          {showAll ? 'Show fewer' : `Show all ${count}`}
        </button>
      )}
    </div>
  )
}

// ── shell ────────────────────────────────────────────────────────────────────

const cardStyle: React.CSSProperties = {
  marginTop: '16px',
  padding: '16px',
  background: 'var(--admin-surface)',
  border: '1px solid var(--admin-border)',
  borderRadius: 'var(--admin-radius-md)',
}

function PanelHeader({ children }: { children?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
      <h3 style={{
        margin: 0, fontFamily: 'var(--admin-font-heading)', fontSize: 'var(--admin-fs-heading)',
        fontWeight: 'var(--admin-fw-heading)', color: 'var(--admin-text)',
      }}>
        Payment
      </h3>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>{children}</div>
    </div>
  )
}

// ── alert banner (D-14, HOLD-05, D-20) ───────────────────────────────────────

const HOUR_MS = 3_600_000
const NO_HOLD_STATES = ['card_saved', 'failed', 'expired', 'placing_hold', 'checkout_pending']

/** Amount still owed on the booking: booked minus captured (null when the price is unknown). */
function outstandingMinor(p: PaymentSnapshot): number | null {
  if (p.amount_minor === null) return null
  const due = p.amount_minor - p.captured_amount_minor
  return due > 0 ? due : p.amount_minor
}

function refundFailedBanner(p: PaymentSnapshot): BannerSpec {
  const amount = p.amount_minor !== null ? ` of ${money(p.amount_minor, p.currency)}` : ''
  return {
    family: 'danger',
    title: 'Refund failed',
    body: `Booking ${p.booking_reference} was cancelled, but the refund${amount} did not go through. Refund it manually in the Stripe Dashboard. The operator alert was emailed to you.`,
  }
}

/**
 * UI-SPEC 5.2, first match. "Cash not confirmed" is information (info family, role status): D-21 says nothing happens
 * automatically because of it. The "driver reports cash not received" row is not built (D-21 reading, plan 89-14).
 */
function computeCashBanner(data: PaymentResponse): BannerSpec | null {
  const p = data.payment
  const amount = p.amount_minor !== null ? money(p.amount_minor, p.currency) : 'the amount'
  if (p.state === 'failed') {
    return {
      family: 'danger',
      title: 'Payment failed',
      body: p.completed
        ? 'The card was declined. The client was emailed a payment link.'
        : `The card was declined. Tell the driver to take ${amount} in cash.`,
    }
  }
  if (p.state === 'card_saved' && (data.cash?.unconfirmed ?? p.completed)) {
    return {
      family: 'info',
      title: 'Cash not confirmed',
      body: `The driver has not confirmed receiving ${amount} in cash. Nothing happens automatically. Mark it paid in cash, or charge the saved card.`,
    }
  }
  if (p.state === 'cash_settled') {
    const by = data.cash?.confirmed_by
    const who = by === 'driver' ? 'driver' : by === 'admin' ? 'operator' : 'system'
    const when = formatPragueFull(data.cash?.confirmed_at)
    return {
      family: 'info',
      title: 'Paid in cash',
      body: `${amount} was confirmed in cash by the ${who}${when ? ` on ${when}` : ''}. If this is wrong, you can reopen it.`,
    }
  }
  return null
}

/** First matching rule wins (UI-SPEC alert banner rules). */
function computeBanner(data: PaymentResponse, nowMs: number): BannerSpec | null {
  const p = data.payment
  if (data.refund_failed) return refundFailedBanner(p)
  // 88-REVIEW T2 (C-WR-03): a cancelled / no-show trip asks for no hold and no payment, so no hold banner applies.
  if (p.status === 'cancelled' || p.status === 'no_show') return null
  if (p.mode === 'cash_guarantee') return computeCashBanner(data)
  if (p.state === 'failed') {
    const retryAt = p.payment_retry_at && p.payment_retry_count < 1 ? formatPragueFull(p.payment_retry_at) : null
    return {
      family: 'danger',
      title: 'Payment failed',
      body: `The client was emailed a payment link. ${retryAt
        ? `Automatic retry at ${retryAt}, once.`
        : 'No automatic retries are left. Use Retry or Send payment link.'}`,
    }
  }
  if (p.state === 'balance_due') {
    const diff = p.amount_minor !== null ? p.amount_minor - p.captured_amount_minor : null
    return {
      family: 'danger',
      title: 'Balance unpaid',
      body: `The trip amount was captured, but ${diff !== null && diff > 0 ? money(diff, p.currency) : 'the difference'} was declined. The client was emailed a payment link.`,
    }
  }
  if (p.state === 'expired' && !p.completed) {
    return {
      family: 'amber',
      title: 'Hold expired',
      body: 'The hold ran out before the trip. It will be charged to the saved card after the trip, or place a new hold now.',
    }
  }
  if (p.state === 'authorized' && !p.completed && p.capture_before) {
    const endsMs = new Date(p.capture_before).getTime()
    if (!Number.isNaN(endsMs) && endsMs - nowMs <= 12 * HOUR_MS) {
      return {
        family: 'amber',
        title: 'Hold expires soon',
        body: `The hold ends on ${formatPragueFull(p.capture_before)}. Complete the trip before then or place a new hold.`,
      }
    }
  }
  if (NO_HOLD_STATES.includes(p.state) && !p.completed && p.pickup_at) {
    const pickupMs = new Date(p.pickup_at).getTime()
    if (!Number.isNaN(pickupMs) && pickupMs - nowMs <= 24 * HOUR_MS) {
      return {
        family: 'warn',
        title: 'No valid hold',
        body: 'Pickup is within 24 hours and this booking has no valid hold or payment.',
      }
    }
  }
  return null
}

/**
 * 88-REVIEW C-WR-05: the refund-failed flag is cleared by the operator once the refund (or hold release) was done by
 * hand in the Stripe Dashboard. Two steps (ask, then confirm); one audit row on the server, no money moves.
 */
function ResolveRefundControl({ bookingId, onDone }: { bookingId: string; onDone: () => void }) {
  const [step, setStep] = useState<'idle' | 'confirm' | 'saving' | 'error'>('idle')

  async function resolve() {
    setStep('saving')
    try {
      const res = await fetch(`/api/admin/bookings/${bookingId}/payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'resolve_refund' }),
      })
      if (res.ok || res.status === 422) {
        // 422: already resolved (another tab): the refetch shows the current state either way.
        setStep('idle')
        onDone()
        return
      }
      setStep('error')
    } catch {
      setStep('error')
    }
  }

  return (
    <div data-testid="resolve-refund" style={{ marginTop: '8px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
      {step === 'confirm' || step === 'saving' ? (
        <>
          <span style={bodyStyle}>Confirm only after the refund or release was done in the Stripe Dashboard.</span>
          <button type="button" style={outlineButtonStyle} disabled={step === 'saving'} onClick={() => { void resolve() }}>
            {step === 'saving' ? 'Saving…' : 'Yes, it is resolved'}
          </button>
          <button type="button" style={outlineButtonStyle} disabled={step === 'saving'} onClick={() => setStep('idle')}>
            Not yet
          </button>
        </>
      ) : (
        <>
          <button type="button" style={outlineButtonStyle} onClick={() => setStep('confirm')}>
            Mark refund resolved
          </button>
          {step === 'error' && (
            <span role="alert" style={{ ...bodyStyle, color: 'var(--status-danger-fg)' }}>Could not save. Try again.</span>
          )}
        </>
      )}
    </div>
  )
}

// ── actions and confirm modals (HOLD-07, T-88-17) ────────────────────────────

interface ConfirmCopy {
  title: string
  body: string
  primary: string
  secondary: string
  danger: boolean
}

function actionButtonLabel(action: PaymentActionName, completed: boolean): string {
  switch (action) {
    case 'capture': return 'Capture'
    case 'retry': return completed ? 'Retry charge' : 'Place hold now'
    case 'send_link': return 'Send payment link'
    case 'release': return 'Release hold'
    case 'waive': return 'Waive balance'
    // The fee / cash display names open their own dialogs (actionLabel in PanelBody names them).
    default: return action
  }
}

function confirmCopy(action: PaymentActionName, p: PaymentSnapshot): ConfirmCopy {
  const ref = p.booking_reference
  const due = outstandingMinor(p)
  const text = (minor: number | null) => (minor !== null ? money(minor, p.currency) : 'the amount')
  const withAmount = (prefix: string, minor: number | null) => (minor !== null ? `${prefix} ${money(minor, p.currency)}` : prefix)
  switch (action) {
    case 'capture': {
      const amount = due ?? p.hold_amount_minor
      return {
        title: 'Capture payment',
        body: `Charge ${text(amount)} to the client's card for booking ${ref} now? The hold becomes the final charge. Refunds are made in Stripe.`,
        primary: withAmount('Capture', amount),
        secondary: "Don't capture",
        danger: false,
      }
    }
    case 'retry': {
      if (!p.completed) {
        const amount = p.amount_minor ?? p.hold_amount_minor
        return {
          title: 'Place hold now',
          body: `Hold ${text(amount)} on the client's saved card for booking ${ref}? A hold is not a charge.`,
          primary: 'Place hold',
          secondary: "Don't place hold",
          danger: false,
        }
      }
      return {
        title: 'Retry charge',
        body: `Charge ${text(due)} to the client's saved card for booking ${ref}? If it is declined, the client gets a payment link.`,
        primary: withAmount('Charge', due),
        secondary: "Don't charge",
        danger: false,
      }
    }
    case 'send_link':
      return {
        title: 'Send payment link',
        body: `Email a payment link for ${text(due)} to ${p.client_email ?? 'the client'}? Any older link stops working.`,
        primary: 'Send link',
        secondary: "Don't send link",
        danger: false,
      }
    case 'release':
      if (p.mode === 'cash_guarantee') {
        return {
          title: 'Release saved card',
          body: `Release the saved card for booking ${ref}? Nothing will be charged and the client's card is released. This cannot be undone.`,
          primary: 'Release saved card',
          secondary: 'Keep saved card',
          danger: true,
        }
      }
      return {
        title: 'Release hold',
        body: `Release the hold of ${text(p.hold_amount_minor ?? p.amount_minor)} for booking ${ref}? Nothing will be charged and the client's card is released. This cannot be undone.`,
        primary: 'Release hold',
        secondary: 'Keep hold',
        danger: true,
      }
    case 'waive':
      return {
        title: 'Waive balance',
        body: `Write off the unpaid ${text(p.amount_minor !== null ? p.amount_minor - p.captured_amount_minor : null)} for booking ${ref}? The client will not be asked to pay it. This cannot be undone.`,
        primary: 'Waive balance',
        secondary: 'Keep balance',
        danger: true,
      }
    default:
      // Never reached: the fee / cash names open their own dialogs, not this confirmation.
      return { title: action, body: '', primary: action, secondary: 'Cancel', danger: false }
  }
}

const COPY_DONE = 'Done. The payment history is updated.'
const COPY_DECLINED = 'The card was declined. The client was emailed a payment link.'

function ConfirmDialog({
  copy, submitting, error, onConfirm, onDismiss,
}: {
  copy: ConfirmCopy
  submitting: boolean
  error: string | null
  onConfirm: () => void
  onDismiss: () => void
}) {
  const dismissRef = useRef<HTMLButtonElement>(null)

  // Money actions open with focus on the safe choice. Deferred one tick so Modal records the
  // trigger button (for focus return) before focus moves.
  useEffect(() => {
    const t = setTimeout(() => dismissRef.current?.focus(), 0)
    return () => clearTimeout(t)
  }, [])

  const primaryColors = copy.danger
    ? { background: 'var(--admin-danger-solid)', color: 'var(--admin-on-danger)' }
    : { background: 'var(--admin-accent)', color: 'var(--admin-on-accent)' }

  return (
    <>
      <p style={{ ...bodyStyle, margin: 0, overflowWrap: 'anywhere' }}>{copy.body}</p>
      {error && (
        <p role="alert" style={{ ...bodyStyle, color: 'var(--status-danger-fg)', margin: '16px 0 0' }}>{error}</p>
      )}
      <div className="flex flex-col sm:flex-row" style={{ gap: '8px', marginTop: '24px' }}>
        <button
          type="button"
          onClick={onConfirm}
          disabled={submitting}
          style={{
            ...outlineButtonStyle,
            ...primaryColors,
            border: 'none',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
            opacity: submitting ? 0.7 : 1,
            cursor: submitting ? 'not-allowed' : 'pointer',
            ...amountStyle,
          }}
        >
          {submitting && <LoaderCircle size={16} aria-hidden="true" className="animate-spin motion-reduce:animate-none" />}
          {submitting ? 'Working…' : copy.primary}
        </button>
        <button
          ref={dismissRef}
          type="button"
          onClick={onDismiss}
          disabled={submitting}
          style={{ ...outlineButtonStyle, opacity: submitting ? 0.7 : 1, cursor: submitting ? 'not-allowed' : 'pointer' }}
        >
          {copy.secondary}
        </button>
      </div>
    </>
  )
}

type LoadState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; data: PaymentResponse }

function isPaymentResponse(value: unknown): value is PaymentResponse {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return !!v.payment && typeof v.payment === 'object' && Array.isArray(v.events)
}

export default function PaymentPanel({ bookingId, refreshKey = 0, paymentMode, onPaymentState }: PaymentPanelProps) {
  const [load, setLoad] = useState<LoadState>({ status: 'loading' })
  const [reloadTick, setReloadTick] = useState(0)

  const loadedState = load.status === 'ready' ? load.data.payment.state : null
  const reportRef = useRef(onPaymentState)
  reportRef.current = onPaymentState
  useEffect(() => {
    if (loadedState) reportRef.current?.(loadedState)
  }, [loadedState])

  // A known non-card booking never shows a skeleton or a load error: its panel only exists for a
  // refund_failed answer (D-20).
  // `undefined` = standalone use (unknown): behave as a card booking. `null` = the list has no mode.
  const quiet = paymentMode !== undefined && paymentMode !== 'card_hold' && paymentMode !== 'cash_guarantee'

  const fetchPayment = useCallback(async (signal: { cancelled: boolean }) => {
    try {
      const res = await fetch(`/api/admin/bookings/${bookingId}/payment`)
      if (!res.ok) throw new Error(`payment ${res.status}`)
      const body: unknown = await res.json()
      if (!isPaymentResponse(body)) throw new Error('payment shape')
      if (!signal.cancelled) setLoad({ status: 'ready', data: body })
    } catch {
      if (!signal.cancelled) setLoad(prev => (prev.status === 'ready' ? prev : { status: 'error' }))
    }
  }, [bookingId])

  useEffect(() => {
    const signal = { cancelled: false }
    // Keep showing the previous data while a refetch is in flight (no skeleton flash).
    setLoad(prev => (prev.status === 'ready' ? prev : { status: 'loading' }))
    void fetchPayment(signal)
    return () => { signal.cancelled = true }
  }, [fetchPayment, refreshKey, reloadTick])

  if (load.status === 'loading') {
    if (quiet) return null
    return (
      <div data-testid="payment-panel" style={cardStyle} onClick={(e) => e.stopPropagation()}>
        <PanelHeader />
        <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px', minHeight: '80px' }} aria-busy="true">
          {[0, 1, 2].map(i => (
            <div
              key={i}
              data-testid="payment-skeleton-row"
              style={{ height: '16px', background: 'var(--admin-hover)', borderRadius: 'var(--admin-radius-sm)' }}
            />
          ))}
        </div>
      </div>
    )
  }

  if (load.status === 'error') {
    if (quiet) return null
    return (
      <div data-testid="payment-panel" style={cardStyle} onClick={(e) => e.stopPropagation()}>
        <PanelHeader />
        <p role="alert" style={{ ...bodyStyle, color: 'var(--status-danger-fg)', margin: '16px 0 8px' }}>
          Could not load payment details.
        </p>
        <button type="button" style={outlineButtonStyle} onClick={() => setReloadTick(t => t + 1)}>
          Reload payment details
        </button>
      </div>
    )
  }

  const { data } = load
  // Phase 89: a card or cash booking gets the whole panel; any other booking (pay-now) only when it has a fee case.
  const hasPanel =
    data.payment.mode === 'card_hold' ||
    data.payment.mode === 'cash_guarantee' ||
    !!data.fee_case ||
    data.allowed_actions.includes('open_fee_case')
  if (!hasPanel && !data.refund_failed) return null

  // D-20: any payment mode. A non-card booking (legacy pay-now) gets only the Refund failed banner.
  if (!hasPanel) {
    return (
      <div data-testid="payment-refund-failed" onClick={(e) => e.stopPropagation()}>
        <div style={{ marginTop: '16px' }}><RefundFailedBadge /></div>
        <AlertBanner spec={refundFailedBanner(data.payment)} />
        <ResolveRefundControl bookingId={bookingId} onDone={() => setReloadTick(t => t + 1)} />
      </div>
    )
  }

  return (
    <PanelBody
      bookingId={bookingId}
      data={data}
      onRefetch={() => setReloadTick(t => t + 1)}
    />
  )
}


const EXECUTABLE_ACTIONS: readonly PaymentActionName[] = ['capture', 'retry', 'send_link', 'release', 'waive']
const KNOWN_ACTIONS: readonly PaymentActionName[] = [
  ...EXECUTABLE_ACTIONS, 'charge_fee', 'waive_fee', 'charge_saved_card', 'mark_cash_settled', 'reopen_cash', 'close_refunded', 'open_fee_case',
]

const FEE_CASE_LABEL: Record<string, string> = {
  late_cancel: 'Late cancellation',
  no_show: 'No-show',
  cash_not_paid: 'Cash not paid',
}
const FEE_STATUS_LABEL: Record<string, string> = {
  pending: 'Decision needed',
  charged: 'Charged',
  waived: 'Waived',
}

function evidenceText(evidence: Record<string, unknown>, key: string): string | null {
  const v = evidence[key]
  return typeof v === 'string' && v ? v : null
}

/** The four-row evidence list of a no-show (UI-SPEC 4.2). Rows without a value are not rendered. */
function EvidenceList({ evidence }: { evidence: Record<string, unknown> }) {
  const threshold = typeof evidence.threshold_min === 'number' ? evidence.threshold_min : null
  const kind = typeof evidence.airport === 'boolean' ? (evidence.airport ? 'airport' : 'city') : null
  const rows: Array<[string, string | null]> = [
    ['Pickup time', formatPragueFull(evidenceText(evidence, 'pickup_utc'))],
    ['Driver arrived', formatPragueFull(evidenceText(evidence, 'on_location_at'))],
    ['No-show requested', formatPragueFull(evidenceText(evidence, 'requested_at'))],
    ['Wait threshold', threshold !== null ? `${threshold} min${kind ? ` (${kind})` : ''}` : null],
  ]
  const shown = rows.filter(([, value]) => value !== null)
  if (shown.length === 0) return null
  return (
    <ul aria-label="Evidence" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
      {shown.map(([caption, value]) => (
        <li key={caption} style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          <span style={labelStyle}>{caption}</span>
          <span style={bodyStyle}>{value}</span>
        </li>
      ))}
    </ul>
  )
}

function buildFeeFacts(c: FeeCaseFacts): Fact[] {
  const facts: Fact[] = []
  const push = (key: string, caption: string, value: React.ReactNode | null) => {
    if (value !== null && value !== undefined && value !== '') facts.push({ key, caption, value })
  }
  push('case', 'Case', FEE_CASE_LABEL[c.kind] ?? c.kind)
  push('status', 'Status', FEE_STATUS_LABEL[c.status] ?? c.status)
  push('proposed', 'Proposed fee', <span style={amountStyle}>{money(c.proposed_minor, c.currency)}</span>)
  if (c.charged_minor !== null) {
    push('charged', 'Charged fee', <span style={amountStyle}>{money(c.charged_minor, c.currency)}</span>)
  }
  push('opened', 'Opened', formatPragueFull(c.opened_at))
  const decidedAt = formatPragueFull(c.decided_at)
  const decided = [c.decided_by, decidedAt].filter(Boolean).join(', ')
  push('decided', 'Decided by and when', decided || null)
  // Operator text: admin-only. It is shown here and nowhere in the payment history.
  push('reason', 'Reason', c.reason ? <span style={{ overflowWrap: 'anywhere' }}>{c.reason}</span> : null)
  push('contact', 'Contact attempt', c.contact_note ? <span style={{ overflowWrap: 'anywhere' }}>{c.contact_note}</span> : null)
  if (c.kind === 'no_show') push('evidence', 'Evidence', <EvidenceList evidence={c.evidence} />)
  return facts
}

function FeeBlock({ feeCase }: { feeCase: FeeCaseFacts }) {
  return (
    <div data-testid="fee-block" style={{ marginTop: '16px' }}>
      <h4 style={{
        margin: 0, fontFamily: FONT, fontSize: 'var(--admin-fs-label)',
        fontWeight: 'var(--admin-fw-strong)', color: 'var(--admin-text)',
      }}>
        Fee
      </h4>
      {feeCase.charge_in_flight && (
        <p role="status" style={{ ...labelStyle, margin: '8px 0 0' }}>
          A charge is in progress. If this stays, press Charge fee again: the same amount is retried and another amount is refused.
        </p>
      )}
      <FactsGrid facts={buildFeeFacts(feeCase)} />
    </div>
  )
}

function actionLabel(action: PaymentActionName, p: PaymentSnapshot): string {
  switch (action) {
    case 'charge_fee': return 'Charge fee…'
    case 'waive_fee': return 'Waive fee…'
    case 'charge_saved_card': return 'Charge saved card…'
    case 'mark_cash_settled': return 'Mark paid in cash…'
    case 'reopen_cash': return 'Reopen as unpaid…'
    case 'close_refunded': return 'Close: refunded by hand…'
    case 'open_fee_case': return 'Open fee case…'
    case 'release': return p.mode === 'cash_guarantee' ? 'Release saved card' : 'Release hold'
    default: return actionButtonLabel(action, p.completed)
  }
}

function PanelBody({ bookingId, data, onRefetch }: { bookingId: string; data: PaymentResponse; onRefetch: () => void }) {
  const p = data.payment
  const feeCase = data.fee_case ?? null
  const [modal, setModal] = useState<PaymentActionName | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [modalError, setModalError] = useState<string | null>(null)
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'manual'>('idle')
  const inFlight = useRef(false)
  const linkFallbackId = `payment-link-url-${bookingId}`

  // The result line clears after 8 s (or on the next action).
  useEffect(() => {
    if (!result) return
    const t = setTimeout(() => setResult(null), 8000)
    return () => clearTimeout(t)
  }, [result])

  useEffect(() => {
    if (copyState !== 'copied') return
    const t = setTimeout(() => setCopyState('idle'), 2000)
    return () => clearTimeout(t)
  }, [copyState])

  const openModal = (action: PaymentActionName) => {
    setResult(null)
    setModalError(null)
    setModal(action)
  }

  const closeModal = () => {
    if (submitting) return // cannot be dismissed while a money action is in flight
    setModal(null)
    setModalError(null)
  }

  // The fee / cash dialogs own their request state; they close through here and report one result line.
  const closeDialog = () => setModal(null)
  const showResult = (r: DecisionResult) => setResult(r)

  async function confirm() {
    if (!modal || !EXECUTABLE_ACTIONS.includes(modal) || inFlight.current) return
    const action = modal
    inFlight.current = true
    setSubmitting(true)
    setModalError(null)
    setResult(null)
    try {
      // T-88-17: the body carries the action name only; the server decides and re-checks everything.
      const res = await fetch(`/api/admin/bookings/${bookingId}/payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const body: { outcome?: string; error?: string } | null = await res.json().catch(() => null)
      if (res.ok) {
        setModal(null)
        setResult(body?.outcome === 'declined' ? { ok: false, text: COPY_DECLINED } : { ok: true, text: COPY_DONE })
        onRefetch()
      } else if (res.status === 409 && body?.error === 'payment_busy') {
        setModalError(COPY_BUSY)
      } else if (res.status === 422) {
        setModal(null)
        setResult({ ok: false, text: COPY_GONE })
        onRefetch()
      } else if (res.status === 401 || res.status === 403) {
        setModalError(COPY_SESSION)
      } else if (res.status >= 500) {
        // e.g. send_link 502 email_failed: the new link exists (the old one is deactivated). Refetch so the facts grid
        // never offers the deactivated link for copying.
        setModalError(COPY_PARTIAL)
        onRefetch()
      } else {
        setModalError(COPY_GENERIC)
      }
    } catch {
      setModalError(COPY_PARTIAL)
      onRefetch()
    } finally {
      inFlight.current = false
      setSubmitting(false)
    }
  }

  async function copyLink() {
    if (!p.recovery_link_url) return
    const copied = await copyPaymentLinkToClipboard(p.recovery_link_url, linkFallbackId)
    setCopyState(copied ? 'copied' : 'manual')
  }

  const banner = computeBanner(data, Date.now())
  // T-89-58: buttons come only from the server's allowed_actions. A waive is hidden while a charge holds the amount lock.
  const actions = data.allowed_actions.filter(
    a => KNOWN_ACTIONS.includes(a) && !(a === 'waive_fee' && feeCase?.charge_in_flight),
  )
  const modalCopy = modal && EXECUTABLE_ACTIONS.includes(modal) ? confirmCopy(modal, p) : null

  return (
    <div data-testid="payment-panel" style={cardStyle} onClick={(e) => e.stopPropagation()}>
      <PanelHeader>
        {p.mode === 'cash_guarantee' && <CashChip />}
        {p.mode !== 'pay_now' && <PaymentStateBadge state={p.state} mode={p.mode} completed={p.completed} />}
        {data.refund_failed && <RefundFailedBadge />}
      </PanelHeader>

      <FeeDecisionBanner payment={p} feeCase={feeCase} />
      {banner && <AlertBanner spec={banner} />}
      {data.refund_failed && <ResolveRefundControl bookingId={bookingId} onDone={onRefetch} />}

      {feeCase && <FeeBlock feeCase={feeCase} />}

      <FactsGrid
        facts={buildFacts(p, { copied: copyState === 'copied', manual: copyState === 'manual', onCopy: copyLink, fallbackId: linkFallbackId }, data.cash ?? null)}
      />

      {actions.length === 0 ? (
        <p style={{ ...bodyStyle, color: 'var(--admin-text-muted)', margin: '16px 0 0' }}>No actions available in this state.</p>
      ) : (
        <div className="flex flex-col sm:flex-row sm:flex-wrap" style={{ gap: '8px', marginTop: '16px' }}>
          {actions.map(action => (
            <button
              key={action}
              type="button"
              disabled={submitting}
              onClick={() => openModal(action)}
              style={{ ...outlineButtonStyle, opacity: submitting ? 0.6 : 1, cursor: submitting ? 'not-allowed' : 'pointer' }}
            >
              {actionLabel(action, p)}
            </button>
          ))}
        </div>
      )}

      {result && (
        <p
          role="status"
          style={{
            margin: '8px 0 0', fontFamily: FONT, fontSize: 'var(--admin-fs-label)',
            color: result.ok ? 'var(--status-ok-fg)' : 'var(--status-danger-fg)',
          }}
        >
          {result.text}
        </p>
      )}

      <HistoryList events={data.events} total={data.events_total} hasFeeCase={feeCase !== null} />

      <Modal isOpen={modalCopy !== null} onClose={closeModal} title={modalCopy?.title ?? ''}>
        {modalCopy && (
          <ConfirmDialog
            copy={modalCopy}
            submitting={submitting}
            error={modalError}
            onConfirm={() => { void confirm() }}
            onDismiss={closeModal}
          />
        )}
      </Modal>

      <CashCardChargeModal
        isOpen={modal === 'charge_saved_card'}
        bookingId={bookingId}
        payment={p}
        onClose={closeDialog}
        onResult={showResult}
        onRefetch={onRefetch}
      />
      <MarkCashModal
        isOpen={modal === 'mark_cash_settled'}
        bookingId={bookingId}
        payment={p}
        onClose={closeDialog}
        onResult={showResult}
        onRefetch={onRefetch}
      />
      <ReopenCashModal
        isOpen={modal === 'reopen_cash'}
        bookingId={bookingId}
        payment={p}
        onClose={closeDialog}
        onResult={showResult}
        onRefetch={onRefetch}
      />
      <FeeCloseRefundedModal
        isOpen={modal === 'close_refunded'}
        bookingId={bookingId}
        onClose={closeDialog}
        onResult={showResult}
        onRefetch={onRefetch}
      />
      <FeeOpenCaseModal
        isOpen={modal === 'open_fee_case'}
        bookingId={bookingId}
        onClose={closeDialog}
        onResult={showResult}
        onRefetch={onRefetch}
      />

      {feeCase && (
        <FeeWaiveModal
          isOpen={modal === 'waive_fee'}
          bookingId={bookingId}
          payment={p}
          feeCase={feeCase}
          onClose={closeDialog}
          onResult={showResult}
          onRefetch={onRefetch}
        />
      )}

      {feeCase && (
        <FeeChargeModal
          isOpen={modal === 'charge_fee'}
          bookingId={bookingId}
          payment={p}
          feeCase={feeCase}
          onClose={closeDialog}
          onResult={showResult}
          onRefetch={onRefetch}
        />
      )}
    </div>
  )
}
