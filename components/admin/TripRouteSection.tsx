'use client'
import React from 'react'
import { WAIT_BLOCK_MIN, waitingTotalEur } from '@/lib/stops'
import { formatEUR } from '@/lib/currency'
import { DetailField } from './DetailField'
import type { AdminBooking } from './bookingTypes'

// Phase 91 (STOP-04, STOP-05): the route of a booking in the one admin panel shared by the list, the board and the
// calendar. For an airport pickup it shows the landing time next to the pickup time and the minutes between them;
// for a booking with stops it shows every stop in order with its waiting time, the paid 15-minute blocks and the
// "Waiting at stops" total read from the stored snapshot (booking_stops), never recomputed from today's rate.
//
// Renders nothing for a booking without stops and without a landing. `children` is the slot for the move-pickup
// button (plan 91-15); it is rendered at the end of the section.

const rowStyle: React.CSSProperties = {
  fontFamily: 'var(--font-montserrat)',
  fontSize: '13px',
  color: 'var(--admin-text)',
}

const mutedStyle: React.CSSProperties = {
  color: 'var(--admin-text-muted)',
}

function clock(value: string | null | undefined): string {
  return typeof value === 'string' ? value.slice(0, 5) : ''
}

export function TripRouteSection({ booking, children }: { booking: AdminBooking; children?: React.ReactNode }) {
  const stops = booking.stops ?? []
  const landingTime = clock(booking.landing_time)
  const hasLanding = Boolean(booking.landing_date) && landingTime !== ''
  if (stops.length === 0 && !hasLanding) return null

  const offset = booking.pickup_offset_min
  const offsetText = typeof offset === 'number' ? (offset === 0 ? ' (at landing)' : ` (+${offset} min)`) : ''

  return (
    <div
      data-testid="trip-route-section"
      style={{
        marginTop: '16px',
        paddingTop: '12px',
        borderTop: '1px solid var(--admin-border)',
      }}
    >
      <div
        style={{
          fontFamily: 'var(--font-montserrat)',
          fontSize: '11px',
          textTransform: 'uppercase',
          letterSpacing: '0.3em',
          color: 'var(--admin-text-muted)',
          marginBottom: '8px',
        }}
      >
        Route
      </div>

      {hasLanding && (
        <div data-testid="trip-route-landing" style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', marginBottom: '8px' }}>
          <div style={rowStyle}>
            <span>{`Landing ${landingTime}`}</span>
            {booking.landing_date && booking.landing_date !== booking.pickup_date && (
              <span style={{ ...mutedStyle, marginLeft: '6px' }}>{booking.landing_date}</span>
            )}
          </div>
          <div style={rowStyle}>
            <span style={{ color: 'var(--admin-accent-text)' }}>{`Pickup ${clock(booking.pickup_time)}${offsetText}`}</span>
          </div>
        </div>
      )}

      {stops.length > 0 && (
        <>
          <ol data-testid="trip-route-stops" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {stops.map((stop) => (
              <li
                key={stop.position}
                data-testid={`trip-route-stop-${stop.position}`}
                style={{ ...rowStyle, display: 'flex', flexWrap: 'wrap', gap: '4px 12px', alignItems: 'baseline' }}
              >
                {stop.address ? (
                  <span>{`${stop.position}. ${stop.address}`}</span>
                ) : (
                  <span style={{ ...mutedStyle, fontStyle: 'italic' }}>{`${stop.position}. `}<span>Address removed</span></span>
                )}
                <span style={mutedStyle}>{`${stop.waitMinutes} min`}</span>
                {stop.blocks > 0 ? (
                  <>
                    <span style={{ color: 'var(--admin-accent-text)' }}>{`${stop.blocks} × ${WAIT_BLOCK_MIN} min paid`}</span>
                    <span data-testid={`trip-route-stop-fee-${stop.position}`} style={mutedStyle}>{formatEUR(stop.feeEur)}</span>
                  </>
                ) : (
                  <span style={mutedStyle}>Free waiting</span>
                )}
              </li>
            ))}
          </ol>
          <div style={{ marginTop: '10px' }} data-testid="trip-route-waiting-total">
            <DetailField label="Waiting at stops" value={formatEUR(waitingTotalEur(stops))} />
          </div>
        </>
      )}

      {children}
    </div>
  )
}
