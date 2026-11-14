'use client'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { StatusBadge } from './StatusBadge'
import PaymentPanel from './PaymentPanel'
import { NoShowBanner, hasOpenNoShowRequest } from './NoShowBanner'
import { STATUS_CONFLICT_STYLE } from './statusConflict'
import { FlightStatusBlock } from './FlightStatusBlock'
import { BookingChangeHistory } from './BookingChangeHistory'
import { DetailField } from './DetailField'
import { TripEditPanel } from './TripEditPanel'
import { TripRouteSection } from './TripRouteSection'
import { PaymentLinkSection } from './PaymentLinkSection'
import { DriverAssignmentSection } from '@/components/admin/DriverAssignmentSection'
import { UI_TRANSITIONS } from '@/lib/booking-transitions'
import type { BookingStatus } from '@/lib/booking-status'
import { STATUS_LABELS, patchBooking, type AdminBooking } from './bookingTypes'
import type { BookingMovesApi } from './useBookingMoves'

// Phase 90 plan 01: the single booking detail panel (RESEARCH Pattern 1, step A). Everything the expanded
// row of the bookings list showed lives here, so the list, the board and the calendar open the same panel.
// Per-booking edit state (notes, driver price, payment refresh) is local to the panel and seeded from the
// booking on mount; mount it with key={booking.id} so a different booking never inherits it (Pitfall 4).
// Row changes go out through onPatched(id, patch); status moves and their dialogs come from `moves`.

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

interface BookingDetailPanelProps {
  booking: AdminBooking
  moves: BookingMovesApi
  onPatched: (id: string, patch: Partial<AdminBooking>) => void
  /** The paired-outbound chip filters the list by that reference. Without it the reference is plain text. */
  onSearchReference?: (reference: string) => void
  /** Bumped by the host when a fresher row showed a status or payment change: the PaymentPanel refetches. */
  refreshSignal?: number
  /**
   * `dirty`: the panel holds input that is not saved yet (notes, driver price, an open trip-edit form), so the views
   * must not refetch. `discardable`: closing or switching the panel right now would lose input for good (a typed
   * driver price, an open trip-edit form, notes whose save failed); a note still waiting for its debounce is not
   * discardable because the unmount sends it.
   */
  onDirtyChange?: (dirty: boolean, discardable: boolean) => void
}

