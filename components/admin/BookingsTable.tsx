'use client'
import React from 'react'
import {
  useReactTable,
  getCoreRowModel,
  getExpandedRowModel,
  flexRender,
  type ColumnDef,
  type ExpandedState,
} from '@tanstack/react-table'
import { useState, useEffect, useCallback, useRef } from 'react'
import { ChevronDown, ChevronUp, Search, X, Copy, Send } from 'lucide-react'
import { StatusBadge } from './StatusBadge'
import PaymentPanel, { formatPragueFull } from './PaymentPanel'
import { PaymentStateBadge } from './PaymentStateBadge'
import { formatMinor } from '@/lib/payments/money'
import { NoShowBanner, NoShowChip, hasOpenNoShowRequest } from './NoShowBanner'
import { ConfirmNoShowModal } from './ConfirmNoShowModal'
import { STATUS_CONFLICT_STYLE, statusConflictMessage } from './statusConflict'
import { FlightStatusBlock } from './FlightStatusBlock'
import { BookingChangeHistory } from './BookingChangeHistory'
import { DriverAssignmentSection } from '@/components/admin/DriverAssignmentSection'
import { UI_TRANSITIONS } from '@/lib/booking-transitions'
import {
  BOOKING_STATUS_LABELS,
  TERMINAL_BOOKING_STATUSES,
  type BookingStatus,
} from '@/lib/booking-status'
import AddressInput from '@/components/booking/AddressInput'
import type { PlaceResult } from '@/types/booking'
import { eurToCzk, czkToEur } from '@/lib/currency'
import { truncatePaymentLinkUrl, copyPaymentLinkToClipboard } from '@/lib/ui/payment-link-display'

interface Booking {
  id: string
  booking_reference: string
  booking_source: 'online' | 'manual' | 'gnet'
  pickup_date: string
  pickup_time: string
  client_first_name: string
  client_last_name: string
  client_email: string
  client_phone: string
  trip_type: string
  vehicle_class: string
  amount_czk: number
  driver_price_czk: number | null
  origin_address: string
  destination_address: string
  origin_lat: number
  origin_lng: number
  destination_lat: number
  destination_lng: number
  passengers: number
  luggage: number
  extra_child_seat: boolean
  extra_meet_greet: boolean
  extra_luggage: boolean
  flight_number: string | null
  terminal: string | null
  hours: number | null
  return_date: string | null
  special_requests: string | null
  payment_intent_id: string | null
  // Phase 64 D-05: persisted Stripe Payment Link (migration 056). Null until
  // an operator generates one via the row-level "Generate Payment Link"
  // action or the ManualBookingForm create-with-payment flow.
  payment_link_url: string | null
  payment_link_id: string | null
  status: string
  operator_notes: string | null
  created_at: string
  leg: 'outbound' | 'return' | null
  linked_booking_id: string | null
  outbound_amount_czk: number | null
  return_amount_czk: number | null
  linked_booking: { booking_reference: string } | null
  // Phase 32: flight status persisted columns (migration 033)
  flight_iata: string | null
  flight_status: string | null
  flight_estimated_arrival: string | null
  flight_delay_minutes: number | null
  flight_departure_airport: string | null
  flight_arrival_airport: string | null
  flight_terminal: string | null
  // Phase 75-17 D-11: site locale at checkout (migration 062). Null for
  // admin-created bookings and any row created before the column existed.
  locale?: string | null
  // Phase 87 D-16(a): when the driver asked for a no-show (migration 084). Arrives through
  // admin_search_bookings to_jsonb; null/absent = no open request.
  no_show_requested_at?: string | null
  // Phase 88 (migration 085): arrive through admin_search_bookings to_jsonb. Old rows and test
  // fixtures may omit them; only 'card_hold' bookings show the payment badge and panel.
  payment_mode?: string | null
  payment_state?: string | null
}

const vehicleClassMap: Record<string, string> = {
  business: 'Business',
  first_class: 'First Class',
  business_van: 'Business Van',
}

// D-02: one label source for every admin surface. Indexed by arbitrary row.status strings, so
// the alias is widened to Record<string, string>; unknown values fall back to the raw status.
const STATUS_LABELS: Record<string, string> = BOOKING_STATUS_LABELS

function DetailField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div style={{
        fontFamily: 'var(--font-montserrat)',
        fontSize: '11px',
        textTransform: 'uppercase',
        letterSpacing: '0.3em',
        color: 'var(--warmgrey)',
        marginBottom: '4px',
      }}>
        {label}
      </div>
      <div style={{
        fontFamily: 'var(--font-montserrat)',
        fontSize: '13px',
        color: 'var(--offwhite)',
      }}>
        {value}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Phase 63 Plan 05 — Trip-edit mode (D-01/D-02), price-review step (D-06),
// terminal/GNet notices, and BookingChangeHistory mount.
// ─────────────────────────────────────────────────────────────────────────

interface PatchBody {
  id: string
  status?: string
  // D-01: the status the row shows; the server answers 409 status_conflict when the stored status differs
  expected_status?: string
  operator_notes?: string
  driver_price_czk?: number | null
  pickup_date?: string
  pickup_time?: string
  client_first_name?: string
  client_last_name?: string
  client_email?: string
  client_phone?: string
  flight_number?: string
  notify_client?: boolean
  vehicle_class?: string
  origin_address?: string
  destination_address?: string
  origin_lat?: number
  origin_lng?: number
  destination_lat?: number
  destination_lng?: number
  distance_km?: number | null
  amount_czk?: number
  override_price?: boolean
}

// Thrown by patchBooking() on a non-ok response. Carries the 422 price-mismatch
// body (computedCzk/submittedCzk) so the price-review step can surface it
// inline without re-parsing the response a second time.
class PatchError extends Error {
  status?: number
  computedCzk?: number
  submittedCzk?: number
  // 409 status_conflict body: the status the booking really has now
  currentStatus?: string
  constructor(
    message: string,
    extra?: { status?: number; computedCzk?: number; submittedCzk?: number; currentStatus?: string },
  ) {
    super(message)
    this.name = 'PatchError'
    this.status = extra?.status
    this.computedCzk = extra?.computedCzk
    this.submittedCzk = extra?.submittedCzk
    this.currentStatus = extra?.currentStatus
  }
}

// Phase 88 D-20: the cancel route answers 502 { error: 'refund_failed', cancelled: true } when the
// cancel applied but the refund or release did not. The booking IS cancelled; the operator refunds
// by hand. Thrown by handleCancel so the dialog shows the line and stays open.
class CancelRefundFailedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CancelRefundFailedError'
  }
}

function refundFailedLine(amountMinor: unknown, currency: unknown): string {
  const amount = typeof amountMinor === 'number' && Number.isFinite(amountMinor) && (currency === 'eur' || currency === 'czk')
    ? formatMinor(amountMinor, currency)
    : null
  return `The booking was cancelled, but the refund failed. Refund ${amount ?? 'it'} manually in the Stripe Dashboard.`
}

// Phase 88 D-16/D-17/D-18: the trip-edit PATCH may carry the payment effect of the change.
const PAYMENT_IN_PROGRESS_COPY = 'Payment is being processed for this booking. Wait a moment and try again.'

function paymentEffectMessage(result: unknown): string | null {
  const effect = (result as { payment_effect?: Record<string, unknown> } | null)?.payment_effect
  if (!effect || typeof effect !== 'object') return null
  const currency = effect.currency === 'czk' ? 'czk' : effect.currency === 'eur' ? 'eur' : null
  const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
  if (effect.kind === 'amount_raised') {
    const held = num(effect.held_minor)
    const diff = num(effect.diff_minor)
    if (!currency || held === null || diff === null) return null
    return `Price updated. The held ${formatMinor(held, currency)} is captured after the trip and the extra ${formatMinor(diff, currency)} is charged to the saved card.`
  }
  if (effect.kind === 'amount_lowered') {
    const amount = num(effect.amount_minor)
    if (!currency || amount === null) return null
    return `Price updated. Only ${formatMinor(amount, currency)} will be captured after the trip. The rest of the hold is released.`
  }
  if (effect.kind === 'amount_kept') {
    // 88-REVIEW A-WR-11: a card booking keeps the price the client agreed to unless the operator enters an amount.
    const amount = num(effect.amount_minor)
    const standard = num(effect.standard_czk)
    return `Card booking: the client's agreed price${amount !== null && currency ? ` of ${formatMinor(amount, currency)}` : ''} stays (promo included).${standard !== null ? ` The standard rate would be ${standard} CZK.` : ''} To charge a different price, enter it as the amount in the price review.`
  }
  if (effect.kind === 'hold_released') {
    const when = typeof effect.hold_date_iso === 'string' ? formatPragueFull(effect.hold_date_iso) : null
    return when
      ? `Pickup moved. The current hold was released. A new hold is placed on ${when}.`
      : 'Pickup moved. The current hold was released.'
  }
  return null
}

/** Error text for a failed trip-edit PATCH: the friendly copy for payment_in_progress, else the message. */
function tripEditErrorText(err: unknown, fallback: string): string {
  if (err instanceof PatchError && err.status === 409 && err.message === 'payment_in_progress') return PAYMENT_IN_PROGRESS_COPY
  return err instanceof Error ? err.message : fallback
}

type FieldGroupKey = 'datetime' | 'name' | 'email' | 'phone' | 'flight'
type SaveState = 'idle' | 'saving' | 'saved' | 'error'

interface TripEditFieldsState {
  pickup_date: string
  pickup_time: string
  client_first_name: string
  client_last_name: string
  client_email: string
  client_phone: string
  flight_number: string
}

