// Phase 94 plan 94-06 (DCAB-05, DCAB-06; D-03, D-04, D-11, D-12): the rides of one driver.
//
// loadDriverRides reads the signed-in driver's pending / accepted assignments (always keyed by driver_id) and the
// driver's own plate; the pure functions below partition them into Upcoming and Past, group them by Prague day and
// total the fee of completed rides per Prague month. Only the first name, the route, the class and the driver's own
// fee leave this module: no other client or money column is ever selected (see RIDE_SELECT).

import { getPragueTodayISO, pickupInstantMs } from '@/lib/prague-date'
import { formatVehicleLabel } from '@/lib/email'
import { newestAssignmentByBooking } from '@/lib/driver-cabinet/assignments'
import { dropoffText, firstNameOf, plateLabel, pragueDayLabel } from '@/lib/driver-cabinet/format'

// Minimal structural type of the service client: the tests pass an in-memory stand-in.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ServiceClient = { from: (table: string) => any }

/**
 * Column gate (D-04, D-11, D-12): the same safe shape as the offers select. tests/driver-cabinet-rides.test.ts asserts
 * the recorded select strings against the forbidden-column list.
 */
export const RIDE_SELECT =
  'id, status, created_at, booking_id, bookings!inner(id, status, pickup_date, pickup_time, pickup_utc, origin_address, destination_address, client_first_name, vehicle_class, driver_price_czk)'

export type RideBadge = 'en_route' | 'on_location' | 'on_board' | 'completed' | 'cancelled' | 'no_show'

export interface RideRowView {
  assignmentId: string
  pickupDate: string
  time: string
  pickup: string
  dropoff: string
  firstName: string
  plate: string | null
  vehicleLabel: string
  badge: RideBadge | null
  accessibleName: string
  bookingStatus: string
  /** The driver's own fee when it is a positive integer, else null. Lists never print it; only monthFeeTotal sums it. */
  feeCzk: number | null
}

export interface DayGroup {
  dateIso: string
  label: string
  rows: RideRowView[]
}

export interface DriverRidesSource {
  rows: unknown[]
  newestByBooking: Map<string, string>
  plate: string | null
}

interface RideBooking {
  id: string
  status: string
  pickup_date: string
  pickup_time: string
  pickup_utc: string | null
  origin_address: string | null
  destination_address: string | null
  client_first_name: string | null
  vehicle_class: string | null
  driver_price_czk: number | null
}

interface RideRow {
  id: string
  status: string
  created_at?: string
  booking_id: string
  bookings: RideBooking | RideBooking[] | null
}

/** The started states of a trip: the car is on its way, at the pickup, or carrying the client. */
const STARTED_STATUSES: ReadonlySet<string> = new Set(['en_route', 'on_location', 'on_board'])
/** Bookings that still wait for the ride (accepted assignments show in Upcoming). */
const UPCOMING_STATUSES: ReadonlySet<string> = new Set(['assigned', 'confirmed', 'en_route', 'on_location', 'on_board'])
const TERMINAL_STATUSES: ReadonlySet<string> = new Set(['completed', 'cancelled', 'no_show'])

function bookingOf(row: RideRow): RideBooking | null {
  const b = Array.isArray(row.bookings) ? row.bookings[0] : row.bookings
  return b ?? null
}

/** The driver's pending and accepted assignments plus the driver's own plate. A failing read yields an empty source. */
export async function loadDriverRides(supabase: ServiceClient, driverId: string): Promise<DriverRidesSource> {
  const empty: DriverRidesSource = { rows: [], newestByBooking: new Map(), plate: null }

  const { data, error } = await supabase
    .from('driver_assignments')
    .select(RIDE_SELECT)
    .eq('driver_id', driverId)
    .in('status', ['pending', 'accepted'])
    .order('created_at', { ascending: false })
    .limit(500)
  if (error || !Array.isArray(data)) return empty

  const rows = data as RideRow[]
  const newestByBooking = await newestAssignmentByBooking(
    supabase,
    Array.from(new Set(rows.map((r) => r.booking_id))),
  )

  const { data: driver } = await supabase.from('drivers').select('vehicle_plate').eq('id', driverId).maybeSingle()
  const plate = plateLabel((driver as { vehicle_plate?: string | null } | null)?.vehicle_plate ?? null)

  return { rows, newestByBooking, plate }
}

function instantOf(b: RideBooking): number {
  const ms = pickupInstantMs(b)
  if (ms !== null) return ms
  const day = Date.parse(`${b.pickup_date}T00:00:00Z`)
  return Number.isFinite(day) ? day : 0
}

interface Entry {
  view: RideRowView
  ms: number
}

