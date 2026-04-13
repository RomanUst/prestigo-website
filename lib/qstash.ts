import { Client } from '@upstash/qstash'

// Lazy initialisation — avoids module-load crash when QSTASH_TOKEN is absent
let _qstash: Client | null = null
function getQStash(): Client {
  if (!_qstash) {
    _qstash = new Client({ token: process.env.QSTASH_TOKEN ?? '' })
  }
  return _qstash
}

/**
 * Schedule a 2h-before-pickup reminder via QStash.
 * Fire-and-forget per D-03: logs errors but never throws.
 *
 * Guards:
 * - If pickup is within 2h + 5min from now, skip silently (D-04: 5-min margin)
 * - If NEXT_PUBLIC_SITE_URL is not set, logs error and returns
 */
export async function scheduleQStashReminder(
  bookingId: string,
  pickupUtcMs: number
): Promise<void> {
  const now = Date.now()
  const twoHoursBefore = pickupUtcMs - 2 * 3600 * 1000
  const margin = 5 * 60 * 1000 // D-04: 5-min guard

  if (twoHoursBefore - now < margin) {
    // Pickup too soon — skip silently
    return
  }

  const delaySeconds = Math.floor((twoHoursBefore - now) / 1000)
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL
  if (!siteUrl) {
    console.error('[qstash] NEXT_PUBLIC_SITE_URL not set — cannot schedule reminder')
    return
  }

  try {
    await getQStash().publishJSON({
      url: `${siteUrl}/api/cron/reminder-2h`,
      delay: delaySeconds,
      body: { booking_id: bookingId },
    })
  } catch (err) {
    // D-03: fire-and-forget — log but do not throw
    console.error('[qstash] schedule failed for booking', bookingId, err)
  }
}
