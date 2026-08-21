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
import { ChevronDown, ChevronUp, Search, X } from 'lucide-react'
import { StatusBadge } from './StatusBadge'
import { FlightStatusBlock } from './FlightStatusBlock'
import { BookingChangeHistory } from './BookingChangeHistory'
import { DriverAssignmentSection } from '@/components/admin/DriverAssignmentSection'
import { UI_TRANSITIONS } from '@/lib/booking-transitions'
import AddressInput from '@/components/booking/AddressInput'
import type { PlaceResult } from '@/types/booking'
import { eurToCzk } from '@/lib/currency'

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
}

const vehicleClassMap: Record<string, string> = {
  business: 'Business',
  first_class: 'First Class',
  business_van: 'Business Van',
}

const STATUS_LABELS: Record<string, string> = {
  unpaid:      'Unpaid',
  pending:     'Pending',
  confirmed:   'Confirmed',
  completed:   'Completed',
  cancelled:   'Cancelled',
  assigned:    'Assigned',
  en_route:    'En Route',
  on_location: 'On Location',
}

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
  constructor(message: string, extra?: { status?: number; computedCzk?: number; submittedCzk?: number }) {
    super(message)
    this.name = 'PatchError'
    this.status = extra?.status
    this.computedCzk = extra?.computedCzk
    this.submittedCzk = extra?.submittedCzk
  }
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
  if (state === 'saved') return <span style={{ color: '#4ade80', fontSize: '11px', letterSpacing: '0.1em' }}>Saved</span>
  if (state === 'error') return <span style={{ color: '#f87171', fontSize: '11px', letterSpacing: '0.1em' }}>{errorText || 'Error saving'}</span>
  return null
}

interface TripEditPanelProps {
  booking: Booking
  patchBooking: (body: PatchBody) => Promise<unknown>
  onUpdated: (bookingId: string, patch: Partial<Booking>) => void
}

