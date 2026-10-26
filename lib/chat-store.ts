import type { SupabaseClient } from '@supabase/supabase-js'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { OutboxStoreError } from '@/lib/outbox-store'

// Supabase access for the chat registry (Phase 83, migration 078). Every call goes through a
// SECURITY DEFINER RPC (the registry tables are deny-all). Deliberately has no CRM import and
// imports nothing but createSupabaseServiceClient from @/lib/supabase: the inbound webhook path
// must not be able to reach booking or profile writers (D-17, tests/webhook-isolation-guard.test.ts).
// Every RPC error or bad shape becomes OutboxStoreError('db_error'); payloads are never logged.

export type ConversationOutcome =
  | 'lead_created'
  | 'lead_appended'
  | 'lead_adopted'
  | 'customer'
  | 'known_contact'
  | 'filtered'
  | 'no_lead_label'

export interface ReserveResult {
  chatLeadId: string
  leadRef: string
  espoLeadId: string | null
  espoContactId: string | null
  /** true when the returned row belongs to the conversation that asked (false: the person's other open Lead). */
  own: boolean
}

export interface ChatConversationRecord {
  conversationId: number
  outcome: ConversationOutcome
  chatwootContactId: number | null
  identityId: string | null
  espoLeadId: string | null
  espoContactId: string | null
  chatLead: {
    id: string
    leadRef: string
    espoLeadId: string | null
    espoContactId: string | null
    open: boolean
  } | null
  identity: {
    id: string
    customer: boolean
    erasing: boolean
    espoContactId: string | null
    chatwootContactId: number | null
  } | null
}

export interface ErasureScopeInput {
  identityId: string | null
  chatwootContactIds: number[]
  phones: string[]
}

export interface ChatStore {
  /** Go-live instant from integration_config; null when absent or unparseable. */
  hooksStart(): Promise<Date | null>
  reserveLead(input: {
    personKey: string
    identityId: string | null
    chatwootContactId: number | null
    phone: string | null
    leadRef: string
  }): Promise<ReserveResult>
  setLeadEspo(chatLeadId: string, espoLeadId: string | null, espoContactId: string | null): Promise<boolean>
  closeLead(
    chatLeadId: string,
    reason: 'converted' | 'dead' | 'closed_in_crm',
    bookingId?: string | null,
  ): Promise<boolean>
  /** Number of chat Leads whose person key moved to `i:<identity>`. */
  linkIdentity(chatwootContactId: number, identityId: string): Promise<number>
  recordConversation(input: {
    conversationId: number
    chatwootContactId: number | null
    identityId: string | null
    chatLeadId: string | null
    espoLeadId: string | null
    espoContactId: string | null
    outcome: ConversationOutcome
  }): Promise<boolean>
  conversation(conversationId: number): Promise<ChatConversationRecord | null>
  openLeadsForPerson(
    identityId: string | null,
    phones: string[],
  ): Promise<Array<{ chatLeadId: string; leadRef: string; espoLeadId: string | null; createdAt: string }>>
  erasureScope(
    input: ErasureScopeInput,
  ): Promise<Array<{ leadRef: string; espoLeadId: string | null; espoContactId: string | null }>>
  erase(input: ErasureScopeInput): Promise<number>
}

/** `i:<identity id>` when the person has an identity, else `c:<chatwoot contact id>`. */
export function personKeyFor(input: { identityId: string | null; chatwootContactId: number | null }): string {
  if (input.identityId) return `i:${input.identityId}`
  return `c:${input.chatwootContactId}`
}

/** Registry reference of a chat Lead, built from the conversation's aggregate uuid. */
export function chatLeadRef(conversationAggregateUuid: string): string {
  return `chat:${conversationAggregateUuid}`
}

const OUTCOMES: ReadonlySet<string> = new Set([
  'lead_created',
  'lead_appended',
  'lead_adopted',
  'customer',
  'known_contact',
  'filtered',
  'no_lead_label',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && /^[0-9]+$/.test(value)) return Number(value)
  return null
}

function toReserveResult(data: unknown): ReserveResult {
  const row = Array.isArray(data) ? data[0] : data
  if (!isRecord(row)) throw new Error('shape')
  const chatLeadId = asString(row.chat_lead_id)
  const leadRef = asString(row.lead_ref)
  if (!chatLeadId || !leadRef || typeof row.own !== 'boolean') throw new Error('shape')
  return {
    chatLeadId,
    leadRef,
    espoLeadId: asString(row.espo_lead_id),
    espoContactId: asString(row.espo_contact_id),
    own: row.own,
  }
}

