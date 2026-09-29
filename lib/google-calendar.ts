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

export const CALENDAR_ACTIVE_STATUSES = [
  'confirmed',
  'assigned',
  'en_route',
  'on_location',
  'completed',
] as const

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
}

/** Rough trip length: hourly bookings use their hours, transfers ~70 km/h + 15 min, min 1 h. */
export function estimateDurationMinutes(b: Pick<CalendarBooking, 'hours' | 'distance_km'>): number {
  if (b.hours && b.hours > 0) return b.hours * 60
  if (b.distance_km && b.distance_km > 0) {
    return Math.max(60, Math.round(((b.distance_km / 70) * 60 + 15) / 15) * 15)
  }
  return 60
}

export function buildCalendarEvent(b: CalendarBooking) {
  const start = new Date(b.pickup_utc)
  const end = new Date(start.getTime() + estimateDurationMinutes(b) * 60_000)
  const client = [b.client_first_name, b.client_last_name].filter(Boolean).join(' ')
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
    `Route: ${route}`,
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
    summary: `${b.booking_source === 'gnet' ? 'GNet' : 'Prestigo'}: ${b.booking_reference}${legLabel} · ${client || 'Client'} · ${formatVehicleLabel(b.vehicle_class)}`,
    location: b.origin_address,
    description: lines.join('\n'),
    start: { dateTime: start.toISOString(), timeZone: TIME_ZONE },
    end: { dateTime: end.toISOString(), timeZone: TIME_ZONE },
    status: 'confirmed',
    // Completed trips stay on the calendar but turn grey (colorId 8 = Graphite).
    colorId: b.status === 'completed' ? '8' : undefined,
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
      origin_address, destination_address, vehicle_class, passengers, luggage,
      client_first_name, client_last_name, client_phone, client_email,
      flight_number, terminal, special_requests, operator_notes,
      extra_child_seat, extra_meet_greet,
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
    row && (CALENDAR_ACTIVE_STATUSES as readonly string[]).includes(row.status) && row.pickup_utc

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
  const body = buildCalendarEvent({ ...(row as unknown as CalendarBooking), driver_name: driverName })

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
