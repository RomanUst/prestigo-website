// Google Calendar sync for accepted bookings.
//
// Every booking in an "accepted" status (confirmed and onward) is mirrored as
// one event in the operator's Google Calendar; any other status removes it.
// Auth is a Google service account (JWT bearer flow, signed with node:crypto —
// no googleapis dependency). The target calendar must be shared with the
// service account email with "Make changes to events".
//
// Event IDs are derived from the booking UUID, so sync is idempotent: no
// bookkeeping column, and concurrent syncs of one booking cannot duplicate.
//
// Env: GOOGLE_CALENDAR_ID, GOOGLE_CALENDAR_SA_EMAIL, GOOGLE_CALENDAR_SA_KEY
// (PEM private key; literal "\n" sequences are accepted).

import { createSign } from 'crypto'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { formatVehicleLabel, getAcceptedDriver } from '@/lib/email'
import { loadStopsSafe } from '@/lib/booking-stops'
import { CALENDAR_ACTIVE_STATUSES, type BookingStatus } from '@/lib/booking-status'
import { estimateDurationMinutes } from '@/lib/trip-duration'

// D-02: one shared set (confirmed through completed, plus on_board and no_show, which keep their event).
export { CALENDAR_ACTIVE_STATUSES }

// Phase 90: the estimate moved to a client-safe module; re-exported unchanged for existing importers.
export { estimateDurationMinutes } from '@/lib/trip-duration'

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const API_BASE = 'https://www.googleapis.com/calendar/v3'
const SCOPE = 'https://www.googleapis.com/auth/calendar.events'
const TIME_ZONE = 'Europe/Prague'

interface CalendarConfig {
  calendarId: string
  email: string
  privateKey: string
}

function getConfig(): CalendarConfig | null {
  const calendarId = process.env.GOOGLE_CALENDAR_ID
  const email = process.env.GOOGLE_CALENDAR_SA_EMAIL
  const key = process.env.GOOGLE_CALENDAR_SA_KEY
  if (!calendarId || !email || !key) return null
  return { calendarId, email, privateKey: key.replace(/\\n/g, '\n') }
}

export function isCalendarSyncConfigured(): boolean {
  return getConfig() !== null
}

// Google event IDs: base32hex chars (0-9, a-v), 5–1024 long. UUID hex fits.
export function calendarEventId(bookingId: string): string {
  return `pb${bookingId.replace(/-/g, '').toLowerCase()}`
}

// ── Auth ────────────────────────────────────────────────────────────────────

let cachedToken: { value: string; expiresAt: number } | null = null

function base64url(input: string | Buffer): string {
  return Buffer.from(input).toString('base64url')
}

async function getAccessToken(cfg: CalendarConfig): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value

  const now = Math.floor(Date.now() / 1000)
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claims = base64url(
    JSON.stringify({ iss: cfg.email, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600 })
  )
  const signer = createSign('RSA-SHA256')
  signer.update(`${header}.${claims}`)
  const assertion = `${header}.${claims}.${base64url(signer.sign(cfg.privateKey))}`

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  })
  if (!res.ok) throw new Error(`Google token exchange failed: ${res.status}`)
  const json = (await res.json()) as { access_token: string; expires_in: number }
  cachedToken = { value: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 }
  return json.access_token
}

// ── Event building ──────────────────────────────────────────────────────────

export interface CalendarBooking {
  id: string
  booking_reference: string
  status: string
  booking_source?: string | null
  trip_type: string | null
  leg: string | null
  pickup_utc: string
  hours: number | null
  distance_km: number | null
  origin_address: string
  destination_address: string | null
  vehicle_class: string
  passengers: number | null
  luggage: number | null
  client_first_name: string | null
  client_last_name: string | null
  client_phone: string | null
  client_email: string | null
  flight_number: string | null
  terminal: string | null
  special_requests: string | null
  operator_notes: string | null
  extra_child_seat: boolean | null
  extra_meet_greet: boolean | null
  driver_name?: string
  /** Phase 91 (STOP-05): the airport landing kept beside the pickup; null / absent for a booking without one. */
  landing?: { date: string; time: string; offsetMin: number } | null
  /** Phase 91 (STOP-04): the stored stops in order; absent or empty for a booking without stops. */
  stops?: Array<{ position: number; address: string | null; waitMinutes: number }>
  /** Phase 93 (TRIP-04): a tour booking's EN title snapshot; `hours` is then the whole time at the destination. */
  tour_title?: string | null
  /** Phase 93: the tour's drive minutes one way, for the event length; absent = the default estimate below. */
  drive_minutes_each_way?: number | null
}

