'use client'
import { useEffect, useRef, useState } from 'react'
import { Modal } from './Modal'
import { STATUS_CONFLICT_STYLE } from './statusConflict'
import { inputBaseStyle, labelStyle, focusRingHandlers } from './adminFieldStyles'
import { pickupFromLanding } from '@/lib/airport-pickup'
import { formatPragueTime, pragueDateOf } from '@/lib/prague-calendar'
import type { AdminBooking } from './bookingTypes'

// Phase 91 plan 15 (STOP-05, D-08, D-11): the operator moves the pickup of an airport booking when the flight is late.
// The dialog asks for the new landing, states the pickup that follows from it ("Move pickup to 15:40": the new landing
// plus the offset stored on the booking) and only its primary button sends the POST. Nothing moves without it.
//
// The pickup shown here is sent as expected_pickup_*: the server recomputes it and answers 409 pickup_changed when the
// two differ, so the operator never confirms a time the server would not set.

interface MovePickupDialogProps {
  isOpen: boolean
  booking: AdminBooking
  onClose: () => void
  /** The server accepted the move: the row follows with the new landing and pickup. */
  onMoved: (patch: Partial<AdminBooking>) => void
}

const GENERIC_ERROR = 'Could not move the pickup. Reload and try again.'

const BUTTON_BASE = {
  minHeight: '44px',
  padding: '0 24px',
  borderRadius: 'var(--admin-radius-md)',
  fontFamily: 'var(--font-montserrat)',
  fontSize: 'var(--admin-fs-body)',
  fontWeight: 'var(--admin-fw-strong)',
} as const

const TEXT_STYLE = {
  margin: 0,
  fontFamily: 'var(--font-montserrat)',
  fontSize: 'var(--admin-fs-body)',
  color: 'var(--admin-text)',
  lineHeight: 1.5,
  overflowWrap: 'anywhere',
} as const

const clock = (value: string | null | undefined): string => (typeof value === 'string' ? value.slice(0, 5) : '')

/** The landing the dialog starts with: the flight's estimated arrival in Prague time when it differs, else the stored one. */
function initialLanding(booking: AdminBooking): { date: string; time: string; fromFlight: boolean } {
  const storedDate = booking.landing_date ?? ''
  const storedTime = clock(booking.landing_time)
  const estimate = booking.flight_estimated_arrival ? Date.parse(booking.flight_estimated_arrival) : Number.NaN
  if (Number.isFinite(estimate)) {
    const date = pragueDateOf(estimate)
    const time = formatPragueTime(estimate)
    if (date !== storedDate || time !== storedTime) return { date, time, fromFlight: true }
  }
  return { date: storedDate, time: storedTime, fromFlight: false }
}

function offsetText(offset: number | null | undefined): string {
  if (typeof offset !== 'number') return ''
  return offset === 0 ? ' (at landing)' : ` (+${offset} min)`
}

function errorLine(code: unknown, pickupTime?: string): string {
  switch (code) {
    case 'pickup_changed':
      return `The pickup would be ${pickupTime ?? 'a different time'}, not the time shown. Check the landing and try again.`
    case 'stale':
      return 'The booking changed while you were editing. Reload it and try again.'
    case 'payment_in_progress':
      return 'The payment is in progress. Try again in a moment.'
    case 'final_status':
      return 'This booking can no longer be moved.'
    case 'no_landing':
      return 'This booking has no landing time.'
    case 'invalid_landing':
      return 'That is not a valid landing date and time.'
    default:
      return GENERIC_ERROR
  }
}

