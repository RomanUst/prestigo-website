'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Copy, LoaderCircle, TriangleAlert } from 'lucide-react'
import { formatMinor, type PaymentCurrency } from '@/lib/payments/money'
import { copyPaymentLinkToClipboard } from '@/lib/ui/payment-link-display'
import { Modal } from './Modal'
import { PaymentStateBadge, RefundFailedBadge } from './PaymentStateBadge'

// Phase 88-07 (HOLD-07, PAYF-01, D-14, D-20): self-contained admin payment panel. It fetches
// GET /api/admin/bookings/[id]/payment itself (route built in plan 88-15) so Phase 90's
// BookingDetailPanel extraction only moves it. No polling: it refetches on mount, when
// `refreshKey` changes (a trip edit) and after any action.
//
// Colour comes only from var(--admin-*) / var(--status-*) tokens (tests/admin-no-hardcoded-colors).

// ── API contract ─────────────────────────────────────────────────────────────

export type PaymentActionName = 'capture' | 'retry' | 'release' | 'waive' | 'send_link'

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
}

// ── formatting ───────────────────────────────────────────────────────────────

const PRAGUE_TZ = 'Europe/Prague'
const HISTORY_PREVIEW = 5

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
function formatPragueShort(iso: string | null | undefined): string | null {
  return pragueStamp(iso, false)
}

function money(amountMinor: number, currency: string | null | undefined): string {
  return formatMinor(amountMinor, currency === 'czk' ? 'czk' : 'eur')
}

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

function eventLabel(kind: string): string {
  return Object.prototype.hasOwnProperty.call(EVENT_LABELS, kind) ? EVENT_LABELS[kind] : kind
}

function friendlyError(code: string): string {
  return Object.prototype.hasOwnProperty.call(ERROR_TEXT, code) ? ERROR_TEXT[code] : 'Payment error'
}

// ── shared styles (tokens only) ──────────────────────────────────────────────

const FONT = 'var(--font-montserrat)'

const labelStyle: React.CSSProperties = {
  fontFamily: FONT,
  fontSize: 'var(--admin-fs-label)',
  color: 'var(--admin-text-muted)',
}

const bodyStyle: React.CSSProperties = {
  fontFamily: FONT,
  fontSize: 'var(--admin-fs-body)',
  color: 'var(--admin-text)',
}

const amountStyle: React.CSSProperties = {
  whiteSpace: 'nowrap',
  fontVariantNumeric: 'tabular-nums',
}

