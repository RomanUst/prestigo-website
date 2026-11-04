'use client'
import { useCallback, useEffect, useState } from 'react'
import { formatMinor, type PaymentCurrency } from '@/lib/payments/money'
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

function buildFacts(p: PaymentSnapshot): Fact[] {
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
  const p = data.payment
  const isCard = p.mode === 'card_hold'
  if (!isCard && !data.refund_failed) return null

  return (
    <div data-testid="payment-panel" style={cardStyle} onClick={(e) => e.stopPropagation()}>
      <PanelHeader>
        <PaymentStateBadge state={p.state} />
        {data.refund_failed && <RefundFailedBadge />}
      </PanelHeader>
      <FactsGrid facts={buildFacts(p)} />
      <HistoryList events={data.events} total={data.events_total} />
    </div>
  )
}
