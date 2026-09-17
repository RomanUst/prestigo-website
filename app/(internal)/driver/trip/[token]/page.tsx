import type { Metadata } from 'next'
import { z } from 'zod'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { isTripLinkValid } from '@/lib/trip-token'
import { formatVehicleLabel } from '@/lib/email'
import RouteMap from '@/components/booking/RouteMap'
import TripProgressClient from './TripProgressClient'
import type { PlaceResult } from '@/types/booking'

// D-08: this page must never be indexed — it is a permanent, unguessable
// per-assignment link presentable to police control, not public content.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

interface PageProps {
  params: Promise<{ token: string }>
}

// Explicit row shape for the trip-sheet join query. createSupabaseServiceClient()
// is not generic-typed against Database (matches the rest of this codebase's
// service-client call sites), so a `bookings!inner(*)` select-string join is
// otherwise inferred as an array by supabase-js's string-literal parser — cast
// through this interface instead of loosening types with `any` at each use site.
interface TripSheetBookingRow {
  booking_reference: string
  pickup_date: string
  pickup_time: string
  origin_address: string | null
  destination_address: string | null
  origin_lat: number | null
  origin_lng: number | null
  destination_lat: number | null
  destination_lng: number | null
  client_first_name: string
  client_last_name: string
  client_phone: string
  flight_number: string | null
  flight_iata: string | null
  special_requests: string | null
  vehicle_class: string
  status: string
  driver_id: string | null
}

interface TripSheetDriverRow {
  name: string
  phone: string
  vehicle_info: string | null
}

interface TripSheetAssignmentRow {
  id: string
  driver_id: string
  trip_progress: string | null
  trip_note: string | null
  bookings: TripSheetBookingRow | null
  drivers: TripSheetDriverRow | null
}

const cardStyle: React.CSSProperties = {
  background: 'var(--anthracite-mid)',
  border: '1px solid var(--anthracite-light)',
  borderRadius: '2px',
  maxWidth: '560px',
  width: '100%',
  padding: '32px 48px',
}

const labelStyle: React.CSSProperties = {
  fontSize: '13px',
  fontWeight: 300,
  letterSpacing: '0.25em',
  textTransform: 'uppercase',
  color: 'var(--copper-light)',
}

const valueStyle: React.CSSProperties = {
  fontSize: '13px',
  fontWeight: 300,
  color: 'var(--offwhite)',
  letterSpacing: '0.03em',
  whiteSpace: 'normal',
  wordBreak: 'break-word',
}

const headingStyle: React.CSSProperties = {
  fontFamily: 'var(--font-cormorant)',
  fontSize: '18px',
  fontWeight: 500,
  color: 'var(--offwhite)',
  letterSpacing: '0.03em',
  marginTop: '24px',
  marginBottom: '16px',
  paddingBottom: '8px',
  borderBottom: '1px solid var(--anthracite-light)',
}

const gridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: '8px 16px',
}

function FieldRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <span style={labelStyle}>{label}</span>
      <span style={valueStyle}>{value}</span>
    </>
  )
}

// D-11: single neutral view for EVERY invalid reason (unknown token,
// bad-UUID shape, terminal status, reassigned, orphaned booking) — no branch
// distinguishes the reason, preventing enumeration/information disclosure.
function InvalidTripLinkView() {
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
          <span className="wordmark-presti">PRESTI</span>
          <span className="wordmark-go">GO</span>
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
          This trip link is no longer active.
        </p>
      </div>
    </main>
  )
}

