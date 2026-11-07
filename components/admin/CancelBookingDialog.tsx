'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent } from 'react'
import { Info, LoaderCircle, TriangleAlert } from 'lucide-react'
import { Modal } from './Modal'
import { formatPragueFull } from './PaymentPanel'
import { statusConflictMessage } from './statusConflict'
import { formatMinor, type PaymentCurrency } from '@/lib/payments/money'
import { czkToEur } from '@/lib/currency'
import {
  evaluateCancellation,
  policyFromSnapshot,
  proposedFeeMinor,
  tripFactsFromRow,
} from '@/lib/cancellation-policy'

// Phase 89 plan 16 (UI-SPEC Surface 3; D-20, D-05, D-07): the admin cancel dialog. The operator must say who
// cancelled; nothing is preselected and the primary stays disabled until a choice is made, because a wrong default
// would either charge a client or waive a fee. The outcome line previews the money effect from the same pure policy
// function the server uses, on the booking's stored snapshot. The preview never decides: the server recomputes.

export type CancelledBy = 'client' | 'prestigo'

/** The fields of a bookings row the dialog reads. Optional ones arrive through admin_search_bookings (b.*). */
export interface CancelDialogBooking {
  id: string
  booking_reference: string
  booking_source: 'online' | 'manual' | 'gnet'
  pickup_date: string
  pickup_time: string
  pickup_utc?: string | null
  trip_type: string
  distance_km?: number | null
  cancel_policy?: unknown
  payment_intent_id: string | null
  payment_mode?: string | null
  payment_state?: string | null
  payment_currency?: string | null
  payment_amount_minor?: number | string | null
  capture_before?: string | null
  stripe_payment_method_id?: string | null
  hold_payment_intent_id?: string | null
  amount_eur?: number | string | null
  leg: 'outbound' | 'return' | null
  linked_booking_id: string | null
  outbound_amount_czk: number | null
  return_amount_czk: number | null
  linked_booking: { booking_reference: string } | null
}

export type CancelSituation = 'pay_now' | 'card' | 'cash' | 'none' | 'card_collected'

export interface CancelOutcomeView {
  situation: CancelSituation
  /** True only when a fee decision will follow (a late client cancel on a booking that holds or kept money). */
  late: boolean
  sentence: string
  primary: string
}

export interface CancelDoneInfo {
  /** The hold or card was released (nothing charged). */
  released: boolean
  /** The money stays and a fee decision follows. */
  late: boolean
}

function num(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v)
  return null
}

function currencyOf(v: unknown): PaymentCurrency | null {
  return v === 'eur' || v === 'czk' ? v : null
}

const HOLDLESS_STATES = new Set(['', 'none', 'checkout_pending', 'released', 'cash_settled'])

function legAmountMinor(b: CancelDialogBooking): number | null {
  const czk = num(b.leg === 'outbound' ? b.outbound_amount_czk : b.return_amount_czk)
  if (czk === null || czk <= 0) return null
  const minor = Math.round(czkToEur(czk) * 100)
  return minor > 0 ? minor : null
}

/** A round-trip row: linked_booking_id is never written, so it can not say this (money CR-02). Display only, the server decides. */
function isLegCancel(b: CancelDialogBooking): boolean {
  return b.leg !== null && b.trip_type === 'round_trip'
}