const outlineButtonStyle: React.CSSProperties = {
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

function buildFacts(p: PaymentSnapshot, link: LinkCopyState): Fact[] {
  const facts: Fact[] = []
  const cur = p.currency
  const push = (key: string, caption: string, value: React.ReactNode | null) => {
    if (value !== null && value !== undefined) facts.push({ key, caption, value })
  }

  if (p.amount_minor !== null) {
    push('booked', 'Booked amount', <span style={amountStyle}>{money(p.amount_minor, cur)}</span>)
  }
  push('card', 'Card on file', p.card_saved ? 'Saved' : 'Not saved')
  if (p.state === 'card_saved') push('hold_at', 'Hold planned for', formatPragueFull(p.hold_at))
  if (p.hold_amount_minor !== null) {
    push('held', 'Held amount', <span style={amountStyle}>{money(p.hold_amount_minor, cur)}</span>)
  }
  if (p.state === 'authorized') {
    const when = formatPragueFull(p.capture_before)
    push('expires', 'Hold expires', when ? `${when} (Prague time)` : null)
  }
  if (p.captured_amount_minor > 0) {
    push('captured', 'Captured', <span style={amountStyle}>{money(p.captured_amount_minor, cur)}</span>)
  }
  if (['captured', 'balance_due', 'failed'].includes(p.state) && p.amount_minor !== null) {
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

function HistoryList({ events, total }: { events: PaymentEventRow[]; total: number }) {
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
                  {eventLabel(ev.kind)}
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

type BannerFamily = 'danger' | 'amber' | 'warn'
interface BannerSpec {
  family: BannerFamily
  title: string
  body: string
}

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

/** First matching rule wins (UI-SPEC alert banner rules). */
function computeBanner(data: PaymentResponse, nowMs: number): BannerSpec | null {
  const p = data.payment
  if (data.refund_failed) return refundFailedBanner(p)
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

function AlertBanner({ spec }: { spec: BannerSpec }) {
  return (
    <div
      role={spec.family === 'danger' ? 'alert' : 'status'}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: '8px', marginTop: '16px', padding: '16px',
        background: `var(--status-${spec.family}-bg)`,
        border: `1px solid var(--status-${spec.family}-border)`,
        borderRadius: 'var(--admin-radius-md)',
      }}
    >
      <TriangleAlert size={20} aria-hidden="true" style={{ flexShrink: 0, color: `var(--status-${spec.family}-fg)` }} />
      <div style={{ ...bodyStyle, minWidth: 0 }}>
        <strong style={{ display: 'block', fontWeight: 'var(--admin-fw-strong)', color: `var(--status-${spec.family}-fg)` }}>
          {spec.title}
        </strong>
        <span style={{ overflowWrap: 'anywhere' }}>{spec.body}</span>
      </div>
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
  }
}

const COPY_BUSY = 'Payment is being processed. Wait a moment and try again.'
const COPY_GENERIC = 'Could not complete the action. Nothing was changed. Try again.'
const COPY_SESSION = 'Your session has ended. Sign in again.'
const COPY_GONE = 'That action is no longer available. The panel shows the current state.'
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

export default function PaymentPanel({ bookingId, refreshKey = 0, paymentMode }: PaymentPanelProps) {
  const [load, setLoad] = useState<LoadState>({ status: 'loading' })
  const [reloadTick, setReloadTick] = useState(0)

  // A known non-card booking never shows a skeleton or a load error: its panel only exists for a
  // refund_failed answer (D-20).
  // `undefined` = standalone use (unknown): behave as a card booking. `null` = the list has no mode.
  const quiet = paymentMode !== undefined && paymentMode !== 'card_hold'

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
  const isCard = data.payment.mode === 'card_hold'
  if (!isCard && !data.refund_failed) return null

  // D-20: any payment mode. A non-card booking (legacy pay-now) gets only the Refund failed banner.
  if (!isCard) {
    return (
      <div data-testid="payment-refund-failed" onClick={(e) => e.stopPropagation()}>
        <div style={{ marginTop: '16px' }}><RefundFailedBadge /></div>
        <AlertBanner spec={refundFailedBanner(data.payment)} />
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

const KNOWN_ACTIONS: readonly PaymentActionName[] = ['capture', 'retry', 'send_link', 'release', 'waive']

function PanelBody({ bookingId, data, onRefetch }: { bookingId: string; data: PaymentResponse; onRefetch: () => void }) {
  const p = data.payment
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

  async function confirm() {
    if (!modal || inFlight.current) return
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
      } else {
        setModalError(COPY_GENERIC)
      }
    } catch {
      setModalError(COPY_GENERIC)
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
  const actions = data.allowed_actions.filter(a => KNOWN_ACTIONS.includes(a))
  const modalCopy = modal ? confirmCopy(modal, p) : null

  return (
    <div data-testid="payment-panel" style={cardStyle} onClick={(e) => e.stopPropagation()}>
      <PanelHeader>
        <PaymentStateBadge state={p.state} />
        {data.refund_failed && <RefundFailedBadge />}
      </PanelHeader>

      {banner && <AlertBanner spec={banner} />}

      <FactsGrid
        facts={buildFacts(p, { copied: copyState === 'copied', manual: copyState === 'manual', onCopy: copyLink, fallbackId: linkFallbackId })}
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
              {actionButtonLabel(action, p.completed)}
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

      <HistoryList events={data.events} total={data.events_total} />

      <Modal isOpen={modal !== null} onClose={closeModal} title={modalCopy?.title ?? ''}>
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
    </div>
  )
}
