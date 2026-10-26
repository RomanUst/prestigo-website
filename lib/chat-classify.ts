/**
 * Pure chat policy for the Chatwoot -> EspoCRM bridge (Phase 83, HOOK-01 / HOOK-02).
 *
 * No I/O: no env, no network, no clock reads (callers pass dates). Handlers wire it, so every
 * handler produces the same Lead source, filter decision and CRM text for the same conversation.
 *
 * Non-target filter (D-18, replaces the D-07 header list): Chatwoot keeps only the email
 * `auto_reply` flag on a message and drops `Precedence` / `List-Unsubscribe` (RESEARCH Pitfall 6),
 * so the automatic filter is: auto_reply flag, a no-reply / bounce / daemon / notification
 * sender address, or an own-domain sender. Anything else that is bulk mail is handled by the
 * operator with the manual `no-lead` label (D-07).
 *
 * Text policy (D-03, D-08, D-09, T-83-16): everything written to the CRM is plain text with
 * control characters removed, a hard length cap, and no tag-like `<x` sequences. Links are built
 * only from config values the caller passes in, never from payload URLs. No transcript, no AI
 * summary (the summary is an operator note convention), English literals only.
 */

import { LEAD_SOURCE } from '@/lib/lead-mapping'

// ── Constants ──────────────────────────────────────────────────────────────

/** Sender domains that never become chat Leads (D-18). Subdomains are included. */
export const CHAT_OWN_DOMAINS: readonly string[] = ['rideprestigo.com']

/** Chatwoot label that suppresses / kills the auto-created chat Lead (D-07). */
export const NO_LEAD_LABEL = 'no-lead'

/** EspoCRM 10.0.8 Lead statuses that count as "open" (D-02). */
export const OPEN_LEAD_STATUSES: readonly string[] = ['New', 'Assigned', 'In Process']

export const FIRST_MESSAGE_MAX = 500
export const NOTE_FIRST_MESSAGE_MAX = 300
export const SUMMARY_MAX = 1000

const NAME_MAX = 100
const INBOX_MAX = 100
const TOPIC_MAX = 60
const REF_MAX = 60
const LINK_MAX = 300
const FALLBACK_NAME = 'Chat contact'

export type ChannelLabel = 'Website chat' | 'Email' | 'Telegram' | 'WhatsApp' | 'Other'
export type NonTargetReason = 'auto_reply' | 'no_reply_sender' | 'own_domain'

export function isOpenLeadStatus(status: unknown): boolean {
  return typeof status === 'string' && OPEN_LEAD_STATUSES.includes(status)
}

// ── Channel -> Lead source (HOOK-01) ───────────────────────────────────────

/** Chatwoot channel string -> the one EspoCRM Lead source it maps to. */
export function leadSourceForChannel(channel: string | null): string {
  switch (channel) {
    case 'Channel::WebWidget':
      return LEAD_SOURCE.websiteChat
    case 'Channel::Email':
      return LEAD_SOURCE.email
    case 'Channel::Telegram':
      return LEAD_SOURCE.telegram
    case 'Channel::Whatsapp':
      return LEAD_SOURCE.whatsapp
    default:
      return LEAD_SOURCE.other
  }
}

/** Human channel label; identical to the Lead source value for every channel. */
export function channelLabel(channel: string | null): ChannelLabel {
  return leadSourceForChannel(channel) as ChannelLabel
}

// ── Labels ─────────────────────────────────────────────────────────────────

function labelStrings(labels: unknown): string[] {
  if (!Array.isArray(labels)) return []
  return labels.filter((l): l is string => typeof l === 'string').map((l) => l.trim()).filter(Boolean)
}

/** True when the conversation carries the `no-lead` label (case-insensitive). */
export function hasNoLeadLabel(labels: unknown): boolean {
  return labelStrings(labels).some((l) => l.toLowerCase() === NO_LEAD_LABEL)
}

/** Topic labels only: `ch-*`, `no-lead` and `wa-window-closing` are control labels. Sorted, deduped. */
export function topicLabels(labels: unknown): string[] {
  const topics = labelStrings(labels).filter((l) => {
    const k = l.toLowerCase()
    return !k.startsWith('ch-') && k !== NO_LEAD_LABEL && k !== 'wa-window-closing'
  })
  return [...new Set(topics)].sort()
}