/** One-way drive minutes assumed for a tour whose drive time could not be read (the event is a window, not a promise). */
export const TOUR_DRIVE_ESTIMATE_MIN = 60

/** The tour title when this booking is a tour with one to show, else null. */
function tourTitleOf(b: CalendarBooking): string | null {
  return b.trip_type === 'tour' && b.tour_title ? b.tour_title : null
}

/** Event length of a tour: the drive there and back plus the hours at the destination (never 0 minutes or 1 hour). */
function tourDurationMinutes(b: CalendarBooking): number {
  const drive = typeof b.drive_minutes_each_way === 'number' && b.drive_minutes_each_way > 0 ? b.drive_minutes_each_way : TOUR_DRIVE_ESTIMATE_MIN
  const hours = b.hours && b.hours > 0 ? b.hours : 0
  return 2 * drive + 60 * hours
}

export function buildCalendarEvent(b: CalendarBooking) {
  const start = new Date(b.pickup_utc)
  const tourTitle = tourTitleOf(b)
  const end = new Date(start.getTime() + (tourTitle ? tourDurationMinutes(b) : estimateDurationMinutes(b)) * 60_000)
  const client = [b.client_first_name, b.client_last_name].filter(Boolean).join(' ')
  const tourLabel = tourTitle ? `Day trip: ${tourTitle} (${b.hours ?? '?'} h)` : null
  const route = b.destination_address
    ? `${b.origin_address} → ${b.destination_address}`
    : `${b.origin_address} (${b.hours ?? '?'} h)`
  const legLabel = b.leg === 'return' ? ' · return' : ''

  const extras = [b.extra_meet_greet && 'Meet & greet', b.extra_child_seat && 'Child seat']
    .filter(Boolean)
    .join(', ')
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://rideprestigo.com'

  const lines = [
    `Booking: ${b.booking_reference}${legLabel}`,
    `Status: ${b.status}`,
    tourLabel ? tourLabel : `Route: ${route}`,
    tourLabel ? `Pickup and return: ${b.origin_address}` : null,
    b.landing ? `Landing ${b.landing.time} (pickup +${b.landing.offsetMin} min)` : null,
    ...(b.stops ?? []).map(
      (s) =>
        `Stop ${s.position}: ${s.address ?? 'pinned on the map'}${s.waitMinutes > 0 ? ` (wait ${s.waitMinutes} min)` : ''}`,
    ),
    `Vehicle: ${formatVehicleLabel(b.vehicle_class)}`,
    `Passengers: ${b.passengers ?? '-'} · Luggage: ${b.luggage ?? '-'}`,
    b.flight_number ? `Flight: ${b.flight_number}${b.terminal ? ` (T${b.terminal})` : ''}` : null,
    extras ? `Extras: ${extras}` : null,
    '',
    `Client: ${client || '-'}`,
    b.client_phone ? `Phone: ${b.client_phone}` : null,
    b.client_email ? `Email: ${b.client_email}` : null,
    `Driver: ${b.driver_name ?? 'not assigned'}`,
    b.special_requests ? `\nClient notes: ${b.special_requests}` : null,
    b.operator_notes ? `Operator notes: ${b.operator_notes}` : null,
    '',
    `${siteUrl}/admin/bookings`,
  ].filter((l): l is string => typeof l === 'string')

  return {
    summary: `${b.booking_source === 'gnet' ? 'GNet' : 'Prestigo'}: ${b.booking_reference}${legLabel}${tourLabel ? ` · ${tourLabel}` : ''} · ${client || 'Client'} · ${formatVehicleLabel(b.vehicle_class)}`,
    location: b.origin_address,
    description: lines.join('\n'),
    start: { dateTime: start.toISOString(), timeZone: TIME_ZONE },
    end: { dateTime: end.toISOString(), timeZone: TIME_ZONE },
    status: 'confirmed',
    // Completed and no-show trips stay on the calendar but turn grey (colorId 8 = Graphite).
    colorId: b.status === 'completed' || b.status === 'no_show' ? '8' : undefined,
  }
}

// ── Sync ────────────────────────────────────────────────────────────────────

export type CalendarSyncResult =
  | { action: 'upserted' | 'deleted' | 'skipped'; reason?: string }

