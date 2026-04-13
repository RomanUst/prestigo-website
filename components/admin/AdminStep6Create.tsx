'use client'

import { useState } from 'react'
import { useBookingStore } from '@/lib/booking-store'
import { computeExtrasTotal } from '@/lib/extras'
import { eurToCzk, formatCZK } from '@/lib/currency'
import { PRG_CONFIG } from '@/types/booking'

interface Props {
  onClose: () => void
  onCreated: () => void
}

const rowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  padding: '10px 0',
  borderBottom: '1px solid var(--anthracite-light)',
  gap: 16,
}

const rowLabelStyle: React.CSSProperties = {
  fontFamily: 'var(--font-montserrat)',
  fontSize: '10px',
  fontWeight: 400,
  letterSpacing: '0.25em',
  textTransform: 'uppercase',
  color: 'var(--warmgrey)',
  flexShrink: 0,
}

const rowValueStyle: React.CSSProperties = {
  fontFamily: 'var(--font-montserrat)',
  fontSize: '13px',
  fontWeight: 300,
  color: 'var(--offwhite)',
  textAlign: 'right',
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={rowStyle}>
      <span style={rowLabelStyle}>{label}</span>
      <span style={rowValueStyle}>{value}</span>
    </div>
  )
}

const VEHICLE_LABELS: Record<string, string> = {
  business: 'Business',
  first_class: 'First Class',
  business_van: 'Business Van',
}

