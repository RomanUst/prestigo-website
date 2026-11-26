// Phase 94 plan 94-12 (DCAB-05, DCAB-10; D-13): the signed-in driver's profile and two simple stats for the You tab.
//
// Every read is keyed by the driver id of the session (.eq gates), never by anything from the request. The profile
// holds only the columns the You tab prints; the stats are a count of completed rides and the share of answered
// offers the driver accepted.

import { loadDriverRides, pastRideRows } from '@/lib/driver-cabinet/rides'
import { plateLabel } from '@/lib/driver-cabinet/format'

// Minimal structural type of the service client: the tests pass an in-memory stand-in.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ServiceClient = { from: (table: string) => any }

export interface DriverProfile {
  name: string
  phone: string | null
  email: string
  vehicleInfo: string | null
  plate: string | null
}

export interface DriverStats {
  ridesCompleted: number
  offersAcceptedPercent: number | null
}

/** Column gate: exactly what the You tab prints. */
export const PROFILE_SELECT = 'name, phone, email, vehicle_info, vehicle_plate'

function textOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const text = value.trim()
  return text === '' ? null : text
}

/** The session driver's own details, or null when the row is missing or unreadable. */
export async function getDriverProfile(supabase: ServiceClient, driverId: string): Promise<DriverProfile | null> {
  const { data, error } = await supabase.from('drivers').select(PROFILE_SELECT).eq('id', driverId).maybeSingle()
  if (error || !data) return null
  const row = data as {
    name?: string | null
    phone?: string | null
    email?: string | null
    vehicle_info?: string | null
    vehicle_plate?: string | null
  }
  return {
    name: typeof row.name === 'string' ? row.name.trim() : '',
    phone: textOrNull(row.phone),
    email: typeof row.email === 'string' ? row.email.trim() : '',
    vehicleInfo: textOrNull(row.vehicle_info),
    plate: plateLabel(row.vehicle_plate),
  }
}

/**
 * Rides completed (the driver's past rides whose booking is completed, newest-assignment rules of rides.ts) and the
 * offers accepted share: round(100 * accepted / (accepted + declined)), pending excluded, null when nothing was answered.
 * A failing read counts as nothing answered / no rides, never as a wrong number.
 */
export async function getDriverStats(supabase: ServiceClient, driverId: string): Promise<DriverStats> {
  const source = await loadDriverRides(supabase, driverId)
  const ridesCompleted = pastRideRows(source).filter((r) => r.bookingStatus === 'completed').length

  const { data, error } = await supabase
    .from('driver_assignments')
    .select('status')
    .eq('driver_id', driverId)
    .in('status', ['accepted', 'declined'])
  let offersAcceptedPercent: number | null = null
  if (!error && Array.isArray(data)) {
    let accepted = 0
    let declined = 0
    for (const row of data as Array<{ status: string }>) {
      if (row.status === 'accepted') accepted += 1
      else if (row.status === 'declined') declined += 1
    }
    const answered = accepted + declined
    if (answered > 0) offersAcceptedPercent = Math.round((100 * accepted) / answered)
  }

  return { ridesCompleted, offersAcceptedPercent }
}