// ── D-18 non-target filter ─────────────────────────────────────────────────

const NO_REPLY_LOCAL =
  /^(no[-_.]?reply|do[-_.]?not[-_.]?reply|mailer[-_.]?daemon|daemon|postmaster|bounces?|notifications?)(\d+|[+._-].*)?$/

/** Why a conversation must NOT become a Lead (D-18), or null when it is a target. */
export function nonTargetReason(input: { senderEmail: string | null; autoReply: boolean }): NonTargetReason | null {
  if (input.autoReply) return 'auto_reply'
  const email = typeof input.senderEmail === 'string' ? input.senderEmail.trim().toLowerCase() : ''
  const at = email.lastIndexOf('@')
  if (at <= 0 || at === email.length - 1) return null
  const local = email.slice(0, at)
  const domain = email.slice(at + 1)
  if (NO_REPLY_LOCAL.test(local)) return 'no_reply_sender'
  if (CHAT_OWN_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`))) return 'own_domain'
  return null
}

// ── Plain text helpers (D-03, T-83-16) ─────────────────────────────────────

/** Tag-like `<x`, `</`, `<!`, `<?` openers become a harmless single guillemet; `1 < 2` stays. */
function defang(text: string): string {
  return text.replace(/<(?=[A-Za-z/!?])/g, '‹')
}

function cut(text: string, max: number): string {
  if (text.length <= max) return text
  let head = text.slice(0, Math.max(0, max - 1))
  const last = head.charCodeAt(head.length - 1)
  if (last >= 0xd800 && last <= 0xdbff) head = head.slice(0, -1) // never split a surrogate pair
  return `${head.trimEnd()}…`
}

/** One line of plain text: control characters and line breaks -> space, collapsed, trimmed, capped. */
export function plainLine(value: unknown, max: number): string {
  if (typeof value !== 'string') return ''
  // eslint-disable-next-line no-control-regex
  const flat = value.replace(/[\u0000-\u001F\u007F\u2028\u2029]/g, ' ').replace(/\s+/g, ' ').trim()
  return cut(defang(flat), max)
}

/** Multi-line plain text: single line breaks kept, other control characters removed, capped. */
export function plainBlock(value: unknown, max: number): string {
  if (typeof value !== 'string') return ''
  const text = value
    .replace(/\r\n?|\u2028|\u2029/g, '\n')
    .replace(/\t/g, ' ')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, '')
    .split('\n')
    .map((l) => l.replace(/[  ]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return cut(defang(text), max)
}

/** A Chatwoot auto-generated contact name (Haikunator), e.g. `autumn-dew-482` (Pitfall 7). */
const HAIKUNATOR = /^[a-z]+-[a-z]+-\d+$/

export function cleanContactName(name: string | null, email: string | null): string {
  const given = plainLine(name, NAME_MAX)
  if (given && !HAIKUNATOR.test(given)) return given
  if (typeof email === 'string') {
    const at = email.indexOf('@')
    if (at > 0) {
      const local = plainLine(email.slice(0, at), NAME_MAX)
      if (local) return local
    }
  }
  return FALLBACK_NAME
}

// ── D-09 summary note convention ───────────────────────────────────────────

const SUMMARY_PREFIX = /^(?:итог|summary)\s*[:：-]\s*/i

function isOutgoing(messageType: unknown): boolean {
  // Webhooks send the enum string, API message objects an int (RESEARCH A14): tolerate both.
  return messageType === 'outgoing' || messageType === 1
}

/** The LAST private outgoing note starting with `Итог:` / `Summary:`; prefix stripped, capped. */
export function summaryFromNotes(
  messages: Array<{ content: string | null; private: boolean; messageType: string }>,
): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (!m || m.private !== true || !isOutgoing(m.messageType) || typeof m.content !== 'string') continue
    const text = m.content.trim()
    const match = SUMMARY_PREFIX.exec(text)
    if (!match) continue
    const body = plainBlock(text.slice(match[0].length), SUMMARY_MAX)
    if (body) return body
  }
  return null
}

// ── Links and idempotency markers ──────────────────────────────────────────

export function conversationUrl(baseUrl: string, accountId: string, conversationId: number): string {
  return `${baseUrl.replace(/\/+$/, '')}/app/accounts/${accountId}/conversations/${conversationId}`
}

/** Idempotency marker of a resolve history entry. */
export function resolveMarker(conversationId: number, resolveEpochSec: number): string {
  return `[cw:${conversationId}:r${resolveEpochSec}]`
}

/** Idempotency marker of an append note (D-02 / D-20). */
export function openMarker(conversationId: number): string {
  return `[cw:${conversationId}:open]`
}

// ── CRM texts ──────────────────────────────────────────────────────────────

/** `YYYY-MM-DD HH:mm UTC` */
function fmtUtc(d: Date): string {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return 'unknown'
  const iso = d.toISOString()
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`
}

function channelLine(channel: string | null, inboxName: string | null): string {
  const inbox = plainLine(inboxName, INBOX_MAX)
  return inbox ? `${channelLabel(channel)} · ${inbox}` : channelLabel(channel)
}

function linkLine(label: string, url: string): string {
  return `${label}: ${plainLine(url, LINK_MAX)}`
}

/** Lead description: channel + inbox, Chatwoot link, then the first message (500 chars, multi-line kept). */
export function formatLeadDescription(i: {
  channel: string | null
  inboxName: string | null
  firstMessage: string | null
  url: string
}): string {
  const lines = [`Channel: ${channelLine(i.channel, i.inboxName)}`, linkLine('Chatwoot', i.url)]
  const first = plainBlock(i.firstMessage, FIRST_MESSAGE_MAX)
  if (first) lines.push('First message:', first)
  return lines.join('\n')
}

/** D-02 / D-20 append note: a further conversation of a person who already has an open Lead. */
export function formatAppendNote(i: {
  channel: string | null
  inboxName: string | null
  conversationId: number
  firstMessage: string | null
  url: string
  marker: string
}): string {
  const lines = [`New chat conversation #${i.conversationId} (${channelLine(i.channel, i.inboxName)})`]
  const first = plainLine(i.firstMessage, NOTE_FIRST_MESSAGE_MAX)
  if (first) lines.push(`First message: ${first}`)
  lines.push(linkLine('Chatwoot', i.url), plainLine(i.marker, REF_MAX))
  return lines.join('\n')
}

/** D-08 resolve history entry: facts only, never a transcript. Marker is the last line. */
export function formatResolveNote(i: {
  channel: string | null
  inboxName: string | null
  conversationId: number
  openedAt: Date
  resolvedAt: Date
  messageCount: number
  topics: string[]
  firstMessage: string | null
  summary: string | null
  url: string
  marker: string
}): string {
  const count = Number.isFinite(i.messageCount) ? Math.max(0, Math.trunc(i.messageCount)) : 0
  const lines = [
    `Chat conversation #${i.conversationId} resolved`,
    `Channel: ${channelLine(i.channel, i.inboxName)}`,
    `Opened: ${fmtUtc(i.openedAt)}`,
    `Resolved: ${fmtUtc(i.resolvedAt)}`,
    `Messages: ${count}`,
  ]
  const topics = i.topics.map((t) => plainLine(t, TOPIC_MAX)).filter(Boolean)
  if (topics.length > 0) lines.push(`Topics: ${topics.join(', ')}`)
  const first = plainLine(i.firstMessage, NOTE_FIRST_MESSAGE_MAX)
  if (first) lines.push(`First message: ${first}`)
  const summary = i.summary === null ? '' : plainLine(i.summary, SUMMARY_MAX)
  if (summary) lines.push(`Summary: ${summary}`)
  lines.push(linkLine('Chatwoot', i.url), plainLine(i.marker, REF_MAX))
  return lines.join('\n')
}

/** D-05 note when a paid site booking converts the open chat Lead. */
export function formatConversionNote(i: { bookingReference: string; adminLink: string | null }): string {
  const lines = [`Converted: paid website booking ${plainLine(i.bookingReference, REF_MAX)}`]
  const link = i.adminLink === null ? '' : plainLine(i.adminLink, LINK_MAX)
  if (link) lines.push(`Admin: ${link}`)
  return lines.join('\n')
}
