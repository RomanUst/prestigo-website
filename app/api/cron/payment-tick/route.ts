import { timingSafeEqual } from 'crypto'
import { NextResponse } from 'next/server'
import { Receiver } from '@upstash/qstash'
import { enforceMaxBody } from '@/lib/request-guards'
import { runPaymentTick } from '@/lib/payments/tick'

// Payment tick (Phase 88, plan 88-11; HOLD-02, D-08, T-88-31, T-88-34).
// One idempotent catch-up endpoint with two triggers:
//   GET   Vercel daily cron, Authorization: Bearer CRON_SECRET (timing-safe, fail-closed when unset)
//   POST  QStash 15-minute schedule, Upstash-Signature verified over the raw body
// Both run the same runPaymentTick(). Once authenticated the answer is always 200 with counts and the codes of
// the steps that failed (QStash counts every retry as a message, and a failed step is retried by the next
// run anyway); unauthenticated callers get 401. Responses carry counts and short codes, never payload text.
// Server-to-server: deliberately not in the middleware CSRF lists.

export const maxDuration = 300

// Lazy singleton, as in reminder-2h: signing keys are absent in test/preview builds.
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

async function respond(): Promise<Response> {
  try {
    return NextResponse.json(await runPaymentTick())
  } catch {
    // runPaymentTick isolates its steps and does not throw; this is the last line of defence.
    console.error('[payment-tick] tick failed')
    return NextResponse.json({ ok: true, placed: 0, failed: 0, reconciled: 0, errors: ['tick'] })
  }
}

export async function GET(request: Request) {
  // Fail-closed: also 401 if CRON_SECRET is not set. Timing-safe comparison, as in outbox-sweep (SEC-14).
  const cronSecret = process.env.CRON_SECRET
  const authHeader = request.headers.get('authorization')
  if (!cronSecret || !authHeader) return new Response('Unauthorized', { status: 401 })
  const expected = Buffer.from(`Bearer ${cronSecret}`)
  const got = Buffer.from(authHeader)
  if (expected.length !== got.length || !timingSafeEqual(expected, got)) {
    return new Response('Unauthorized', { status: 401 })
  }
  return respond()
}

export async function POST(request: Request) {
  // The QStash schedule posts an empty or tiny body; 1 KB is generous. Checked before anything is read.
  const sizeError = enforceMaxBody(request, 1024)
  if (sizeError) return sizeError

  // MUST read the body as text BEFORE verify: the stream is single-read.
  const rawBody = await request.text()
  const signature = request.headers.get('Upstash-Signature') ?? ''
  const valid = await getReceiver()
    .verify({ signature, body: rawBody })
    .catch(() => false)
  if (!valid) return new Response('Unauthorized', { status: 401 })

  return respond()
}
