import { createHmac, timingSafeEqual } from 'node:crypto'

// Pure HMAC verification for inbound webhooks (Phase 83, HOOK-03). No env access and no env
// var names live here: the route reads its secrets and passes them in.

/** Constant-time string compare. timingSafeEqual THROWS on unequal length, so check that first. */
export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'utf8')
  const bb = Buffer.from(b, 'utf8')
  return ba.length === bb.length && timingSafeEqual(ba, bb)
}

export type ChatwootVerifyResult = 'ok' | 'malformed' | 'stale' | 'bad_signature'

/**
 * Chatwoot account webhooks sign `"<X-Chatwoot-Timestamp>.<raw body>"` with HMAC-SHA256 and send
 * `X-Chatwoot-Signature: sha256=<hex>`. Any listed secret may match (rotation without a gap).
 * The timestamp window is two-sided: a request from the future is as suspect as an old one.
 */
export function verifyChatwootSignature(input: {
  rawBody: Buffer
  signature: string | null
  timestamp: string | null
  secrets: string[]
  nowSec: number
  windowSec?: number
}): ChatwootVerifyResult {
  const { rawBody, signature, timestamp, secrets, nowSec } = input
  if (!signature || !timestamp || !/^\d{9,12}$/.test(timestamp)) return 'malformed'
  if (Math.abs(nowSec - Number(timestamp)) > (input.windowSec ?? 300)) return 'stale'

  const prefix = Buffer.from(`${timestamp}.`)
  const message = Buffer.concat([prefix, rawBody])
  let ok = false
  for (const secret of secrets) {
    if (!secret) continue
    const expected = 'sha256=' + createHmac('sha256', secret).update(message).digest('hex')
    // No early exit: every configured secret is compared, so timing does not reveal which matched.
    if (safeEqual(expected, signature)) ok = true
  }
  return ok ? 'ok' : 'bad_signature'
}

export type EspoVerifyResult = 'ok' | 'malformed' | 'wrong_webhook' | 'bad_signature'

const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/

/**
 * EspoCRM 10.0.8 webhooks send `Signature: base64("<webhookId>:<hex HMAC-SHA256(raw body, secret)>")`.
 * The protocol has no timestamp, so there is no replay window here (D-19 compensates per delivery).
 * Any listed secret may match (rotation without a gap). The legacy `X-Signature` header is never
 * consulted by the route. When `expectedWebhookId` is given the embedded id must match it.
 */
export function verifyEspoSignature(input: {
  rawBody: Buffer
  signature: string | null
  secrets: string[]
  expectedWebhookId?: string
}): EspoVerifyResult {
  const { rawBody, signature, secrets, expectedWebhookId } = input
  if (!signature || signature.length > 512 || !BASE64_RE.test(signature)) return 'malformed'

  const decoded = Buffer.from(signature, 'base64').toString('utf8')
  const colon = decoded.indexOf(':')
  if (colon <= 0) return 'malformed'
  const webhookId = decoded.slice(0, colon)
  const hex = decoded.slice(colon + 1)
  if (hex === '') return 'malformed'

  if (expectedWebhookId && !safeEqual(webhookId, expectedWebhookId)) return 'wrong_webhook'

  let ok = false
  for (const secret of secrets) {
    if (!secret) continue
    const expected = createHmac('sha256', secret).update(rawBody).digest('hex')
    // No early exit: every configured secret is compared, so timing does not reveal which matched.
    if (safeEqual(expected, hex.toLowerCase())) ok = true
  }
  return ok ? 'ok' : 'bad_signature'
}
