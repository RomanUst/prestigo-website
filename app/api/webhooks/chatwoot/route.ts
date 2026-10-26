import { createHash } from 'node:crypto'
import { NextResponse } from 'next/server'
import { enforceMaxBody } from '@/lib/request-guards'
import { verifyChatwootSignature } from '@/lib/webhook-verify'
import { classifyChatwootEvent, loggableEventName } from '@/lib/chat-payload'
import { createWebhookStore } from '@/lib/webhook-store'
import { publishAfterResponse } from '@/lib/outbox'

// Chatwoot account-webhook receiver (Phase 83, HOOK-03). Thin by design (D-15): verify the HMAC
// over the raw bytes, filter, then ONE RPC (webhook_ingest) that dedups, applies the loop fuse and
// enqueues a single ids-only hook.* outbox row. It makes no Chatwoot or EspoCRM call and imports
// no CRM client, dispatcher or handler, so a slow or down VPS can never delay it (Chatwoot gives
// 5 s and never retries). Every business outcome answers 200; only a store failure answers 500.
// Logs carry the source, an allowlisted event name, the outcome and a code, never a body.

export const runtime = 'nodejs'
export const maxDuration = 10

const MAX_BODY_BYTES = 1_048_576
const DELIVERY_ID = /^[A-Za-z0-9-]{8,64}$/

function log(event: string, outcome: string, code: string, extra = ''): void {
  console.log(`[webhook] source=chatwoot event=${event} outcome=${outcome} code=${code}${extra}`)
}

function unauthorized(code: string): Response {
  log('none', 'rejected', code)
  return new Response('Unauthorized', { status: 401 })
}

export async function POST(request: Request) {
  // Fail-closed: without a configured secret nothing can be authenticated.
  const secrets = [process.env.CHATWOOT_WEBHOOK_SECRET, process.env.CHATWOOT_WEBHOOK_SECRET_PREVIOUS]
    .map((s) => (typeof s === 'string' ? s.trim() : ''))
    .filter((s) => s !== '')
  if (secrets.length === 0) return unauthorized('unconfigured')

  const tooBig = enforceMaxBody(request, MAX_BODY_BYTES)
  if (tooBig) {
    log('none', 'rejected', 'too_large')
    return tooBig
  }

  // Raw bytes, read once: the signature covers them exactly (no decode/re-encode drift).
  const rawBody = Buffer.from(await request.arrayBuffer())
  if (rawBody.length > MAX_BODY_BYTES) {
    log('none', 'rejected', 'too_large')
    return NextResponse.json({ error: 'Payload too large' }, { status: 413 })
  }

  const timestamp = request.headers.get('X-Chatwoot-Timestamp')
  const verdict = verifyChatwootSignature({
    rawBody,
    signature: request.headers.get('X-Chatwoot-Signature'),
    timestamp,
    secrets,
    nowSec: Math.floor(Date.now() / 1000),
  })
  if (verdict !== 'ok') return unauthorized(verdict)

  // Only a verified request is ever parsed.
  let json: unknown
  try {
    json = JSON.parse(rawBody.toString('utf8'))
  } catch {
    log('none', 'rejected', 'bad_json')
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }

  const event = loggableEventName(json)
  const nowMs = Date.now()
  const result = classifyChatwootEvent(json, { nowMs, headerTimestampSec: Number(timestamp) })

  if (result.kind === 'invalid') {
    // Key names only, restricted to a safe charset; never a value.
    const names = result.keys.filter((k) => /^[A-Za-z0-9_]{1,32}$/.test(k)).join(',')
    log(event, 'ignored', 'invalid_payload', ` keys=${names}`)
    return NextResponse.json({ received: true })
  }
  if (result.kind === 'ignore') {
    log(event, 'ignored', result.reason)
    return NextResponse.json({ received: true })
  }
  if (result.kind === 'echo') {
    log(event, 'ignored', 'echo')
    return NextResponse.json({ received: true })
  }

  const { plan } = result
  const headerDelivery = request.headers.get('X-Chatwoot-Delivery')
  const deliveryId =
    headerDelivery && DELIVERY_ID.test(headerDelivery)
      ? headerDelivery
      : `b${createHash('sha256').update(rawBody).digest('hex')}`

  let outcome: Awaited<ReturnType<ReturnType<typeof createWebhookStore>['ingest']>>
  try {
    outcome = await createWebhookStore().ingest({
      source: 'chatwoot',
      deliveryId,
      entityKey: plan.entityKey,
      fuseLimit: plan.fuseLimit,
      eventType: plan.eventType,
      aggregateType: plan.aggregateType,
      aggregateId: plan.aggregateId,
      key: plan.key,
      availableAt: plan.availableAt,
    })
  } catch {
    log(event, 'error', 'store_error')
    return NextResponse.json({ error: 'store_error' }, { status: 500 })
  }

  if (outcome === 'queued') {
    publishAfterResponse(plan.key, {
      delaySeconds: Math.max(0, Math.ceil((plan.availableAt.getTime() - Date.now()) / 1000)),
      dedupSuffix: 'w',
    })
  }

  log(event, outcome, 'ok')
  return NextResponse.json({ received: true })
}
