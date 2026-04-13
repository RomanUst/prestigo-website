import { createSupabaseServiceClient } from '@/lib/supabase'
import DriverResponseClient from './DriverResponseClient'

interface PageProps {
  searchParams: Promise<{ token?: string; action?: string }>
}

function InvalidTokenView() {
  return (
    <main
      style={{
        background: 'var(--anthracite)',
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        fontFamily: 'var(--font-montserrat)',
      }}
    >
      <div
        style={{
          background: 'var(--anthracite-mid)',
          border: '1px solid var(--anthracite-light)',
          borderRadius: '2px',
          maxWidth: '480px',
          width: '100%',
          padding: '32px 48px',
        }}
      >
        {/* Wordmark */}
        <div
          className="wordmark"
          style={{ marginBottom: '32px', display: 'block', textAlign: 'center' }}
        >
          <span className="wordmark-presti">Presti</span>
          <span className="wordmark-go">go</span>
        </div>

        {/* Error message */}
        <p
          style={{
            color: 'var(--warmgrey)',
            fontSize: '14px',
            fontWeight: 300,
            lineHeight: 1.75,
            textAlign: 'center',
            letterSpacing: '0.03em',
          }}
        >
          This link has expired or has already been used.
        </p>
      </div>
    </main>
  )
}

export default async function DriverResponsePage({ searchParams }: PageProps) {
  const { token } = await searchParams

  if (!token) {
    return <InvalidTokenView />
  }

  const supabase = createSupabaseServiceClient()

  // Fetch assignment by token — validate before rendering trip details
  const { data: assignment, error: assignmentError } = await supabase
    .from('driver_assignments')
    .select('id, status, token_used_at, token_expires_at, booking_id, driver_id')
    .eq('token', token)
    .single()

  // Token not found or DB error
  if (assignmentError || !assignment) {
    return <InvalidTokenView />
  }

  // Token already used or expired
  const isValid =
    !assignment.token_used_at && new Date(assignment.token_expires_at) > new Date()

  if (!isValid) {
    return <InvalidTokenView />
  }

  // Already responded (not pending)
  if (assignment.status !== 'pending') {
    return (
      <main
        style={{
          background: 'var(--anthracite)',
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '16px',
          fontFamily: 'var(--font-montserrat)',
        }}
      >
        <div
          style={{
            background: 'var(--anthracite-mid)',
            border: '1px solid var(--anthracite-light)',
            borderRadius: '2px',
            maxWidth: '480px',
            width: '100%',
            padding: '32px 48px',
          }}
        >
          <div
            className="wordmark"
            style={{ marginBottom: '32px', display: 'block', textAlign: 'center' }}
          >
            <span className="wordmark-presti">Presti</span>
            <span className="wordmark-go">go</span>
          </div>
          <p
            style={{
              color: 'var(--warmgrey)',
              fontSize: '14px',
              fontWeight: 300,
              lineHeight: 1.75,
              textAlign: 'center',
              letterSpacing: '0.03em',
            }}
          >
            {assignment.status === 'accepted'
              ? 'Thank you. Booking accepted.'
              : 'Understood. The booking has been declined.'}
          </p>
        </div>
      </main>
    )
  }

  // Fetch booking details
  const { data: booking } = await supabase
    .from('bookings')
    .select('pickup_date, pickup_time, origin_address, destination_address, first_name, last_name, phone')
    .eq('id', assignment.booking_id)
    .single()

  // Fetch driver name
  const { data: driver } = await supabase
    .from('drivers')
    .select('name')
    .eq('id', assignment.driver_id)
    .single()

  // Responsive card padding helper (inline for SSR compatibility)
  const cardStyle = {
    background: 'var(--anthracite-mid)',
    border: '1px solid var(--anthracite-light)',
    borderRadius: '2px',
    maxWidth: '480px',
    width: '100%',
    padding: '32px 48px',
  } as React.CSSProperties

  const labelStyle = {
    fontSize: '13px',
    fontWeight: 300,
    letterSpacing: '0.25em',
    textTransform: 'uppercase' as const,
    color: 'var(--copper-light)',
  }

  const valueStyle = {
    fontSize: '13px',
    fontWeight: 300,
    color: 'var(--offwhite)',
    letterSpacing: '0.03em',
  }

  return (
    <main
      style={{
        background: 'var(--anthracite)',
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        fontFamily: 'var(--font-montserrat)',
      }}
    >
      <div style={cardStyle}>
        {/* Wordmark */}
        <div
          className="wordmark"
          style={{ marginBottom: '32px', display: 'block', textAlign: 'center' }}
        >
          <span className="wordmark-presti">Presti</span>
          <span className="wordmark-go">go</span>
        </div>

        {/* Heading */}
        <h1
          style={{
            fontFamily: 'var(--font-cormorant)',
            fontSize: '28px',
            fontWeight: 300,
            lineHeight: 1.2,
            color: 'var(--offwhite)',
            letterSpacing: '0.05em',
            marginBottom: '8px',
          }}
        >
          Your ride assignment
        </h1>

        {driver?.name && (
          <p
            style={{
              fontSize: '13px',
              fontWeight: 300,
              color: 'var(--warmgrey)',
              letterSpacing: '0.03em',
              marginBottom: '24px',
            }}
          >
            Hello, {driver.name}
          </p>
        )}

        {/* Trip detail grid */}
        {booking && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '8px 16px',
              marginBottom: '32px',
            }}
          >
            <span style={labelStyle}>Date</span>
            <span style={valueStyle}>{booking.pickup_date}</span>

            <span style={labelStyle}>Time</span>
            <span style={valueStyle}>{booking.pickup_time}</span>

            <span style={labelStyle}>From</span>
            <span style={valueStyle}>{booking.origin_address}</span>

            <span style={labelStyle}>To</span>
            <span style={valueStyle}>{booking.destination_address}</span>

            <span style={labelStyle}>Passenger</span>
            <span style={valueStyle}>
              {booking.first_name} {booking.last_name}
            </span>

            <span style={labelStyle}>Phone</span>
            <span style={valueStyle}>{booking.phone}</span>
          </div>
        )}

        {/* Accept / Decline client island */}
        <DriverResponseClient token={token} />
      </div>
    </main>
  )
}
