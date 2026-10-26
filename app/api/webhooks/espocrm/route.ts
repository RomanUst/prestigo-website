import { NextResponse } from 'next/server'
import { enforceMaxBody } from '@/lib/request-guards'
import { verifyEspoSignature } from '@/lib/webhook-verify'
import { classifyEspoItem, espoDeliveryId } from '@/lib/espo-payload'
import { createWebhookStore } from '@/lib/webhook-store'
import { publishAfterResponse } from '@/lib/outbox'

// EspoCRM webhook receiver (Phase 83, HOOK-03). Thin by design (D-15): verify the `Signature` HMAC
// over the raw bytes, then ONE RPC per relevant batch item (webhook_ingest_espo) that dedups, applies
// the loop fuse and enqueues an ids-only hook.espo_contact outbox row. No Chatwoot or EspoCRM call,
// no CRM client, dispatcher or handler import.
//
// Status discipline (EspoCRM retries 0/401/403/404/405/408/500/503 four times every 10 minutes and
// DELETES the webhook on 410): 401 only for authentication, 400/413 for a malformed request, 503 when
// the store fails (so EspoCRM retries; items already ingested report `duplicate` on the retry), and
// 200 for every business outcome. The gone status is never used.
// Logs carry the source, counts and an outcome code, never a body, name, phone or email.

export const runtime = 'nodejs'
export const maxDuration = 30

const MAX_BODY_BYTES = 1_048_576
const MAX_ITEMS = 100
const FUSE_LIMIT = 20
const BUCKET_SECONDS = 30

function log(items: number, queued: number, outcome: string): void {
  console.log(`[webhook] source=espocrm items=${items} queued=${queued} outcome=${outcome}`)
}

function unauthorized(code: string): Response {
  log(0, 0, code)
  return new Response('Unauthorized', { status: 401 })
}

export async function POST(request: Request) {
  // Fail-closed: without a configured secret nothing can be authenticated.
  const secrets = [process.env.ESPOCRM_WEBHOOK_SECRET, process.env.ESPOCRM_WEBHOOK_SECRET_PREVIOUS]
    .map((s) => (typeof s === 'string' ? s.trim() : ''))
    .filter((s) => s !== '')
  if (secrets.length === 0) return unauthorized('unconfigured')
  const expectedWebhookId = process.env.ESPOCRM_WEBHOOK_ID?.trim() || undefined

  const tooBig = enforceMaxBody(request, MAX_BODY_BYTES)
  if (tooBig) {
    log(0, 0, 'too_large')
    return tooBig
  }

  // Raw bytes, read once: the signature covers them exactly. The legacy X-Signature header is not
  // a fallback (RESEARCH Pitfall 2).
  const rawBody = Buffer.from(await request.arrayBuffer())
  if (rawBody.length > MAX_BODY_BYTES) {
    log(0, 0, 'too_large')
    return NextResponse.json({ error: 'Payload too large' }, { status: 413 })
  }

  const verdict = verifyEspoSignature({
    rawBody,
    signature: request.headers.get('Signature'),
    secrets,
    expectedWebhookId,
  })
  if (verdict !== 'ok') return unauthorized(verdict)

  // Only a verified request is ever parsed.
  let json: unknown
  try {
    json = JSON.parse(rawBody.toString('utf8'))
  } catch {
    log(0, 0, 'bad_json')
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }
  if (!Array.isArray(json) || json.length > MAX_ITEMS) {
    log(0, 0, 'bad_batch')
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }

  const store = createWebhookStore()
  let queued = 0
  for (const item of json as unknown[]) {
    const plan = classifyEspoItem(item)
    if (plan.kind === 'ignore') continue

    let result: Awaited<ReturnType<typeof store.ingestEspo>>
    try {
      result = await store.ingestEspo({
        deliveryId: espoDeliveryId(item),
        espoContactId: plan.contactId,
        fuseLimit: FUSE_LIMIT,
        bucketSeconds: BUCKET_SECONDS,
        tagSuffix: `m${plan.mask}`,
      })
    } catch {
      // EspoCRM retries a 503; the items ingested so far answer `duplicate` next time.
      log(json.length, queued, 'store_error')
      return new Response('Service Unavailable', { status: 503 })
    }

    if (result.outcome === 'queued' && result.key) {
      queued += 1
      const availableAt = result.availableAt?.getTime() ?? Date.now()
      publishAfterResponse(result.key, {
        delaySeconds: Math.max(0, Math.ceil((availableAt - Date.now()) / 1000)),
        dedupSuffix: 'w',
      })
    } else if (result.outcome === 'fused') {
      // One ALERT line per fused delivery, ids only (never a name, email or phone).
      console.error(`[webhook] ALERT webhook_loop_fused source=espocrm entity=espo:contact:${plan.contactId}`)
    }
  }

  log(json.length, queued, 'ok')
  return NextResponse.json({ received: json.length })
}
