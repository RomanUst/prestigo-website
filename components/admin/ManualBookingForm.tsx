'use client'
import { useState, useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import usePlacesAutocomplete from 'use-places-autocomplete'
import { setOptions, importLibrary } from '@googlemaps/js-api-loader'

// Module-level singleton — mirrors AddressInput's ensureMapsLoaded pattern exactly
let adminMapsPromise: Promise<void> | null = null
function ensureAdminMapsLoaded(): Promise<void> {
  if (adminMapsPromise) return adminMapsPromise
  setOptions({ key: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!, libraries: ['places'], v: 'weekly' })
  adminMapsPromise = importLibrary('places').then(() => undefined)
  return adminMapsPromise
}

const labelStyle: React.CSSProperties = {
  fontSize: '11px',
  fontFamily: 'var(--font-montserrat)',
  fontWeight: 300,
  textTransform: 'uppercase',
  letterSpacing: '0.3em',
  color: 'var(--warmgrey)',
  marginBottom: '4px',
  display: 'block',
}

const inputStyle: React.CSSProperties = {
  background: 'var(--anthracite)',
  border: '1px solid var(--anthracite-light)',
  borderRadius: '2px',
  color: 'var(--offwhite)',
  fontFamily: 'var(--font-montserrat)',
  fontSize: '13px',
  fontWeight: 300,
  padding: '8px 12px',
  width: '100%',
  boxSizing: 'border-box',
  outline: 'none',
}

const sectionLabelStyle: React.CSSProperties = {
  fontSize: '11px',
  fontFamily: 'var(--font-montserrat)',
  fontWeight: 300,
  textTransform: 'uppercase',
  letterSpacing: '0.3em',
  color: 'var(--copper)',
  marginBottom: '16px',
  marginTop: '24px',
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  )
}

