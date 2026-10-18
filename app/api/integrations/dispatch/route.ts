import { NextResponse } from 'next/server'
import { z } from 'zod'
import { Receiver } from '@upstash/qstash'
import { enforceMaxBody } from '@/lib/request-guards'
import { dispatchOutboxKey } from '@/lib/lead-sync'

// QStash-signed outbox dispatcher (Phase 81). Only Upstash can call it; every
// business outcome answers 200 so QStash adds no retries of its own (the outbox
// owns the retry schedule). A 500 is returned only when the outbox store itself
// is unreachable, so QStash retries the delivery.

export const maxDuration = 60

const MAX_BODY_BYTES = 1024

const bodySchema = z.object({ key: z.string().min(1).max(120) }).strict()

// Lazy singleton — avoids a module-load crash when signing keys are absent in test/preview.
let _receiver: Receiver | null = null
function getReceiver(): Receiver {
  if (!_receiver) {
    _receiver = new Receiver({
      currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY ?? '',
      nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY ?? '',
    })
  }
  return _receiver
}

export async function POST(request: Request) {
  const sizeError = enforceMaxBody(request, MAX_BODY_BYTES)
  if (sizeError) return sizeError

  // The body must be read as text BEFORE verification: the signature covers the raw bytes.
  const rawBody = await request.text()
  if (Buffer.byteLength(rawBody, 'utf8') > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'Payload too large' }, { status: 413 })
  }

  const signature = request.headers.get('Upstash-Signature')
  if (!signature) return new Response('Unauthorized', { status: 401 })

  // The signed subject is the URL QStash was asked to call (lib/outbox.ts publishes to this one).
  // Must match lib/outbox.ts exactly (trimmed) or every signature fails.
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim()
  const url = siteUrl ? `${siteUrl}/api/integrations/dispatch` : undefined
  const valid = await getReceiver()
    .verify({ signature, body: rawBody, ...(url ? { url } : {}) })
    .catch(() => false)
  if (!valid) return new Response('Unauthorized', { status: 401 })

  let json: unknown
  try {
    json = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }
  const parsed = bodySchema.safeParse(json)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })

  try {
    const result = await dispatchOutboxKey(parsed.data.key)
    return NextResponse.json(result)
  } catch {
    return NextResponse.json({ error: 'dispatch_failed' }, { status: 500 })
  }
}
