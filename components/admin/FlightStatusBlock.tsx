'use client'
import { useState, useCallback } from 'react'

interface FlightStatusBlockProps {
  bookingId: string
  flightIata: string              // guaranteed non-null by caller
  initialStatus: string | null
  initialEstimatedArrival: string | null
  initialDelayMinutes: number | null
}

const STATUS_COLORS: Record<string, { text: string; bg: string }> = {
  scheduled: { text: '#B87333', bg: 'rgba(184,115,51,0.15)' },
  active:    { text: '#B87333', bg: 'rgba(184,115,51,0.15)' },
  landed:    { text: '#27AE60', bg: '#1a3a2a' },
  delayed:   { text: '#E67E22', bg: '#3a2a1a' },
  cancelled: { text: '#C0392B', bg: '#2a1a1a' },
  diverted:  { text: '#C0392B', bg: '#2a1a1a' },
  unknown:   { text: '#9A958F', bg: 'transparent' },
}

function getStatusColors(status: string | null): { text: string; bg: string } {
  if (!status) return STATUS_COLORS.unknown
  return STATUS_COLORS[status.toLowerCase()] ?? STATUS_COLORS.unknown
}

function formatArrivalTime(isoStr: string | null): string {
  return isoStr?.slice(11, 16) || '—'
}

function formatUpdatedTime(date: Date): string {
  const hh = String(date.getHours()).padStart(2, '0')
  const mm = String(date.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

export function FlightStatusBlock({
  bookingId,
  initialStatus,
  initialEstimatedArrival,
  initialDelayMinutes,
}: FlightStatusBlockProps) {
  const [refreshing, setRefreshing] = useState(false)
  const [refreshError, setRefreshError] = useState<string | null>(null)
  const [localFlightData, setLocalFlightData] = useState({
    flight_status: initialStatus,
    flight_estimated_arrival: initialEstimatedArrival,
    flight_delay_minutes: initialDelayMinutes,
    updatedAt: null as Date | null,
  })
  const [isHovered, setIsHovered] = useState(false)

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    setRefreshError(null)
    try {
      const res = await fetch('/api/admin/flight-refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId }),
      })
      if (!res.ok) throw new Error('refresh_failed')
      const data = await res.json()
      setLocalFlightData({
        flight_status: data.flight_status,
        flight_estimated_arrival: data.flight_estimated_arrival,
        flight_delay_minutes: data.flight_delay_minutes,
        updatedAt: new Date(),
      })
    } catch {
      setRefreshError('⚠ Refresh failed — FlightStats unavailable')
    } finally {
      setRefreshing(false)
    }
  }, [bookingId])

  const { flight_status, flight_estimated_arrival, flight_delay_minutes, updatedAt } = localFlightData
  const colors = getStatusColors(flight_status)
  const statusLabel = (flight_status ?? 'unknown').toUpperCase()
  const arrivalTime = formatArrivalTime(flight_estimated_arrival)
  const showDelay = flight_delay_minutes !== null && flight_delay_minutes !== undefined && flight_delay_minutes > 0

  return (
    <div style={{
      paddingBottom: 8,
      marginBottom: 8,
      borderBottom: '1px solid var(--anthracite-light)',
      fontFamily: 'var(--font-montserrat)',
    }}>
      {/* Header row */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        {/* Left: section label */}
        <span style={{
          fontSize: '11px',
          fontWeight: 400,
          textTransform: 'uppercase',
          color: 'var(--warmgrey)',
          letterSpacing: '0.3em',
          fontFamily: 'var(--font-montserrat)',
        }}>
          FLIGHT STATUS
        </span>

        {/* Right: Refresh button + Updated timestamp */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            style={{
              border: '1px solid var(--copper)',
              color: 'var(--copper)',
              background: 'transparent',
              borderRadius: '2px',
              padding: '4px 8px',
              fontFamily: 'var(--font-montserrat)',
              fontSize: '11px',
              fontWeight: 600,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              cursor: refreshing ? 'not-allowed' : 'pointer',
              opacity: refreshing ? 0.6 : isHovered ? 0.8 : 1,
            }}
          >
            {refreshing ? '...' : 'Refresh'}
          </button>

          {updatedAt && (
            <span style={{
              fontSize: '11px',
              color: 'var(--warmgrey)',
              fontFamily: 'var(--font-montserrat)',
            }}>
              Updated {formatUpdatedTime(updatedAt)}
            </span>
          )}
        </div>
      </div>

      {/* Data rows */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        marginTop: 8,
      }}>
        {/* Status badge */}
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          padding: '4px 8px',
          borderRadius: 2,
          background: colors.bg,
          color: colors.text,
          alignSelf: 'flex-start',
        }}>
          {/* Dot */}
          <span style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: colors.text,
            marginRight: 4,
            flexShrink: 0,
          }} />
          <span style={{
            fontSize: '11px',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            fontFamily: 'var(--font-montserrat)',
          }}>
            {statusLabel}
          </span>
        </span>

        {/* Arrival line */}
        <span style={{
          fontSize: '13px',
          fontWeight: 400,
          color: 'var(--offwhite)',
          lineHeight: 1.5,
          fontFamily: 'var(--font-montserrat)',
        }}>
          Arrival: {arrivalTime}
        </span>

        {/* Delay line — omitted when 0 or null */}
        {showDelay && (
          <span style={{
            fontSize: '13px',
            fontWeight: 400,
            color: 'var(--offwhite)',
            lineHeight: 1.5,
            fontFamily: 'var(--font-montserrat)',
          }}>
            Delay: {flight_delay_minutes} min
          </span>
        )}
      </div>

      {/* Inline error */}
      {refreshError && (
        <div style={{
          marginTop: 8,
          fontSize: '11px',
          color: 'var(--warmgrey)',
          fontFamily: 'var(--font-montserrat)',
        }}>
          {refreshError}
        </div>
      )}
    </div>
  )
}