export async function syncBookingToCalendar(bookingId: string): Promise<CalendarSyncResult> {
  const cfg = getConfig()
  if (!cfg) return { action: 'skipped', reason: 'not_configured' }

  const supabase = createSupabaseServiceClient()
  const { data: row, error } = await supabase
    .from('bookings')
    .select(`
      id, booking_reference, status, booking_source, trip_type, leg, pickup_utc, hours, distance_km,
      tour_id, tour_title, origin_address, destination_address, vehicle_class, passengers, luggage,
      client_first_name, client_last_name, client_phone, client_email,
      flight_number, terminal, special_requests, operator_notes,
      extra_child_seat, extra_meet_greet, landing_date, landing_time, pickup_offset_min,
      driver_assignments!left(status, drivers(name, email, vehicle_info))
    `)
    .eq('id', bookingId)
    .maybeSingle()

  if (error) throw new Error(`Booking lookup failed: ${error.message}`)

  const token = await getAccessToken(cfg)
  const eventUrl = `${API_BASE}/calendars/${encodeURIComponent(cfg.calendarId)}/events`
  const eventId = calendarEventId(bookingId)
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }

  const isActive =
    row && CALENDAR_ACTIVE_STATUSES.has(row.status as BookingStatus) && row.pickup_utc

  if (!isActive) {
    const res = await fetch(`${eventUrl}/${eventId}`, { method: 'DELETE', headers })
    // 404 = never created, 410 = already deleted
    if (!res.ok && res.status !== 404 && res.status !== 410) {
      throw new Error(`Calendar delete failed: ${res.status}`)
    }
    return { action: res.ok ? 'deleted' : 'skipped', reason: res.ok ? undefined : 'no_event' }
  }

  const assignments = (row.driver_assignments ?? []) as Array<{ status: string; drivers?: unknown }>
  const accepted = getAcceptedDriver(assignments)
  const pending = assignments.find((a) => a.status === 'pending')?.drivers as { name?: string } | undefined
  const driverName = accepted?.name
    ? `${accepted.name} (accepted)`
    : pending?.name
      ? `${pending.name} (awaiting acceptance)`
      : undefined

  // Phase 91 (STOP-04, STOP-05): the landing and the stops go into the description. A stops read that fails never blocks
  // the sync: the event is written without the stop lines.
  let stops: NonNullable<CalendarBooking['stops']> = []
  try {
    stops = (await loadStopsSafe(bookingId)).map((s) => ({
      position: s.position,
      address: s.address,
      waitMinutes: s.waitMinutes,
    }))
  } catch {
    stops = []
  }
  const landingRow = row as unknown as {
    landing_date: string | null
    landing_time: string | null
    pickup_offset_min: number | null
  }
  const landing =
    landingRow.landing_date && landingRow.landing_time && typeof landingRow.pickup_offset_min === 'number'
      ? { date: landingRow.landing_date, time: landingRow.landing_time, offsetMin: landingRow.pickup_offset_min }
      : null
  // Phase 93 (TRIP-04): a tour's event covers the drive too, so its drive time is read; a failed read never blocks the sync
  // (the event then uses the default estimate).
  let driveMinutes: number | null = null
  const tourRow = row as unknown as { trip_type: string | null; tour_id?: string | null }
  if (tourRow.trip_type === 'tour' && tourRow.tour_id) {
    try {
      const { data: tour } = await supabase
        .from('tours')
        .select('drive_minutes_each_way')
        .eq('id', tourRow.tour_id)
        .maybeSingle()
      const minutes = (tour as { drive_minutes_each_way?: unknown } | null)?.drive_minutes_each_way
      driveMinutes = typeof minutes === 'number' && Number.isFinite(minutes) ? minutes : null
    } catch {
      driveMinutes = null
    }
  }
  const body = buildCalendarEvent({
    ...(row as unknown as CalendarBooking),
    driver_name: driverName,
    landing,
    stops,
    drive_minutes_each_way: driveMinutes,
  })

  // PUT restores a previously deleted (cancelled) event with the same ID too.
  const put = await fetch(`${eventUrl}/${eventId}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(body),
  })
  if (put.ok) return { action: 'upserted' }
  if (put.status !== 404) throw new Error(`Calendar update failed: ${put.status}`)

  const insert = await fetch(eventUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({ id: eventId, ...body }),
  })
  if (!insert.ok) throw new Error(`Calendar insert failed: ${insert.status}`)
  return { action: 'upserted' }
}