/** Which row of the outcome table applies, and the amount a fee is a share of (null when unknown). */
export function situationOf(b: CancelDialogBooking): { situation: CancelSituation; base: { minor: number; currency: PaymentCurrency } | null } {
  if (b.booking_source === 'gnet') return { situation: 'none', base: null }
  const mode = b.payment_mode ?? null
  const state = b.payment_state ?? ''
  if (mode === 'card_hold' || mode === 'cash_guarantee') {
    const minor = num(b.payment_amount_minor)
    const currency = currencyOf(b.payment_currency)
    const base = minor !== null && minor > 0 && currency ? { minor, currency } : null
    if (state === 'captured' || state === 'balance_due') return { situation: 'card_collected', base }
    if (HOLDLESS_STATES.has(state)) return { situation: 'none', base: null }
    // A card (saved or held) must exist for a fee; rows that do not carry the columns are taken as having one.
    const columnsKnown = b.stripe_payment_method_id !== undefined || b.hold_payment_intent_id !== undefined
    const hasCard = !columnsKnown || Boolean(b.stripe_payment_method_id) || Boolean(b.hold_payment_intent_id)
    if (!hasCard) return { situation: 'none', base: null }
    return { situation: mode === 'cash_guarantee' ? 'cash' : 'card', base }
  }
  if (b.payment_intent_id) {
    if (isLegCancel(b)) {
      const minor = legAmountMinor(b)
      return { situation: 'pay_now', base: minor !== null ? { minor, currency: 'eur' } : null }
    }
    const eur = num(b.amount_eur)
    const minor = eur !== null && eur > 0 ? Math.round(eur * 100) : null
    return { situation: 'pay_now', base: minor !== null ? { minor, currency: 'eur' } : null }
  }
  return { situation: 'none', base: null }
}

function pickupFacts(b: CancelDialogBooking) {
  return tripFactsFromRow({
    trip_type: b.trip_type,
    distance_km: typeof b.distance_km === 'number' ? b.distance_km : null,
    pickup_utc: b.pickup_utc ?? null,
    pickup_date: b.pickup_date,
    pickup_time: b.pickup_time,
  })
}

/**
 * The one outcome row for a booking, who cancelled and the current time. Prestigo is always free. For the client the
 * policy the booking was made under decides; after the pickup time the admin route counts it as late (as the server does).
 */
export function outcomeFor(b: CancelDialogBooking, who: CancelledBy, nowMs: number): CancelOutcomeView {
  const { situation, base } = situationOf(b)

  let policyLate = false
  let feePercent = 100
  if (who === 'client') {
    const policy = policyFromSnapshot(b.cancel_policy)
    feePercent = policy.feePercent
    const facts = pickupFacts(b)
    if (facts) policyLate = evaluateCancellation(policy, facts, nowMs).kind !== 'free'
  }
  // A late cancel only matters where money is held or kept; the server opens no case otherwise.
  const late = policyLate && situation !== 'none'

  const amount = base ? formatMinor(base.minor, base.currency) : null
  const fee = base ? formatMinor(proposedFeeMinor(base.minor, feePercent), base.currency) : null
  const proposed = fee ? ` (proposed ${fee})` : ''
  const DECIDE = 'Cancel and decide the fee'

  switch (situation) {
    case 'pay_now':
      return late
        ? {
            situation, late,
            sentence: `Late. The booking is cancelled now. The ${amount ?? 'payment'} paid stays with Prestigo until you decide in the booking${proposed}. Waiving refunds it.`,
            primary: DECIDE,
          }
        : {
            situation, late,
            sentence: `Free. The full ${amount ?? 'payment'} is refunded to the client.`,
            primary: amount ? `Cancel and refund ${amount}` : 'Cancel and refund',
          }
    case 'card': {
      const until = b.capture_before ? formatPragueFull(b.capture_before) : null
      return late
        ? {
            situation, late,
            sentence: `Late. The booking is cancelled now. The hold stays in place${until ? ` (until ${until}, Prague time)` : ''} and you decide the fee in the booking${proposed}.`,
            primary: DECIDE,
          }
        : { situation, late, sentence: 'Free. The hold is released and nothing is charged.', primary: 'Cancel and release hold' }
    }
    case 'cash':
      return late
        ? {
            situation, late,
            sentence: `Late. The booking is cancelled now. You can charge the saved card up to ${amount ?? 'the booking amount'} in the booking, or waive.`,
            primary: DECIDE,
          }
        : { situation, late, sentence: 'Free. The saved card is released and nothing is charged.', primary: 'Cancel booking' }
    case 'card_collected':
      return late
        ? {
            situation, late,
            sentence: `Late. The booking is cancelled now. ${amount ?? 'The collected payment'} stays until you decide.`,
            primary: DECIDE,
          }
        : {
            situation, late,
            sentence: `Free. ${amount ?? 'The collected payment'} is refunded.`,
            primary: amount ? `Cancel and refund ${amount}` : 'Cancel and refund',
          }
    default:
      return { situation, late: false, sentence: 'Nothing was collected. Only the status changes.', primary: 'Cancel booking' }
  }
}

