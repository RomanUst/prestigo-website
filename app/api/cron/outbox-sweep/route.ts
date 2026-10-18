import { timingSafeEqual } from 'crypto'
import { NextResponse } from 'next/server'
import { publishOutboxDispatch } from '@/lib/outbox'
import { dueKeys, enqueueAbandonedPurge, enqueueExpiredUnpaid, recentFailedCount } from '@/lib/outbox-store'

// Daily outbox sweep (Phase 81, plan 81-10). Three independent steps:
//   1. D-03   unpaid bookings past pickup   -> enqueue 'lead.booking:<id>:dead'
//   2. D-15/20 abandoned online checkouts    -> enqueue 'lead.purge:<id>' (90 days past pickup)
//   3. safety net: re-publish every due or lease-expired row (success criterion 7)
//   4. WR-02: count rows that turned `failed` since the last run (terminal, never re-published)
// Deliberately imports no CRM code: the CRM is only ever called from the QStash-signed
// dispatcher (VPS isolation guard). Responses carry counts and short codes, never payload text.

export const maxDuration = 300

const DUE_LIMIT = 200
const PUBLISH_BATCH = 10
// The sweep runs daily; a 25 h window overlaps runs so no failure falls between two reports.
const FAILED_WINDOW_HOURS = 25

function yyyymmddUtc(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, '')
}

async function step<T>(code: string, errors: string[], run: () => Promise<T>): Promise<T | null> {
  try {
    return await run()
  } catch {
    errors.push(code)
    return null
  }
}

export async function GET(request: Request) {
  // CRON_SECRET guard (fail-closed: also 401 if env var not set) — T-81-30.
  // Timing-safe comparison, copied from reminder-24h (SEC-14).
  const cronSecret = process.env.CRON_SECRET
  const authHeader = request.headers.get('authorization')
  if (!cronSecret || !authHeader) return new Response('Unauthorized', { status: 401 })
  const expected = Buffer.from(`Bearer ${cronSecret}`)
  const got = Buffer.from(authHeader)
  if (expected.length !== got.length || !timingSafeEqual(expected, got)) {
    return new Response('Unauthorized', { status: 401 })
  }

  const errors: string[] = []

  const expired = await step('expired_failed', errors, () => enqueueExpiredUnpaid())
  const purge = await step('purge_failed', errors, () => enqueueAbandonedPurge())
  // Read the due keys AFTER the enqueue steps so today's new rows are published today.
  const keys = await step('due_failed', errors, () => dueKeys(DUE_LIMIT))

  let published: number | null = null
  if (keys) {
    published = 0
    const dedupSuffix = `s${yyyymmddUtc(new Date())}`
    for (let i = 0; i < keys.length; i += PUBLISH_BATCH) {
      const batch = keys.slice(i, i + PUBLISH_BATCH)
      const results = await Promise.all(
        batch.map((key) => publishOutboxDispatch(key, { dedupSuffix }).catch(() => false)),
      )
      published += results.filter(Boolean).length
    }
  }

  const failed = await step('failed_count_failed', errors, () => recentFailedCount(FAILED_WINDOW_HOURS))
  if (failed) console.error(`[outbox-sweep] ALERT failed_last_${FAILED_WINDOW_HOURS}h=${failed}`)

  return NextResponse.json({
    ok: true,
    expired,
    purge,
    due: keys ? keys.length : null,
    published,
    failed,
    errors,
  })
}