interface PriceReviewState {
  trigger: 'vehicle' | 'route'
  status: 'loading' | 'ready' | 'saving' | 'error'
  oldAmountCzk: number
  newAmountCzk: number | null
  distanceKm: number | null
  overrideValue: string
  overrideActive: boolean
  overrideAcknowledged: boolean
  notifyClient: boolean
  mismatch: { computedCzk: number; submittedCzk: number } | null
  errorMessage: string | null
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const editInputStyle: React.CSSProperties = {
  width: '100%',
  background: 'var(--anthracite)',
  border: '1px solid var(--anthracite-light)',
  borderRadius: '2px',
  padding: '8px 16px',
  fontFamily: 'var(--font-montserrat)',
  fontSize: '13px',
  color: 'var(--offwhite)',
  outline: 'none',
  boxSizing: 'border-box',
}

const editHeaderLabelStyle: React.CSSProperties = {
  fontFamily: 'var(--font-montserrat)',
  fontSize: '11px',
  textTransform: 'uppercase',
  letterSpacing: '0.3em',
  color: 'var(--warmgrey)',
  marginBottom: '4px',
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
}

const ghostCopperButtonStyle: React.CSSProperties = {
  height: '32px',
  padding: '0 16px',
  background: 'transparent',
  border: '1px solid var(--copper)',
  color: 'var(--copper)',
  borderRadius: '2px',
  fontFamily: 'var(--font-montserrat)',
  fontSize: '11px',
  letterSpacing: '0.15em',
  textTransform: 'uppercase',
  cursor: 'pointer',
}

function editFocusOn(e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) {
  e.target.style.borderColor = 'var(--copper)'
}
function editFocusOff(e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) {
  e.target.style.borderColor = 'var(--anthracite-light)'
}

function SaveHint({ state, errorText }: { state: SaveState; errorText?: string }) {
  if (state === 'saving') return <span style={{ color: 'var(--copper)', fontSize: '11px', letterSpacing: '0.1em' }}>Saving...</span>
  if (state === 'saved') return <span style={{ color: 'var(--status-ok-fg)', fontSize: '11px', letterSpacing: '0.1em' }}>Saved</span>
  if (state === 'error') return <span style={{ color: 'var(--status-danger-fg)', fontSize: '11px', letterSpacing: '0.1em' }}>{errorText || 'Error saving'}</span>
  return null
}

interface TripEditPanelProps {
  booking: Booking
  patchBooking: (body: PatchBody) => Promise<unknown>
  onUpdated: (bookingId: string, patch: Partial<Booking>) => void
}

function TripEditPanel({ booking, patchBooking, onUpdated }: TripEditPanelProps) {
  const isTerminal = TERMINAL_BOOKING_STATUSES.has(booking.status as BookingStatus)
  const [editOpen, setEditOpen] = useState(false)

  const [fields, setFields] = useState<TripEditFieldsState>(() => ({
    pickup_date: booking.pickup_date,
    pickup_time: booking.pickup_time,
    client_first_name: booking.client_first_name,
    client_last_name: booking.client_last_name,
    client_email: booking.client_email,
    client_phone: booking.client_phone,
    flight_number: booking.flight_number ?? '',
  }))
  const [fieldSaving, setFieldSaving] = useState<Record<FieldGroupKey, SaveState>>({
    datetime: 'idle', name: 'idle', email: 'idle', phone: 'idle', flight: 'idle',
  })
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FieldGroupKey, string>>>({})

  const [vehicleClass, setVehicleClass] = useState(booking.vehicle_class)
  const [originPlace, setOriginPlace] = useState<PlaceResult | null>(
    booking.origin_lat != null && booking.origin_lng != null
      ? { address: booking.origin_address, placeId: '', lat: booking.origin_lat, lng: booking.origin_lng }
      : null
  )
  const [destinationPlace, setDestinationPlace] = useState<PlaceResult | null>(
    booking.destination_address && booking.destination_lat != null && booking.destination_lng != null
      ? { address: booking.destination_address, placeId: '', lat: booking.destination_lat, lng: booking.destination_lng }
      : null
  )
  const [priceReview, setPriceReview] = useState<PriceReviewState | null>(null)
  // Phase 88: what the edit did to the card payment (price raised / lowered, hold released).
  const [paymentNote, setPaymentNote] = useState<string | null>(null)

  const saveGroup = useCallback(async (group: FieldGroupKey) => {
    let validationError: string | null = null
    if (group === 'name') {
      if (!fields.client_first_name.trim() || !fields.client_last_name.trim()) validationError = 'First and last name are required'
    } else if (group === 'email') {
      if (!EMAIL_RE.test(fields.client_email.trim())) validationError = 'Enter a valid email address'
    } else if (group === 'phone') {
      if (!fields.client_phone.trim()) validationError = 'Phone number is required'
    } else if (group === 'datetime') {
      if (!fields.pickup_date || !fields.pickup_time) validationError = 'Date and time are required'
    }
    if (validationError) {
      setFieldErrors(prev => ({ ...prev, [group]: validationError as string }))
      setFieldSaving(prev => ({ ...prev, [group]: 'error' }))
      return
    }
    setFieldErrors(prev => ({ ...prev, [group]: undefined }))
    setFieldSaving(prev => ({ ...prev, [group]: 'saving' }))

    const patch: PatchBody = { id: booking.id }
    const bookingPatch: Partial<Booking> = {}
    if (group === 'datetime') {
      patch.pickup_date = fields.pickup_date
      patch.pickup_time = fields.pickup_time
      bookingPatch.pickup_date = fields.pickup_date
      bookingPatch.pickup_time = fields.pickup_time
    } else if (group === 'name') {
      patch.client_first_name = fields.client_first_name.trim()
      patch.client_last_name = fields.client_last_name.trim()
      bookingPatch.client_first_name = patch.client_first_name
      bookingPatch.client_last_name = patch.client_last_name
    } else if (group === 'email') {
      patch.client_email = fields.client_email.trim()
      bookingPatch.client_email = patch.client_email
    } else if (group === 'phone') {
      patch.client_phone = fields.client_phone.trim()
      bookingPatch.client_phone = patch.client_phone
    } else if (group === 'flight') {
      patch.flight_number = fields.flight_number.trim()
      bookingPatch.flight_number = patch.flight_number
    }

    setPaymentNote(null)
    try {
      const result = await patchBooking(patch)
      setPaymentNote(paymentEffectMessage(result))
      onUpdated(booking.id, bookingPatch)
      setFieldSaving(prev => ({ ...prev, [group]: 'saved' }))
      setTimeout(() => {
        setFieldSaving(prev => prev[group] === 'saved' ? { ...prev, [group]: 'idle' } : prev)
      }, 2000)
    } catch (err) {
      setFieldErrors(prev => ({ ...prev, [group]: tripEditErrorText(err, 'Save failed') }))
      setFieldSaving(prev => ({ ...prev, [group]: 'error' }))
    }
  }, [fields, booking.id, patchBooking, onUpdated])

  // AEDIT-03/D-06: vehicle_class / route edits never commit directly — they
  // trigger a client round trip to POST /api/calculate-price for a fresh
  // preview price before opening the price-review step.
  const openPriceReview = useCallback(async (trigger: 'vehicle' | 'route') => {
    setPriceReview({
      trigger, status: 'loading', oldAmountCzk: booking.amount_czk, newAmountCzk: null,
      distanceKm: null, overrideValue: '', overrideActive: false, overrideAcknowledged: false,
      notifyClient: false, mismatch: null, errorMessage: null,
    })
    const origin = originPlace ?? (booking.origin_lat != null && booking.origin_lng != null
      ? { lat: booking.origin_lat, lng: booking.origin_lng } : null)
    const destination = booking.trip_type === 'transfer'
      ? (destinationPlace ?? (booking.destination_lat != null && booking.destination_lng != null
        ? { lat: booking.destination_lat, lng: booking.destination_lng } : null))
      : null
    if (!origin || (booking.trip_type === 'transfer' && !destination)) {
      setPriceReview(prev => prev ? { ...prev, status: 'error', errorMessage: 'Missing address coordinates — re-select the address.' } : prev)
      return
    }
    try {
      const res = await fetch('/api/calculate-price', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          origin: { lat: origin.lat, lng: origin.lng },
          destination: destination ? { lat: destination.lat, lng: destination.lng } : null,
          tripType: booking.trip_type,
          hours: booking.hours ?? 2,
          pickupDate: fields.pickup_date || booking.pickup_date,
          returnDate: booking.return_date,
          pickupTime: fields.pickup_time || booking.pickup_time,
          isAirport: false,
        }),
      })
      const data = await res.json()
      const vcKey = vehicleClass === 'first_class' ? 'first_class' : vehicleClass === 'business_van' ? 'business_van' : 'business'
      const priceEur = data?.prices?.[vcKey]?.total
      if (data?.quoteMode || !priceEur) {
        setPriceReview(prev => prev ? { ...prev, status: 'error', errorMessage: 'Could not calculate a price for this route/vehicle — try again or enter an amount manually.' } : prev)
        return
      }
      const newAmountCzk = eurToCzk(priceEur)
      // 88-REVIEW A-WR-11: a card booking is charged its stored amount after the trip. The standard rate above knows no
      // promo code, so the review starts from the agreed price; only an amount the operator enters changes it.
      const startValue = booking.payment_mode === 'card_hold' ? booking.amount_czk : newAmountCzk
      setPriceReview(prev => prev ? {
        ...prev, status: 'ready', newAmountCzk, distanceKm: data.distanceKm ?? null, overrideValue: String(startValue),
      } : prev)
    } catch {
      setPriceReview(prev => prev ? { ...prev, status: 'error', errorMessage: 'Price calculation failed.' } : prev)
    }
  }, [booking, originPlace, destinationPlace, vehicleClass, fields.pickup_date, fields.pickup_time])

  const confirmPriceReview = useCallback(async () => {
    if (!priceReview) return
    const amount = Math.round(Number(priceReview.overrideValue))
    if (!Number.isFinite(amount) || amount <= 0) {
      setPriceReview(prev => prev ? { ...prev, errorMessage: 'Enter a valid amount.' } : prev)
      return
    }
    setPriceReview(prev => prev ? { ...prev, status: 'saving', errorMessage: null } : prev)

    const patch: PatchBody = { id: booking.id, amount_czk: amount, notify_client: priceReview.notifyClient }
    if (priceReview.trigger === 'vehicle' && vehicleClass !== booking.vehicle_class) patch.vehicle_class = vehicleClass
    if (priceReview.trigger === 'route') {
      if (originPlace) { patch.origin_address = originPlace.address; patch.origin_lat = originPlace.lat; patch.origin_lng = originPlace.lng }
      if (destinationPlace) { patch.destination_address = destinationPlace.address; patch.destination_lat = destinationPlace.lat; patch.destination_lng = destinationPlace.lng }
      if (priceReview.distanceKm !== null) patch.distance_km = priceReview.distanceKm
    }
    if (priceReview.overrideActive || priceReview.mismatch) patch.override_price = true

    setPaymentNote(null)
    try {
      const result = await patchBooking(patch)
      setPaymentNote(paymentEffectMessage(result))
      const bookingPatch: Partial<Booking> = { amount_czk: amount }
      if (patch.vehicle_class) bookingPatch.vehicle_class = patch.vehicle_class
      if (patch.origin_address !== undefined) {
        bookingPatch.origin_address = patch.origin_address
        bookingPatch.origin_lat = patch.origin_lat as number
        bookingPatch.origin_lng = patch.origin_lng as number
      }
      if (patch.destination_address !== undefined) {
        bookingPatch.destination_address = patch.destination_address
        bookingPatch.destination_lat = patch.destination_lat as number
        bookingPatch.destination_lng = patch.destination_lng as number
      }
      onUpdated(booking.id, bookingPatch)
      setPriceReview(null)
    } catch (err) {
      if (err instanceof PatchError && err.status === 422 && err.computedCzk !== undefined && err.submittedCzk !== undefined) {
        setPriceReview(prev => prev ? {
          ...prev, status: 'ready',
          mismatch: { computedCzk: err.computedCzk as number, submittedCzk: err.submittedCzk as number },
          overrideActive: true, overrideValue: String(err.submittedCzk),
          errorMessage: 'Price mismatch — server recompute diverges from the submitted amount. Review and override if intentional.',
        } : prev)
      } else {
        setPriceReview(prev => prev ? { ...prev, status: 'ready', errorMessage: tripEditErrorText(err, 'Save failed.') } : prev)
      }
    }
  }, [priceReview, booking.id, booking.vehicle_class, vehicleClass, originPlace, destinationPlace, patchBooking, onUpdated])

  const confirmDisabled = priceReview
    ? priceReview.status === 'saving' || (!!priceReview.mismatch && !priceReview.overrideAcknowledged)
    : true

  return (
    <div style={{ marginTop: 16 }} onClick={(e) => e.stopPropagation()}>
      {isTerminal ? (
        <div style={{ fontSize: 13, fontFamily: 'var(--font-montserrat)', color: 'var(--warmgrey)' }}>
          {STATUS_LABELS[booking.status] ?? booking.status} bookings are final and cannot be edited.
        </div>
      ) : (
        <>
          {booking.booking_source === 'gnet' && (
            <div style={{
              fontSize: 11, fontFamily: 'var(--font-montserrat)', color: 'var(--warmgrey)',
              background: 'var(--status-info-bg)', border: '1px solid var(--status-info-border)',
              borderRadius: 2, padding: '8px 16px', marginBottom: 16,
            }}>
              This booking originated from a GNet partner — edits are recorded locally but not synced back to GNet.
            </div>
          )}

          <button type="button" onClick={() => setEditOpen(o => !o)} style={ghostCopperButtonStyle}>
            {editOpen ? 'Close Edit Mode' : 'Edit Trip Details'}
          </button>

          {paymentNote && (
            <div role="status" style={{ marginTop: 8, fontSize: 13, fontFamily: 'var(--font-montserrat)', color: 'var(--status-ok-fg)' }}>
              {paymentNote}
            </div>
          )}

          {editOpen && (
            <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Pickup date + time — committed together (D-02) */}
              <div>
                <div style={editHeaderLabelStyle}>
                  Pickup Date & Time
                  <SaveHint state={fieldSaving.datetime} errorText={fieldErrors.datetime} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <input
                    type="date"
                    value={fields.pickup_date}
                    onChange={(e) => setFields(f => ({ ...f, pickup_date: e.target.value }))}
                    style={{ ...editInputStyle, colorScheme: 'dark' }}
                    onFocus={editFocusOn}
                    onBlur={editFocusOff}
                  />
                  <input
                    type="time"
                    value={fields.pickup_time}
                    onChange={(e) => setFields(f => ({ ...f, pickup_time: e.target.value }))}
                    style={{ ...editInputStyle, colorScheme: 'dark' }}
                    onFocus={editFocusOn}
                    onBlur={editFocusOff}
                  />
                </div>
                <button type="button" onClick={() => saveGroup('datetime')} style={{ ...ghostCopperButtonStyle, marginTop: 8 }}>
                  Save Date & Time
                </button>
              </div>

              {/* Passenger name — first + last committed together */}
              <div>
                <div style={editHeaderLabelStyle}>
                  Passenger Name
                  <SaveHint state={fieldSaving.name} errorText={fieldErrors.name} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <input
                    type="text"
                    value={fields.client_first_name}
                    onChange={(e) => setFields(f => ({ ...f, client_first_name: e.target.value }))}
                    placeholder="First name"
                    maxLength={100}
                    style={editInputStyle}
                    onFocus={editFocusOn}
                    onBlur={editFocusOff}
                  />
                  <input
                    type="text"
                    value={fields.client_last_name}
                    onChange={(e) => setFields(f => ({ ...f, client_last_name: e.target.value }))}
                    placeholder="Last name"
                    maxLength={100}
                    style={editInputStyle}
                    onFocus={editFocusOn}
                    onBlur={editFocusOff}
                  />
                </div>
                <button type="button" onClick={() => saveGroup('name')} style={{ ...ghostCopperButtonStyle, marginTop: 8 }}>
                  Save Name
                </button>
              </div>

              {/* Email */}
              <div>
                <div style={editHeaderLabelStyle}>
                  Email
                  <SaveHint state={fieldSaving.email} errorText={fieldErrors.email} />
                </div>
                <input
                  type="email"
                  value={fields.client_email}
                  onChange={(e) => setFields(f => ({ ...f, client_email: e.target.value }))}
                  style={editInputStyle}
                  onFocus={editFocusOn}
                  onBlur={editFocusOff}
                />
                <button type="button" onClick={() => saveGroup('email')} style={{ ...ghostCopperButtonStyle, marginTop: 8 }}>
                  Save Email
                </button>
              </div>

              {/* Phone */}
              <div>
                <div style={editHeaderLabelStyle}>
                  Phone
                  <SaveHint state={fieldSaving.phone} errorText={fieldErrors.phone} />
                </div>
                <input
                  type="text"
                  value={fields.client_phone}
                  onChange={(e) => setFields(f => ({ ...f, client_phone: e.target.value }))}
                  maxLength={50}
                  style={editInputStyle}
                  onFocus={editFocusOn}
                  onBlur={editFocusOff}
                />
                <button type="button" onClick={() => saveGroup('phone')} style={{ ...ghostCopperButtonStyle, marginTop: 8 }}>
                  Save Phone
                </button>
              </div>

              {/* Flight number — blank (not a dash) when null */}
              <div>
                <div style={editHeaderLabelStyle}>
                  Flight Number
                  <SaveHint state={fieldSaving.flight} errorText={fieldErrors.flight} />
                </div>
                <input
                  type="text"
                  value={fields.flight_number}
                  onChange={(e) => setFields(f => ({ ...f, flight_number: e.target.value }))}
                  placeholder="e.g. OK123"
                  maxLength={20}
                  style={editInputStyle}
                  onFocus={editFocusOn}
                  onBlur={editFocusOff}
                />
                <button type="button" onClick={() => saveGroup('flight')} style={{ ...ghostCopperButtonStyle, marginTop: 8 }}>
                  Save Flight Number
                </button>
              </div>

              {/* Vehicle class — price-affecting, never commits directly (D-02/D-06) */}
              <div>
                <div style={editHeaderLabelStyle}>Vehicle Class</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <select
                    value={vehicleClass}
                    onChange={(e) => setVehicleClass(e.target.value)}
                    style={{ ...editInputStyle, flex: 1 }}
                    onFocus={editFocusOn}
                    onBlur={editFocusOff}
                  >
                    <option value="business">Business</option>
                    <option value="first_class">First Class</option>
                    <option value="business_van">Business Van</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => openPriceReview('vehicle')}
                    disabled={vehicleClass === booking.vehicle_class}
                    style={{
                      ...ghostCopperButtonStyle,
                      opacity: vehicleClass === booking.vehicle_class ? 0.4 : 1,
                      cursor: vehicleClass === booking.vehicle_class ? 'not-allowed' : 'pointer',
                    }}
                  >
                    Review Price →
                  </button>
                </div>
              </div>

              {/* Route — origin always editable; destination hidden for non-transfer trips */}
              <div>
                <div style={editHeaderLabelStyle}>Route</div>
                <AddressInput
                  label="Pickup address"
                  placeholder="Start typing an address…"
                  value={originPlace}
                  onSelect={setOriginPlace}
                  onClear={() => setOriginPlace(null)}
                  ariaLabel="Edit pickup address"
                  neverDisabled
                />
                {booking.trip_type === 'transfer' && (
                  <div style={{ marginTop: 16 }}>
                    <AddressInput
                      label="Destination address"
                      placeholder="Start typing an address…"
                      value={destinationPlace}
                      onSelect={setDestinationPlace}
                      onClear={() => setDestinationPlace(null)}
                      ariaLabel="Edit destination address"
                      neverDisabled
                    />
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => openPriceReview('route')}
                  style={{ ...ghostCopperButtonStyle, marginTop: 8 }}
                >
                  Review Price →
                </button>
              </div>

              {/* Price-review sub-panel (D-06, AEDIT-07) */}
              {priceReview && (
                <div style={{ background: 'var(--anthracite-mid)', padding: 24, borderRadius: 2 }}>
                  <h3 style={{ fontFamily: 'var(--font-cormorant)', fontSize: 26, fontWeight: 300, lineHeight: 1.2, color: 'var(--offwhite)', margin: 0 }}>
                    Review Price Change
                  </h3>

                  {priceReview.status === 'loading' && (
                    <div style={{ fontSize: 11, fontFamily: 'var(--font-montserrat)', color: 'var(--warmgrey)', marginTop: 16 }}>
                      Calculating…
                    </div>
                  )}

                  {priceReview.status === 'error' && priceReview.newAmountCzk === null && (
                    <div style={{ fontSize: 11, fontFamily: 'var(--font-montserrat)', color: 'var(--status-danger-fg)', marginTop: 16 }}>
                      {priceReview.errorMessage}
                    </div>
                  )}

                  {priceReview.newAmountCzk !== null && (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 16, fontSize: 13, fontFamily: 'var(--font-montserrat)' }}>
                        <span style={{ color: 'var(--warmgrey)' }}>{priceReview.oldAmountCzk} CZK</span>
                        <span style={{ color: 'var(--warmgrey)' }}>→</span>
                        <span style={{ color: 'var(--copper)', fontWeight: 500 }}>{priceReview.newAmountCzk} CZK</span>
                      </div>

                      {booking.payment_mode === 'card_hold' && (
                        <div data-testid="card-price-note" style={{ fontSize: 11, fontFamily: 'var(--font-montserrat)', color: 'var(--warmgrey)', marginTop: 8 }}>
                          Card booking: the client keeps the agreed price of {booking.amount_czk} CZK (promo included) unless you enter a different amount below. A higher amount is charged to the saved card after the trip.
                        </div>
                      )}

                      {priceReview.mismatch && (
                        <div style={{ fontSize: 11, fontFamily: 'var(--font-montserrat)', color: 'var(--status-danger-fg)', marginTop: 8 }}>
                          Price mismatch — server recompute diverges from the submitted amount. Review and override if intentional.
                          <div style={{ marginTop: 4 }}>
                            Computed: {priceReview.mismatch.computedCzk} CZK · Submitted: {priceReview.mismatch.submittedCzk} CZK
                          </div>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, cursor: 'pointer' }}>
                            <input
                              type="checkbox"
                              checked={priceReview.overrideAcknowledged}
                              onChange={(e) => setPriceReview(prev => prev ? { ...prev, overrideAcknowledged: e.target.checked } : prev)}
                            />
                            <span>I confirm overriding the price to the amount below.</span>
                          </label>
                        </div>
                      )}

                      <div style={{ marginTop: 16 }}>
                        <div style={editHeaderLabelStyle}>Override Amount (CZK)</div>
                        <input
                          type="number"
                          value={priceReview.overrideValue}
                          onChange={(e) => setPriceReview(prev => prev ? { ...prev, overrideValue: e.target.value, overrideActive: true } : prev)}
                          style={editInputStyle}
                          onFocus={editFocusOn}
                          onBlur={editFocusOff}
                        />
                      </div>

                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 16, cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={priceReview.notifyClient}
                          onChange={(e) => setPriceReview(prev => prev ? { ...prev, notifyClient: e.target.checked } : prev)}
                        />
                        <span style={{ fontSize: 13, fontFamily: 'var(--font-montserrat)', color: 'var(--offwhite)' }}>
                          Notify client of this change
                        </span>
                      </label>
                      <div style={{ fontSize: 11, fontFamily: 'var(--font-montserrat)', color: 'var(--warmgrey)', marginTop: 4 }}>
                        Client will receive a branded email showing exactly what changed.
                      </div>

                      {priceReview.errorMessage && !priceReview.mismatch && (
                        <div style={{ fontSize: 11, fontFamily: 'var(--font-montserrat)', color: 'var(--status-danger-fg)', marginTop: 8 }}>
                          {priceReview.errorMessage}
                        </div>
                      )}

                      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                        <button
                          type="button"
                          onClick={() => setPriceReview(null)}
                          style={{
                            height: '32px', padding: '0 16px', background: 'transparent',
                            border: '1px solid var(--anthracite-light)', color: 'var(--warmgrey)', borderRadius: '2px',
                            fontFamily: 'var(--font-montserrat)', fontSize: '11px', letterSpacing: '0.15em',
                            textTransform: 'uppercase', cursor: 'pointer',
                          }}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          disabled={confirmDisabled}
                          onClick={confirmPriceReview}
                          style={{
                            ...ghostCopperButtonStyle,
                            opacity: confirmDisabled ? 0.5 : 1,
                            cursor: confirmDisabled ? 'not-allowed' : 'pointer',
                          }}
                        >
                          {priceReview.status === 'saving' ? 'Calculating…' : 'Confirm & Save'}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// D-05: row-level "Generate Payment Link" action + result panel. Renders
// ONLY for unpaid/pending bookings (64-UI-SPEC.md E3/E2). Mounted identically
// in the desktop expanded row and the mobile expanded card.
interface PaymentLinkSectionProps {
  bookingId: string
  status: string
  paymentLinkUrl: string | null
  clientEmail: string
  amountCzk: number
  onGenerated: (bookingId: string, url: string, linkedBookingId: string | null) => void
}

const paymentLinkIconButtonStyle: React.CSSProperties = {
  background: 'var(--anthracite)',
  border: '1px solid var(--anthracite-light)',
  borderRadius: '2px',
  color: 'var(--copper)',
  cursor: 'pointer',
  padding: '8px 12px',
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  fontFamily: 'var(--font-montserrat)',
  fontSize: '11px',
  fontWeight: 500,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
}

function PaymentLinkSection({ bookingId, status, paymentLinkUrl, clientEmail, amountCzk, onGenerated }: PaymentLinkSectionProps) {
  const [generating, setGenerating] = useState(false)
  const [generateError, setGenerateError] = useState(false)
  const [linkedBookingId, setLinkedBookingId] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [resending, setResending] = useState(false)
  const [resendState, setResendState] = useState<'idle' | 'sent' | 'error'>('idle')

  // D-05: only unpaid/pending bookings are eligible for a payment link.
  if (status !== 'unpaid' && status !== 'pending') return null

  async function handleGenerate() {
    setGenerating(true)
    setGenerateError(false)
    try {
      const res = await fetch(`/api/admin/bookings/${bookingId}/payment-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (res.ok) {
        const data = await res.json()
        setLinkedBookingId(data.linkedBookingId ?? null)
        onGenerated(bookingId, data.paymentLinkUrl, data.linkedBookingId ?? null)
      } else {
        setGenerateError(true)
      }
    } catch {
      setGenerateError(true)
    } finally {
      setGenerating(false)
    }
  }

  async function handleCopyLink(url: string) {
    const didCopy = await copyPaymentLinkToClipboard(url, `payment-link-url-text-${bookingId}`)
    if (didCopy) {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  async function handleResend() {
    setResending(true)
    setResendState('idle')
    try {
      const res = await fetch(`/api/admin/bookings/${bookingId}/payment-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resend: true }),
      })
      if (res.ok) {
        setResendState('sent')
        setTimeout(() => setResendState('idle'), 2000)
      } else {
        setResendState('error')
      }
    } catch {
      setResendState('error')
    } finally {
      setResending(false)
    }
  }

  const amountEur = czkToEur(amountCzk)
  const sectionLabel: React.CSSProperties = {
    fontFamily: 'var(--font-montserrat)',
    fontSize: '11px',
    fontWeight: 300,
    textTransform: 'uppercase',
    letterSpacing: '0.3em',
    color: 'var(--warmgrey)',
    marginBottom: '8px',
  }

  if (paymentLinkUrl) {
    return (
      <div style={{ marginTop: '16px' }} onClick={(e) => e.stopPropagation()}>
        <div style={sectionLabel}>Payment Link</div>
        <div style={{
          background: 'var(--anthracite-mid)',
          borderLeft: '3px solid var(--copper)',
          padding: '24px',
        }}>
          <div style={{
            fontFamily: 'var(--font-montserrat)',
            fontSize: '13px',
            fontWeight: 400,
            color: 'var(--offwhite)',
            marginBottom: '8px',
          }}>
            Payment link ready
          </div>
          <div style={{
            fontFamily: 'var(--font-montserrat)',
            fontSize: '13px',
            fontWeight: 300,
            lineHeight: 1.5,
            color: 'var(--warmgrey)',
            marginBottom: '16px',
          }}>
            Already emailed to {clientEmail}. Copy the link to share it another way (e.g. WhatsApp), or resend the email.
          </div>
          <div
            id={`payment-link-url-text-${bookingId}`}
            style={{
              fontFamily: 'var(--font-montserrat)',
              fontSize: '13px',
              fontWeight: 300,
              lineHeight: 1.5,
              color: 'var(--offwhite)',
              wordBreak: 'break-all',
              marginBottom: '16px',
            }}
          >
            {truncatePaymentLinkUrl(paymentLinkUrl)}
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <button type="button" onClick={() => handleCopyLink(paymentLinkUrl)} style={paymentLinkIconButtonStyle}>
              <Copy size={14} />
              {copied ? 'Copied!' : 'Copy Link'}
            </button>
            <button
              type="button"
              onClick={handleResend}
              disabled={resending}
              style={{ ...paymentLinkIconButtonStyle, opacity: resending ? 0.6 : 1, cursor: resending ? 'not-allowed' : 'pointer' }}
            >
              <Send size={14} />
              {resending ? 'Sending...' : resendState === 'sent' ? 'Sent' : 'Resend Email'}
            </button>
          </div>
          {resendState === 'error' && (
            <div style={{
              fontFamily: 'var(--font-montserrat)',
              fontSize: '11px',
              fontWeight: 300,
              color: 'var(--status-danger-fg)',
              marginTop: '8px',
            }}>
              Failed to send — try again
            </div>
          )}
          {linkedBookingId && (
            <div style={{
              fontFamily: 'var(--font-montserrat)',
              fontSize: '11px',
              fontWeight: 300,
              color: 'var(--warmgrey)',
              marginTop: '8px',
            }}>
              This link also covers the linked return/outbound leg — paying once settles both.
            </div>
          )}
          <div style={{
            fontFamily: 'var(--font-montserrat)',
            fontSize: '13px',
            fontWeight: 400,
            color: 'var(--copper)',
            marginTop: '16px',
          }}>
            {amountEur} EUR
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ marginTop: '16px' }} onClick={(e) => e.stopPropagation()}>
      <div style={sectionLabel}>Payment Link</div>
      <div style={{
        fontFamily: 'var(--font-montserrat)',
        fontSize: '13px',
        fontWeight: 300,
        color: 'var(--offwhite)',
        marginBottom: '4px',
      }}>
        No payment link yet.
      </div>
      <div style={{
        fontFamily: 'var(--font-montserrat)',
        fontSize: '11px',
        fontWeight: 300,
        color: 'var(--warmgrey)',
        marginBottom: '8px',
      }}>
        Generate one to let the client pay online.
      </div>
      <button
        type="button"
        onClick={handleGenerate}
        disabled={generating}
        style={{
          border: '1px solid var(--copper)',
          color: 'var(--offwhite)',
          background: 'transparent',
          minHeight: '44px',
          padding: '0 24px',
          fontSize: '11px',
          fontWeight: 500,
          letterSpacing: '0.15em',
          textTransform: 'uppercase',
          fontFamily: 'var(--font-montserrat)',
          cursor: generating ? 'not-allowed' : 'pointer',
          borderRadius: '2px',
          opacity: generating ? 0.5 : 1,
        }}
        onMouseEnter={(e) => {
          if (!generating) {
            e.currentTarget.style.background = 'var(--copper)'
            e.currentTarget.style.color = 'var(--anthracite)'
          }
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent'
          e.currentTarget.style.color = 'var(--offwhite)'
        }}
      >
        {generating ? 'Generating…' : 'Generate Payment Link'}
      </button>
      {status === 'pending' && (
        <div style={{
          fontFamily: 'var(--font-montserrat)',
          fontSize: '11px',
          fontWeight: 300,
          color: 'var(--warmgrey)',
          marginTop: '8px',
        }}>
          Generating a payment link will mark this booking as Unpaid until the client pays.
        </div>
      )}
      {generateError && (
        <div style={{
          fontFamily: 'var(--font-montserrat)',
          fontSize: '11px',
          fontWeight: 300,
          color: 'var(--status-danger-fg)',
          marginTop: '8px',
        }}>
          Could not generate payment link. Please try again.
        </div>
      )}
    </div>
  )
}

