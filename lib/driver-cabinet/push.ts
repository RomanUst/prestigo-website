// Phase 94 plan 94-05 (DCAB-12; D-09): web push transport for the driver cabinet.
//
// Server-only, Node runtime only (web-push does not run on the edge runtime). Email stays the guaranteed channel:
// without the three VAPID variables every send is a silent no-op, and a send never throws into its caller (the
// offer notification of 94-09 runs it inside after()). The three variables are read on every call, never cached at
// module level, so a fresh Vercel env works without a rebuild.
//
// Never log an endpoint, a key or a payload: the only thing logged on a failed send is the HTTP status code.

import webpush from 'web-push'
import { readEnv } from '@/lib/env'

export interface DriverPushPayload {
  title: string
  body: string
  url: string
  tag: string
}

// Minimal structural type of the service client, like lib/driver-cabinet/auth.ts.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ServiceClient = { from: (table: string) => any }

const DEFAULT_URL = '/driver/offers'
// Same-origin /driver/ paths only: no scheme, no protocol-relative start, no traversal, no backslash.
const SAFE_URL_RE = /^\/driver\/[A-Za-z0-9._~\-/?=&#%]*$/

export function pushConfigured(): boolean {
  return Boolean(readEnv('VAPID_PUBLIC_KEY') && readEnv('VAPID_PRIVATE_KEY') && readEnv('VAPID_SUBJECT'))
}

export function vapidPublicKey(): string | null {
  return readEnv('VAPID_PUBLIC_KEY') ?? null
}

function safeUrl(url: unknown): string {
  if (typeof url !== 'string' || url.length > 500) return DEFAULT_URL
  if (!SAFE_URL_RE.test(url) || url.includes('..') || url.includes('//')) return DEFAULT_URL
  return url
}

interface SubscriptionRow {
  id: string
  endpoint: string
  p256dh: string
  auth: string
}

/**
 * Send one notification to every stored browser of one driver. A 404 or 410 answer deletes that subscription row.
 * Resolves with the counts and never throws.
 */
export async function sendDriverPush(
  supabase: ServiceClient,
  driverId: string,
  payload: DriverPushPayload,
): Promise<{ sent: number; pruned: number }> {
  const none = { sent: 0, pruned: 0 }
  if (!pushConfigured()) return none

  try {
    const subject = readEnv('VAPID_SUBJECT') as string
    const publicKey = readEnv('VAPID_PUBLIC_KEY') as string
    const privateKey = readEnv('VAPID_PRIVATE_KEY') as string
    webpush.setVapidDetails(subject, publicKey, privateKey)

    const { data, error } = await supabase
      .from('driver_push_subscriptions')
      .select('id, endpoint, p256dh, auth')
      .eq('driver_id', driverId)
    if (error || !Array.isArray(data) || data.length === 0) return none

    const message = JSON.stringify({ ...payload, url: safeUrl(payload.url) })
    const rows = data as SubscriptionRow[]

    const settled = await Promise.allSettled(
      rows.map((row) =>
        webpush.sendNotification(
          { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
          message,
          { TTL: 3600, urgency: 'high' },
        ),
      ),
    )

    let sent = 0
    let pruned = 0
    for (let i = 0; i < settled.length; i += 1) {
      const outcome = settled[i]
      if (outcome.status === 'fulfilled') {
        sent += 1
        continue
      }
      const statusCode = (outcome.reason as { statusCode?: unknown } | null)?.statusCode
      if (statusCode === 404 || statusCode === 410) {
        try {
          await supabase.from('driver_push_subscriptions').delete().eq('id', rows[i].id)
          pruned += 1
        } catch {
          // A failed prune is retried by the next dead answer.
        }
      } else {
        console.error('[driver-push] send failed', { statusCode: typeof statusCode === 'number' ? statusCode : null })
      }
    }
    return { sent, pruned }
  } catch {
    return none
  }
}
