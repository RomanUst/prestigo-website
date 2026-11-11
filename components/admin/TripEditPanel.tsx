'use client'
import React from 'react'
import { useState, useCallback, useEffect, useRef } from 'react'
import { formatMinor } from '@/lib/payments/money'
import { formatPragueFull } from './PaymentPanel'
import { TERMINAL_BOOKING_STATUSES, type BookingStatus } from '@/lib/booking-status'
import AddressInput from '@/components/booking/AddressInput'
import type { PlaceResult } from '@/types/booking'
import { eurToCzk } from '@/lib/currency'
import { LANDING_OFFSETS, pickupFromLanding } from '@/lib/airport-pickup'
import {
  PatchError,
  STATUS_LABELS,
  type AdminBooking,
  type PatchBody,
} from './bookingTypes'

type Booking = AdminBooking

// Phase 88 D-16/D-17/D-18: the trip-edit PATCH may carry the payment effect of the change.
const PAYMENT_IN_PROGRESS_COPY = 'Payment is being processed for this booking. Wait a moment and try again.'

/** A Prague calendar date (YYYY-MM-DD) as "Thu 12 Nov", without inventing a time of day. */
function formatPragueDay(dateIso: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateIso)
  if (!m) return null
  // Noon UTC is the same calendar day in Prague all year round.
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12))
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Prague', weekday: 'short', day: 'numeric', month: 'short' }).format(d).replace(',', '')
}

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
    // 88-REVIEW C-WR-06: hold_date_iso is a calendar date (no time); the instant is hold_at_iso. A hold whose time has
    // already come is placed by the next scheduled run, not on a date.
    const atMs = typeof effect.hold_at_iso === 'string' ? Date.parse(effect.hold_at_iso) : NaN
    if (Number.isFinite(atMs)) {
      if (atMs <= Date.now()) return 'Pickup moved. The current hold was released. A new hold is placed on the next scheduled run (within 15 minutes).'
      return `Pickup moved. The current hold was released. A new hold is placed on ${formatPragueFull(effect.hold_at_iso as string)}.`
    }
    const day = typeof effect.hold_date_iso === 'string' ? formatPragueDay(effect.hold_date_iso) : null
    return day
      ? `Pickup moved. The current hold was released. A new hold is placed on ${day}.`
      : 'Pickup moved. The current hold was released.'
  }
  return null
}

// Phase 91 Pitfall 10: the recalculated price covers the vehicle, the route and the extras, not the detour through the
// stops or their waiting time, so the server refuses to reprice a booking with stops unless the operator sets the price.
const STOPS_PRICE_NOTE =
  'This booking has stops: the recalculated price leaves out the detour and the waiting. Set the price by hand.'

/** The pickups a landing allows, as clock times: "14:00, 14:15, 14:30, 14:45, 15:00 or 15:30". Null without a landing. */
function allowedPickupTimes(booking: Booking): string[] | null {
  if (!booking.landing_date || !booking.landing_time) return null
  const times: string[] = []
  for (const offset of LANDING_OFFSETS) {
    const derived = pickupFromLanding(booking.landing_date, booking.landing_time.slice(0, 5), offset)
    if (derived) times.push(derived.pickupTime)
  }
  return times.length > 0 ? times : null
}

/** Phase 91 (D-07, D-18): the hint under the pickup fields of an airport booking timed from its landing. */
function landingPickupHint(booking: Booking): string | null {
  const times = allowedPickupTimes(booking)
  if (!times || !booking.landing_time) return null
  const list = times.length > 1 ? `${times.slice(0, -1).join(', ')} or ${times[times.length - 1]}` : times[0]
  return `Timed from landing ${booking.landing_time.slice(0, 5)}: pickup can be ${list}. For a new landing time use Move pickup.`
}