export function MovePickupDialog({ isOpen, booking, onClose, onMoved }: MovePickupDialogProps) {
  const [landing, setLanding] = useState(() => initialLanding(booking))
  const [notify, setNotify] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // A second click before React re-renders must not send a second request.
  const inFlight = useRef(false)

  // A (re)opened dialog starts clean from the booking as it is now.
  useEffect(() => {
    if (isOpen) {
      setLanding(initialLanding(booking))
      setNotify(false)
      setPending(false)
      setError(null)
      inFlight.current = false
    }
    // Only the opening resets the form; a booking patch while open must not wipe what the operator typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  if (!isOpen) return null

  const storedDate = booking.landing_date ?? ''
  const storedTime = clock(booking.landing_time)
  const derived =
    typeof booking.pickup_offset_min === 'number'
      ? pickupFromLanding(landing.date, landing.time, booking.pickup_offset_min)
      : null
  const unchanged = landing.date === storedDate && landing.time === storedTime
  const canSubmit = derived !== null && !unchanged && !pending

  async function submit() {
    if (inFlight.current || derived === null || unchanged) return
    inFlight.current = true
    setPending(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/bookings/${booking.id}/landing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          landing_date: landing.date,
          landing_time: landing.time,
          expected_pickup_date: derived.pickupDate,
          expected_pickup_time: derived.pickupTime,
          notify_client: notify,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        // pickup_utc is dropped so the board and calendar read the new date and time, not the old instant.
        onMoved({
          landing_date: typeof data.landing_date === 'string' ? data.landing_date : landing.date,
          landing_time: typeof data.landing_time === 'string' ? data.landing_time : landing.time,
          pickup_date: typeof data.pickup_date === 'string' ? data.pickup_date : derived.pickupDate,
          pickup_time: typeof data.pickup_time === 'string' ? data.pickup_time : derived.pickupTime,
          pickup_utc: null,
        })
        return
      }
      setError(errorLine(data?.error, typeof data?.pickup_time === 'string' ? data.pickup_time : undefined))
    } catch {
      setError(GENERIC_ERROR)
    } finally {
      inFlight.current = false
      setPending(false)
    }
  }

  const dateSuffix = derived && derived.pickupDate !== booking.pickup_date ? ` on ${derived.pickupDate}` : ''

  return (
    // While the request is pending the dialog cannot be dismissed.
    <Modal isOpen onClose={pending ? () => {} : onClose} title={`Move pickup ${booking.booking_reference}`}>
      <p style={TEXT_STYLE}>
        {`Now: landing ${storedTime}, pickup ${clock(booking.pickup_time)}${offsetText(booking.pickup_offset_min)}`}
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '16px' }}>
        <div>
          <label htmlFor="move-pickup-landing-date" style={labelStyle}>Landing date</label>
          <input
            id="move-pickup-landing-date"
            type="date"
            value={landing.date}
            onChange={(e) => setLanding((l) => ({ ...l, date: e.target.value }))}
            disabled={pending}
            style={{ ...inputBaseStyle, fontWeight: 400, colorScheme: 'dark' }}
            {...focusRingHandlers}
          />
        </div>
        <div>
          <label htmlFor="move-pickup-landing-time" style={labelStyle}>Landing time</label>
          <input
            id="move-pickup-landing-time"
            type="time"
            value={landing.time}
            onChange={(e) => setLanding((l) => ({ ...l, time: e.target.value }))}
            disabled={pending}
            style={{ ...inputBaseStyle, fontWeight: 400, colorScheme: 'dark' }}
            {...focusRingHandlers}
          />
        </div>
      </div>

      {landing.fromFlight && !unchanged && (
        <p style={{ ...TEXT_STYLE, marginTop: '8px', color: 'var(--admin-text-muted)', fontSize: 'var(--admin-fs-label)' }}>
          Prefilled from the flight&apos;s estimated arrival.
        </p>
      )}

      <div style={{ marginTop: '16px' }} data-testid="move-pickup-preview">
        {derived === null ? (
          <p style={{ ...TEXT_STYLE, color: 'var(--admin-text-muted)' }}>Enter a valid landing date and time.</p>
        ) : unchanged ? (
          <p style={{ ...TEXT_STYLE, color: 'var(--admin-text-muted)' }}>{`The landing is already ${storedTime}.`}</p>
        ) : (
          <p style={{ ...TEXT_STYLE, color: 'var(--admin-accent-text)', fontWeight: 'var(--admin-fw-strong)' }}>
            {`Move pickup to ${derived.pickupTime}${dateSuffix}`}
          </p>
        )}
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '16px', cursor: 'pointer' }}>
        <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} disabled={pending} />
        <span style={{ ...TEXT_STYLE, fontSize: '13px' }}>Notify client</span>
      </label>

      {error && (
        <div role="alert" style={STATUS_CONFLICT_STYLE}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: '8px', marginTop: '24px' }}>
        <button
          type="button"
          onClick={onClose}
          disabled={pending}
          style={{
            ...BUTTON_BASE,
            background: 'transparent',
            border: '1px solid var(--admin-border-strong)',
            color: 'var(--admin-text)',
            cursor: pending ? 'not-allowed' : 'pointer',
            opacity: pending ? 0.6 : 1,
          }}
        >
          Keep pickup
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit}
          style={{
            ...BUTTON_BASE,
            background: 'var(--admin-accent)',
            border: '1px solid var(--admin-accent)',
            color: 'var(--admin-on-accent)',
            cursor: canSubmit ? 'pointer' : 'not-allowed',
            opacity: canSubmit ? 1 : 0.6,
          }}
        >
          {pending ? 'Moving…' : 'Confirm move'}
        </button>
      </div>
    </Modal>
  )
}
