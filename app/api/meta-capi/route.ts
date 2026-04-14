import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { enforceMaxBody, safeString, safeEmail } from '@/lib/request-guards'

const PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID
const CAPI_TOKEN = process.env.META_CAPI_TOKEN

function sha256(value: string): string {
  return createHash('sha256').update(value.toLowerCase().trim()).digest('hex')
}

/**
 * POST /api/meta-capi
 *
 * Server-side Conversions API proxy. Called in parallel with the client-side
 * fbq() call using the same eventId for deduplication.
 *
 * Public endpoint — no admin auth. Returns 200 on all errors so the client
 * is never blocked if CAPI is unavailable.
 *
 * Body:
 *   event_name  string  required  e.g. "Purchase", "InitiateCheckout"
 *   event_id    string  optional  deduplication key (match client-side eventID)
 *   url         string  optional  current page URL
 *   email       string  optional  will be SHA-256 hashed before sending
 *   phone       string  optional  will be SHA-256 hashed before sending
 *   first_name  string  optional  will be SHA-256 hashed before sending
 *   last_name   string  optional  will be SHA-256 hashed before sending
 *   custom_data object  optional  e.g. { value: 120, currency: "EUR" }
 */
export async function POST(request: NextRequest) {
  const tooBig = enforceMaxBody(request, 8_000)
  if (tooBig) return tooBig

  // Not configured — return success silently so the client is never blocked
  if (!PIXEL_ID || !CAPI_TOKEN) {
    return NextResponse.json({ ok: true, skipped: true })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const eventName = safeString(64).safeParse(body.event_name).data
  if (!eventName) {
    return NextResponse.json({ error: 'event_name required' }, { status: 400 })
  }

  const eventId = safeString(128).safeParse(body.event_id).data
  const eventSourceUrl = safeString(1024).safeParse(body.url).data

  // Build hashed user data
  const userData: Record<string, unknown> = {}

  const clientIp =
    request.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    request.headers.get('x-real-ip') ??
    ''
  const userAgent = request.headers.get('user-agent') ?? ''

  if (clientIp) userData['client_ip_address'] = clientIp
  if (userAgent) userData['client_user_agent'] = userAgent

  const rawEmail = safeEmail().safeParse(body.email).data
  if (rawEmail) userData['em'] = [sha256(rawEmail)]

  const rawPhone = safeString(30).safeParse(body.phone).data
  if (rawPhone) {
    const digits = rawPhone.replace(/\D/g, '')
    if (digits) userData['ph'] = [sha256(digits)]
  }

  const firstName = safeString(100).safeParse(body.first_name).data
  if (firstName) userData['fn'] = [sha256(firstName)]

  const lastName = safeString(100).safeParse(body.last_name).data
  if (lastName) userData['ln'] = [sha256(lastName)]

  const event: Record<string, unknown> = {
    event_name: eventName,
    event_time: Math.floor(Date.now() / 1000),
    action_source: 'website',
    user_data: userData,
  }
  if (eventId) event['event_id'] = eventId
  if (eventSourceUrl) event['event_source_url'] = eventSourceUrl
  if (body.custom_data && typeof body.custom_data === 'object') {
    event['custom_data'] = body.custom_data
  }

  try {
    const res = await fetch(
      `https://graph.facebook.com/v19.0/${PIXEL_ID}/events?access_token=${CAPI_TOKEN}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: [event] }),
      },
    )
    const data = await res.json()
    return NextResponse.json({ ok: res.ok, events_received: data.events_received })
  } catch {
    // CAPI failure must never break the booking flow
    return NextResponse.json({ ok: true, skipped: true })
  }
}