export function BookingDetailPanel({ booking, moves, onPatched, onSearchReference, refreshSignal = 0, onDirtyChange }: BookingDetailPanelProps) {
  const bookingId = booking.id
  const transitions = UI_TRANSITIONS[booking.status] ?? []

  const [notes, setNotes] = useState(booking.operator_notes ?? '')
  // The last value known to be stored: seeds from the booking, moves forward on a successful save.
  const [savedNotes, setSavedNotes] = useState(booking.operator_notes ?? '')
  const [notesSaving, setNotesSaving] = useState<SaveState>('idle')
  const notesTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // The value the 800 ms debounce is waiting to send; null when nothing is pending.
  const pendingNotesRef = useRef<string | null>(null)

  const [driverPrice, setDriverPrice] = useState(booking.driver_price_czk != null ? String(booking.driver_price_czk) : '')
  const [savedDriverPrice, setSavedDriverPrice] = useState(booking.driver_price_czk != null ? String(booking.driver_price_czk) : '')
  const [tripEditOpen, setTripEditOpen] = useState(false)
  const [driverPriceSaving, setDriverPriceSaving] = useState<SaveState>('idle')

  // Phase 88-07: a trip edit can change the payment (price, pickup); an open PaymentPanel refetches.
  const [paymentBump, setPaymentBump] = useState(0)

  // The latest callback, readable from the unmount flush without re-running the effect.
  const onPatchedRef = useRef(onPatched)
  useEffect(() => {
    onPatchedRef.current = onPatched
  })

  const flushNotes = useCallback(async (value: string) => {
    setNotesSaving('saving')
    try {
      await patchBooking({ id: bookingId, operator_notes: value })
      onPatchedRef.current(bookingId, { operator_notes: value })
      setSavedNotes(value)
      setNotesSaving('saved')
      // Reset "saved" indicator after 2 seconds
      setTimeout(() => {
        setNotesSaving(prev => prev === 'saved' ? 'idle' : prev)
      }, 2000)
    } catch {
      setNotesSaving('error')
    }
  }, [bookingId])

  const handleNotesChange = useCallback((value: string) => {
    setNotes(value)
    // Cancel pending debounce
    if (notesTimerRef.current) clearTimeout(notesTimerRef.current)
    pendingNotesRef.current = value
    // Schedule save after 800ms idle
    notesTimerRef.current = setTimeout(() => {
      notesTimerRef.current = null
      pendingNotesRef.current = null
      flushNotes(value)
    }, 800)
  }, [flushNotes])

  const handleNotesBlur = useCallback(() => {
    // Flush immediately on blur
    if (notesTimerRef.current) clearTimeout(notesTimerRef.current)
    notesTimerRef.current = null
    pendingNotesRef.current = null
    flushNotes(notes)
  }, [notes, flushNotes])

  // A note typed in the last 800 ms must not be lost when the panel closes: send it once on unmount.
  useEffect(() => {
    return () => {
      if (notesTimerRef.current) clearTimeout(notesTimerRef.current)
      notesTimerRef.current = null
      const pending = pendingNotesRef.current
      pendingNotesRef.current = null
      if (pending === null) return
      patchBooking({ id: bookingId, operator_notes: pending })
        .then(() => onPatchedRef.current(bookingId, { operator_notes: pending }))
        .catch(() => { /* nothing is mounted to show the error; the next open shows the stored value */ })
    }
  }, [bookingId])

  const saveDriverPrice = useCallback(async (rawValue: string) => {
    const trimmed = rawValue.trim()
    // Empty clears the fee (null); otherwise must be a non-negative integer.
    let value: number | null
    if (trimmed === '') {
      value = null
    } else {
      const n = Number(trimmed)
      if (!Number.isInteger(n) || n < 0) {
        setDriverPriceSaving('error')
        return
      }
      value = n
    }
    setDriverPriceSaving('saving')
    try {
      await patchBooking({ id: bookingId, driver_price_czk: value })
      onPatchedRef.current(bookingId, { driver_price_czk: value })
      setSavedDriverPrice(value === null ? '' : String(value))
      setDriverPriceSaving('saved')
      setTimeout(() => {
        setDriverPriceSaving(prev => prev === 'saved' ? 'idle' : prev)
      }, 2000)
    } catch {
      setDriverPriceSaving('error')
    }
  }, [bookingId])

  // D-16 groundwork: unsaved input pauses any polling refetch of the views around the panel. A field whose save
  // failed (notes error, a driver price the save rejected) does not pause: nothing is in flight for it, so the
  // views would stay frozen with no way for the operator to tell why (90 WR-08).
  const dirty =
    (notes !== savedNotes && notesSaving !== 'error') ||
    (driverPrice.trim() !== savedDriverPrice && driverPriceSaving !== 'error') ||
    tripEditOpen
  // 90 WR-02: input that would be gone after an unmount. The host asks before it closes or switches the panel.
  const discardable =
    (notes !== savedNotes && notesSaving === 'error') ||
    // a price whose PATCH is on its way is not lost by an unmount: the request still completes
    (driverPrice.trim() !== savedDriverPrice && driverPriceSaving !== 'saving') ||
    tripEditOpen
  const onDirtyChangeRef = useRef(onDirtyChange)
  useEffect(() => {
    onDirtyChangeRef.current = onDirtyChange
  })
  useEffect(() => {
    onDirtyChangeRef.current?.(dirty, discardable)
  }, [dirty, discardable])
  useEffect(() => {
    return () => onDirtyChangeRef.current?.(false, false)
  }, [])

  // Phase 63 Plan 05: optimistic-update sink for TripEditPanel — mutates only the fields that were actually saved.
  const handleTripUpdated = useCallback((id: string, patch: Partial<AdminBooking>) => {
    // 90 WR-03: pickupInstantMs prefers pickup_utc over the date and time, so a saved date/time edit must drop the
    // old instant or the board and calendar keep showing the old pickup. Null falls back to the Prague wall clock.
    const changesPickup = 'pickup_date' in patch || 'pickup_time' in patch
    onPatchedRef.current(id, changesPickup ? { ...patch, pickup_utc: null } : patch)
    setPaymentBump(n => n + 1)
  }, [])

  // 90 WR-06: follow the status the assign route reported (it leaves pending/unpaid and en_route/on_location alone) and
  // ask the views to refetch, so the card shows the new driver name instead of "Not assigned".
  const handleAssigned = useCallback((newStatus: string) => {
    if (newStatus && newStatus !== 'unknown' && newStatus !== booking.status) {
      onPatchedRef.current(bookingId, { status: newStatus })
    }
    moves.refreshBooking(bookingId)
  }, [bookingId, booking.status, moves])

  // 88-REVIEW C-WR-04: the open PaymentPanel reports the state after every (re)load, so the row badge follows panel
  // actions and the refetch after a cancel.
  const handlePaymentState = useCallback((state: string) => {
    if (booking.payment_state !== state) onPatchedRef.current(bookingId, { payment_state: state })
  }, [bookingId, booking.payment_state])

  // D-05: the route also flips a 'pending' source booking to 'unpaid' directly (Pitfall 2), so both fields are patched.
  const handlePaymentLinkGenerated = useCallback((id: string, url: string) => {
    onPatchedRef.current(id, { payment_link_url: url, status: 'unpaid' })
  }, [])

  return (
    <div data-testid="booking-detail-panel">
      {hasOpenNoShowRequest(booking) && booking.no_show_requested_at && (
        <NoShowBanner
          bookingId={booking.id}
          requestedAt={booking.no_show_requested_at}
          onConfirmRequest={() => moves.openNoShow(booking)}
          // "Client found": the request is cleared, the status stays on_location.
          onCleared={() => onPatched(booking.id, { no_show_requested_at: null })}
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
      {/* Phase 91: landing and pickup time, stops and the waiting total (renders nothing without either). */}
      <TripRouteSection booking={booking} onBookingPatched={(patch) => handleTripUpdated(booking.id, patch)} />
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '12px',
      }}>
        <DetailField label="Origin" value={booking.origin_address} />
        <DetailField label="Destination" value={booking.destination_address} />
        <DetailField label="Email" value={booking.client_email} />
        <DetailField label="Phone" value={booking.client_phone} />
        {booking.trip_type === 'hourly' && booking.hours !== null && (
          <DetailField label="Duration" value={`${booking.hours} hours`} />
        )}
        <DetailField label="Passengers" value={String(booking.passengers)} />
        <DetailField label="Luggage" value={String(booking.luggage)} />
        <DetailField
          label="Child seat"
          value={booking.extra_child_seat
            ? <StatusBadge variant="active" label="Yes" />
            : '—'}
        />
        <DetailField
          label="Meet & greet"
          value={booking.extra_meet_greet
            ? <StatusBadge variant="active" label="Yes" />
            : '—'}
        />
        <DetailField
          label="Extra luggage"
          value={booking.extra_luggage
            ? <StatusBadge variant="active" label="Yes" />
            : '—'}
        />
        <DetailField label="Flight" value={booking.flight_number ?? '—'} />
        <DetailField label="Terminal" value={booking.terminal ?? '—'} />
        <DetailField label="Return" value={booking.return_date ?? '—'} />
        <DetailField label="Notes" value={booking.special_requests ?? '—'} />
        <DetailField label="Language" value={booking.locale ? booking.locale.toUpperCase() : '—'} />
        <DetailField
          label="Payment ID"
          value={
            booking.payment_intent_id ? (
              <span style={{ fontFamily: 'monospace', fontSize: '13px' }}>
                {booking.payment_intent_id.length > 24
                  ? `${booking.payment_intent_id.slice(0, 24)}...`
                  : booking.payment_intent_id}
              </span>
            ) : '—'
          }
        />
        {booking.leg === 'return' && booking.linked_booking?.booking_reference && (
          <DetailField
            label="Paired outbound"
            value={
              onSearchReference ? (
                <button
                  type="button"
                  data-testid={`linked-ref-chip-${booking.id}`}
                  aria-label={`Search for paired outbound booking ${booking.linked_booking.booking_reference}`}
                  onClick={() => {
                    const ref = booking.linked_booking?.booking_reference
                    if (ref) onSearchReference(ref)
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
                  {booking.linked_booking.booking_reference}
                </button>
              ) : booking.linked_booking.booking_reference
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
        {transitions.length > 0 ? (
          <select
            value=""
            disabled={moves.isUpdating(booking.id)}
            onChange={(e) => {
              if (e.target.value) moves.requestStatusChange(booking, e.target.value)
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
              cursor: moves.isUpdating(booking.id) ? 'not-allowed' : 'pointer',
              opacity: moves.isUpdating(booking.id) ? 0.5 : 1,
            }}
          >
            <option value="" disabled>
              {moves.isUpdating(booking.id) ? 'Updating...' : `Change from ${STATUS_LABELS[booking.status]}...`}
            </option>
            {transitions.map(s => (
              <option key={s} value={s}>{STATUS_LABELS[s]}</option>
            ))}
          </select>
        ) : (
          <StatusBadge
            variant={booking.status as BookingStatus}
            label={`${STATUS_LABELS[booking.status]} (final)`}
          />
        )}
      </div>
      {moves.conflictFor(booking.id) && (
        <div role="alert" style={STATUS_CONFLICT_STYLE}>
          {moves.conflictFor(booking.id)}
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
          {notesSaving === 'saving' && (
            <span style={{ color: 'var(--copper)', fontSize: '10px', letterSpacing: '0.1em' }}>Saving...</span>
          )}
          {notesSaving === 'saved' && (
            <span style={{ color: 'var(--status-ok-fg)', fontSize: '10px', letterSpacing: '0.1em' }}>Saved</span>
          )}
          {notesSaving === 'error' && (
            <span style={{ color: 'var(--status-danger-fg)', fontSize: '10px', letterSpacing: '0.1em' }}>Error saving</span>
          )}
        </div>
        <textarea
          value={notes}
          onChange={(e) => handleNotesChange(e.target.value)}
          onBlur={handleNotesBlur}
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
          {driverPriceSaving === 'saving' && <span style={{ color: 'var(--copper)', fontSize: '10px', letterSpacing: '0.1em' }}>Saving...</span>}
          {driverPriceSaving === 'saved' && <span style={{ color: 'var(--status-ok-fg)', fontSize: '10px', letterSpacing: '0.1em' }}>Saved</span>}
          {driverPriceSaving === 'error' && <span style={{ color: 'var(--status-danger-fg)', fontSize: '10px', letterSpacing: '0.1em' }}>Enter a whole number ≥ 0</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <input
            type="number"
            min={0}
            step={1}
            value={driverPrice}
            onChange={(e) => setDriverPrice(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); saveDriverPrice(driverPrice) } }}
            placeholder="e.g. 1000 — leave empty to hide"
            style={{
              width: '220px', height: '32px', background: 'var(--anthracite-mid)',
              border: '1px solid var(--anthracite-light)', borderRadius: '2px', padding: '0 12px',
              fontFamily: 'var(--font-montserrat)', fontSize: '13px', color: 'var(--offwhite)',
              outline: 'none', boxSizing: 'border-box',
            }}
            onFocus={(e) => { e.target.style.borderColor = 'var(--copper)' }}
            onBlur={(e) => { e.target.style.borderColor = 'var(--anthracite-light)'; saveDriverPrice(driverPrice) }}
          />
          <button
            onClick={() => saveDriverPrice(driverPrice)}
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
        bookingId={booking.id}
        bookingStatus={booking.status}
        onAssigned={handleAssigned}
      />

      {/* Payment panel (Phase 88 HOLD-07) */}
      <PaymentPanel
        bookingId={booking.id}
        refreshKey={paymentBump + moves.paymentBumpFor(booking.id) + refreshSignal}
        paymentMode={booking.payment_mode ?? null}
        onPaymentState={handlePaymentState}
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
      <TripEditPanel booking={booking} patchBooking={patchBooking} onUpdated={handleTripUpdated} onEditOpenChange={setTripEditOpen} />

      {/* Change history (D-11, FOLLOW-02) */}
      <div style={{ marginTop: '16px' }} onClick={(e) => e.stopPropagation()}>
        <BookingChangeHistory bookingId={booking.id} />
      </div>

      {/* Cancel Booking button — only for cancellable statuses */}
      {(booking.status === 'pending' || booking.status === 'confirmed') && (
        <div style={{ marginTop: '16px' }}>
          <button
            onClick={(e) => { e.stopPropagation(); moves.openCancel(booking) }}
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
    </div>
  )
}