function toEntry(row: RideRow, booking: RideBooking, plate: string | null): Entry {
  const time = typeof booking.pickup_time === 'string' ? booking.pickup_time.slice(0, 5) : ''
  const pickup = booking.origin_address ?? ''
  const dropoff = dropoffText(booking.destination_address)
  const firstName = firstNameOf(booking.client_first_name)
  const vehicleLabel = formatVehicleLabel(booking.vehicle_class ?? '')

  const badge: RideBadge | null =
    STARTED_STATUSES.has(booking.status) || TERMINAL_STATUSES.has(booking.status) ? (booking.status as RideBadge) : null

  const parts = [`${time}, ${pickup} to ${dropoff}`]
  if (firstName) parts.push(`passenger ${firstName}`)
  parts.push(`plate ${plate ?? 'pending'}`)
  if (vehicleLabel) parts.push(vehicleLabel)

  const fee = booking.driver_price_czk
  return {
    ms: instantOf(booking),
    view: {
      assignmentId: row.id,
      pickupDate: booking.pickup_date,
      time,
      pickup,
      dropoff,
      firstName,
      plate,
      vehicleLabel,
      badge,
      accessibleName: parts.join(', '),
      bookingStatus: booking.status,
      feeCzk: typeof fee === 'number' && Number.isInteger(fee) && fee > 0 ? fee : null,
    },
  }
}

/** Rows that are the newest assignment of their booking (Pitfall 3), with their booking, ready to classify. */
function newestRows(source: DriverRidesSource): Array<{ row: RideRow; booking: RideBooking }> {
  const out: Array<{ row: RideRow; booking: RideBooking }> = []
  for (const raw of source.rows) {
    const row = raw as RideRow
    const booking = bookingOf(row)
    if (!booking) continue
    if (source.newestByBooking.get(row.booking_id) !== row.id) continue
    out.push({ row, booking })
  }
  return out
}

function groupByDay(entries: Entry[], todayIso: string): DayGroup[] {
  const groups: DayGroup[] = []
  const byDate = new Map<string, DayGroup>()
  for (const { view } of entries) {
    let group = byDate.get(view.pickupDate)
    if (!group) {
      group = { dateIso: view.pickupDate, label: pragueDayLabel(view.pickupDate, todayIso), rows: [] }
      byDate.set(view.pickupDate, group)
      groups.push(group)
    }
    group.rows.push(view)
  }
  return groups
}

/**
 * Upcoming (D-03): the newest assignment of its booking, accepted on a waiting or started booking, or pending on a
 * booking that already started (the driver began via the old trip link without accepting: otherwise the ride would
 * vanish from every tab). Ascending by pickup instant, grouped by Prague date.
 */
export function upcomingGroups(source: DriverRidesSource, todayIso: string = getPragueTodayISO()): DayGroup[] {
  const entries: Entry[] = []
  for (const { row, booking } of newestRows(source)) {
    const accepted = row.status === 'accepted' && UPCOMING_STATUSES.has(booking.status)
    const startedPending = row.status === 'pending' && STARTED_STATUSES.has(booking.status)
    if (!accepted && !startedPending) continue
    entries.push(toEntry(row, booking, source.plate))
  }
  entries.sort((a, b) => a.ms - b.ms)
  return groupByDay(entries, todayIso)
}

function pastEntries(source: DriverRidesSource): Entry[] {
  const entries: Entry[] = []
  for (const { row, booking } of newestRows(source)) {
    if (!TERMINAL_STATUSES.has(booking.status)) continue
    const accepted = row.status === 'accepted'
    // A pending offer on a cancelled booking was never the driver's ride; on completed / no_show it was (started via link).
    const pendingOnRun = row.status === 'pending' && (booking.status === 'completed' || booking.status === 'no_show')
    if (!accepted && !pendingOnRun) continue
    entries.push(toEntry(row, booking, source.plate))
  }
  entries.sort((a, b) => b.ms - a.ms)
  return entries
}

/** Every past (terminal) ride of the driver, newest first. */
export function pastRideRows(source: DriverRidesSource): RideRowView[] {
  return pastEntries(source).map((e) => e.view)
}

/**
 * The fee of completed rides: the sum of positive-integer driver_price_czk over completed rides only, null when no
 * completed ride carries a fee (never 0: D-11, Pitfall 11).
 */
export function monthFeeTotal(rows: RideRowView[]): number | null {
  let total = 0
  let priced = false
  for (const r of rows) {
    if (r.bookingStatus !== 'completed' || r.feeCzk === null) continue
    total += r.feeCzk
    priced = true
  }
  return priced ? total : null
}

export function isValidMonth(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value)
}

/** 'November 2026' from '2026-11'. Formatted at UTC noon in the UTC zone, so it never shifts with the server zone. */
export function monthLabel(month: string): string {
  const d = new Date(`${month}-01T12:00:00Z`)
  if (Number.isNaN(d.getTime())) return month
  return new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(d)
}

/** One Prague month of past rides (the month is the pickup_date prefix, so a 00:30 ride on the 1st is the new month). */
export function pastMonthView(
  source: DriverRidesSource,
  month: string,
  todayIso: string = getPragueTodayISO(),
): {
  month: string
  monthLabel: string
  groups: DayGroup[]
  feeTotal: number | null
  hasEarlier: boolean
  hasLater: boolean
} {
  const all = pastEntries(source)
  const inMonth = all.filter((e) => e.view.pickupDate.slice(0, 7) === month)
  return {
    month,
    monthLabel: monthLabel(month),
    groups: groupByDay(inMonth, todayIso),
    feeTotal: monthFeeTotal(inMonth.map((e) => e.view)),
    hasEarlier: all.some((e) => e.view.pickupDate.slice(0, 7) < month),
    hasLater: month < todayIso.slice(0, 7),
  }
}