// Lightweight address input: always typeable, shows Places suggestions when Maps loads
function AdminAddressInput({ label, value, onChange, placeholder, required }: {
  label: string
  value: string
  onChange: (val: string) => void
  placeholder?: string
  required?: boolean
}) {
  const [mapsLoaded, setMapsLoaded] = useState(false)
  const [showSugg, setShowSugg] = useState(false)
  const blurRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const {
    value: inputVal,
    setValue,
    suggestions: { data, status },
    clearSuggestions,
    init,
  } = usePlacesAutocomplete({ initOnMount: false, debounce: 300, defaultValue: value })

  // Mirror AddressInput's ensureMapsLoaded pattern exactly
  useEffect(() => {
    ensureAdminMapsLoaded().then(() => {
      init()
      setMapsLoaded(true)
    }).catch(() => {})
  }, [init])

  // Sync if parent resets value to empty
  useEffect(() => {
    if (value === '' && inputVal !== '') setValue('', false)
  }, [value]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setShowSugg(status === 'OK' && inputVal.length >= 2)
  }, [status, inputVal])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setValue(e.target.value)
    onChange(e.target.value)
  }

  const handleSelect = (description: string) => {
    setValue(description, false)
    onChange(description)
    clearSuggestions()
    setShowSugg(false)
  }

  return (
    <div style={{ position: 'relative' }}>
      <label style={labelStyle}>{label}</label>
      <input
        type="text"
        value={inputVal}
        onChange={handleChange}
        onBlur={() => { blurRef.current = setTimeout(() => setShowSugg(false), 200) }}
        onFocus={() => { if (blurRef.current) clearTimeout(blurRef.current) }}
        placeholder={placeholder}
        required={required}
        style={inputStyle}
        autoComplete="off"
      />
      {showSugg && data.length > 0 && (
        <ul style={{
          position: 'absolute', width: '100%', zIndex: 100,
          background: 'var(--anthracite)', border: '1px solid var(--anthracite-light)',
          borderTop: 'none', listStyle: 'none', margin: 0, padding: 0,
          maxHeight: '200px', overflowY: 'auto', borderRadius: '0 0 2px 2px',
        }}>
          {data.map(s => (
            <li
              key={s.place_id}
              onMouseDown={() => handleSelect(s.description)}
              style={{
                padding: '10px 12px', cursor: 'pointer',
                fontFamily: 'var(--font-montserrat)', fontSize: '12px', fontWeight: 300,
                color: 'var(--offwhite)', borderBottom: '1px solid var(--anthracite-light)',
              }}
            >
              {s.description}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

interface ManualBookingFormProps {
  open: boolean
  onClose: () => void
  onCreated: () => void
}

export function ManualBookingForm({ open, onClose, onCreated }: ManualBookingFormProps) {
  const [tripType, setTripType] = useState('transfer')
  const [pickupDate, setPickupDate] = useState('')
  const [pickupTime, setPickupTime] = useState('')
  const [originAddress, setOriginAddress] = useState('')
  const [destinationAddress, setDestinationAddress] = useState('')
  const [vehicleClass, setVehicleClass] = useState('business')
  const [passengers, setPassengers] = useState(1)
  const [luggage, setLuggage] = useState(0)
  const [amountCzk, setAmountCzk] = useState('')
  const [hours, setHours] = useState('')
  const [returnDate, setReturnDate] = useState('')
  const [flightNumber, setFlightNumber] = useState('')
  const [terminal, setTerminal] = useState('')
  const [specialRequests, setSpecialRequests] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!open) return null

  function openPicker(e: React.MouseEvent<HTMLInputElement>) {
    try { (e.currentTarget as HTMLInputElement).showPicker() } catch { /* unsupported */ }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    if (!originAddress.trim()) {
      setError('Please enter a pickup address.')
      setLoading(false)
      return
    }

    const payload: Record<string, unknown> = {
      trip_type: tripType,
      pickup_date: pickupDate,
      pickup_time: pickupTime,
      origin_address: originAddress.trim(),
      vehicle_class: vehicleClass,
      passengers,
      luggage,
      amount_czk: amountCzk ? Number(amountCzk) : undefined,
      client_first_name: firstName,
      client_last_name: lastName,
      client_email: email,
      client_phone: phone,
    }

    if (destinationAddress.trim()) payload.destination_address = destinationAddress.trim()
    if (hours) payload.hours = Number(hours)
    if (returnDate) payload.return_date = returnDate
    if (flightNumber) payload.flight_number = flightNumber
    if (terminal) payload.terminal = terminal
    if (specialRequests) payload.special_requests = specialRequests

    try {
      const res = await fetch('/api/admin/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (res.status === 201) {
        onCreated()
        onClose()
      } else {
        let msg = 'Something went wrong. Please try again.'
        try {
          const data = await res.json()
          if (data.error) msg = data.error
        } catch { /* keep default */ }
        setError(msg)
      }
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--anthracite-mid)',
          border: '1px solid var(--anthracite-light)',
          borderRadius: '4px',
          maxWidth: '640px',
          width: '100%',
          maxHeight: '90vh',
          overflowY: 'auto',
          position: 'relative',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Copper accent line */}
        <div style={{ height: 2, background: 'linear-gradient(90deg, var(--copper), transparent)' }} />

        <div style={{ padding: '24px' }}>
          {/* Header */}
          <h2 style={{
            fontFamily: 'var(--font-cormorant)',
            fontSize: '26px',
            fontWeight: 300,
            lineHeight: 1.2,
            color: 'var(--offwhite)',
            margin: 0,
          }}>
            New Booking
          </h2>

          {/* Close button */}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
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
            <X size={18} />
          </button>

          <form onSubmit={handleSubmit}>
            {/* Section A: Trip Details */}
            <div style={sectionLabelStyle}>TRIP DETAILS</div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <Field label="TRIP TYPE">
                <select
                  value={tripType}
                  onChange={(e) => setTripType(e.target.value)}
                  style={inputStyle}
                >
                  <option value="transfer">Transfer</option>
                  <option value="hourly">Hourly</option>
                  <option value="daily">Daily</option>
                </select>
              </Field>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <Field label="PICKUP DATE">
                  <input
                    type="date"
                    value={pickupDate}
                    onChange={(e) => setPickupDate(e.target.value)}
                    onClick={openPicker}
                    style={{ ...inputStyle, colorScheme: 'dark', cursor: 'pointer' }}
                    required
                  />
                </Field>
                <Field label="PICKUP TIME">
                  <input
                    type="time"
                    value={pickupTime}
                    onChange={(e) => setPickupTime(e.target.value)}
                    onClick={openPicker}
                    style={{ ...inputStyle, colorScheme: 'dark', cursor: 'pointer' }}
                    required
                  />
                </Field>
              </div>

              <AdminAddressInput
                label="PICKUP ADDRESS"
                value={originAddress}
                onChange={setOriginAddress}
                placeholder="Start typing an address…"
                required
              />

              <AdminAddressInput
                label="DESTINATION ADDRESS"
                value={destinationAddress}
                onChange={setDestinationAddress}
                placeholder="Start typing an address… (optional for hourly/daily)"
              />

              <Field label="VEHICLE CLASS">
                <select
                  value={vehicleClass}
                  onChange={(e) => setVehicleClass(e.target.value)}
                  style={inputStyle}
                >
                  <option value="business">Business</option>
                  <option value="first_class">First Class</option>
                  <option value="business_van">Business Van</option>
                </select>
              </Field>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <Field label="PASSENGERS">
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={passengers}
                    onChange={(e) => setPassengers(Number(e.target.value))}
                    style={inputStyle}
                    required
                  />
                </Field>
                <Field label="LUGGAGE">
                  <input
                    type="number"
                    min={0}
                    max={20}
                    value={luggage}
                    onChange={(e) => setLuggage(Number(e.target.value))}
                    style={inputStyle}
                    required
                  />
                </Field>
              </div>

              <Field label="PRICE (CZK) — OPERATOR ENTERED">
                <input
                  type="number"
                  value={amountCzk}
                  onChange={(e) => setAmountCzk(e.target.value)}
                  style={inputStyle}
                  required
                  min={1}
                />
              </Field>

              <Field label="HOURS (optional)">
                <input
                  type="number"
                  min={1}
                  max={24}
                  value={hours}
                  onChange={(e) => setHours(e.target.value)}
                  style={inputStyle}
                />
              </Field>

              <Field label="RETURN DATE (optional)">
                <input
                  type="date"
                  value={returnDate}
                  onChange={(e) => setReturnDate(e.target.value)}
                  onClick={openPicker}
                  style={{ ...inputStyle, colorScheme: 'dark', cursor: 'pointer' }}
                />
              </Field>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <Field label="FLIGHT NUMBER (optional)">
                  <input
                    type="text"
                    value={flightNumber}
                    onChange={(e) => setFlightNumber(e.target.value)}
                    style={inputStyle}
                    maxLength={20}
                  />
                </Field>
                <Field label="TERMINAL (optional)">
                  <input
                    type="text"
                    value={terminal}
                    onChange={(e) => setTerminal(e.target.value)}
                    style={inputStyle}
                    maxLength={20}
                  />
                </Field>
              </div>

              <Field label="SPECIAL REQUESTS (optional)">
                <textarea
                  value={specialRequests}
                  onChange={(e) => setSpecialRequests(e.target.value)}
                  style={{ ...inputStyle, resize: 'vertical' }}
                  rows={3}
                  maxLength={1000}
                />
              </Field>
            </div>

            {/* Section B: Passenger Details */}
            <div style={sectionLabelStyle}>PASSENGER DETAILS</div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <Field label="FIRST NAME">
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    style={inputStyle}
                    required
                    maxLength={100}
                  />
                </Field>
                <Field label="LAST NAME">
                  <input
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    style={inputStyle}
                    required
                    maxLength={100}
                  />
                </Field>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <Field label="EMAIL">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    style={inputStyle}
                    required
                  />
                </Field>
                <Field label="PHONE">
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    style={inputStyle}
                    required
                    maxLength={50}
                  />
                </Field>
              </div>
            </div>

            {/* Footer */}
            <div style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '12px',
              marginTop: '24px',
            }}>
              <button
                type="button"
                onClick={onClose}
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
                  cursor: 'pointer',
                }}
              >
                Discard Booking
              </button>
              <button
                type="submit"
                disabled={loading}
                style={{
                  background: 'var(--copper)',
                  color: 'var(--offwhite)',
                  border: 'none',
                  minHeight: '44px',
                  padding: '0 24px',
                  fontFamily: 'var(--font-montserrat)',
                  fontSize: '11px',
                  fontWeight: 500,
                  letterSpacing: '3px',
                  textTransform: 'uppercase',
                  borderRadius: '2px',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.7 : 1,
                }}
              >
                {loading ? 'Creating...' : 'Create Booking'}
              </button>
            </div>

            {error && (
              <div style={{
                fontSize: '11px',
                fontFamily: 'var(--font-montserrat)',
                fontWeight: 300,
                color: '#f87171',
                marginTop: '8px',
                textAlign: 'right',
              }}>
                {error}
              </div>
            )}
          </form>
        </div>
      </div>
    </div>
  )
}

export default ManualBookingForm