/** The offset whose pickup (landing + offset) is exactly this date and time; null when there is none. */
function offsetForPickup(booking: Booking, date: string, time: string): number | null {
  if (!booking.landing_date || !booking.landing_time) return null
  for (const offset of LANDING_OFFSETS) {
    const derived = pickupFromLanding(booking.landing_date, booking.landing_time.slice(0, 5), offset)
    if (derived && derived.pickupDate === date && derived.pickupTime === time) return offset
  }
  return null
}

/**
 * Error text for a failed trip-edit PATCH: the friendly copy for payment_in_progress, the stops note for
 * stops_edit_unsupported, the landing hint for landing_pickup_mismatch, else the message.
 */
function tripEditErrorText(err: unknown, fallback: string, landingHint: string | null = null): string {
  if (err instanceof PatchError && err.status === 409 && err.message === 'payment_in_progress') return PAYMENT_IN_PROGRESS_COPY
  if (err instanceof PatchError && err.status === 422 && err.message === 'stops_edit_unsupported') return STOPS_PRICE_NOTE
  if (err instanceof PatchError && err.status === 422 && err.message === 'landing_pickup_mismatch') {
    return landingHint ?? 'The pickup must be the landing time plus an allowed delay. For a new landing time use Move pickup.'
  }
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
  /** Reports whether the edit form is open: an open form is unsaved input that a refetch must not disturb. */
  onEditOpenChange?: (open: boolean) => void
}

export function TripEditPanel({ booking, patchBooking, onUpdated, onEditOpenChange }: TripEditPanelProps) {
  const isTerminal = TERMINAL_BOOKING_STATUSES.has(booking.status as BookingStatus)
  const [editOpen, setEditOpen] = useState(false)
  const onEditOpenChangeRef = useRef(onEditOpenChange)
  useEffect(() => {
    onEditOpenChangeRef.current = onEditOpenChange
  })
  // Report every change of the open state, and "closed" when the panel goes away while the form is open.
  useEffect(() => {
    onEditOpenChangeRef.current?.(editOpen)
    return () => { if (editOpen) onEditOpenChangeRef.current?.(false) }
  }, [editOpen])

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
  const hasStops = (booking.stops?.length ?? 0) > 0
  const landingHint = landingPickupHint(booking)
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
      // The server writes pickup_offset_min with the pickup; keep the row in step so the panel shows the new offset.
      const offset = offsetForPickup(booking, fields.pickup_date, fields.pickup_time)
      if (offset !== null) bookingPatch.pickup_offset_min = offset
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
      setFieldErrors(prev => ({ ...prev, [group]: tripEditErrorText(err, 'Save failed', landingHint) }))
      setFieldSaving(prev => ({ ...prev, [group]: 'error' }))
    }
  }, [fields, booking, patchBooking, onUpdated, landingHint])

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
      // Phase 91: the same for a booking with stops, whose recompute leaves out the detour and the waiting.
      const startValue = booking.payment_mode === 'card_hold' || hasStops ? booking.amount_czk : newAmountCzk
      setPriceReview(prev => prev ? {
        ...prev, status: 'ready', newAmountCzk, distanceKm: data.distanceKm ?? null, overrideValue: String(startValue),
      } : prev)
    } catch {
      setPriceReview(prev => prev ? { ...prev, status: 'error', errorMessage: 'Price calculation failed.' } : prev)
    }
  }, [booking, hasStops, originPlace, destinationPlace, vehicleClass, fields.pickup_date, fields.pickup_time])

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
                {landingHint && (
                  <div data-testid="landing-pickup-hint" style={{ fontSize: 11, fontFamily: 'var(--font-montserrat)', color: 'var(--warmgrey)', marginTop: 8 }}>
                    {landingHint}
                  </div>
                )}
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

                  {hasStops && (
                    <div data-testid="stops-price-note" style={{ fontSize: 11, fontFamily: 'var(--font-montserrat)', color: 'var(--warmgrey)', marginTop: 8 }}>
                      {STOPS_PRICE_NOTE}
                    </div>
                  )}

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
