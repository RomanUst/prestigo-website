import { createClient } from '@/lib/supabase/server'
import { getTranslations } from 'next-intl/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import Nav from '@/components/Nav'
import { VEHICLE_CLASS_KEY, type VehicleClass } from '@/types/booking'

export const dynamic = 'force-dynamic'

// Colour/style values only — the display label text now lives in the catalog
// under Account.trips.statusLabels (single source). The 4-key map is preserved
// intentionally: any status outside these four falls back to `pending`
// (pre-existing behaviour, byte-for-byte unchanged — see plan prohibition).
const STATUS_STYLES: Record<string, { color: string }> = {
  confirmed: { color: 'var(--copper)' },
  pending:   { color: '#E67E22' },
  completed: { color: '#27AE60' },
  cancelled: { color: '#f87171' },
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

  const t = await getTranslations('Account.trips')
  const vt = await getTranslations('Booking.vehicleClasses')

  const { data: bookings } = await supabase
    .from('bookings')
    .select('id, booking_reference, pickup_date, pickup_time, origin_address, destination_address, vehicle_class, amount_eur, status, leg, trip_type')
    .eq('user_id', user.id) // defense-in-depth on top of RLS
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
          {t('heading')}
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
                {t('emptyHeading')}
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
                {t('emptyBody')}
              </p>
              <Link href="/book" className="btn-primary" style={{ padding: '12px 32px' }}>
                {t('emptyCta')}
              </Link>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 760 }}>
            {trips.map((trip) => {
              // Preserve the pre-existing 4-key gap: any status outside the
              // four defined keys resolves to `pending` for both colour + label.
              const statusKey = STATUS_STYLES[trip.status] ? trip.status : 'pending'
              const statusEntry = STATUS_STYLES[statusKey]
              const statusLabel = t(`statusLabels.${statusKey}`)
              // Class label resolves from the single-source Booking.vehicleClasses
              // catalog (via VEHICLE_CLASS_KEY); unknown classes fall back to raw.
              const classKey = VEHICLE_CLASS_KEY[trip.vehicle_class as VehicleClass]
              const classLabel = classKey ? vt(`${classKey}.label`) : trip.vehicle_class
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
                      {statusLabel}
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
