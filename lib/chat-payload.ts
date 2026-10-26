import { z } from 'zod'
import { hookConversationKey } from '@/lib/sync-origin'

// Pure classification of a verified Chatwoot account-webhook payload into what the receiver does
// with it (Phase 83). No I/O, no env access. The payload is only a hint: the outbox row carries
// ids, and the dispatcher re-reads Chatwoot when it runs the handler (RESEARCH Pattern 2).
//
// This plan handles message_created (D-03 tracer). Plan 83-16 adds conversation_status_changed,
// conversation_updated and contact_updated (D-10, D-12, D-20) and the site-echo drop.

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

const displayId = z.number().int().positive().max(2_000_000_000)

const messageCreatedSchema = z.object({
  event: z.literal('message_created'),
  // 'incoming' string in current Chatwoot; tolerate the integer enum (0 incoming, 1 outgoing, ...).
  message_type: z.union([z.string(), z.number()]).optional(),
  private: z.boolean().optional(),
  conversation: z.object({ id: displayId }),
})

const eventShape = z.object({ event: z.string().min(1).max(64) })

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

  return { kind: 'ignore', reason: 'not_handled' }
}