interface BookingsTableProps {
  // DISP-02: the persisted default, read from /api/admin/settings by the
  // parent page. Treated as read-only here — this component NEVER writes
  // back to it. Falls back to the shipped defaults ('future'/7) so the
  // component still renders correctly if the parent hasn't hydrated yet.
  defaultHorizon?: string
  horizonDays?: number
}

// The bookings table opens pre-filtered from a link: /admin/bookings?search={ref|email}.
// Sources: the CRM Booking "Admin link" (Phase 80 D-18, a booking reference),
// the stats Customers tab top-customer links and the Chatwoot panel
// admin_bookings_url (Phase 85 D-11, an email).
// Read once on mount; only a well-formed booking reference (letters, digits,
// hyphens, max 40) or a strict email (<= 254 characters, one @, local part of
// 1-64 characters, a dotted domain, none of whitespace, angle brackets, quotes
// or backtick) is accepted — anything else is ignored. The accepted value is
// only placed in the search box and sent as a bound query parameter. The
// parameter is stripped from the address bar right after it is applied (see
// clearBookingDeepLink) so a later remount of the table — e.g. after a manual
// booking is created — starts from the operator's defaults, not the old link.
const DEEP_LINK_REFERENCE = /^[A-Za-z0-9-]{1,40}$/
const DEEP_LINK_EMAIL = /^[^\s@<>"'`]{1,64}@[^\s@<>"'`]+\.[^\s@<>"'`]+$/

function readBookingDeepLink(): string {
  if (typeof window === 'undefined') return ''
  const raw = new URLSearchParams(window.location.search).get('search')
  if (!raw) return ''
  const value = raw.trim()
  if (DEEP_LINK_REFERENCE.test(value)) return value
  if (value.length <= 254 && DEEP_LINK_EMAIL.test(value)) return value
  return ''
}

function clearBookingDeepLink(): void {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  if (!url.searchParams.has('search')) return
  url.searchParams.delete('search')
  // Keep history.state: the Next.js router stores its own bookkeeping in it.
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`)
}