export default async function TripSheetPage({ params }: PageProps) {
  const { token } = await params

  // V5 input validation (anti-enumeration): reject malformed tokens before
  // ever touching Supabase — mirrors respondSchema's z.string().uuid().
  const parsedToken = z.string().uuid().safeParse(token)
  if (!parsedToken.success) {
    return <InvalidTripLinkView />
  }

  const supabase = createSupabaseServiceClient()

  // Single read-only join — resolves exactly one assignment -> its own
  // booking (bookings!inner) and that assignment's driver. No cross-booking
  // data, no enumeration parameter, no writes anywhere on this page.
  const { data: rawAssignment, error } = await supabase
    .from('driver_assignments')
    .select('id, driver_id, trip_progress, trip_note, bookings!inner(*), drivers(name, phone, vehicle_info)')
    .eq('trip_token', parsedToken.data)
    .single()

  const assignment = rawAssignment as unknown as TripSheetAssignmentRow | null

  if (error || !assignment || !assignment.bookings) {
    return <InvalidTripLinkView />
  }

  const booking = assignment.bookings
  const driver = assignment.drivers

  // D-03 security boundary: driver_id match (self-invalidates on
  // reassignment) AND non-terminal status (self-invalidates on completion
  // or cancellation) — checked live on every request, no stored expiry.
  const valid = isTripLinkValid({
    assignmentDriverId: assignment.driver_id,
    bookingDriverId: booking.driver_id,
    bookingStatus: booking.status,
  })

  if (!valid) {
    return <InvalidTripLinkView />
  }

  // Pitfall 3: pass null through when a coordinate is missing rather than
  // {lat:0, lng:0} — RouteMap's own null-safe empty state is for its OWN
  // internal use; here we render a page-owned placeholder instead of
  // mounting RouteMap at all when either pair is null.
  const origin: PlaceResult | null =
    booking.origin_lat !== null && booking.origin_lat !== undefined &&
    booking.origin_lng !== null && booking.origin_lng !== undefined
      ? { address: booking.origin_address ?? '', placeId: '', lat: booking.origin_lat, lng: booking.origin_lng }
      : null

  const destination: PlaceResult | null =
    booking.destination_lat !== null && booking.destination_lat !== undefined &&
    booking.destination_lng !== null && booking.destination_lng !== undefined
      ? { address: booking.destination_address ?? '', placeId: '', lat: booking.destination_lat, lng: booking.destination_lng }
      : null

  const flightInfo: string | null = booking.flight_number ?? booking.flight_iata ?? null

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
        {/* Header (D-05): wordmark, title, booking reference — primary focal anchor */}
        <div
          className="wordmark"
          style={{ marginBottom: '24px', display: 'block', textAlign: 'center' }}
        >
          <span className="wordmark-presti">PRESTI</span>
          <span className="wordmark-go">GO</span>
        </div>

        <h1
          style={{
            fontFamily: 'var(--font-cormorant)',
            fontSize: '28px',
            fontWeight: 300,
            lineHeight: 1.2,
            color: 'var(--offwhite)',
            letterSpacing: '0.05em',
            marginBottom: '8px',
            textAlign: 'center',
          }}
        >
          Trip Sheet
        </h1>

        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <div style={{ ...labelStyle, marginBottom: '4px' }}>Booking Reference</div>
          <div
            style={{
              fontFamily: 'var(--font-cormorant)',
              fontSize: '22px',
              fontWeight: 500,
              color: 'var(--copper-light)',
              letterSpacing: '0.05em',
            }}
          >
            {booking.booking_reference}
          </div>
        </div>

        {/* Section 1 (D-06): Trip Details */}
        <h2 style={headingStyle}>Trip Details</h2>
        <div style={gridStyle}>
          <FieldRow label="Date" value={booking.pickup_date} />
          <FieldRow label="Time" value={booking.pickup_time} />
          <FieldRow label="From" value={booking.origin_address ?? ''} />
          <FieldRow label="To" value={booking.destination_address ?? ''} />
          {flightInfo && <FieldRow label="Flight" value={flightInfo} />}
        </div>

        {/* Section 2 (D-06): Passenger */}
        <h2 style={headingStyle}>Passenger</h2>
        <div style={gridStyle}>
          <FieldRow label="Passenger" value={`${booking.client_first_name} ${booking.client_last_name}`} />
          <FieldRow label="Phone" value={booking.client_phone} />
          {booking.special_requests && <FieldRow label="Notes" value={booking.special_requests} />}
        </div>

        {/* Section 3 (D-06/D-07): Route Map — embedded, attribution-safe (RouteMap.tsx reused as-is) */}
        <h2 style={headingStyle}>Route Map</h2>
        {origin && destination ? (
          <RouteMap origin={origin} destination={destination} pickupTime={booking.pickup_time} />
        ) : (
          <div
            style={{
              height: 300,
              background: 'var(--anthracite-mid)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0 16px',
              textAlign: 'center',
            }}
          >
            <p
              style={{
                fontFamily: 'var(--font-montserrat)',
                fontSize: '11px',
                fontWeight: 400,
                color: 'var(--warmgrey)',
                lineHeight: 1.5,
              }}
            >
              Map unavailable — see address above.
            </p>
          </div>
        )}

        {/* Section 4 (D-06): Vehicle & Driver — Pitfall 4: both vehicle fields, distinct labels */}
        <h2 style={headingStyle}>Vehicle & Driver</h2>
        <div style={gridStyle}>
          <FieldRow label="Vehicle Class" value={formatVehicleLabel(booking.vehicle_class)} />
          {driver?.vehicle_info && <FieldRow label="Vehicle" value={driver.vehicle_info} />}
          <FieldRow label="Driver" value={driver?.name ?? ''} />
          <FieldRow label="Driver Phone" value={driver?.phone ?? ''} />
        </div>

        {/* Section 5 (DTRIP-03): trip-progress island — driver self-reports status */}
        <TripProgressClient
          token={parsedToken.data}
          initialProgress={assignment.trip_progress ?? null}
          initialNote={assignment.trip_note ?? null}
        />
      </div>
    </main>
  )
}
