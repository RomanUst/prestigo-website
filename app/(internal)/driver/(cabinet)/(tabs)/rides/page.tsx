import type { Metadata } from 'next'
import { requireDriver } from '@/lib/driver-cabinet/auth'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { getPragueTodayISO } from '@/lib/prague-date'
import { loadDriverRides, upcomingGroups } from '@/lib/driver-cabinet/rides'
import { countLiveOffers } from '@/lib/driver-cabinet/offers'
import { DayGroupHeader, RideRow, RidesEmptyState } from '@/components/driver/RideList'

// Phase 94 plan 94-06 (DCAB-05, DCAB-06; D-03): the driver's upcoming rides grouped by Prague day. Per request (reads the
// session cookie), gated by this page itself (a layout is not a gate, Pitfall 4). The service client is created inside
// the request, never at module scope.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Rides | Prestigo Driver',
  robots: { index: false, follow: false },
}

export default async function DriverRidesPage() {
  const { driverId } = await requireDriver('/driver/rides')

  const supabase = createSupabaseServiceClient()
  const [source, offersCount] = await Promise.all([
    loadDriverRides(supabase, driverId),
    countLiveOffers(supabase, driverId),
  ])
  const groups = upcomingGroups(source, getPragueTodayISO())

  return (
    <main style={{ flex: 1, fontFamily: 'var(--font-montserrat)', color: 'var(--admin-text)' }}>
      <h1
        style={{
          margin: '8px 24px 16px',
          fontFamily: 'var(--admin-font-heading)',
          fontSize: 'var(--driver-fs-display)',
          fontWeight: 500,
        }}
      >
        Rides
      </h1>
      {groups.length === 0 ? (
        <RidesEmptyState
          heading="No upcoming rides"
          body="Rides you accept will appear here."
          offersCount={offersCount}
        />
      ) : (
        groups.map((group) => (
          <section key={group.dateIso}>
            <DayGroupHeader label={group.label} />
            {group.rows.map((row) => (
              <RideRow key={row.assignmentId} row={row} />
            ))}
          </section>
        ))
      )}
    </main>
  )
}