function TripEditPanel({ booking, patchBooking, onUpdated }: TripEditPanelProps) {
  const isTerminal = booking.status === 'completed' || booking.status === 'cancelled'
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

    try {
      await patchBooking(patch)
      onUpdated(booking.id, bookingPatch)
      setFieldSaving(prev => ({ ...prev, [group]: 'saved' }))
      setTimeout(() => {
        setFieldSaving(prev => prev[group] === 'saved' ? { ...prev, [group]: 'idle' } : prev)
      }, 2000)
    } catch (err) {
      setFieldErrors(prev => ({ ...prev, [group]: err instanceof Error ? err.message : 'Save failed' }))
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
      setPriceReview(prev => prev ? {
        ...prev, status: 'ready', newAmountCzk, distanceKm: data.distanceKm ?? null, overrideValue: String(newAmountCzk),
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

    try {
      await patchBooking(patch)
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
        setPriceReview(prev => prev ? { ...prev, status: 'ready', errorMessage: err instanceof Error ? err.message : 'Save failed.' } : prev)
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
              background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.25)',
              borderRadius: 2, padding: '8px 16px', marginBottom: 16,
            }}>
              This booking originated from a GNet partner — edits are recorded locally but not synced back to GNet.
            </div>
          )}

          <button type="button" onClick={() => setEditOpen(o => !o)} style={ghostCopperButtonStyle}>
            {editOpen ? 'Close Edit Mode' : 'Edit Trip Details'}
          </button>

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
                  label="PICKUP ADDRESS"
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
                      label="DESTINATION ADDRESS"
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
                    <div style={{ fontSize: 11, fontFamily: 'var(--font-montserrat)', color: '#f87171', marginTop: 16 }}>
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

                      {priceReview.mismatch && (
                        <div style={{ fontSize: 11, fontFamily: 'var(--font-montserrat)', color: '#f87171', marginTop: 8 }}>
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
                        <div style={{ fontSize: 11, fontFamily: 'var(--font-montserrat)', color: '#f87171', marginTop: 8 }}>
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

export default function BookingsTable() {
  const [bookings, setBookings] = useState<Booking[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [expanded, setExpanded] = useState<ExpandedState>({})
  const [tripType, setTripType] = useState<string>('all')
  // D-08: a SEPARATE status dimension from tripType — the 'Unpaid' chip
  // coexists with the trip-type chips rather than replacing them.
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [showDateFilter, setShowDateFilter] = useState(false)
  const [loading, setLoading] = useState(true)
  const [hoveredRow, setHoveredRow] = useState<string | null>(null)
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const limit = 20

  const [localNotes, setLocalNotes] = useState<Record<string, string>>({})
  const [statusUpdating, setStatusUpdating] = useState<Record<string, boolean>>({})
  const [notesSaving, setNotesSaving] = useState<Record<string, 'idle' | 'saving' | 'saved' | 'error'>>({})
  const notesDebounceRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  const [localDriverPrice, setLocalDriverPrice] = useState<Record<string, string>>({})
  const [driverPriceSaving, setDriverPriceSaving] = useState<Record<string, 'idle' | 'saving' | 'saved' | 'error'>>({})

  const [isMobile, setIsMobile] = useState(false)
  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({})

  const [pendingCancel, setPendingCancel] = useState<Booking | null>(null)
  const [cancelling, setCancelling] = useState(false)
  const [cancelError, setCancelError] = useState<string | null>(null)

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
      })
    }
    return res.json()
  }, [])

  // Phase 63 Plan 05: optimistic-update sink for TripEditPanel — mutates only
  // the fields that were actually saved, mirroring handleStatusChange's pattern.
  const handleTripUpdated = useCallback((bookingId: string, patch: Partial<Booking>) => {
    setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, ...patch } : b))
  }, [])

  const handleStatusChange = useCallback(async (bookingId: string, newStatus: string) => {
    setStatusUpdating(prev => ({ ...prev, [bookingId]: true }))
    try {
      await patchBooking({ id: bookingId, status: newStatus })
      // Optimistic update — mutate only the status field, don't re-fetch
      setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, status: newStatus } : b))
    } catch (err) {
      // Show alert on failure — simple for v1.3 single-operator admin
      alert(err instanceof Error ? err.message : 'Status update failed')
    } finally {
      setStatusUpdating(prev => ({ ...prev, [bookingId]: false }))
    }
  }, [patchBooking])

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

      const res = await fetch(`/api/admin/bookings?${params.toString()}`)
      if (!res.ok) {
        console.error('Failed to load bookings', res.status)
        return
      }
      const data = await res.json()
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
    } finally {
      setLoading(false)
    }
  }, [page, tripType, statusFilter, debouncedSearch, startDate, endDate])

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
      header: 'REF',
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
              background: '#2a2a1a',
              color: '#E8B87A',
              border: '1px solid rgba(184,115,51,0.25)',
              fontSize: '11px',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              padding: '4px 8px',
              borderRadius: '2px',
              display: 'inline-block',
            }}>MANUAL</span>
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
              {row.original.leg === 'return' ? 'RETURN' : 'OUTBOUND'}
            </span>
          )}
          {row.original.booking_source === 'gnet' && (
            <span
              data-testid={`gnet-badge-${row.original.id}`}
              style={{
                marginLeft: '8px',
                background: '#1a2a3a',
                color: '#60a5fa',
                border: '1px solid rgba(59,130,246,0.25)',
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
              GNET
            </span>
          )}
        </span>
      ),
    },
    {
      id: 'pickup',
      header: 'PICKUP',
      size: 140,
      cell: ({ row }) => (
        <span>{row.original.pickup_date} · {row.original.pickup_time}</span>
      ),
    },
    {
      id: 'client',
      header: 'CLIENT',
      size: 180,
      cell: ({ row }) => (
        <span>{row.original.client_first_name} {row.original.client_last_name}</span>
      ),
    },
    {
      accessorKey: 'trip_type',
      header: 'TYPE',
      size: 100,
      cell: ({ getValue }) => {
        const v = getValue<string>()
        return <span>{v.charAt(0).toUpperCase() + v.slice(1)}</span>
      },
    },
    {
      accessorKey: 'vehicle_class',
      header: 'VEHICLE',
      size: 120,
      cell: ({ getValue }) => {
        const v = getValue<string>()
        return <span>{vehicleClassMap[v] ?? v}</span>
      },
    },
    {
      accessorKey: 'amount_czk',
      header: 'AMOUNT',
      size: 100,
      cell: ({ getValue }) => (
        <span style={{ textAlign: 'right', display: 'block' }}>
          {getValue<number>()} CZK
        </span>
      ),
    },
    {
      id: 'status',
      header: 'STATUS',
      size: 120,
      cell: ({ row }) => (
        <StatusBadge
          variant={row.original.status as 'unpaid' | 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'assigned' | 'en_route' | 'on_location'}
          label={STATUS_LABELS[row.original.status] ?? row.original.status}
        />
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
            background: showDateFilter ? 'rgba(184,115,51,0.09)' : 'transparent',
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
                background: isActive ? 'rgba(184,115,51,0.09)' : 'transparent',
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
            background: statusFilter === 'unpaid' ? 'rgba(245,158,11,0.09)' : 'transparent',
            border: statusFilter === 'unpaid' ? '1px solid #f59e0b' : '1px solid var(--anthracite-light)',
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
          ) : bookings.length === 0 ? (
            <div style={{
              padding: '32px',
              textAlign: 'center',
              fontFamily: 'var(--font-montserrat)',
              fontSize: '13px',
              color: 'var(--warmgrey)',
            }}>
              <div>No bookings found.</div>
              <div style={{ marginTop: '8px' }}>Adjust your filters or check back later.</div>
            </div>
          ) : (
            bookings.map((booking) => {
              const isExpanded = !!expandedCards[booking.id]
              const transitions = UI_TRANSITIONS[booking.status] ?? []
              return (
                <div
                  key={booking.id}
                  style={{
                    backgroundColor: booking.status === 'unpaid' ? 'rgba(245,158,11,0.06)' : '#36363B',
                    border: '1px solid #4E4E56',
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
                      color: booking.booking_source === 'manual' ? '#E8B87A' : 'var(--copper)',
                    }}>
                      {booking.booking_reference}
                      {booking.booking_source === 'manual' && (
                        <span style={{
                          marginLeft: '8px',
                          background: '#2a2a1a',
                          color: '#E8B87A',
                          border: '1px solid rgba(184,115,51,0.25)',
                          fontSize: '11px',
                          textTransform: 'uppercase' as const,
                          letterSpacing: '0.08em',
                          padding: '2px 6px',
                          borderRadius: '2px',
                        }}>MANUAL</span>
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
                          {booking.leg === 'return' ? 'RETURN' : 'OUTBOUND'}
                        </span>
                      )}
                      {booking.booking_source === 'gnet' && (
                        <span
                          data-testid={`gnet-badge-mobile-${booking.id}`}
                          style={{
                            marginLeft: '8px',
                            background: '#1a2a3a',
                            color: '#60a5fa',
                            border: '1px solid rgba(59,130,246,0.25)',
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
                          GNET
                        </span>
                      )}
                    </span>
                    <StatusBadge
                      variant={booking.status as 'unpaid' | 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'assigned' | 'en_route' | 'on_location'}
                      label={STATUS_LABELS[booking.status] ?? booking.status}
                    />
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
                    <div style={{ display: 'flex', gap: 8, marginBottom: 8 }} onClick={e => e.stopPropagation()}>
                      {transitions.map(s => (
                        <button
                          key={s}
                          disabled={!!statusUpdating[booking.id]}
                          onClick={() => handleStatusChange(booking.id, s)}
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
                  )}

                  {/* Expanded details */}
                  {isExpanded && (
                    <div style={{ marginTop: 12, borderTop: '1px solid #4E4E56', paddingTop: 12 }} onClick={e => e.stopPropagation()}>
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
                        <DetailField label="ORIGIN" value={booking.origin_address} />
                        <DetailField label="DESTINATION" value={booking.destination_address} />
                        <DetailField label="EMAIL" value={booking.client_email} />
                        <DetailField label="PHONE" value={booking.client_phone} />
                        {booking.flight_number && <DetailField label="FLIGHT" value={booking.flight_number} />}
                        {booking.terminal && <DetailField label="TERMINAL" value={booking.terminal} />}
                        {booking.special_requests && <DetailField label="REQUESTS" value={booking.special_requests} />}
                        <DetailField
                          label="CHILD SEAT"
                          value={booking.extra_child_seat ? <StatusBadge variant="active" label="Yes" /> : '—'}
                        />
                        <DetailField
                          label="MEET & GREET"
                          value={booking.extra_meet_greet ? <StatusBadge variant="active" label="Yes" /> : '—'}
                        />
                        <DetailField
                          label="EXTRA LUGGAGE"
                          value={booking.extra_luggage ? <StatusBadge variant="active" label="Yes" /> : '—'}
                        />
                        {booking.leg === 'return' && booking.linked_booking?.booking_reference && (
                          <DetailField
                            label="PAIRED OUTBOUND"
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
                            <span style={{ color: '#4ade80', fontSize: '10px' }}>Saved</span>
                          )}
                          {notesSaving[booking.id] === 'error' && (
                            <span style={{ color: '#f87171', fontSize: '10px' }}>Error saving</span>
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
                  <div>No bookings found.</div>
                  <div style={{ marginTop: '8px' }}>Adjust your filters or check back later.</div>
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
                          ? 'rgba(245,158,11,0.06)'
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
                          <DetailField label="ORIGIN" value={row.original.origin_address} />
                          <DetailField label="DESTINATION" value={row.original.destination_address} />
                          {row.original.trip_type === 'hourly' && row.original.hours !== null && (
                            <DetailField label="DURATION" value={`${row.original.hours} hours`} />
                          )}
                          <DetailField label="PASSENGERS" value={String(row.original.passengers)} />
                          <DetailField label="LUGGAGE" value={String(row.original.luggage)} />
                          <DetailField
                            label="CHILD SEAT"
                            value={row.original.extra_child_seat
                              ? <StatusBadge variant="active" label="Yes" />
                              : '—'}
                          />
                          <DetailField
                            label="MEET & GREET"
                            value={row.original.extra_meet_greet
                              ? <StatusBadge variant="active" label="Yes" />
                              : '—'}
                          />
                          <DetailField
                            label="EXTRA LUGGAGE"
                            value={row.original.extra_luggage
                              ? <StatusBadge variant="active" label="Yes" />
                              : '—'}
                          />
                          <DetailField label="FLIGHT" value={row.original.flight_number ?? '—'} />
                          <DetailField label="TERMINAL" value={row.original.terminal ?? '—'} />
                          <DetailField label="RETURN" value={row.original.return_date ?? '—'} />
                          <DetailField label="NOTES" value={row.original.special_requests ?? '—'} />
                          <DetailField
                            label="PAYMENT ID"
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
                              label="PAIRED OUTBOUND"
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
                                if (e.target.value) handleStatusChange(row.original.id, e.target.value)
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
                              variant={row.original.status as 'unpaid' | 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'assigned' | 'en_route' | 'on_location'}
                              label={`${STATUS_LABELS[row.original.status]} (final)`}
                            />
                          )}
                        </div>

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
                              <span style={{ color: '#4ade80', fontSize: '10px', letterSpacing: '0.1em' }}>Saved</span>
                            )}
                            {notesSaving[row.original.id] === 'error' && (
                              <span style={{ color: '#f87171', fontSize: '10px', letterSpacing: '0.1em' }}>Error saving</span>
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
                            {driverPriceSaving[row.original.id] === 'saved' && <span style={{ color: '#4ade80', fontSize: '10px', letterSpacing: '0.1em' }}>Saved</span>}
                            {driverPriceSaving[row.original.id] === 'error' && <span style={{ color: '#f87171', fontSize: '10px', letterSpacing: '0.1em' }}>Enter a whole number ≥ 0</span>}
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

      {/* CancellationModal */}
      {pendingCancel !== null && (
        <div
          onClick={() => { if (!cancelling) setPendingCancel(null) }}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            zIndex: 50,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--anthracite-mid)',
              border: '1px solid var(--anthracite-light)',
              borderRadius: '4px',
              maxWidth: '480px',
              width: '100%',
              padding: '24px',
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
              fontFamily: 'var(--font-cormorant)',
              fontSize: '26px',
              fontWeight: 300,
              lineHeight: 1.2,
              color: 'var(--offwhite)',
              margin: 0,
            }}>
              Cancel Booking
            </h2>

            {pendingCancel.payment_intent_id !== null && pendingCancel.leg !== null && pendingCancel.linked_booking_id !== null && pendingCancel.booking_source !== 'gnet' ? (
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
                      color: '#f87171',
                      marginTop: '8px',
                    }}>
                      The paired {pairedLegLabel} booking {pairedRef} will NOT be affected and remains active.
                    </p>
                    <p style={{
                      fontSize: '11px',
                      fontFamily: 'var(--font-montserrat)',
                      fontWeight: 500,
                      textTransform: 'uppercase',
                      color: '#f87171',
                      marginTop: '8px',
                    }}>
                      PARTIAL STRIPE REFUND WILL BE ISSUED FOR THIS LEG.
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
                  color: '#f87171',
                  marginTop: '12px',
                }}>
                  A FULL STRIPE REFUND WILL BE ISSUED.
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
                    setCancelError(err instanceof Error ? err.message : 'Cancel failed')
                  } finally {
                    setCancelling(false)
                  }
                }}
                disabled={cancelling}
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
                  cursor: cancelling ? 'not-allowed' : 'pointer',
                  opacity: cancelling ? 0.7 : 1,
                }}
              >
                {cancelling
                  ? 'Cancelling...'
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
                color: '#f87171',
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
