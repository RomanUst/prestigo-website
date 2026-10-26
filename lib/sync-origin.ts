import { createHash } from 'node:crypto'

// Pure helpers for the inbound webhook path (Phase 83): the site-origin fingerprint that lets the
// receiver recognise its own writes (HOOK-04), deterministic aggregate uuids for integer Chatwoot
// ids, and the hook.* outbox key builders. node:crypto only, no env access, no env var names.

/** Chatwoot custom attribute the site writes after every contact push (value = contactFingerprint). */
export const SITE_SYNC_FP_ATTRIBUTE = 'site_sync_fp'

export interface FingerprintFields {
  name?: string | null
  email?: string | null
  phone_number?: string | null
  identifier?: string | null
}

const norm = (v?: string | null): string => (typeof v === 'string' ? v : '').trim().toLowerCase()

/** Origin tag for site -> Chatwoot writes: hash of the identity fields the site is allowed to touch. */
export function contactFingerprint(c: FingerprintFields): string {
  return createHash('sha256')
    .update([c.name, c.email, c.phone_number, c.identifier].map(norm).join('\u0001'))
    .digest('hex')
    .slice(0, 16)
}

/** True when the contact carries the site's own fingerprint and its fields still match it. */
export function isSiteEcho(
  contact: (FingerprintFields & { custom_attributes?: Record<string, unknown> | null }) | null | undefined,
): boolean {
  if (!contact || typeof contact !== 'object') return false
  const attrs = contact.custom_attributes
  if (!attrs || typeof attrs !== 'object') return false
  const tag = (attrs as Record<string, unknown>)[SITE_SYNC_FP_ATTRIBUTE]
  return typeof tag === 'string' && tag === contactFingerprint(contact)
}

/** Deterministic uuid (v5-style) so an integer Chatwoot id can be an outbox aggregate_id. */
export function aggregateUuid(kind: 'conversation' | 'contact', id: number): string {
  const h = createHash('sha1').update(`prestigo:chatwoot:${kind}:${id}`).digest()
  h[6] = (h[6] & 0x0f) | 0x50
  h[8] = (h[8] & 0x3f) | 0x80
  const x = h.subarray(0, 16).toString('hex')
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`
}

export interface HookKey {
  key: string
  aggregateId: string
}

/** One row per conversation: later events for it hit the outbox idempotency key. */
export function hookConversationKey(
  eventType: 'hook.chat_intake' | 'hook.chat_label',
  conversationId: number,
): HookKey {
  const aggregateId = aggregateUuid('conversation', conversationId)
  return { key: `${eventType}:${aggregateId}:c${conversationId}`, aggregateId }
}

/** One row per resolve moment (floor of the conversation's updated_at, epoch seconds). */
export function hookResolveKey(conversationId: number, epochSec: number): HookKey {
  const aggregateId = aggregateUuid('conversation', conversationId)
  return { key: `hook.chat_resolve:${aggregateId}:c${conversationId}r${Math.floor(epochSec)}`, aggregateId }
}

/** Bucketed contact row; available when its bucket has closed so a burst of edits is read once. */
export function hookContactKey(
  contactId: number,
  nowMs: number,
  bucketSeconds = 30,
): HookKey & { availableAt: Date } {
  const aggregateId = aggregateUuid('contact', contactId)
  const bucket = Math.floor(nowMs / 1000 / bucketSeconds)
  return {
    key: `hook.chat_contact:${aggregateId}:c${contactId}b${bucket}`,
    aggregateId,
    availableAt: new Date((bucket + 1) * bucketSeconds * 1000),
  }
}
