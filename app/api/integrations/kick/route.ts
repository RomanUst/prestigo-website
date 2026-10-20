import { timingSafeEqual } from 'crypto'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { enforceMaxBody } from '@/lib/request-guards'
import { parseOutboxKey, publishOutboxDispatch } from '@/lib/outbox'

// pg_net -> QStash bridge (Phase 81 migration 067, Phase 82 migration 069). The bookings and
// customer_profiles triggers POST the outbox key with a Bearer secret; this route publishes a delayed
// dispatch. The daily sweep is the safety net, so a lost or rejected kick only costs latency. Importing nothing CRM-related keeps it off the VPS allowlist.

export const maxDuration = 10

const MAX_BODY_BYTES = 512
const KICK_DELAY_SECONDS = 90

// Only the capture keys written by the database triggers are ever kicked; every other event type
// (the per-person sync.espo / sync.chatwoot rows, erase.person, lead.inquiry, lead.purge) is
// published by the TypeScript code that creates it or by the sweep.
const KICKABLE_EVENT_TYPES: ReadonlySet<string> = new Set(['lead.booking', 'sync.booking', 'sync.signup'])

const bodySchema = z.object({ key: z.string().min(1).max(120) }).strict()

/** Fail-closed, timing-safe Bearer check (same shape as the cron guards). */
function isAuthorized(request: Request): boolean {
  const secret = process.env.OUTBOX_KICK_SECRET
  const header = request.headers.get('authorization')
  if (!secret || !header) return false
  const expected = Buffer.from(`Bearer ${secret}`)
  const got = Buffer.from(header)
  return expected.length === got.length && timingSafeEqual(expected, got)
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) return new Response('Unauthorized', { status: 401 })

  const sizeError = enforceMaxBody(request, MAX_BODY_BYTES)
  if (sizeError) return sizeError

  const rawBody = await request.text()
  if (Buffer.byteLength(rawBody, 'utf8') > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'Payload too large' }, { status: 413 })
  }

  let json: unknown
  try {
    json = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }
  const parsed = bodySchema.safeParse(json)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })

  const eventType = parseOutboxKey(parsed.data.key)?.eventType
  if (!eventType || !KICKABLE_EVENT_TYPES.has(eventType)) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }

  const published = await publishOutboxDispatch(parsed.data.key, {
    delaySeconds: KICK_DELAY_SECONDS,
    dedupSuffix: 'k',
  })
  return NextResponse.json({ ok: true, published })
}