export default function BookingsTable({ defaultHorizon = 'future', horizonDays: horizonDaysProp = 7 }: BookingsTableProps) {
  const [deepLinkSearch] = useState(readBookingDeepLink)
  // Apply the deep link once: drop it from the URL after the first render has
  // consumed it. Impure work stays out of the useState initializer (StrictMode
  // calls initializers twice).
  useEffect(() => {
    if (deepLinkSearch) clearBookingDeepLink()
  }, [deepLinkSearch])
  const [bookings, setBookings] = useState<Booking[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [expanded, setExpanded] = useState<ExpandedState>({})
  const [tripType, setTripType] = useState<string>('all')
  // D-08: a SEPARATE status dimension from tripType — the 'Unpaid' chip
  // coexists with the trip-type chips rather than replacing them.
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [search, setSearch] = useState(deepLinkSearch)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [showDateFilter, setShowDateFilter] = useState(false)
  // DISP-01/DISP-03/DISP-04 (Plan 65-04): TWO distinct state slots.
  // 1) The persisted default is the `defaultHorizon`/`horizonDaysProp` props
  //    themselves — never re-stored, never mutated by this component.
  // 2) `horizon`/`horizonDays` is the EPHEMERAL in-session override, seeded
  //    from the persisted default on mount. The Future/Past/All segmented
  //    control only ever calls setHorizon — it NEVER PATCHes
  //    /api/admin/settings. A remount (fresh props) re-seeds from the
  //    persisted default, not from whatever was last clicked (D-04).
  //    A Phase 80 D-18 deep link (?search={ref}) starts the session on 'all'
  //    so past bookings are found; still never written back.
  const [horizon, setHorizon] = useState<string>(deepLinkSearch ? 'all' : defaultHorizon)
  const [horizonDays] = useState<number>(horizonDaysProp)
  // D-05 refetch-error state (E2 backstop): distinct from "zero rows" so a
  // legitimately-empty Future view is never confused with a silent failure.
  const [fetchFailed, setFetchFailed] = useState(false)
  const [loading, setLoading] = useState(true)
  const [hoveredRow, setHoveredRow] = useState<string | null>(null)
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [debouncedSearch, setDebouncedSearch] = useState(deepLinkSearch)
  const limit = 20

  const [localNotes, setLocalNotes] = useState<Record<string, string>>({})
  const [statusUpdating, setStatusUpdating] = useState<Record<string, boolean>>({})
  // D-01: per-booking inline message after an admin status change lost the race (409 status_conflict)
  const [statusConflict, setStatusConflict] = useState<Record<string, string>>({})
  const [notesSaving, setNotesSaving] = useState<Record<string, 'idle' | 'saving' | 'saved' | 'error'>>({})
  const notesDebounceRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  const [localDriverPrice, setLocalDriverPrice] = useState<Record<string, string>>({})
  const [driverPriceSaving, setDriverPriceSaving] = useState<Record<string, 'idle' | 'saving' | 'saved' | 'error'>>({})

  const [isMobile, setIsMobile] = useState(false)
  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({})

  // Phase 87 D-16(a): the booking whose Confirm no-show modal is open (banner button or the
  // generic status select / buttons; no_show is terminal, so it is never applied directly).
  const [noShowTarget, setNoShowTarget] = useState<{ id: string; reference: string } | null>(null)

  const [pendingCancel, setPendingCancel] = useState<Booking | null>(null)
  const [cancelling, setCancelling] = useState(false)
  const [cancelError, setCancelError] = useState<string | null>(null)
  // D-20: the cancel applied but the refund failed; the dialog keeps its line and cannot cancel again.
  const [cancelRefundFailed, setCancelRefundFailed] = useState(false)
  // Phase 88-07: per-booking counter that makes an open PaymentPanel refetch after a trip edit.
  const [paymentRefreshKeys, setPaymentRefreshKeys] = useState<Record<string, number>>({})

  // Mobile detection
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // Reset cancel state when modal opens/closes
  useEffect(() => {
    if (!pendingCancel) {
      setCancelling(false)
      setCancelError(null)
      setCancelRefundFailed(false)
    }
  }, [pendingCancel])

  const patchBooking = useCallback(async (body: PatchBody) => {
    const res = await fetch('/api/admin/bookings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: 'Unknown error' }))
      throw new PatchError(data.error ?? 'Update failed', {
        status: res.status,
        computedCzk: data.computedCzk,
        submittedCzk: data.submittedCzk,
        currentStatus: data.error === 'status_conflict' ? data.currentStatus : undefined,
      })
    }
    return res.json()
  }, [])

  // Phase 63 Plan 05: optimistic-update sink for TripEditPanel — mutates only
  // the fields that were actually saved, mirroring handleStatusChange's pattern.
  const handleTripUpdated = useCallback((bookingId: string, patch: Partial<Booking>) => {
    setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, ...patch } : b))
    // Phase 88-07: a trip edit can change the payment (price, pickup); the panel refetches.
    setPaymentRefreshKeys(prev => ({ ...prev, [bookingId]: (prev[bookingId] ?? 0) + 1 }))
  }, [])

  // D-05: sink for PaymentLinkSection's row-level "Generate Payment Link"
  // action — the route also flips a 'pending' source booking to 'unpaid'
  // directly (Pitfall 2), so both fields are optimistically updated here.
  const handlePaymentLinkGenerated = useCallback((bookingId: string, url: string) => {
    setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, payment_link_url: url, status: 'unpaid' } : b))
  }, [])

  const handleStatusChange = useCallback(async (bookingId: string, newStatus: string, fromStatus: string) => {
    setStatusUpdating(prev => ({ ...prev, [bookingId]: true }))
    setStatusConflict(prev => {
      if (!(bookingId in prev)) return prev
      const next = { ...prev }
      delete next[bookingId]
      return next
    })
    try {
      // D-01: expected_status = the status this row shows, so a stale view cannot overwrite the driver
      await patchBooking({ id: bookingId, status: newStatus, expected_status: fromStatus })
      // Optimistic update — mutate only the status field, don't re-fetch
      setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, status: newStatus } : b))
    } catch (err) {
      if (err instanceof PatchError && err.status === 409 && err.message === 'status_conflict') {
        // Lost the race: show the locked inline copy, keep the row as it is, no automatic reload
        setStatusConflict(prev => ({ ...prev, [bookingId]: statusConflictMessage(err.currentStatus) }))
      } else {
        // Show alert on failure — simple for v1.3 single-operator admin
        alert(err instanceof Error ? err.message : 'Status update failed')
      }
    } finally {
      setStatusUpdating(prev => ({ ...prev, [bookingId]: false }))
    }
  }, [patchBooking])

  // T-87-40: every path to the terminal no_show goes through the confirmation modal.
  const requestStatusChange = useCallback((booking: Booking, newStatus: string) => {
    if (newStatus === 'no_show') {
      setNoShowTarget({ id: booking.id, reference: booking.booking_reference })
      return
    }
    // 88-REVIEW T5: a card booking is cancelled through the payment-aware cancel dialog (release / refund), never
    // by a bare status change (the server answers 422 use_cancel_route to that).
    if (newStatus === 'cancelled' && booking.payment_mode === 'card_hold') {
      setPendingCancel(booking)
      return
    }
    handleStatusChange(booking.id, newStatus, booking.status)
  }, [handleStatusChange])

  // The server moved the booking to no_show (final): mirror it locally and drop the request flag.
  const handleNoShowConfirmed = useCallback((bookingId: string) => {
    setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, status: 'no_show', no_show_requested_at: null } : b))
    setStatusConflict(prev => {
      if (!(bookingId in prev)) return prev
      const next = { ...prev }
      delete next[bookingId]
      return next
    })
    setNoShowTarget(null)
  }, [])

  // "Client found": the request is cleared, the status stays on_location.
  const handleNoShowCleared = useCallback((bookingId: string) => {
    setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, no_show_requested_at: null } : b))
  }, [])

  const flushNotes = useCallback(async (bookingId: string, value: string) => {
    setNotesSaving(prev => ({ ...prev, [bookingId]: 'saving' }))
    try {
      await patchBooking({ id: bookingId, operator_notes: value })
      setNotesSaving(prev => ({ ...prev, [bookingId]: 'saved' }))
      // Reset "saved" indicator after 2 seconds
      setTimeout(() => {
        setNotesSaving(prev => prev[bookingId] === 'saved' ? { ...prev, [bookingId]: 'idle' } : prev)
      }, 2000)
    } catch {
      setNotesSaving(prev => ({ ...prev, [bookingId]: 'error' }))
    }
  }, [patchBooking])

  const handleNotesChange = useCallback((bookingId: string, value: string) => {
    setLocalNotes(prev => ({ ...prev, [bookingId]: value }))
    // Cancel pending debounce
    if (notesDebounceRef.current[bookingId]) {
      clearTimeout(notesDebounceRef.current[bookingId])
    }
    // Schedule save after 800ms idle
    notesDebounceRef.current[bookingId] = setTimeout(() => {
      flushNotes(bookingId, value)
    }, 800)
  }, [flushNotes])

  const handleNotesBlur = useCallback((bookingId: string) => {
    // Flush immediately on blur
    const currentValue = localNotes[bookingId]
    if (currentValue !== undefined) {
      if (notesDebounceRef.current[bookingId]) {
        clearTimeout(notesDebounceRef.current[bookingId])
      }
      flushNotes(bookingId, currentValue)
    }
  }, [localNotes, flushNotes])

  const saveDriverPrice = useCallback(async (bookingId: string, rawValue: string) => {
    const trimmed = rawValue.trim()
    // Empty clears the fee (null); otherwise must be a non-negative integer.
    let value: number | null
    if (trimmed === '') {
      value = null
    } else {
      const n = Number(trimmed)
      if (!Number.isInteger(n) || n < 0) {
        setDriverPriceSaving(prev => ({ ...prev, [bookingId]: 'error' }))
        return
      }
      value = n
    }
    setDriverPriceSaving(prev => ({ ...prev, [bookingId]: 'saving' }))
    try {
      await patchBooking({ id: bookingId, driver_price_czk: value })
      setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, driver_price_czk: value } : b))
      setDriverPriceSaving(prev => ({ ...prev, [bookingId]: 'saved' }))
      setTimeout(() => {
        setDriverPriceSaving(prev => prev[bookingId] === 'saved' ? { ...prev, [bookingId]: 'idle' } : prev)
      }, 2000)
    } catch {
      setDriverPriceSaving(prev => ({ ...prev, [bookingId]: 'error' }))
    }
  }, [patchBooking])

  const handleCancel = useCallback(async (booking: Booking) => {
    const cancelBody: { id: string; leg?: 'outbound' | 'return' } = { id: booking.id }
    if (booking.leg !== null && booking.linked_booking_id !== null) {
      cancelBody.leg = booking.leg
    }
    const res = await fetch('/api/admin/bookings/cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cancelBody),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: 'Unknown error' }))
      if (res.status === 502 && data.error === 'refund_failed' && data.cancelled === true) {
        // Phase 88 D-20: the cancel applied (the row is cancelled now) but the refund / release failed.
        setBookings(prev => prev.map(b => b.id === booking.id ? { ...b, status: 'cancelled' } : b))
        throw new CancelRefundFailedError(refundFailedLine(data.amount_minor, data.currency))
      }
      if (res.status === 409 && data.error === 'status_conflict') {
        // Lost the compare-and-set race. The cancel route now applies the status change before it
        // refunds, so a 409 means nothing was refunded: same copy as the status select, no refund note.
        throw new Error(statusConflictMessage(data.currentStatus))
      }
      if (res.status === 409 && data.error === 'payment_busy') {
        // A hold or capture is in flight for this card booking; nothing was cancelled or released.
        throw new Error('A card payment is being processed for this booking. Nothing was cancelled. Try again in a minute.')
      }
      throw new Error(data.error ?? 'Cancel failed')
    }
    // Optimistic update
    setBookings(prev => prev.map(b => b.id === booking.id ? { ...b, status: 'cancelled' } : b))
    setPendingCancel(null)
  }, [])

  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
    searchDebounceRef.current = setTimeout(() => {
      setDebouncedSearch(search)
      setPage(0)
    }, 300)
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
    }
  }, [search])

  const fetchBookings = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('page', String(page))
      params.set('limit', String(limit))
      if (startDate) params.set('startDate', startDate)
      if (endDate) params.set('endDate', endDate)
      if (tripType !== 'all') params.set('tripType', tripType)
      if (statusFilter !== 'all') params.set('status', statusFilter)
      if (debouncedSearch) params.set('search', debouncedSearch)
      // D-07: an explicit manual Date Range takes session precedence over the
      // segmented-control horizon — omit horizon entirely so the manual bound
      // (already set above) drives the query untouched.
      if (!startDate && !endDate) {
        params.set('horizon', horizon)
        if (horizon === 'last_n_days') params.set('horizonDays', String(horizonDays))
      }

      const res = await fetch(`/api/admin/bookings?${params.toString()}`)
      if (!res.ok) {
        console.error('Failed to load bookings', res.status)
        setFetchFailed(true)
        return
      }
      const data = await res.json()
      setFetchFailed(false)
      setBookings(data.bookings ?? [])
      setTotal(data.total ?? 0)
      // Seed localNotes for bookings that don't already have a local edit
      const fetched = data.bookings ?? []
      setLocalNotes(prev => {
        const next = { ...prev }
        fetched.forEach((b: Booking) => {
          if (!(b.id in next)) {
            next[b.id] = b.operator_notes ?? ''
          }
        })
        return next
      })
      setLocalDriverPrice(prev => {
        const next = { ...prev }
        fetched.forEach((b: Booking) => {
          if (!(b.id in next)) {
            next[b.id] = b.driver_price_czk != null ? String(b.driver_price_czk) : ''
          }
        })
        return next
      })
    } catch (err) {
      console.error('fetchBookings error', err)
      setFetchFailed(true)
    } finally {
      setLoading(false)
    }
  }, [page, tripType, statusFilter, debouncedSearch, startDate, endDate, horizon, horizonDays])

  useEffect(() => {
    fetchBookings()
  }, [fetchBookings])

  // Cleanup debounce timers on unmount
  useEffect(() => {
    const debounceMap = notesDebounceRef.current
    return () => {
      Object.values(debounceMap).forEach(timer => clearTimeout(timer))
    }
  }, [])

  const handleFilterChange = useCallback((setter: (v: string) => void) => (v: string) => {
    setter(v)
    setPage(0)
  }, [])

  const columns: ColumnDef<Booking>[] = [
    {
      accessorKey: 'booking_reference',
      header: 'Ref',
      size: 160,
      cell: ({ row }) => (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 0 }}>
          <span style={{
            fontFamily: 'monospace',
            fontSize: '13px',
            color: 'var(--copper)',
          }}>
            {row.original.booking_reference}
          </span>
          {row.original.booking_source === 'manual' && (
            <span style={{
              marginLeft: '8px',
              background: 'var(--admin-accent-tint-strong)',
              color: 'var(--admin-accent-text)',
              border: '1px solid var(--admin-accent-border)',
              fontSize: '11px',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              padding: '4px 8px',
              borderRadius: '2px',
              display: 'inline-block',
            }}>Manual</span>
          )}
          {(row.original.leg === 'return' || (row.original.leg === 'outbound' && row.original.linked_booking_id !== null)) && (
            <span
              data-testid={`leg-badge-${row.original.id}`}
              style={{
                marginLeft: '8px',
                background: 'transparent',
                color: 'var(--copper)',
                border: '1px solid var(--copper)',
                fontFamily: 'var(--font-montserrat)',
                fontSize: '11px',
                fontWeight: 500,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                padding: '4px 8px',
                borderRadius: '2px',
                display: 'inline-block',
              }}
            >
              {row.original.leg === 'return' ? 'Return' : 'Outbound'}
            </span>
          )}
          {row.original.booking_source === 'gnet' && (
            <span
              data-testid={`gnet-badge-${row.original.id}`}
              style={{
                marginLeft: '8px',
                background: 'var(--status-info-bg)',
                color: 'var(--status-info-fg)',
                border: '1px solid var(--status-info-border)',
                fontSize: '11px',
                fontWeight: 500,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                padding: '4px 8px',
                borderRadius: '2px',
                display: 'inline-block',
                fontFamily: 'var(--font-montserrat)',
                lineHeight: 1,
              }}
            >
              GNet
            </span>
          )}
        </span>
      ),
    },
    {
      id: 'pickup',
      header: 'Pickup',
      size: 140,
      cell: ({ row }) => (
        <span>{row.original.pickup_date} · {row.original.pickup_time}</span>
      ),
    },
    {
      id: 'client',
      header: 'Client',
      size: 180,
      cell: ({ row }) => (
        <span>{row.original.client_first_name} {row.original.client_last_name}</span>
      ),
    },
    {
      accessorKey: 'trip_type',
      header: 'Type',
      size: 100,
      cell: ({ getValue }) => {
        const v = getValue<string>()
        return <span>{v.charAt(0).toUpperCase() + v.slice(1)}</span>
      },
    },
    {
      accessorKey: 'vehicle_class',
      header: 'Vehicle',
      size: 120,
      cell: ({ getValue }) => {
        const v = getValue<string>()
        return <span>{vehicleClassMap[v] ?? v}</span>
      },
    },
    {
      accessorKey: 'amount_czk',
      header: 'Amount',
      size: 100,
      cell: ({ getValue }) => (
        <span style={{ textAlign: 'right', display: 'block' }}>
          {getValue<number>()} CZK
        </span>
      ),
    },
    {
      id: 'status',
      header: 'Status',
      size: 120,
      cell: ({ row }) => (
        <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start', gap: '4px', maxWidth: '100%' }}>
          <span style={{ display: 'inline-flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px' }}>
            <StatusBadge
              variant={row.original.status as BookingStatus}
              label={STATUS_LABELS[row.original.status] ?? row.original.status}
            />
            {hasOpenNoShowRequest(row.original) && <NoShowChip />}
          </span>
          {row.original.payment_mode === 'card_hold' && <PaymentStateBadge state={row.original.payment_state ?? 'none'} />}
        </span>
      ),
    },
    {
      id: 'expand',
      header: '',
      size: 48,
      cell: ({ row }) => (
        <span style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--warmgrey)',
        }}>
          {row.getIsExpanded()
            ? <ChevronUp size={16} />
            : <ChevronDown size={16} />}
        </span>
      ),
    },
  ]

  const table = useReactTable({
    data: bookings,
    columns,
    state: { expanded },
    onExpandedChange: setExpanded,
    getCoreRowModel: getCoreRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    manualPagination: true,
    rowCount: total,
  })

  const totalPages = Math.ceil(total / limit)
  const start = total === 0 ? 0 : page * limit + 1
  const end = Math.min(page * limit + limit, total)

  const filterChips = [
    { label: 'All', value: 'all' },
    { label: 'Transfer', value: 'transfer' },
    { label: 'Hourly', value: 'hourly' },
    { label: 'Daily', value: 'daily' },
  ]

  // DISP-03/D-07: an explicit manual Date Range takes session precedence over
  // the segmented control — gray every segment to the inactive-chip style so
  // the admin sees the Date Range is driving the query (not disabled, just
  // visually deferred).
  const dateRangeActive = Boolean(startDate || endDate)
  // 'last_n_days' (persisted-default-only, not a segment) displays as its
  // nearest visible peer, Future, per UI-SPEC.
  const displayHorizon = horizon === 'last_n_days' ? 'future' : horizon
  const horizonSegments = [
    { label: 'Future', value: 'future' },
    { label: 'Past', value: 'past' },
    { label: 'All', value: 'all' },
  ]
  // E2 empty: the Future-segment "nothing upcoming" copy only applies when
  // the segmented control (not a manual Date Range) is actually driving a
  // future-only query.
  const isFutureEmpty = displayHorizon === 'future' && !dateRangeActive

  return (
    <div>
      {/* Filter bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        marginBottom: '16px',
        flexWrap: 'wrap',
      }}>
        {/* Future/Past/All segmented control (DISP-03) — ephemeral in-session
            override, never PATCHes /api/admin/settings. Sits at the top of
            the filter bar per UI-SPEC. */}
        {horizonSegments.map(seg => {
          const isActive = !dateRangeActive && displayHorizon === seg.value
          return (
            <button
              key={seg.value}
              onClick={() => handleFilterChange(setHorizon)(seg.value)}
              style={{
                height: '32px',
                padding: '0 12px',
                fontFamily: 'var(--font-montserrat)',
                fontSize: '11px',
                letterSpacing: '0.06em',
                borderRadius: '2px',
                cursor: 'pointer',
                background: isActive ? 'var(--admin-accent-tint)' : 'transparent',
                border: isActive ? '1px solid var(--copper)' : '1px solid var(--anthracite-light)',
                color: isActive ? 'var(--offwhite)' : 'var(--warmgrey)',
                transition: 'border-color 150ms ease, color 150ms ease',
              }}
            >
              {seg.label}
            </button>
          )
        })}

        {/* Separator */}
        <div style={{ width: '1px', height: '20px', background: 'var(--anthracite-light)' }} />

        {/* Search input */}
        <div style={{ position: 'relative' }}>
          <span style={{
            position: 'absolute',
            left: '12px',
            top: '50%',
            transform: 'translateY(-50%)',
            color: 'var(--warmgrey)',
            display: 'flex',
            alignItems: 'center',
          }}>
            <Search size={13} />
          </span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search client or reference..."
            style={{
              width: '240px',
              height: '32px',
              background: 'var(--anthracite)',
              border: '1px solid var(--anthracite-light)',
              borderRadius: '2px',
              padding: '0 12px 0 36px',
              fontFamily: 'var(--font-montserrat)',
              fontSize: '13px',
              color: 'var(--offwhite)',
              outline: 'none',
              boxSizing: 'border-box',
            }}
            onFocus={(e) => { e.target.style.borderColor = 'var(--copper)' }}
            onBlur={(e) => { e.target.style.borderColor = 'var(--anthracite-light)' }}
          />
        </div>

        {/* Date range button */}
        <button
          onClick={() => setShowDateFilter(v => !v)}
          style={{
            height: '32px',
            padding: '0 12px',
            fontFamily: 'var(--font-montserrat)',
            fontSize: '11px',
            letterSpacing: '0.06em',
            borderRadius: '2px',
            cursor: 'pointer',
            background: showDateFilter ? 'var(--admin-accent-tint)' : 'transparent',
            border: showDateFilter ? '1px solid var(--copper)' : '1px solid var(--anthracite-light)',
            color: showDateFilter ? 'var(--offwhite)' : 'var(--warmgrey)',
            transition: 'border-color 150ms ease, color 150ms ease',
          }}
        >
          Date Range
        </button>

        {/* Date inputs */}
        {showDateFilter && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{
                fontFamily: 'var(--font-montserrat)',
                fontSize: '11px',
                color: 'var(--warmgrey)',
                letterSpacing: '0.06em',
              }}>
                From
              </span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => { setStartDate(e.target.value); setPage(0) }}
                style={{
                  width: '140px',
                  height: '32px',
                  background: 'var(--anthracite)',
                  border: '1px solid var(--anthracite-light)',
                  borderRadius: '2px',
                  padding: '0 12px',
                  fontFamily: 'var(--font-montserrat)',
                  fontSize: '13px',
                  color: 'var(--offwhite)',
                  outline: 'none',
                  boxSizing: 'border-box',
                  colorScheme: 'dark',
                }}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{
                fontFamily: 'var(--font-montserrat)',
                fontSize: '11px',
                color: 'var(--warmgrey)',
                letterSpacing: '0.06em',
              }}>
                To
              </span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => { setEndDate(e.target.value); setPage(0) }}
                style={{
                  width: '140px',
                  height: '32px',
                  background: 'var(--anthracite)',
                  border: '1px solid var(--anthracite-light)',
                  borderRadius: '2px',
                  padding: '0 12px',
                  fontFamily: 'var(--font-montserrat)',
                  fontSize: '13px',
                  color: 'var(--offwhite)',
                  outline: 'none',
                  boxSizing: 'border-box',
                  colorScheme: 'dark',
                }}
              />
            </div>
          </>
        )}

        {/* Separator */}
        <div style={{ width: '1px', height: '20px', background: 'var(--anthracite-light)' }} />

        {/* Filter chips */}
        {filterChips.map(chip => {
          const isActive = tripType === chip.value
          return (
            <button
              key={chip.value}
              onClick={() => handleFilterChange(setTripType)(chip.value)}
              style={{
                height: '32px',
                padding: '0 12px',
                fontFamily: 'var(--font-montserrat)',
                fontSize: '11px',
                letterSpacing: '0.06em',
                borderRadius: '2px',
                cursor: 'pointer',
                background: isActive ? 'var(--admin-accent-tint)' : 'transparent',
                border: isActive ? '1px solid var(--copper)' : '1px solid var(--anthracite-light)',
                color: isActive ? 'var(--offwhite)' : 'var(--warmgrey)',
                transition: 'border-color 150ms ease, color 150ms ease',
              }}
            >
              {chip.label}
            </button>
          )
        })}

        {/* Unpaid status chip — separate dimension from trip-type chips (D-08) */}
        <button
          onClick={() => handleFilterChange(setStatusFilter)(statusFilter === 'unpaid' ? 'all' : 'unpaid')}
          style={{
            height: '32px',
            padding: '0 12px',
            fontFamily: 'var(--font-montserrat)',
            fontSize: '11px',
            letterSpacing: '0.06em',
            borderRadius: '2px',
            cursor: 'pointer',
            background: statusFilter === 'unpaid' ? 'var(--status-warn-bg)' : 'transparent',
            border: statusFilter === 'unpaid' ? '1px solid var(--status-warn-fg)' : '1px solid var(--anthracite-light)',
            color: statusFilter === 'unpaid' ? 'var(--offwhite)' : 'var(--warmgrey)',
            transition: 'border-color 150ms ease, color 150ms ease',
          }}
        >
          Unpaid
        </button>
      </div>

      {/* Mobile card layout */}
      {!isMobile ? null : (
        <div className="md:hidden" data-testid="mobile-cards">
          {loading ? (
            <div style={{
              padding: '32px',
              textAlign: 'center',
              fontFamily: 'var(--font-montserrat)',
              fontSize: '13px',
              color: 'var(--warmgrey)',
            }}>Loading...</div>
          ) : fetchFailed ? (
            <div style={{
              padding: '32px',
              textAlign: 'center',
              fontFamily: 'var(--font-montserrat)',
              fontSize: '13px',
              color: 'var(--status-danger-fg)',
            }}>
              Couldn&apos;t load bookings — check your connection and try again.
            </div>
          ) : bookings.length === 0 ? (
            <div style={{
              padding: '32px',
              textAlign: 'center',
              fontFamily: 'var(--font-montserrat)',
              fontSize: '13px',
              color: 'var(--warmgrey)',
            }}>
              {isFutureEmpty ? (
                <>
                  <div>No upcoming trips</div>
                  <div style={{ marginTop: '8px' }}>Every confirmed booking has passed. Switch to Past or All to see historical trips.</div>
                </>
              ) : (
                <>
                  <div>No bookings found.</div>
                  <div style={{ marginTop: '8px' }}>Adjust your filters or check back later.</div>
                </>
              )}
            </div>
          ) : (
            bookings.map((booking) => {
              const isExpanded = !!expandedCards[booking.id]
              const transitions = UI_TRANSITIONS[booking.status] ?? []
              return (
                <div
                  key={booking.id}
                  style={{
                    backgroundColor: booking.status === 'unpaid' ? 'var(--status-warn-bg)' : 'var(--admin-surface)',
                    border: '1px solid var(--admin-border)',
                    borderRadius: 8,
                    padding: 16,
                    marginBottom: 12,
                  }}
                  onClick={() => setExpandedCards(prev => ({ ...prev, [booking.id]: !prev[booking.id] }))}
                >
                  {/* Top row: ref + status */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{
                      fontFamily: 'monospace',
                      fontSize: '13px',
                      color: booking.booking_source === 'manual' ? 'var(--admin-accent-text)' : 'var(--copper)',
                    }}>
                      {booking.booking_reference}
                      {booking.booking_source === 'manual' && (
                        <span style={{
                          marginLeft: '8px',
                          background: 'var(--admin-accent-tint-strong)',
                          color: 'var(--admin-accent-text)',
                          border: '1px solid var(--admin-accent-border)',
                          fontSize: '11px',
                          textTransform: 'uppercase' as const,
                          letterSpacing: '0.08em',
                          padding: '2px 6px',
                          borderRadius: '2px',
                        }}>Manual</span>
                      )}
                      {(booking.leg === 'return' || (booking.leg === 'outbound' && booking.linked_booking_id !== null)) && (
                        <span
                          data-testid={`leg-badge-mobile-${booking.id}`}
                          style={{
                            marginLeft: '8px',
                            background: 'transparent',
                            color: 'var(--copper)',
                            border: '1px solid var(--copper)',
                            fontFamily: 'var(--font-montserrat)',
                            fontSize: '11px',
                            fontWeight: 500,
                            textTransform: 'uppercase' as const,
                            letterSpacing: '0.08em',
                            padding: '2px 6px',
                            borderRadius: '2px',
                          }}
                        >
                          {booking.leg === 'return' ? 'Return' : 'Outbound'}
                        </span>
                      )}
                      {booking.booking_source === 'gnet' && (
                        <span
                          data-testid={`gnet-badge-mobile-${booking.id}`}
                          style={{
                            marginLeft: '8px',
                            background: 'var(--status-info-bg)',
                            color: 'var(--status-info-fg)',
                            border: '1px solid var(--status-info-border)',
                            fontSize: '11px',
                            fontWeight: 500,
                            textTransform: 'uppercase' as const,
                            letterSpacing: '0.08em',
                            padding: '4px 8px',
                            borderRadius: '2px',
                            display: 'inline-block',
                            fontFamily: 'var(--font-montserrat)',
                            lineHeight: 1,
                          }}
                        >
                          GNet
                        </span>
                      )}
                    </span>
                    <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px', maxWidth: '100%' }}>
                      <span style={{ display: 'inline-flex', flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'center', gap: '4px' }}>
                        <StatusBadge
                          variant={booking.status as BookingStatus}
                          label={STATUS_LABELS[booking.status] ?? booking.status}
                        />
                        {hasOpenNoShowRequest(booking) && <NoShowChip />}
                      </span>
                      {booking.payment_mode === 'card_hold' && <PaymentStateBadge state={booking.payment_state ?? 'none'} />}
                    </span>
                  </div>

                  {/* Client name */}
                  <div style={{
                    fontFamily: 'var(--font-montserrat)',
                    fontSize: '13px',
                    color: 'var(--offwhite)',
                    marginBottom: 4,
                  }}>
                    {booking.client_first_name} {booking.client_last_name}
                  </div>

                  {/* Pickup + vehicle */}
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontFamily: 'var(--font-montserrat)',
                    fontSize: '11px',
                    color: 'var(--warmgrey)',
                    marginBottom: 4,
                  }}>
                    <span>{booking.pickup_date} · {booking.pickup_time}</span>
                    <span>{vehicleClassMap[booking.vehicle_class] ?? booking.vehicle_class}</span>
                  </div>

                  {/* Amount */}
                  <div style={{
                    fontFamily: 'var(--font-montserrat)',
                    fontSize: '13px',
                    color: 'var(--offwhite)',
                    textAlign: 'right' as const,
                    marginBottom: 8,
                  }}>
                    {booking.amount_czk} CZK
                  </div>

                  {/* Status transitions */}
                  {transitions.length > 0 && (
                    <>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 8 }} onClick={e => e.stopPropagation()}>
                      {transitions.map(s => (
                        <button
                          key={s}
                          disabled={!!statusUpdating[booking.id]}
                          onClick={() => requestStatusChange(booking, s)}
                          style={{
                            minHeight: 44,
                            minWidth: 44,
                            flex: 1,
                            background: 'transparent',
                            border: '1px solid var(--anthracite-light)',
                            borderRadius: '2px',
                            color: 'var(--offwhite)',
                            fontFamily: 'var(--font-montserrat)',
                            fontSize: '11px',
                            letterSpacing: '0.1em',
                            textTransform: 'uppercase' as const,
                            cursor: statusUpdating[booking.id] ? 'not-allowed' : 'pointer',
                            opacity: statusUpdating[booking.id] ? 0.5 : 1,
                          }}
                        >
                          {statusUpdating[booking.id] ? '...' : STATUS_LABELS[s]}
                        </button>
                      ))}
                    </div>
                    {statusConflict[booking.id] && (
                      <div role="alert" style={{ ...STATUS_CONFLICT_STYLE, marginTop: 0, marginBottom: 8 }} onClick={e => e.stopPropagation()}>
                        {statusConflict[booking.id]}
                      </div>
                    )}
                    </>
                  )}

                  {/* Expanded details */}
                  {isExpanded && (
                    <div style={{ marginTop: 12, borderTop: '1px solid var(--admin-border)', paddingTop: 12 }} onClick={e => e.stopPropagation()}>
                      {hasOpenNoShowRequest(booking) && booking.no_show_requested_at && (
                        <NoShowBanner
                          bookingId={booking.id}
                          requestedAt={booking.no_show_requested_at}
                          onConfirmRequest={() => setNoShowTarget({ id: booking.id, reference: booking.booking_reference })}
                          onCleared={() => handleNoShowCleared(booking.id)}
                        />
                      )}
                      {booking.flight_iata && (
                        <FlightStatusBlock
                          bookingId={booking.id}
                          flightIata={booking.flight_iata}
                          initialStatus={booking.flight_status}
                          initialEstimatedArrival={booking.flight_estimated_arrival}
                          initialDelayMinutes={booking.flight_delay_minutes}
                        />
                      )}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: 12 }}>
                        <DetailField label="Origin" value={booking.origin_address} />
                        <DetailField label="Destination" value={booking.destination_address} />
                        <DetailField label="Email" value={booking.client_email} />
                        <DetailField label="Phone" value={booking.client_phone} />
                        {booking.flight_number && <DetailField label="Flight" value={booking.flight_number} />}
                        {booking.terminal && <DetailField label="Terminal" value={booking.terminal} />}
                        {booking.special_requests && <DetailField label="Requests" value={booking.special_requests} />}
                        <DetailField label="Language" value={booking.locale ? booking.locale.toUpperCase() : '—'} />
                        <DetailField
                          label="Child seat"
                          value={booking.extra_child_seat ? <StatusBadge variant="active" label="Yes" /> : '—'}
                        />
                        <DetailField
                          label="Meet & greet"
                          value={booking.extra_meet_greet ? <StatusBadge variant="active" label="Yes" /> : '—'}
                        />
                        <DetailField
                          label="Extra luggage"
                          value={booking.extra_luggage ? <StatusBadge variant="active" label="Yes" /> : '—'}
                        />
                        {booking.leg === 'return' && booking.linked_booking?.booking_reference && (
                          <DetailField
                            label="Paired outbound"
                            value={
                              <button
                                type="button"
                                data-testid={`linked-ref-chip-mobile-${booking.id}`}
                                aria-label={`Search for paired outbound booking ${booking.linked_booking.booking_reference}`}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  const ref = booking.linked_booking?.booking_reference
                                  if (ref) {
                                    setSearch(ref)
                                    setDebouncedSearch(ref)
                                    setPage(0)
                                  }
                                }}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  border: '1px solid var(--copper)',
                                  color: 'var(--copper)',
                                  background: 'transparent',
                                  borderRadius: '2px',
                                  padding: '4px 12px',
                                  fontFamily: 'var(--font-montserrat)',
                                  fontSize: '11px',
                                  fontWeight: 500,
                                  letterSpacing: '0.12em',
                                  textTransform: 'uppercase' as const,
                                  cursor: 'pointer',
                                }}
                                onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.8' }}
                                onMouseLeave={(e) => { e.currentTarget.style.opacity = '1' }}
                              >
                                {booking.linked_booking.booking_reference}
                              </button>
                            }
                          />
                        )}
                      </div>

                      {/* Operator notes */}
                      <div style={{ marginTop: 8 }}>
                        <div style={{
                          fontFamily: 'var(--font-montserrat)',
                          fontSize: '11px',
                          textTransform: 'uppercase',
                          letterSpacing: '0.3em',
                          color: 'var(--warmgrey)',
                          marginBottom: '4px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                        }}>
                          Operator Notes
                          {notesSaving[booking.id] === 'saving' && (
                            <span style={{ color: 'var(--copper)', fontSize: '10px' }}>Saving...</span>
                          )}
                          {notesSaving[booking.id] === 'saved' && (
                            <span style={{ color: 'var(--status-ok-fg)', fontSize: '10px' }}>Saved</span>
                          )}
                          {notesSaving[booking.id] === 'error' && (
                            <span style={{ color: 'var(--status-danger-fg)', fontSize: '10px' }}>Error saving</span>
                          )}
                        </div>
                        <textarea
                          value={localNotes[booking.id] ?? booking.operator_notes ?? ''}
                          onChange={(e) => handleNotesChange(booking.id, e.target.value)}
                          onBlur={() => handleNotesBlur(booking.id)}
                          onClick={(e) => e.stopPropagation()}
                          maxLength={2000}
                          placeholder="Add internal notes..."
                          rows={3}
                          style={{
                            width: '100%',
                            background: 'var(--anthracite-mid)',
                            border: '1px solid var(--anthracite-light)',
                            borderRadius: '2px',
                            padding: '8px 12px',
                            fontFamily: 'var(--font-montserrat)',
                            fontSize: '13px',
                            color: 'var(--offwhite)',
                            resize: 'vertical',
                            outline: 'none',
                            boxSizing: 'border-box' as const,
                          }}
                          onFocus={(e) => { e.target.style.borderColor = 'var(--copper)' }}
                        />
                      </div>

                      {/* Payment panel (Phase 88 HOLD-07) */}
                      <PaymentPanel
                        bookingId={booking.id}
                        refreshKey={paymentRefreshKeys[booking.id] ?? 0}
                        paymentMode={booking.payment_mode ?? null}
                      />

                      {/* Payment Link (D-05) */}
                      <PaymentLinkSection
                        bookingId={booking.id}
                        status={booking.status}
                        paymentLinkUrl={booking.payment_link_url}
                        clientEmail={booking.client_email}
                        amountCzk={booking.amount_czk}
                        onGenerated={handlePaymentLinkGenerated}
                      />

                      {/* Trip-edit mode (Phase 63 Plan 05) */}
                      <TripEditPanel booking={booking} patchBooking={patchBooking} onUpdated={handleTripUpdated} />

                      {/* Change history (D-11, FOLLOW-02) */}
                      <div style={{ marginTop: 16 }} onClick={(e) => e.stopPropagation()}>
                        <BookingChangeHistory bookingId={booking.id} />
                      </div>

                      {/* Cancel button */}
                      {(booking.status === 'pending' || booking.status === 'confirmed') && (
                        <div style={{ marginTop: 12 }}>
                          <button
                            onClick={(e) => { e.stopPropagation(); setPendingCancel(booking) }}
                            style={{
                              border: '1px solid var(--anthracite-light)',
                              background: 'transparent',
                              color: 'var(--warmgrey)',
                              fontFamily: 'var(--font-montserrat)',
                              fontSize: '11px',
                              fontWeight: 500,
                              letterSpacing: '3px',
                              textTransform: 'uppercase' as const,
                              padding: '0 24px',
                              minHeight: 44,
                              borderRadius: '2px',
                              cursor: 'pointer',
                              width: '100%',
                            }}
                          >
                            Cancel Booking
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      )}

      {/* Table (desktop) */}
      <div className="hidden md:block" data-testid="desktop-table" style={{
        width: '100%',
        border: '1px solid var(--anthracite-light)',
        borderRadius: '4px',
        overflow: 'hidden',
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            {table.getHeaderGroups().map(headerGroup => (
              <tr key={headerGroup.id} style={{
                background: 'var(--anthracite)',
                borderBottom: '1px solid var(--anthracite-light)',
                height: '40px',
              }}>
                {headerGroup.headers.map(header => (
                  <th
                    key={header.id}
                    style={{
                      padding: '0 12px',
                      textAlign: header.column.id === 'amount_czk' ? 'right' : 'left',
                      fontFamily: 'var(--font-montserrat)',
                      fontSize: '11px',
                      fontWeight: 400,
                      textTransform: 'uppercase',
                      letterSpacing: '0.4em',
                      color: 'var(--warmgrey)',
                      width: header.getSize(),
                    }}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td
                  colSpan={columns.length}
                  style={{
                    padding: '32px',
                    textAlign: 'center',
                    fontFamily: 'var(--font-montserrat)',
                    fontSize: '13px',
                    color: 'var(--warmgrey)',
                  }}
                >
                  Loading...
                </td>
              </tr>
            ) : fetchFailed ? (
              <tr>
                <td
                  colSpan={columns.length}
                  style={{
                    padding: '32px',
                    textAlign: 'center',
                    fontFamily: 'var(--font-montserrat)',
                    fontSize: '13px',
                    color: 'var(--status-danger-fg)',
                  }}
                >
                  Couldn&apos;t load bookings — check your connection and try again.
                </td>
              </tr>
            ) : bookings.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  style={{
                    padding: '32px',
                    textAlign: 'center',
                    fontFamily: 'var(--font-montserrat)',
                    fontSize: '13px',
                    color: 'var(--warmgrey)',
                  }}
                >
                  {isFutureEmpty ? (
                    <>
                      <div>No upcoming trips</div>
                      <div style={{ marginTop: '8px' }}>Every confirmed booking has passed. Switch to Past or All to see historical trips.</div>
                    </>
                  ) : (
                    <>
                      <div>No bookings found.</div>
                      <div style={{ marginTop: '8px' }}>Adjust your filters or check back later.</div>
                    </>
                  )}
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map(row => (
                <React.Fragment key={row.id}>
                  <tr
                    onClick={() => row.toggleExpanded()}
                    onMouseEnter={() => setHoveredRow(row.id)}
                    onMouseLeave={() => setHoveredRow(null)}
                    style={{
                      background: row.getIsExpanded() || hoveredRow === row.id
                        ? 'var(--anthracite-light)'
                        : row.original.status === 'unpaid'
                          ? 'var(--status-warn-bg)'
                          : 'var(--anthracite-mid)',
                      borderBottom: '1px solid var(--anthracite-light)',
                      minHeight: '44px',
                      cursor: 'pointer',
                    }}
                  >
                    {row.getVisibleCells().map(cell => (
                      <td
                        key={cell.id}
                        style={{
                          padding: '0 12px',
                          height: '44px',
                          fontFamily: 'var(--font-montserrat)',
                          fontSize: '13px',
                          color: 'var(--offwhite)',
                          width: cell.column.getSize(),
                        }}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                  {row.getIsExpanded() && (
                    <tr key={`${row.id}-expanded`}>
                      <td
                        colSpan={columns.length}
                        style={{
                          background: 'var(--anthracite)',
                          padding: '16px 20px',
                          borderBottom: '1px solid var(--anthracite-light)',
                        }}
                      >
                        {hasOpenNoShowRequest(row.original) && row.original.no_show_requested_at && (
                          <NoShowBanner
                            bookingId={row.original.id}
                            requestedAt={row.original.no_show_requested_at}
                            onConfirmRequest={() => setNoShowTarget({ id: row.original.id, reference: row.original.booking_reference })}
                            onCleared={() => handleNoShowCleared(row.original.id)}
                          />
                        )}
                        {row.original.flight_iata && (
                          <FlightStatusBlock
                            bookingId={row.original.id}
                            flightIata={row.original.flight_iata}
                            initialStatus={row.original.flight_status}
                            initialEstimatedArrival={row.original.flight_estimated_arrival}
                            initialDelayMinutes={row.original.flight_delay_minutes}
                          />
                        )}
                        <div style={{
                          display: 'grid',
                          gridTemplateColumns: '1fr 1fr',
                          gap: '12px',
                        }}>
                          <DetailField label="Origin" value={row.original.origin_address} />
                          <DetailField label="Destination" value={row.original.destination_address} />
                          {row.original.trip_type === 'hourly' && row.original.hours !== null && (
                            <DetailField label="Duration" value={`${row.original.hours} hours`} />
                          )}
                          <DetailField label="Passengers" value={String(row.original.passengers)} />
                          <DetailField label="Luggage" value={String(row.original.luggage)} />
                          <DetailField
                            label="Child seat"
                            value={row.original.extra_child_seat
                              ? <StatusBadge variant="active" label="Yes" />
                              : '—'}
                          />
                          <DetailField
                            label="Meet & greet"
                            value={row.original.extra_meet_greet
                              ? <StatusBadge variant="active" label="Yes" />
                              : '—'}
                          />
                          <DetailField
                            label="Extra luggage"
                            value={row.original.extra_luggage
                              ? <StatusBadge variant="active" label="Yes" />
                              : '—'}
                          />
                          <DetailField label="Flight" value={row.original.flight_number ?? '—'} />
                          <DetailField label="Terminal" value={row.original.terminal ?? '—'} />
                          <DetailField label="Return" value={row.original.return_date ?? '—'} />
                          <DetailField label="Notes" value={row.original.special_requests ?? '—'} />
                          <DetailField label="Language" value={row.original.locale ? row.original.locale.toUpperCase() : '—'} />
                          <DetailField
                            label="Payment ID"
                            value={
                              row.original.payment_intent_id ? (
                                <span style={{ fontFamily: 'monospace', fontSize: '13px' }}>
                                  {row.original.payment_intent_id.length > 24
                                    ? `${row.original.payment_intent_id.slice(0, 24)}...`
                                    : row.original.payment_intent_id}
                                </span>
                              ) : '—'
                            }
                          />
                          {row.original.leg === 'return' && row.original.linked_booking?.booking_reference && (
                            <DetailField
                              label="Paired outbound"
                              value={
                                <button
                                  type="button"
                                  data-testid={`linked-ref-chip-${row.original.id}`}
                                  aria-label={`Search for paired outbound booking ${row.original.linked_booking.booking_reference}`}
                                  onClick={() => {
                                    const ref = row.original.linked_booking?.booking_reference
                                    if (ref) {
                                      setSearch(ref)
                                      setDebouncedSearch(ref)
                                      setPage(0)
                                    }
                                  }}
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    border: '1px solid var(--copper)',
                                    color: 'var(--copper)',
                                    background: 'transparent',
                                    borderRadius: '2px',
                                    padding: '4px 12px',
                                    fontFamily: 'var(--font-montserrat)',
                                    fontSize: '11px',
                                    fontWeight: 500,
                                    letterSpacing: '0.12em',
                                    textTransform: 'uppercase',
                                    cursor: 'pointer',
                                  }}
                                  onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.8' }}
                                  onMouseLeave={(e) => { e.currentTarget.style.opacity = '1' }}
                                >
                                  {row.original.linked_booking.booking_reference}
                                </button>
                              }
                            />
                          )}
                        </div>

                        {/* Status transition */}
                        <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <span style={{
                            fontFamily: 'var(--font-montserrat)',
                            fontSize: '11px',
                            textTransform: 'uppercase',
                            letterSpacing: '0.3em',
                            color: 'var(--warmgrey)',
                          }}>
                            Status
                          </span>
                          {(UI_TRANSITIONS[row.original.status] ?? []).length > 0 ? (
                            <select
                              value=""
                              disabled={!!statusUpdating[row.original.id]}
                              onChange={(e) => {
                                if (e.target.value) requestStatusChange(row.original, e.target.value)
                              }}
                              onClick={(e) => e.stopPropagation()}
                              style={{
                                height: '32px',
                                padding: '0 8px',
                                background: 'var(--anthracite)',
                                border: '1px solid var(--anthracite-light)',
                                borderRadius: '2px',
                                fontFamily: 'var(--font-montserrat)',
                                fontSize: '13px',
                                color: 'var(--offwhite)',
                                cursor: statusUpdating[row.original.id] ? 'not-allowed' : 'pointer',
                                opacity: statusUpdating[row.original.id] ? 0.5 : 1,
                              }}
                            >
                              <option value="" disabled>
                                {statusUpdating[row.original.id] ? 'Updating...' : `Change from ${STATUS_LABELS[row.original.status]}...`}
                              </option>
                              {(UI_TRANSITIONS[row.original.status] ?? []).map(s => (
                                <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                              ))}
                            </select>
                          ) : (
                            <StatusBadge
                              variant={row.original.status as BookingStatus}
                              label={`${STATUS_LABELS[row.original.status]} (final)`}
                            />
                          )}
                        </div>
                        {statusConflict[row.original.id] && (
                          <div role="alert" style={STATUS_CONFLICT_STYLE}>
                            {statusConflict[row.original.id]}
                          </div>
                        )}

                        {/* Operator notes */}
                        <div style={{ marginTop: '16px' }}>
                          <div style={{
                            fontFamily: 'var(--font-montserrat)',
                            fontSize: '11px',
                            textTransform: 'uppercase',
                            letterSpacing: '0.3em',
                            color: 'var(--warmgrey)',
                            marginBottom: '4px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                          }}>
                            Operator Notes
                            {notesSaving[row.original.id] === 'saving' && (
                              <span style={{ color: 'var(--copper)', fontSize: '10px', letterSpacing: '0.1em' }}>Saving...</span>
                            )}
                            {notesSaving[row.original.id] === 'saved' && (
                              <span style={{ color: 'var(--status-ok-fg)', fontSize: '10px', letterSpacing: '0.1em' }}>Saved</span>
                            )}
                            {notesSaving[row.original.id] === 'error' && (
                              <span style={{ color: 'var(--status-danger-fg)', fontSize: '10px', letterSpacing: '0.1em' }}>Error saving</span>
                            )}
                          </div>
                          <textarea
                            value={localNotes[row.original.id] ?? row.original.operator_notes ?? ''}
                            onChange={(e) => handleNotesChange(row.original.id, e.target.value)}
                            onBlur={() => handleNotesBlur(row.original.id)}
                            onClick={(e) => e.stopPropagation()}
                            maxLength={2000}
                            placeholder="Add internal notes..."
                            rows={3}
                            style={{
                              width: '100%',
                              background: 'var(--anthracite-mid)',
                              border: '1px solid var(--anthracite-light)',
                              borderRadius: '2px',
                              padding: '8px 12px',
                              fontFamily: 'var(--font-montserrat)',
                              fontSize: '13px',
                              color: 'var(--offwhite)',
                              resize: 'vertical',
                              outline: 'none',
                              boxSizing: 'border-box',
                            }}
                            onFocus={(e) => { e.target.style.borderColor = 'var(--copper)' }}
                          />
                        </div>

                        {/* Driver Price (shown to driver in assignment email) */}
                        <div style={{ marginTop: '16px' }} onClick={(e) => e.stopPropagation()}>
                          <div style={{
                            fontFamily: 'var(--font-montserrat)', fontSize: '11px', textTransform: 'uppercase',
                            letterSpacing: '0.3em', color: 'var(--warmgrey)', marginBottom: '4px',
                            display: 'flex', alignItems: 'center', gap: '8px',
                          }}>
                            Driver Price (CZK)
                            {driverPriceSaving[row.original.id] === 'saving' && <span style={{ color: 'var(--copper)', fontSize: '10px', letterSpacing: '0.1em' }}>Saving...</span>}
                            {driverPriceSaving[row.original.id] === 'saved' && <span style={{ color: 'var(--status-ok-fg)', fontSize: '10px', letterSpacing: '0.1em' }}>Saved</span>}
                            {driverPriceSaving[row.original.id] === 'error' && <span style={{ color: 'var(--status-danger-fg)', fontSize: '10px', letterSpacing: '0.1em' }}>Enter a whole number ≥ 0</span>}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <input
                              type="number"
                              min={0}
                              step={1}
                              value={localDriverPrice[row.original.id] ?? ''}
                              onChange={(e) => setLocalDriverPrice(prev => ({ ...prev, [row.original.id]: e.target.value }))}
                              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); saveDriverPrice(row.original.id, localDriverPrice[row.original.id] ?? '') } }}
                              placeholder="e.g. 1000 — leave empty to hide"
                              style={{
                                width: '220px', height: '32px', background: 'var(--anthracite-mid)',
                                border: '1px solid var(--anthracite-light)', borderRadius: '2px', padding: '0 12px',
                                fontFamily: 'var(--font-montserrat)', fontSize: '13px', color: 'var(--offwhite)',
                                outline: 'none', boxSizing: 'border-box',
                              }}
                              onFocus={(e) => { e.target.style.borderColor = 'var(--copper)' }}
                              onBlur={(e) => { e.target.style.borderColor = 'var(--anthracite-light)'; saveDriverPrice(row.original.id, localDriverPrice[row.original.id] ?? '') }}
                            />
                            <button
                              onClick={() => saveDriverPrice(row.original.id, localDriverPrice[row.original.id] ?? '')}
                              style={{
                                height: '32px', padding: '0 16px', background: 'transparent',
                                border: '1px solid var(--copper)', color: 'var(--copper)', borderRadius: '2px',
                                fontFamily: 'var(--font-montserrat)', fontSize: '11px', letterSpacing: '0.15em',
                                textTransform: 'uppercase', cursor: 'pointer',
                              }}
                            >Save</button>
                          </div>
                          <span style={{
                            fontFamily: 'var(--font-montserrat)', fontSize: '11px', fontWeight: 300,
                            color: 'var(--warmgrey)', marginTop: '4px', display: 'block',
                          }}>Shown to the driver in the assignment email. Empty = no price shown.</span>
                        </div>

                        {/* Driver Assignment */}
                        <DriverAssignmentSection
                          bookingId={row.original.id}
                          bookingStatus={row.original.status}
                          onAssigned={(newStatus) => {
                            setBookings(prev =>
                              prev.map(b => b.id === row.original.id ? { ...b, status: newStatus } : b)
                            )
                          }}
                        />

                        {/* Payment panel (Phase 88 HOLD-07) */}
                        <PaymentPanel
                          bookingId={row.original.id}
                          refreshKey={paymentRefreshKeys[row.original.id] ?? 0}
                          paymentMode={row.original.payment_mode ?? null}
                        />

                        {/* Payment Link (D-05) */}
                        <PaymentLinkSection
                          bookingId={row.original.id}
                          status={row.original.status}
                          paymentLinkUrl={row.original.payment_link_url}
                          clientEmail={row.original.client_email}
                          amountCzk={row.original.amount_czk}
                          onGenerated={handlePaymentLinkGenerated}
                        />

                        {/* Trip-edit mode (Phase 63 Plan 05) */}
                        <TripEditPanel booking={row.original} patchBooking={patchBooking} onUpdated={handleTripUpdated} />

                        {/* Change history (D-11, FOLLOW-02) */}
                        <div style={{ marginTop: '16px' }} onClick={(e) => e.stopPropagation()}>
                          <BookingChangeHistory bookingId={row.original.id} />
                        </div>

                        {/* Cancel Booking button — only for cancellable statuses */}
                        {(row.original.status === 'pending' || row.original.status === 'confirmed') && (
                          <div style={{ marginTop: '16px' }}>
                            <button
                              onClick={(e) => { e.stopPropagation(); setPendingCancel(row.original) }}
                              style={{
                                border: '1px solid var(--anthracite-light)',
                                background: 'transparent',
                                color: 'var(--warmgrey)',
                                fontFamily: 'var(--font-montserrat)',
                                fontSize: '11px',
                                fontWeight: 500,
                                letterSpacing: '3px',
                                textTransform: 'uppercase',
                                padding: '0 24px',
                                minHeight: '44px',
                                borderRadius: '2px',
                                cursor: 'pointer',
                              }}
                            >
                              Cancel Booking
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div style={{
        display: 'flex',
        justifyContent: 'flex-end',
        alignItems: 'center',
        gap: '12px',
        marginTop: '16px',
      }}>
        <span style={{
          fontFamily: 'var(--font-montserrat)',
          fontSize: '11px',
          color: 'var(--warmgrey)',
        }}>
          Showing {start}–{end} of {total}
        </span>
        <button
          onClick={() => setPage(p => Math.max(0, p - 1))}
          disabled={page === 0}
          style={{
            border: '1px solid var(--anthracite-light)',
            padding: '8px 16px',
            fontFamily: 'var(--font-montserrat)',
            fontSize: '11px',
            textTransform: 'uppercase',
            letterSpacing: '0.2em',
            color: 'var(--warmgrey)',
            borderRadius: '2px',
            cursor: page === 0 ? 'not-allowed' : 'pointer',
            background: 'transparent',
            opacity: page === 0 ? 0.4 : 1,
            pointerEvents: page === 0 ? 'none' : 'auto',
          }}
        >
          Previous
        </button>
        <span style={{
          fontFamily: 'var(--font-montserrat)',
          fontSize: '11px',
          color: 'var(--warmgrey)',
        }}>
          Page {totalPages === 0 ? 0 : page + 1} of {totalPages}
        </span>
        <button
          onClick={() => setPage(p => p + 1)}
          disabled={page >= totalPages - 1}
          style={{
            border: '1px solid var(--anthracite-light)',
            padding: '8px 16px',
            fontFamily: 'var(--font-montserrat)',
            fontSize: '11px',
            textTransform: 'uppercase',
            letterSpacing: '0.2em',
            color: 'var(--warmgrey)',
            borderRadius: '2px',
            cursor: page >= totalPages - 1 ? 'not-allowed' : 'pointer',
            background: 'transparent',
            opacity: page >= totalPages - 1 ? 0.4 : 1,
            pointerEvents: page >= totalPages - 1 ? 'none' : 'auto',
          }}
        >
          Next
        </button>
      </div>

      {/* Confirm no-show (Phase 87 D-16 a): the only way to reach the terminal no_show status */}
      <ConfirmNoShowModal
        isOpen={noShowTarget !== null}
        bookingId={noShowTarget?.id ?? ''}
        bookingReference={noShowTarget?.reference ?? ''}
        onClose={() => setNoShowTarget(null)}
        onConfirmed={() => { if (noShowTarget) handleNoShowConfirmed(noShowTarget.id) }}
      />

      {/* CancellationModal */}
      {pendingCancel !== null && (
        <div
          onClick={() => { if (!cancelling) setPendingCancel(null) }}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'var(--admin-scrim)',
            zIndex: 50,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--admin-surface)',
              border: '1px solid var(--admin-border)',
              borderRadius: 'var(--admin-radius-lg)',
              maxWidth: '480px',
              width: '100%',
              padding: 'var(--admin-sheet-padding)',
              boxShadow: 'var(--admin-shadow-sheet)',
              position: 'relative',
            }}
          >
            {/* Close button */}
            <button
              aria-label="Close"
              onClick={() => { if (!cancelling) setPendingCancel(null) }}
              style={{
                position: 'absolute',
                top: '24px',
                right: '24px',
                background: 'none',
                border: 'none',
                color: 'var(--warmgrey)',
                cursor: 'pointer',
                padding: 0,
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <X size={16} />
            </button>

            {/* Heading */}
            <h2 style={{
              fontFamily: 'var(--admin-font-heading)',
              fontSize: 'var(--admin-fs-heading)',
              fontWeight: 'var(--admin-fw-heading)',
              lineHeight: 1.2,
              color: 'var(--offwhite)',
              margin: 0,
            }}>
              Cancel Booking
            </h2>

            {pendingCancel.payment_mode === 'card_hold' && (pendingCancel.payment_state === 'captured' || pendingCancel.payment_state === 'balance_due') ? (
              /* Variant E (88-REVIEW T4): card booking already paid (recovery link) before the trip — full refund */
              <>
                <p style={{
                  fontSize: '13px',
                  fontFamily: 'var(--font-montserrat)',
                  fontWeight: 300,
                  color: 'var(--warmgrey)',
                  marginTop: '16px',
                  lineHeight: 1.8,
                }}>
                  This booking was already paid by card. Cancelling will issue a full refund to the client&apos;s card. This action cannot be undone.
                </p>
                <p style={{
                  fontSize: '11px',
                  fontFamily: 'var(--font-montserrat)',
                  fontWeight: 500,
                  textTransform: 'uppercase',
                  color: 'var(--status-danger-fg)',
                  marginTop: '12px',
                }}>
                  A full Stripe refund will be issued.
                </p>
              </>
            ) : pendingCancel.payment_mode === 'card_hold' ? (
              /* Variant D (Phase 88 D-04): card on file, nothing collected yet — release the hold */
              <>
                <p style={{
                  fontSize: '13px',
                  fontFamily: 'var(--font-montserrat)',
                  fontWeight: 300,
                  color: 'var(--warmgrey)',
                  marginTop: '16px',
                  lineHeight: 1.8,
                }}>
                  Cancelling releases the hold on the client&apos;s card. Nothing is charged. This action cannot be undone.
                </p>
                <p style={{
                  fontSize: '11px',
                  fontFamily: 'var(--font-montserrat)',
                  fontWeight: 500,
                  textTransform: 'uppercase',
                  color: 'var(--status-danger-fg)',
                  marginTop: '12px',
                }}>
                  The card hold will be released.
                </p>
              </>
            ) : pendingCancel.payment_intent_id !== null && pendingCancel.leg !== null && pendingCancel.linked_booking_id !== null && pendingCancel.booking_source !== 'gnet' ? (
              /* Variant C: Stripe-paid round-trip leg — partial refund */
              (() => {
                const legAmountCzk = pendingCancel.leg === 'outbound'
                  ? pendingCancel.outbound_amount_czk
                  : pendingCancel.return_amount_czk
                const pairedLegLabel = pendingCancel.leg === 'outbound' ? 'return' : 'outbound'
                const pairedRef = pendingCancel.linked_booking?.booking_reference ?? '—'
                return (
                  <>
                    <p style={{
                      fontSize: '13px',
                      fontFamily: 'var(--font-montserrat)',
                      fontWeight: 300,
                      color: 'var(--warmgrey)',
                      marginTop: '16px',
                      lineHeight: 1.8,
                    }}>
                      This booking was paid online. Cancelling will issue a partial refund for this leg only. This action cannot be undone.
                    </p>
                    <p style={{
                      fontSize: '13px',
                      fontFamily: 'var(--font-montserrat)',
                      fontWeight: 500,
                      color: 'var(--offwhite)',
                      marginTop: '12px',
                    }}>
                      Refund: {legAmountCzk ?? '—'} CZK for this leg only.
                    </p>
                    <p style={{
                      fontSize: '11px',
                      fontFamily: 'var(--font-montserrat)',
                      fontWeight: 500,
                      textTransform: 'uppercase',
                      color: 'var(--status-danger-fg)',
                      marginTop: '8px',
                    }}>
                      The paired {pairedLegLabel} booking {pairedRef} will NOT be affected and remains active.
                    </p>
                    <p style={{
                      fontSize: '11px',
                      fontFamily: 'var(--font-montserrat)',
                      fontWeight: 500,
                      textTransform: 'uppercase',
                      color: 'var(--status-danger-fg)',
                      marginTop: '8px',
                    }}>
                      Partial Stripe refund will be issued for this leg.
                    </p>
                  </>
                )
              })()
            ) : pendingCancel.payment_intent_id !== null && pendingCancel.booking_source !== 'gnet' ? (
              /* Variant A: Stripe-paid one-way — full refund (unchanged) */
              <>
                <p style={{
                  fontSize: '13px',
                  fontFamily: 'var(--font-montserrat)',
                  fontWeight: 300,
                  color: 'var(--warmgrey)',
                  marginTop: '16px',
                  lineHeight: 1.8,
                }}>
                  This booking was paid online. Cancelling will issue a full refund to the client&apos;s card. This action cannot be undone.
                </p>
                <p style={{
                  fontSize: '11px',
                  fontFamily: 'var(--font-montserrat)',
                  fontWeight: 500,
                  textTransform: 'uppercase',
                  color: 'var(--status-danger-fg)',
                  marginTop: '12px',
                }}>
                  A full Stripe refund will be issued.
                </p>
              </>
            ) : (
              /* Variant B: GNet or Manual */
              pendingCancel.booking_source === 'gnet' ? (
                <p style={{
                  fontSize: '13px',
                  fontFamily: 'var(--font-montserrat)',
                  fontWeight: 300,
                  color: 'var(--warmgrey)',
                  marginTop: '16px',
                  lineHeight: 1.8,
                }}>
                  This booking was received from a GNet partner. Billing is handled directly by the GNet partner. Cancelling will mark the booking as cancelled and push the CANCEL status to GNet.
                </p>
              ) : (
                <p style={{
                  fontSize: '13px',
                  fontFamily: 'var(--font-montserrat)',
                  fontWeight: 300,
                  color: 'var(--warmgrey)',
                  marginTop: '16px',
                  lineHeight: 1.8,
                }}>
                  This booking was created manually and has no payment record. Cancelling will mark the booking as cancelled.
                </p>
              )
            )}

            {/* Action buttons */}
            <div style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '12px',
              marginTop: '24px',
            }}>
              <button
                onClick={() => setPendingCancel(null)}
                disabled={cancelling}
                style={{
                  border: '1px solid var(--anthracite-light)',
                  color: 'var(--warmgrey)',
                  background: 'transparent',
                  minHeight: '44px',
                  padding: '0 24px',
                  fontFamily: 'var(--font-montserrat)',
                  fontSize: '11px',
                  fontWeight: 500,
                  letterSpacing: '3px',
                  textTransform: 'uppercase',
                  borderRadius: '2px',
                  cursor: cancelling ? 'not-allowed' : 'pointer',
                  opacity: cancelling ? 0.7 : 1,
                }}
              >
                Keep Booking
              </button>
              <button
                onClick={async () => {
                  setCancelling(true)
                  setCancelError(null)
                  try {
                    await handleCancel(pendingCancel)
                  } catch (err) {
                    if (err instanceof CancelRefundFailedError) setCancelRefundFailed(true)
                    setCancelError(err instanceof Error ? err.message : 'Cancel failed')
                  } finally {
                    setCancelling(false)
                  }
                }}
                disabled={cancelling || cancelRefundFailed}
                style={{
                  border: '1px solid var(--copper)',
                  color: 'var(--copper)',
                  background: 'transparent',
                  minHeight: '44px',
                  padding: '0 24px',
                  fontFamily: 'var(--font-montserrat)',
                  fontSize: '11px',
                  fontWeight: 500,
                  letterSpacing: '3px',
                  textTransform: 'uppercase',
                  borderRadius: '2px',
                  cursor: cancelling || cancelRefundFailed ? 'not-allowed' : 'pointer',
                  opacity: cancelling || cancelRefundFailed ? 0.7 : 1,
                }}
              >
                {cancelling
                  ? 'Cancelling...'
                  : pendingCancel.payment_mode === 'card_hold'
                    ? (pendingCancel.payment_state === 'captured' || pendingCancel.payment_state === 'balance_due'
                        ? 'Confirm Cancel + Refund'
                        : 'Confirm Cancel + Release Hold')
                    : pendingCancel.payment_intent_id !== null && pendingCancel.booking_source !== 'gnet'
                      ? 'Confirm Cancel + Refund'
                      : 'Cancel Booking'}
              </button>
            </div>

            {/* Error message */}
            {cancelError && (
              <p style={{
                fontSize: '11px',
                fontFamily: 'var(--font-montserrat)',
                fontWeight: 300,
                color: 'var(--status-danger-fg)',
                marginTop: '8px',
                textAlign: 'right',
              }}>
                {cancelError}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
