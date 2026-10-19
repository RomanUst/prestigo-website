import { Resend } from 'resend'
import type { OutboxHealth } from '@/lib/outbox-admin-store'
import { outboxEventLabel } from '@/lib/outbox-labels'

// Daily owner digest (Phase 82, D-11, SYNC-05). Sent by the outbox sweep only when sync events
// failed or are stuck. Counts, event-type labels and one admin link only: no outbox key, aggregate
// id, name, email or phone ever reaches the subject, HTML or text (T-82-17). Deliberately imports
// no CRM or Chatwoot code (VPS isolation guard).

const MAX_ROWS = 20

export interface OutboxDigest {
  subject: string
  html: string
  text: string
}

export interface DigestMessage {
  from: string
  to: string[]
  subject: string
  html: string
  text: string
}

export type DigestOutcome = 'sent' | 'no_problems' | 'unconfigured'

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

/** 'D Month YYYY, HH:MM UTC' */
function formatUtc(d: Date): string {
  const hh = String(d.getUTCHours()).padStart(2, '0')
  const mm = String(d.getUTCMinutes()).padStart(2, '0')
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${hh}:${mm} UTC`
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

interface Row {
  label: string
  count: number
}

/** Failed counts per human label (several lead.* types share one label), biggest first. */
function failedRows(health: OutboxHealth): Row[] {
  const byLabel = new Map<string, number>()
  for (const r of health.by_type) {
    if (r.status !== 'failed' || !(r.count > 0)) continue
    const label = outboxEventLabel(r.event_type)
    byLabel.set(label, (byLabel.get(label) ?? 0) + r.count)
  }
  return [...byLabel.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
}

/** Pure builder. Null when failed + stuck === 0 (no email is sent then). */
export function buildOutboxDigest(
  health: OutboxHealth,
  opts: { siteUrl: string; asOf: Date },
): OutboxDigest | null {
  const failed = health.failed
  const stuck = health.stuck
  const total = failed + stuck
  if (!(total > 0)) return null

  const base = opts.siteUrl.trim().replace(/\/+$/, '')
  const link = `${base}/admin/outbox`
  const subject = total === 1 ? 'Prestigo sync: 1 event needs attention' : `Prestigo sync: ${total} events need attention`
  const sentence = `${failed} failed and ${stuck} stuck sync events as of ${formatUtc(opts.asOf)}.`
  const advice = 'Check that the CRM server is reachable, then open the Outbox to retry.'

  const rows = failedRows(health)
  const shown = rows.slice(0, MAX_ROWS)
  const more = rows.length - shown.length

  const textLines = [sentence, advice, '']
  if (shown.length > 0) {
    textLines.push('Failed by type:')
    for (const r of shown) textLines.push(`- ${r.label}: ${r.count}`)
    if (more > 0) textLines.push(`+${more} more`)
  }
  if (stuck > 0) textLines.push(`Stuck: ${stuck}`)
  if (shown.length > 0 || stuck > 0) textLines.push('')
  textLines.push(`Open Outbox: ${link}`)
  const text = textLines.join('\n')

  const itemStyle = 'margin: 0 0 4px 0;'
  const listHtml =
    shown.length > 0
      ? `<p style="margin: 16px 0 6px 0; color: #555555;">Failed by type:</p>
      <ul style="margin: 0; padding-left: 20px; color: #1a1a1a;">
${shown.map((r) => `        <li style="${itemStyle}">${escapeHtml(r.label)}: ${r.count}</li>`).join('\n')}${
          more > 0 ? `\n        <li style="${itemStyle}">+${more} more</li>` : ''
        }
      </ul>`
      : ''
  const stuckHtml = stuck > 0 ? `<p style="margin: 12px 0 0 0; color: #1a1a1a;">Stuck: ${stuck}</p>` : ''

  const html = `<!DOCTYPE html>
<html>
<body style="margin: 0; padding: 24px; background-color: #f4f4f4; font-family: Arial, Helvetica, sans-serif;">
  <div style="max-width: 560px; margin: 0 auto; background-color: #ffffff; padding: 28px; border: 1px solid #e2e2e2;">
    <h1 style="margin: 0 0 16px 0; font-size: 20px; font-weight: 500; color: #1a1a1a;">${escapeHtml(subject)}</h1>
    <p style="margin: 0 0 8px 0; font-size: 15px; line-height: 1.5; color: #1a1a1a;">${escapeHtml(sentence)}</p>
    <p style="margin: 0; font-size: 15px; line-height: 1.5; color: #1a1a1a;">${escapeHtml(advice)}</p>
    <div style="font-size: 15px; line-height: 1.5;">
      ${listHtml}
      ${stuckHtml}
    </div>
    <p style="margin: 24px 0 0 0;"><a href="${escapeHtml(link)}" style="display: inline-block; padding: 12px 20px; background-color: #0F1D2C; color: #E6D6B0; text-decoration: none; font-size: 15px;">Open Outbox &rarr;</a></p>
  </div>
</body>
</html>`

  return { subject, html, text }
}

let _resend: Resend | null = null

async function defaultSend(msg: DigestMessage, apiKey: string): Promise<unknown> {
  if (!_resend) _resend = new Resend(apiKey)
  const { error } = await _resend.emails.send(msg)
  if (error) throw new Error('digest_send_failed')
  return null
}

/**
 * Builds and sends the digest. Returns 'no_problems' (nothing to report, nothing sent) or
 * 'unconfigured' (a required env var is missing, nothing sent). Throws only when the send itself
 * throws; the sweep step catches that and reports `digest_failed`.
 */
export async function sendOutboxDigest(
  health: OutboxHealth,
  deps: {
    send?: (msg: DigestMessage) => Promise<unknown>
    env?: Record<string, string | undefined>
    now?: () => Date
  } = {},
): Promise<DigestOutcome> {
  const env = deps.env ?? process.env
  const now = deps.now ?? (() => new Date())

  if (!(health.failed + health.stuck > 0)) return 'no_problems'

  const apiKey = env.RESEND_API_KEY?.trim()
  const manager = env.MANAGER_EMAIL?.trim()
  const siteUrl = env.NEXT_PUBLIC_SITE_URL?.trim()
  if (!apiKey || !manager || !siteUrl) return 'unconfigured'

  const digest = buildOutboxDigest(health, { siteUrl, asOf: now() })
  if (!digest) return 'no_problems'

  const msg: DigestMessage = {
    from: 'PRESTIGO Bookings <bookings@rideprestigo.com>',
    to: [manager],
    subject: digest.subject,
    html: digest.html,
    text: digest.text,
  }
  await (deps.send ? deps.send(msg) : defaultSend(msg, apiKey))
  return 'sent'
}