/** "{n} h before pickup", "less than 1 h before pickup" or "pickup time passed". */
export function hoursBeforePickupLabel(pickupMs: number | null, nowMs: number): string | null {
  if (pickupMs === null) return null
  const diff = pickupMs - nowMs
  if (diff <= 0) return 'pickup time passed'
  const hours = Math.floor(diff / 3_600_000)
  return hours < 1 ? 'less than 1 h before pickup' : `${hours} h before pickup`
}

const GENERIC_ERROR = 'Could not cancel the booking. Nothing was changed. Try again.'
const SESSION_ERROR = 'Your session has ended. Sign in again.'
const BUSY_ERROR = 'Payment is being processed. Wait a moment and try again.'
const NO_CASE_ERROR = 'The booking was cancelled, but the fee decision could not be opened. Reload and check the booking.'

const BUTTON_BASE: CSSProperties = {
  minHeight: '44px',
  padding: '0 24px',
  borderRadius: 'var(--admin-radius-md)',
  fontFamily: 'var(--font-montserrat)',
  fontSize: 'var(--admin-fs-body)',
  fontWeight: 'var(--admin-fw-strong)',
}

const TILES: ReadonlyArray<{ value: CancelledBy; title: string; helper: string }> = [
  { value: 'client', title: 'The client', helper: 'Follows the cancellation policy.' },
  { value: 'prestigo', title: 'Prestigo', helper: 'Always free for the client.' },
]

interface CancelBookingDialogProps {
  /** The booking being cancelled; null keeps the dialog closed. */
  booking: CancelDialogBooking | null
  onClose: () => void
  /** The cancel applied (200). */
  onCancelled: (booking: CancelDialogBooking, done: CancelDoneInfo) => void
  /** 502 refund_failed with cancelled: true. The booking IS cancelled; the dialog closes and the row shows the banner. */
  onRefundFailed: (booking: CancelDialogBooking) => void
  /** 500 with cancelled: true (the fee case could not be opened). The booking IS cancelled. */
  onCancelledWithoutCase?: (booking: CancelDialogBooking) => void
}