function toConversation(data: unknown): ChatConversationRecord {
  if (!isRecord(data)) throw new Error('shape')
  const conversationId = asNumber(data.conversation_id)
  if (conversationId === null || typeof data.outcome !== 'string' || !OUTCOMES.has(data.outcome)) {
    throw new Error('shape')
  }
  let chatLead: ChatConversationRecord['chatLead'] = null
  if (isRecord(data.chat_lead)) {
    const lead = data.chat_lead
    const id = asString(lead.id)
    const leadRef = asString(lead.lead_ref)
    if (!id || !leadRef) throw new Error('shape')
    chatLead = {
      id,
      leadRef,
      espoLeadId: asString(lead.espo_lead_id),
      espoContactId: asString(lead.espo_contact_id),
      open: lead.open === true,
    }
  }
  let identity: ChatConversationRecord['identity'] = null
  if (isRecord(data.identity)) {
    const ident = data.identity
    const id = asString(ident.id)
    if (!id) throw new Error('shape')
    identity = {
      id,
      customer: ident.customer === true,
      erasing: ident.erasing === true,
      espoContactId: asString(ident.espo_contact_id),
      chatwootContactId: asNumber(ident.chatwoot_contact_id),
    }
  }
  return {
    conversationId,
    outcome: data.outcome as ConversationOutcome,
    chatwootContactId: asNumber(data.chatwoot_contact_id),
    identityId: asString(data.identity_id),
    espoLeadId: asString(data.espo_lead_id),
    espoContactId: asString(data.espo_contact_id),
    chatLead,
    identity,
  }
}

export function createChatStore(client?: SupabaseClient): ChatStore {
  // Built lazily inside each method's try so a missing env var surfaces as db_error, not a crash.
  const db = (): SupabaseClient => client ?? createSupabaseServiceClient()

  async function rpc(fn: string, args: Record<string, unknown>): Promise<unknown> {
    try {
      const { data, error } = await db().rpc(fn, args)
      if (error) throw new Error('rpc')
      return data
    } catch {
      throw new OutboxStoreError('db_error')
    }
  }

  function parse<T>(data: unknown, map: (value: unknown) => T): T {
    try {
      return map(data)
    } catch {
      throw new OutboxStoreError('db_error')
    }
  }

  function scopeArgs(input: ErasureScopeInput): Record<string, unknown> {
    return {
      p_identity_id: input.identityId,
      p_chatwoot_contact_ids: input.chatwootContactIds,
      p_phones: input.phones,
    }
  }

  return {
    async hooksStart() {
      const data = await rpc('chat_hooks_start', {})
      if (typeof data !== 'string') return null
      const at = new Date(data)
      return Number.isNaN(at.getTime()) ? null : at
    },

    async reserveLead(input) {
      const data = await rpc('chat_lead_reserve', {
        p_person_key: input.personKey,
        p_identity_id: input.identityId,
        p_chatwoot_contact_id: input.chatwootContactId,
        p_phone: input.phone,
        p_lead_ref: input.leadRef,
      })
      return parse(data, toReserveResult)
    },

    async setLeadEspo(chatLeadId, espoLeadId, espoContactId) {
      const data = await rpc('chat_lead_set_espo', {
        p_chat_lead_id: chatLeadId,
        p_espo_lead_id: espoLeadId,
        p_espo_contact_id: espoContactId,
      })
      return data === true
    },

    async closeLead(chatLeadId, reason, bookingId) {
      const data = await rpc('chat_lead_close', {
        p_chat_lead_id: chatLeadId,
        p_reason: reason,
        p_booking_id: bookingId ?? null,
      })
      return data === true
    },

    async linkIdentity(chatwootContactId, identityId) {
      const data = await rpc('chat_lead_link_identity', {
        p_chatwoot_contact_id: chatwootContactId,
        p_identity_id: identityId,
      })
      return typeof data === 'number' ? data : 0
    },

    async recordConversation(input) {
      const data = await rpc('chat_conversation_record', {
        p_conversation_id: input.conversationId,
        p_chatwoot_contact_id: input.chatwootContactId,
        p_identity_id: input.identityId,
        p_chat_lead_id: input.chatLeadId,
        p_espo_lead_id: input.espoLeadId,
        p_espo_contact_id: input.espoContactId,
        p_outcome: input.outcome,
      })
      return data === true
    },

    async conversation(conversationId) {
      const data = await rpc('chat_conversation', { p_conversation_id: conversationId })
      if (data === null || data === undefined) return null
      return parse(data, toConversation)
    },

    async openLeadsForPerson(identityId, phones) {
      const data = await rpc('chat_open_leads_for_person', { p_identity_id: identityId, p_phones: phones })
      const out: Array<{ chatLeadId: string; leadRef: string; espoLeadId: string | null; createdAt: string }> = []
      for (const row of Array.isArray(data) ? data : []) {
        if (!isRecord(row)) continue
        const chatLeadId = asString(row.chat_lead_id)
        const leadRef = asString(row.lead_ref)
        const createdAt = asString(row.created_at)
        if (!chatLeadId || !leadRef || !createdAt) continue
        out.push({ chatLeadId, leadRef, espoLeadId: asString(row.espo_lead_id), createdAt })
      }
      return out
    },

    async erasureScope(input) {
      const data = await rpc('chat_erasure_scope', scopeArgs(input))
      const out: Array<{ leadRef: string; espoLeadId: string | null; espoContactId: string | null }> = []
      for (const row of Array.isArray(data) ? data : []) {
        if (!isRecord(row)) continue
        out.push({
          leadRef: asString(row.lead_ref) ?? '',
          espoLeadId: asString(row.espo_lead_id),
          espoContactId: asString(row.espo_contact_id),
        })
      }
      return out
    },

    async erase(input) {
      const data = await rpc('chat_erase', scopeArgs(input))
      return typeof data === 'number' ? data : 0
    },
  }
}
