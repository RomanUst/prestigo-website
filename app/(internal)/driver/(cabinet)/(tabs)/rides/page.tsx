import type { Metadata } from 'next'
import { requireDriver } from '@/lib/driver-cabinet/auth'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { getPragueTodayISO } from '@/lib/prague-date'
import { isValidMonth, loadDriverRides, pastMonthView, upcomingGroups } from '@/lib/driver-cabinet/rides'
import { countLiveOffers } from '@/lib/driver-cabinet/offers'
import {
  DayGroupHeader,
  MonthBar,
  MonthTotalCard,
  RideRow,
  RidesEmptyState,
  RidesViewSwitch,
  type RidesView,
} from '@/components/driver/RideList'

// Phase 94 plans 94-06 / 94-10 (DCAB-05, DCAB-06; D-03, D-11): the driver's rides, Upcoming (grouped by Prague day) and
// Past (one Prague month at a time with the month's fee total). The URL is the state: /driver/rides and
// /driver/rides?view=past&month=YYYY-MM. Per request (reads the session cookie), gated by this page itself (a layout is
// not a gate, Pitfall 4). The service client is created inside the request, never at module scope.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Rides | Prestigo Driver',
  robots: { index: false, follow: false },
}

type SearchParams = Record<string, string | string[] | undefined>

/** A repeated query key (an array) is malformed input: it counts as absent. */
function single(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined
}

/** '2026-11' shifted by whole months: pure integer arithmetic, no Date and no time zone. */
function shiftMonth(month: string, delta: number): string {
  const [year, mon] = month.split('-').map(Number)
  const index = year * 12 + (mon - 1) + delta
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`
}

const pastHref = (month: string) => `/driver/rides?view=past&month=${month}`

export default async function DriverRidesPage({ searchParams }: { searchParams?: Promise<SearchParams> } = {}) {
  const params: SearchParams = (await searchParams) ?? {}
  const view: RidesView = single(params.view) === 'past' ? 'past' : 'upcoming'

  const todayIso = getPragueTodayISO()
  const currentMonth = todayIso.slice(0, 7)
  // T-94-47: the month comes from the URL; only a well-formed, not-future month is used, anything else is the current month.
  const requested = single(params.month)
  const month = isValidMonth(requested) && requested <= currentMonth ? requested : currentMonth

  const { driverId } = await requireDriver(view === 'past' ? pastHref(month) : '/driver/rides')

  const supabase = createSupabaseServiceClient()
  const title = (
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
  )

  if (view === 'past') {
    const source = await loadDriverRides(supabase, driverId)
    const past = pastMonthView(source, month, todayIso)
    return (
      <main style={{ flex: 1, fontFamily: 'var(--font-montserrat)', color: 'var(--admin-text)' }}>
        {title}
        <RidesViewSwitch view="past" />
        <MonthBar
          monthLabel={past.monthLabel}
          prevHref={past.hasEarlier ? pastHref(shiftMonth(month, -1)) : null}
          nextHref={past.hasLater ? pastHref(shiftMonth(month, 1)) : null}
        />
        {past.feeTotal !== null && <MonthTotalCard totalCzk={past.feeTotal} />}
        {past.groups.length === 0 ? (
          <RidesEmptyState
            heading={`No past rides in ${past.monthLabel}`}
            body={past.hasEarlier ? 'Use the arrows to see other months.' : undefined}
          />
        ) : (
          past.groups.map((group) => (
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

  const [source, offersCount] = await Promise.all([
    loadDriverRides(supabase, driverId),
    countLiveOffers(supabase, driverId),
  ])
  const groups = upcomingGroups(source, todayIso)

  return (
    <main style={{ flex: 1, fontFamily: 'var(--font-montserrat)', color: 'var(--admin-text)' }}>
      {title}
      <RidesViewSwitch view="upcoming" />
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
