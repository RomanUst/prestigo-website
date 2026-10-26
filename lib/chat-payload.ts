import { z } from 'zod'
import { hookConversationKey, hookContactKey, isSiteEcho } from '@/lib/sync-origin'

// Pure classification of a verified Chatwoot account-webhook payload into what the receiver does
// with it (Phase 83). No I/O, no env access. The payload is only a hint: the outbox row carries
// ids, and the dispatcher re-reads Chatwoot when it runs the handler (RESEARCH Pattern 2).
//
// Four subscribed events: message_created (D-03), conversation_status_changed (D-10),
// conversation_updated (D-20) and contact_updated (D-12, with the HOOK-04 site-echo drop).

export interface ChatwootIngestPlan {
  eventType: 'hook.chat_intake' | 'hook.chat_resolve' | 'hook.chat_label' | 'hook.chat_contact'
  aggregateType: 'chat_conversation' | 'chat_contact'
  aggregateId: string
  key: string
  entityKey: string
  /** Deliveries per entity allowed in 10 minutes before webhook_ingest answers fused; null = none. */
  fuseLimit: number | null
  availableAt: Date
}

export type ChatwootClassification =
  | { kind: 'ingest'; plan: ChatwootIngestPlan }
  | { kind: 'ignore'; reason: string }
  | { kind: 'echo' }
  | { kind: 'invalid'; keys: string[] }

export interface ClassifyContext {
  nowMs: number
  headerTimestampSec: number
}

/** The four event names the receiver is subscribed to; anything else is logged as `other`. */
export const SUBSCRIBED_EVENTS = [
  'message_created',
  'conversation_status_changed',
  'conversation_updated',
  'contact_updated',
] as const
export type SubscribedEvent = (typeof SUBSCRIBED_EVENTS)[number]

/** Allowlisted event name for logging: never echoes an arbitrary string from the payload. */
export function loggableEventName(json: unknown): SubscribedEvent | 'other' {
  const name = isRecord(json) ? json.event : undefined
  return (SUBSCRIBED_EVENTS as readonly string[]).includes(name as string) ? (name as SubscribedEvent) : 'other'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Contact deliveries per entity in 10 minutes before webhook_ingest answers fused. */
const CONTACT_FUSE_LIMIT = 20

const displayId = z.number().int().positive().max(2_000_000_000)

const messageCreatedSchema = z.object({
  event: z.literal('message_created'),
  // 'incoming' string in current Chatwoot; tolerate the integer enum (0 incoming, 1 outgoing, ...).
  message_type: z.union([z.string(), z.number()]).optional(),
  private: z.boolean().optional(),
  conversation: z.object({ id: displayId }),
})

const eventShape = z.object({ event: z.string().min(1).max(64) })

const contactUpdatedSchema = z.object({
  event: z.literal('contact_updated'),
  id: displayId,
  name: z.string().nullish(),
  email: z.string().nullish(),
  phone_number: z.string().nullish(),
  identifier: z.string().nullish(),
  custom_attributes: z.record(z.string(), z.unknown()).nullish(),
})

/** Contact changes the site cares about (D-12); everything else (activity stamps, ...) is noise. */
const RELEVANT_CONTACT_CHANGES: readonly string[] = ['email', 'phone_number']

/**
 * changed_attributes is an array of single-key objects or one object depending on the Chatwoot
 * build. An unreadable shape counts as relevant: the handler converges on current state anyway.
 */
function contactChangeRelevant(changed: unknown): boolean {
  let names: string[]
  if (Array.isArray(changed)) {
    names = changed.flatMap((entry) => (isRecord(entry) ? Object.keys(entry) : []))
    if (names.length === 0 && changed.length > 0) return true
  } else if (isRecord(changed)) {
    names = Object.keys(changed)
  } else {
    return true
  }
  if (names.length === 0) return true
  return names.some((n) => RELEVANT_CONTACT_CHANGES.includes(n))
}

function invalid(json: unknown): ChatwootClassification {
  return { kind: 'invalid', keys: isRecord(json) ? Object.keys(json).slice(0, 20) : [] }
}

function isIncoming(messageType: string | number | undefined): boolean {
  return messageType === 'incoming' || messageType === 0
}

export function classifyChatwootEvent(json: unknown, ctx: ClassifyContext): ChatwootClassification {
  if (!eventShape.safeParse(json).success) return invalid(json)
  const event = (json as { event: string }).event

  if (event === 'message_created') {
    const parsed = messageCreatedSchema.safeParse(json)
    if (!parsed.success) return invalid(json)
    const { message_type: messageType, private: isPrivate, conversation } = parsed.data
    if (isPrivate === true) return { kind: 'ignore', reason: 'private' }
    if (!isIncoming(messageType)) return { kind: 'ignore', reason: 'not_incoming' }

    const { key, aggregateId } = hookConversationKey('hook.chat_intake', conversation.id)
    return {
      kind: 'ingest',
      plan: {
        eventType: 'hook.chat_intake',
        aggregateType: 'chat_conversation',
        aggregateId,
        key,
        entityKey: `cw:conv:${conversation.id}`,
        fuseLimit: null,
        availableAt: new Date(ctx.nowMs),
      },
    }
  }

  if (event === 'contact_updated') {
    const parsed = contactUpdatedSchema.safeParse(json)
    if (!parsed.success) return invalid(json)
    const contact = parsed.data
    // HOOK-04 receiver layer: the site's own write carries a fingerprint that still matches.
    if (isSiteEcho(contact)) return { kind: 'echo' }
    if (!contactChangeRelevant((json as { changed_attributes?: unknown }).changed_attributes)) {
      return { kind: 'ignore', reason: 'irrelevant_change' }
    }

    const { key, aggregateId, availableAt } = hookContactKey(contact.id, ctx.nowMs)
    return {
      kind: 'ingest',
      plan: {
        eventType: 'hook.chat_contact',
        aggregateType: 'chat_contact',
        aggregateId,
        key,
        entityKey: `cw:contact:${contact.id}`,
        // Contact events are the only loop-prone ones; message/conversation events carry no limit.
        fuseLimit: CONTACT_FUSE_LIMIT,
        availableAt,
      },
    }
  }

  return { kind: 'ignore', reason: 'not_handled' }
}
