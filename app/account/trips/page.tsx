import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import Nav from '@/components/Nav'

export const dynamic = 'force-dynamic'

const CLASS_LABELS: Record<string, string> = {
  business: 'Business',
  first_class: 'First Class',
  business_van: 'Business Van',
}

const STATUS_STYLES: Record<string, { label: string; color: string }> = {
  confirmed: { label: 'CONFIRMED', color: 'var(--copper)' },
  pending:   { label: 'PENDING',   color: '#E67E22' },
  completed: { label: 'COMPLETED', color: '#27AE60' },
  cancelled: { label: 'CANCELLED', color: '#f87171' },
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default async function AccountTripsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/account/trips')

  const { data: bookings } = await supabase
    .from('bookings')
    .select('id, booking_reference, pickup_date, pickup_time, origin_address, destination_address, vehicle_class, amount_eur, status, leg, trip_type')
    .order('pickup_date', { ascending: false })
    .limit(50)

  const trips = bookings ?? []

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: 'var(--anthracite)',
        fontFamily: 'var(--font-montserrat)',
      }}
    >
      <Nav />
      <div
        style={{ maxWidth: '1280px', margin: '0 auto', padding: '96px 24px 64px' }}
        className="md:px-12"
      >
        <h1
          style={{
            fontFamily: 'var(--font-cormorant)',
            fontSize: '28px',
            fontWeight: 400,
            color: 'var(--offwhite)',
            letterSpacing: '0.12em',
            lineHeight: 1.1,
            marginBottom: '8px',
          }}
        >
          My Trips
        </h1>
        <div className="copper-line" style={{ marginBottom: '32px' }} />

        {trips.length === 0 ? (
          <div className="max-w-md mx-auto mt-16 text-center">
            <div className="bg-anthracite-mid border border-anthracite-light rounded p-12">
              <svg
                width="48" height="48" viewBox="0 0 48 48" fill="none"
                xmlns="http://www.w3.org/2000/svg" aria-hidden="true"
                style={{ color: 'var(--anthracite-light)', margin: '0 auto 16px' }}
              >
                <rect x="6" y="10" width="36" height="30" rx="3" stroke="currentColor" strokeWidth="2" />
                <path d="M6 18h36" stroke="currentColor" strokeWidth="2" />
                <path d="M16 6v8M32 6v8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                <path d="M14 28h6M28 28h6M14 34h6M28 34h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              <h2
                style={{
                  fontFamily: 'var(--font-cormorant)',
                  fontSize: '18px',
                  fontWeight: 400,
                  color: 'var(--offwhite)',
                  letterSpacing: '0.08em',
                  marginBottom: '12px',
                }}
              >
                No trips yet
              </h2>
              <p
                style={{
                  fontFamily: 'var(--font-montserrat)',
                  fontSize: '14px',
                  fontWeight: 300,
                  color: 'var(--warmgrey)',
                  lineHeight: 1.75,
                  marginBottom: '32px',
                }}
              >
                Your booked transfers will appear here. Ready to travel?
              </p>
              <Link href="/book" className="btn-primary" style={{ padding: '12px 32px' }}>
                Book a transfer
              </Link>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 760 }}>
            {trips.map((trip) => {
              const statusEntry = STATUS_STYLES[trip.status] ?? STATUS_STYLES.pending
              const classLabel = CLASS_LABELS[trip.vehicle_class] ?? trip.vehicle_class
              return (
                <div
                  key={trip.id}
                  style={{
                    background: 'var(--anthracite-mid)',
                    border: '1px solid var(--anthracite-light)',
                    borderRadius: 4,
                    padding: '20px 24px',
                  }}
                >
                  {/* Top row: ref + status */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <span
                      style={{
                        fontFamily: 'var(--font-montserrat)',
                        fontSize: 11,
                        fontWeight: 600,
                        letterSpacing: '0.22em',
                        color: 'var(--copper)',
                        textTransform: 'uppercase',
                      }}
                    >
                      {trip.booking_reference}
                    </span>
                    <span
                      style={{
                        fontFamily: 'var(--font-montserrat)',
                        fontSize: 10,
                        fontWeight: 600,
                        letterSpacing: '0.22em',
                        color: statusEntry.color,
                        textTransform: 'uppercase',
                      }}
                    >
                      {statusEntry.label}
                    </span>
                  </div>

                  {/* Date + class */}
                  <div style={{ display: 'flex', gap: 24, marginBottom: 10, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13, color: 'var(--offwhite)', fontWeight: 400 }}>
                      {formatDate(trip.pickup_date)}{trip.pickup_time ? ` · ${trip.pickup_time}` : ''}
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--warmgrey)', fontWeight: 300 }}>
                      {classLabel}
                    </span>
                  </div>

                  {/* Route */}
                  <div style={{ fontSize: 13, color: 'var(--warmgrey)', fontWeight: 300, lineHeight: 1.5 }}>
                    <span>{trip.origin_address ?? '—'}</span>
                    <span style={{ margin: '0 8px', color: 'var(--copper)' }}>→</span>
                    <span>{trip.destination_address ?? '—'}</span>
                  </div>

                  {/* Amount */}
                  {trip.amount_eur != null && (
                    <div style={{ marginTop: 10, fontSize: 14, fontWeight: 600, color: 'var(--offwhite)' }}>
                      €{Number(trip.amount_eur).toFixed(0)}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