export function CancelBookingDialog({ booking, onClose, onCancelled, onRefundFailed, onCancelledWithoutCase }: CancelBookingDialogProps) {
  const [choice, setChoice] = useState<CancelledBy | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // The cancel applied but the dialog stays up with a line to read (500 cancelled: true).
  const [applied, setApplied] = useState(false)
  // Captured when the dialog opens: nothing to wait on, the preview is computed locally.
  const [openedAt, setOpenedAt] = useState(() => Date.now())
  const inFlight = useRef(false)
  const tileRefs = useRef<Array<HTMLButtonElement | null>>([])

  const bookingId = booking?.id ?? null
  useEffect(() => {
    // A fresh open starts clean (nothing preselected, D-20) with focus on the first tile.
    setChoice(null)
    setBusy(false)
    setError(null)
    setApplied(false)
    setOpenedAt(Date.now())
    inFlight.current = false
    if (bookingId !== null) tileRefs.current[0]?.focus()
  }, [bookingId])

  const outcome = useMemo(
    () => (booking && choice ? outcomeFor(booking, choice, openedAt) : null),
    [booking, choice, openedAt],
  )

  const select = useCallback((value: CancelledBy) => {
    if (busy || applied) return
    setChoice(value)
    setError(null)
  }, [busy, applied])

  const onTileKey = useCallback((e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next: number | null = null
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (index + 1) % TILES.length
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (index + TILES.length - 1) % TILES.length
    if (next === null) return
    e.preventDefault()
    select(TILES[next].value)
    tileRefs.current[next]?.focus()
  }, [select])

  async function submit() {
    if (!booking || !choice || inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setError(null)
    const body: { id: string; cancelled_by: CancelledBy } = { id: booking.id, cancelled_by: choice }
    try {
      const res = await fetch('/api/admin/bookings/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        const data = (await res.json().catch(() => ({}))) as { released?: boolean; late?: boolean }
        onCancelled(booking, { released: data.released === true, late: data.late === true })
        return
      }
      const data = (await res.json().catch(() => ({}))) as { error?: string; cancelled?: boolean; currentStatus?: string }
      if (res.status === 502 && data.error === 'refund_failed' && data.cancelled === true) {
        onRefundFailed(booking)
        return
      }
      if (res.status === 500 && data.cancelled === true) {
        setApplied(true)
        setError(NO_CASE_ERROR)
        onCancelledWithoutCase?.(booking)
        return
      }
      if (res.status === 409 && data.error === 'payment_busy') setError(BUSY_ERROR)
      else if (res.status === 409 && data.error === 'status_conflict') setError(statusConflictMessage(data.currentStatus))
      else if (res.status === 401 || res.status === 403) setError(SESSION_ERROR)
      else setError(GENERIC_ERROR)
    } catch {
      setError(GENERIC_ERROR)
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  const facts = booking ? pickupFacts(booking) : null
  const pickupText = facts ? formatPragueFull(new Date(facts.pickupMs).toISOString()) : null
  const hoursText = facts ? hoursBeforePickupLabel(facts.pickupMs, openedAt) : null
  const isLeg = booking !== null && isLegCancel(booking) && booking.payment_intent_id !== null && booking.booking_source !== 'gnet'
  const legAmountCzk = booking ? (booking.leg === 'outbound' ? booking.outbound_amount_czk : booking.return_amount_czk) : null
  const pairedLegLabel = booking?.leg === 'outbound' ? 'return' : 'outbound'
  const pairedRef = booking?.linked_booking?.booking_reference ?? '—'

  const primaryDisabled = busy || applied || outcome === null
  const mutedText: CSSProperties = {
    margin: 0,
    fontFamily: 'var(--font-montserrat)',
    fontSize: 'var(--admin-fs-body)',
    color: 'var(--admin-text-muted)',
    lineHeight: 1.5,
  }

  return (
    // While the request runs the dialog cannot be dismissed.
    <Modal
      isOpen={booking !== null}
      onClose={busy ? () => {} : onClose}
      title={`Cancel booking ${booking?.booking_reference ?? ''}`}
    >
      {booking && (
        <div>
          <p style={mutedText}>
            {[pickupText ? `Pickup ${pickupText} (Prague)` : `Pickup ${booking.pickup_date} ${booking.pickup_time}`, hoursText]
              .filter(Boolean)
              .join(' · ')}
          </p>

          <div style={{ marginTop: '16px' }}>
            <div
              id="cancel-who-label"
              style={{
                fontFamily: 'var(--font-montserrat)',
                fontSize: 'var(--admin-fs-label)',
                fontWeight: 'var(--admin-fw-strong)',
                letterSpacing: '0.3em',
                textTransform: 'uppercase',
                color: 'var(--admin-text-muted)',
                marginBottom: '8px',
              }}
            >
              Who cancelled?
            </div>
            <div
              role="radiogroup"
              aria-labelledby="cancel-who-label"
              aria-required="true"
              style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}
            >
              {TILES.map((tile, index) => {
                const selected = choice === tile.value
                // Roving tabindex: the selected tile, or the first one while nothing is selected.
                const tabbable = choice === null ? index === 0 : selected
                return (
                  <button
                    key={tile.value}
                    ref={el => { tileRefs.current[index] = el }}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    tabIndex={tabbable ? 0 : -1}
                    disabled={busy || applied}
                    onClick={() => select(tile.value)}
                    onKeyDown={e => onTileKey(e, index)}
                    style={{
                      flex: '1 1 200px',
                      minHeight: '64px',
                      padding: '16px',
                      textAlign: 'left',
                      cursor: busy || applied ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '12px',
                      borderRadius: 'var(--admin-radius-md)',
                      border: `1px solid ${selected ? 'var(--admin-accent-border)' : 'var(--admin-border-strong)'}`,
                      background: selected ? 'var(--admin-accent-tint)' : 'transparent',
                      color: 'var(--admin-text)',
                      fontFamily: 'var(--font-montserrat)',
                    }}
                  >
                    <span
                      aria-hidden="true"
                      style={{
                        width: '8px',
                        height: '8px',
                        marginTop: '6px',
                        borderRadius: '50%',
                        flexShrink: 0,
                        background: selected ? 'var(--admin-accent)' : 'transparent',
                        border: selected ? 'none' : '1px solid var(--admin-border-strong)',
                      }}
                    />
                    <span style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <span style={{ fontSize: 'var(--admin-fs-body)', fontWeight: 'var(--admin-fw-strong)' }}>{tile.title}</span>
                      <span style={{ fontSize: 'var(--admin-fs-label)', color: 'var(--admin-text-muted)' }}>{tile.helper}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* The outcome line is a live region that exists from the start, so a choice is announced. */}
          <div role="status" style={{ marginTop: '16px' }}>
            {outcome && (
              <div
                data-testid="cancel-outcome"
                style={{
                  display: 'flex',
                  gap: '12px',
                  alignItems: 'flex-start',
                  padding: '16px',
                  background: 'var(--admin-hover)',
                  borderRadius: 'var(--admin-radius-md)',
                  fontFamily: 'var(--font-montserrat)',
                  fontSize: 'var(--admin-fs-body)',
                  color: 'var(--admin-text)',
                  lineHeight: 1.5,
                }}
              >
                {outcome.late ? (
                  <TriangleAlert size={20} aria-hidden="true" style={{ color: 'var(--status-warn-fg)', flexShrink: 0 }} />
                ) : (
                  <Info size={20} aria-hidden="true" style={{ flexShrink: 0 }} />
                )}
                <span>{outcome.sentence}</span>
              </div>
            )}
          </div>

          {booking.booking_source === 'gnet' && (
            <p style={{ ...mutedText, marginTop: '12px' }}>
              This booking was received from a GNet partner. Billing is handled directly by the GNet partner, and the CANCEL status is pushed to GNet.
            </p>
          )}

          {/* Round-trip leg: the paired booking is untouched (Phase 66 sentences, moved in). */}
          {isLeg && (
            <div style={{ marginTop: '12px' }}>
              {outcome !== null && !outcome.late && (
                <p style={{ ...mutedText, color: 'var(--admin-text)' }}>
                  Refund: about {legAmountCzk ?? '—'} CZK for this leg only (its share of what was paid).
                </p>
              )}
              <p style={{ ...mutedText, marginTop: '8px', color: 'var(--status-danger-fg)', fontWeight: 500 }}>
                The paired {pairedLegLabel} booking {pairedRef} will NOT be affected and remains active.
              </p>
            </div>
          )}

          {error && (
            <div
              role="alert"
              style={{
                marginTop: '12px',
                fontFamily: 'var(--font-montserrat)',
                fontSize: '13px',
                color: 'var(--status-danger-fg)',
              }}
            >
              {error}
            </div>
          )}

          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: '8px', marginTop: '24px' }}>
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              style={{
                ...BUTTON_BASE,
                background: 'transparent',
                border: '1px solid var(--admin-border-strong)',
                color: 'var(--admin-text)',
                cursor: busy ? 'not-allowed' : 'pointer',
                opacity: busy ? 0.6 : 1,
              }}
            >
              {applied ? 'Close' : 'Keep booking'}
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={primaryDisabled}
              style={{
                ...BUTTON_BASE,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                background: 'var(--admin-danger-solid)',
                border: '1px solid var(--admin-danger-solid)',
                color: 'var(--admin-on-danger)',
                cursor: primaryDisabled ? 'not-allowed' : 'pointer',
                opacity: primaryDisabled ? 0.6 : 1,
              }}
            >
              {busy && <LoaderCircle size={16} aria-hidden="true" className="animate-spin motion-reduce:animate-none" />}
              {busy ? 'Cancelling…' : (outcome?.primary ?? 'Cancel booking')}
            </button>
          </div>

          <p style={{ ...mutedText, fontSize: '11px', marginTop: '12px' }}>The client and the assigned driver are emailed.</p>
        </div>
      )}
    </Modal>
  )
}