export default function AdminStep6Create({ onClose: _onClose, onCreated }: Props) {
  const tripType = useBookingStore(s => s.tripType)
  const origin = useBookingStore(s => s.origin)
  const destination = useBookingStore(s => s.destination)
  const pickupDate = useBookingStore(s => s.pickupDate)
  const pickupTime = useBookingStore(s => s.pickupTime)
  const returnDate = useBookingStore(s => s.returnDate)
  const vehicleClass = useBookingStore(s => s.vehicleClass)
  const passengers = useBookingStore(s => s.passengers)
  const luggage = useBookingStore(s => s.luggage)
  const hours = useBookingStore(s => s.hours)
  const extras = useBookingStore(s => s.extras)
  const passengerDetails = useBookingStore(s => s.passengerDetails)
  const priceBreakdown = useBookingStore(s => s.priceBreakdown)
  const distanceKm = useBookingStore(s => s.distanceKm)
  const quoteMode = useBookingStore(s => s.quoteMode)

  const isAirportRide =
    origin?.placeId === PRG_CONFIG.placeId ||
    destination?.placeId === PRG_CONFIG.placeId

  // Pre-fill calculated price (base + extras) in CZK
  const extrasEur = computeExtrasTotal(extras)
  const baseEur = priceBreakdown && vehicleClass ? priceBreakdown[vehicleClass].total : null
  const calculatedEur = baseEur !== null ? baseEur + extrasEur : null
  const calculatedCzk = calculatedEur !== null ? eurToCzk(calculatedEur) : null

  const [amountCzk, setAmountCzk] = useState(calculatedCzk !== null ? String(calculatedCzk) : '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const extrasLabel = [
    extras.childSeat && 'Child Seat',
    extras.meetAndGreet && 'Meet & Greet',
    extras.extraLuggage && 'Extra Luggage',
  ].filter(Boolean).join(', ')

  const handleCreate = async () => {
    const parsed = Number(amountCzk)
    if (!amountCzk || isNaN(parsed) || parsed <= 0) {
      setError('Enter a valid amount in CZK.')
      return
    }
    setLoading(true)
    setError(null)

    try {
      const payload: Record<string, unknown> = {
        trip_type: tripType,
        pickup_date: pickupDate,
        pickup_time: pickupTime,
        origin_address: origin!.address,
        destination_address: destination?.address,
        vehicle_class: vehicleClass,
        passengers,
        luggage,
        amount_czk: parsed,
        client_first_name: passengerDetails!.firstName,
        client_last_name: passengerDetails!.lastName,
        client_email: passengerDetails!.email,
        client_phone: passengerDetails!.phone,
        // Extras
        extra_child_seat: extras.childSeat,
        extra_meet_greet: extras.meetAndGreet,
        extra_luggage: extras.extraLuggage,
        // Coordinates and distance
        origin_lat: origin!.lat ?? null,
        origin_lng: origin!.lng ?? null,
        destination_lat: destination?.lat ?? null,
        destination_lng: destination?.lng ?? null,
        distance_km: distanceKm ?? null,
      }
      if (tripType === 'hourly' && hours) payload.hours = hours
      if (returnDate) payload.return_date = returnDate
      if (isAirportRide && passengerDetails?.flightNumber) payload.flight_number = passengerDetails.flightNumber
      if (isAirportRide && passengerDetails?.terminal) payload.terminal = passengerDetails.terminal
      if (passengerDetails?.specialRequests) payload.special_requests = passengerDetails.specialRequests

      const res = await fetch('/api/admin/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (res.status === 201) {
        onCreated()
      } else {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? 'Something went wrong. Please try again.')
      }
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      {/* Booking summary */}
      <div
        style={{
          background: 'var(--anthracite-mid)',
          border: '1px solid var(--anthracite-light)',
          borderRadius: 2,
          padding: '0 16px',
          marginBottom: 24,
        }}
      >
        <SummaryRow
          label="Route"
          value={
            tripType === 'hourly'
              ? `${origin?.address ?? '—'} · ${hours}h`
              : `${origin?.address ?? '—'} → ${destination?.address ?? '—'}`
          }
        />
        {returnDate && <SummaryRow label="Return date" value={returnDate} />}
        <SummaryRow label="Date & time" value={`${pickupDate} at ${pickupTime}`} />
        <SummaryRow label="Vehicle" value={VEHICLE_LABELS[vehicleClass ?? ''] ?? '—'} />
        <SummaryRow label="Passengers" value={`${passengers} pax · ${luggage} bags`} />
        {extrasLabel && <SummaryRow label="Extras" value={extrasLabel} />}
        <SummaryRow
          label="Passenger"
          value={`${passengerDetails?.firstName} ${passengerDetails?.lastName}`}
        />
        <SummaryRow label="Contact" value={`${passengerDetails?.email} · ${passengerDetails?.phone}`} />
        {isAirportRide && passengerDetails?.flightNumber && (
          <SummaryRow
            label="Flight"
            value={
              passengerDetails.flightNumber +
              (passengerDetails.terminal ? ` · T${passengerDetails.terminal}` : '')
            }
          />
        )}
        {passengerDetails?.specialRequests && (
          <SummaryRow label="Requests" value={passengerDetails.specialRequests} />
        )}
        {distanceKm && (
          <SummaryRow label="Distance" value={`${distanceKm} km`} />
        )}
      </div>

      {/* Calculated price hint */}
      {calculatedCzk !== null && !quoteMode ? (
        <p
          style={{
            fontFamily: 'var(--font-montserrat)',
            fontSize: '12px',
            fontWeight: 300,
            color: 'var(--warmgrey)',
            marginBottom: 8,
          }}
        >
          Calculated: {formatCZK(calculatedCzk)} — adjust if needed
        </p>
      ) : (
        <p
          style={{
            fontFamily: 'var(--font-montserrat)',
            fontSize: '12px',
            fontWeight: 300,
            color: 'var(--warmgrey)',
            marginBottom: 8,
          }}
        >
          No price calculated (quote mode or offline). Enter amount manually.
        </p>
      )}

      {/* Amount input */}
      <div style={{ marginBottom: 24 }}>
        <label
          style={{
            display: 'block',
            fontFamily: 'var(--font-montserrat)',
            fontSize: '9px',
            fontWeight: 400,
            letterSpacing: '0.4em',
            textTransform: 'uppercase',
            color: 'var(--copper)',
            marginBottom: 6,
          }}
        >
          Amount (CZK)
        </label>
        <input
          type="number"
          min={1}
          value={amountCzk}
          onChange={e => setAmountCzk(e.target.value)}
          placeholder="e.g. 1200"
          style={{
            width: '100%',
            background: 'var(--anthracite-mid)',
            border: '1px solid var(--anthracite-light)',
            color: 'var(--offwhite)',
            fontFamily: 'var(--font-montserrat)',
            fontSize: '16px',
            fontWeight: 300,
            padding: '10px 14px',
            outline: 'none',
            borderRadius: 2,
            boxSizing: 'border-box',
          }}
        />
      </div>

      {error && (
        <p
          style={{
            fontFamily: 'var(--font-montserrat)',
            fontSize: '12px',
            color: '#f87171',
            marginBottom: 12,
          }}
        >
          {error}
        </p>
      )}

      <button
        type="button"
        disabled={loading}
        onClick={handleCreate}
        style={{
          width: '100%',
          background: 'var(--copper)',
          color: 'var(--offwhite)',
          border: 'none',
          minHeight: 48,
          fontFamily: 'var(--font-montserrat)',
          fontSize: '11px',
          fontWeight: 500,
          letterSpacing: '3px',
          textTransform: 'uppercase',
          borderRadius: 2,
          cursor: loading ? 'not-allowed' : 'pointer',
          opacity: loading ? 0.7 : 1,
        }}
      >
        {loading ? 'Creating…' : 'Create Booking'}
      </button>
    </div>
  )
}
