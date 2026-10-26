// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createChatStore, personKeyFor, chatLeadRef } from '@/lib/chat-store'
import { OutboxStoreError } from '@/lib/outbox-store'

const IDENT = '3e2c5f41-806d-4b1e-8fa0-4d5e6f708192'
const LEAD = '4f3d6052-917e-4c2f-90b1-5e6f708192a3'
const REF = 'chat:5a4e7163-a28f-4d30-a1c2-6f708192a3b4'
const ESPO = 'a1b2c3d4e5f60718a'

function client(data: unknown, error: unknown = null) {
  const rpc = vi.fn(async () => ({ data, error }))
  return { store: createChatStore({ rpc } as unknown as SupabaseClient), rpc }
}

describe('personKeyFor / chatLeadRef', () => {
  it('uses the identity when there is one, else the chatwoot contact', () => {
    expect(personKeyFor({ identityId: 'u', chatwootContactId: 7 })).toBe('i:u')
    expect(personKeyFor({ identityId: null, chatwootContactId: 7 })).toBe('c:7')
  })

  it('prefixes the conversation aggregate uuid', () => {
    expect(chatLeadRef('abc')).toBe('chat:abc')
  })
})

describe('chat store: tracer', () => {
  it('reserveLead sends the five p_ args and maps the table row', async () => {
    const { store, rpc } = client([
      { chat_lead_id: LEAD, lead_ref: REF, espo_lead_id: null, espo_contact_id: ESPO, own: false },
    ])
    const out = await store.reserveLead({
      personKey: 'c:9',
      identityId: null,
      chatwootContactId: 9,
      phone: '+420700000086',
      leadRef: REF,
    })
    expect(rpc).toHaveBeenCalledWith('chat_lead_reserve', {
      p_person_key: 'c:9',
      p_identity_id: null,
      p_chatwoot_contact_id: 9,
      p_phone: '+420700000086',
      p_lead_ref: REF,
    })
    expect(out).toEqual({ chatLeadId: LEAD, leadRef: REF, espoLeadId: null, espoContactId: ESPO, own: false })
  })

  it('reserveLead rejects a bad shape as db_error', async () => {
    const { store } = client([{ chat_lead_id: LEAD }])
    await expect(
      store.reserveLead({ personKey: 'c:9', identityId: null, chatwootContactId: 9, phone: null, leadRef: REF }),
    ).rejects.toMatchObject({ name: 'OutboxStoreError', code: 'db_error' })
  })

  it('conversation() maps the jsonb with and without chat_lead / identity', async () => {
    const full = client({
      conversation_id: 9000301,
      outcome: 'lead_created',
      chatwoot_contact_id: 9000083,
      identity_id: IDENT,
      espo_lead_id: ESPO,
      espo_contact_id: null,
      chat_lead: { id: LEAD, lead_ref: REF, espo_lead_id: ESPO, espo_contact_id: null, open: true },
      identity: { id: IDENT, customer: false, erasing: false, espo_contact_id: null, chatwoot_contact_id: 9000083 },
    })
    const record = await full.store.conversation(9000301)
    expect(full.rpc).toHaveBeenCalledWith('chat_conversation', { p_conversation_id: 9000301 })
    expect(record).toEqual({
      conversationId: 9000301,
      outcome: 'lead_created',
      chatwootContactId: 9000083,
      identityId: IDENT,
      espoLeadId: ESPO,
      espoContactId: null,
      chatLead: { id: LEAD, leadRef: REF, espoLeadId: ESPO, espoContactId: null, open: true },
      identity: { id: IDENT, customer: false, erasing: false, espoContactId: null, chatwootContactId: 9000083 },
    })

    const bare = client({
      conversation_id: 5,
      outcome: 'filtered',
      chatwoot_contact_id: null,
      identity_id: null,
      espo_lead_id: null,
      espo_contact_id: null,
      chat_lead: null,
      identity: null,
    })
    const minimal = await bare.store.conversation(5)
    expect(minimal?.chatLead).toBeNull()
    expect(minimal?.identity).toBeNull()
    expect(minimal?.outcome).toBe('filtered')
  })

  it('conversation() returns null for SQL NULL', async () => {
    expect(await client(null).store.conversation(1)).toBeNull()
  })

  it('conversation() throws db_error on an unknown outcome', async () => {
    const { store } = client({ conversation_id: 1, outcome: 'bogus' })
    await expect(store.conversation(1)).rejects.toBeInstanceOf(OutboxStoreError)
  })

  it('hooksStart parses an ISO string and returns null for null or garbage', async () => {
    const at = await client('2026-10-26T10:00:00+00:00').store.hooksStart()
    expect(at?.toISOString()).toBe('2026-10-26T10:00:00.000Z')
    expect(await client(null).store.hooksStart()).toBeNull()
    expect(await client('not-a-date').store.hooksStart()).toBeNull()
  })

  it('setLeadEspo and recordConversation send their p_ args and map the boolean', async () => {
    const a = client(true)
    expect(await a.store.setLeadEspo(LEAD, ESPO, null)).toBe(true)
    expect(a.rpc).toHaveBeenCalledWith('chat_lead_set_espo', {
      p_chat_lead_id: LEAD,
      p_espo_lead_id: ESPO,
      p_espo_contact_id: null,
    })
    const b = client(true)
    await b.store.recordConversation({
      conversationId: 7,
      chatwootContactId: 3,
      identityId: null,
      chatLeadId: LEAD,
      espoLeadId: ESPO,
      espoContactId: null,
      outcome: 'lead_appended',
    })
    expect(b.rpc).toHaveBeenCalledWith('chat_conversation_record', {
      p_conversation_id: 7,
      p_chatwoot_contact_id: 3,
      p_identity_id: null,
      p_chat_lead_id: LEAD,
      p_espo_lead_id: ESPO,
      p_espo_contact_id: null,
      p_outcome: 'lead_appended',
    })
  })

  it('an RPC error becomes OutboxStoreError db_error', async () => {
    const { store } = client(null, { message: 'boom' })
    await expect(store.hooksStart()).rejects.toMatchObject({ name: 'OutboxStoreError', code: 'db_error' })
    await expect(store.conversation(1)).rejects.toBeInstanceOf(OutboxStoreError)
  })

  it('a missing client env surfaces as db_error, not a crash', async () => {
    const store = createChatStore({
      rpc: () => {
        throw new Error('no env')
      },
    } as unknown as SupabaseClient)
    await expect(store.hooksStart()).rejects.toBeInstanceOf(OutboxStoreError)
  })
})

describe('chat store: lifecycle', () => {
  it('closeLead sends reason and a null booking by default', async () => {
    const { store, rpc } = client(true)
    expect(await store.closeLead(LEAD, 'dead')).toBe(true)
    expect(rpc).toHaveBeenCalledWith('chat_lead_close', { p_chat_lead_id: LEAD, p_reason: 'dead', p_booking_id: null })
    expect(await client(false).store.closeLead(LEAD, 'converted', IDENT)).toBe(false)
  })

  it('linkIdentity returns the moved count', async () => {
    const { store, rpc } = client(1)
    expect(await store.linkIdentity(9, IDENT)).toBe(1)
    expect(rpc).toHaveBeenCalledWith('chat_lead_link_identity', { p_chatwoot_contact_id: 9, p_identity_id: IDENT })
    expect(await client(0).store.linkIdentity(9, IDENT)).toBe(0)
  })

  it('openLeadsForPerson maps rows and tolerates an empty answer', async () => {
    const { store, rpc } = client([
      { chat_lead_id: LEAD, lead_ref: REF, espo_lead_id: null, created_at: '2026-10-26T10:00:00+00:00' },
    ])
    expect(await store.openLeadsForPerson(null, ['+420700000086'])).toEqual([
      { chatLeadId: LEAD, leadRef: REF, espoLeadId: null, createdAt: '2026-10-26T10:00:00+00:00' },
    ])
    expect(rpc).toHaveBeenCalledWith('chat_open_leads_for_person', {
      p_identity_id: null,
      p_phones: ['+420700000086'],
    })
    expect(await client([]).store.openLeadsForPerson(IDENT, [])).toEqual([])
    expect(await client(null).store.openLeadsForPerson(IDENT, [])).toEqual([])
  })

  it('erasureScope and erase send the same scope args', async () => {
    const input = { identityId: IDENT, chatwootContactIds: [9], phones: ['+420700000086'] }
    const a = client([{ lead_ref: REF, espo_lead_id: ESPO, espo_contact_id: null }])
    expect(await a.store.erasureScope(input)).toEqual([{ leadRef: REF, espoLeadId: ESPO, espoContactId: null }])
    expect(a.rpc).toHaveBeenCalledWith('chat_erasure_scope', {
      p_identity_id: IDENT,
      p_chatwoot_contact_ids: [9],
      p_phones: ['+420700000086'],
    })
    expect(await client([]).store.erasureScope(input)).toEqual([])
    const b = client(3)
    expect(await b.store.erase(input)).toBe(3)
    expect(b.rpc).toHaveBeenCalledWith('chat_erase', {
      p_identity_id: IDENT,
      p_chatwoot_contact_ids: [9],
      p_phones: ['+420700000086'],
    })
  })

  it('lifecycle RPC errors throw db_error', async () => {
    const { store } = client(null, { message: 'boom' })
    await expect(store.closeLead(LEAD, 'dead')).rejects.toBeInstanceOf(OutboxStoreError)
    await expect(store.linkIdentity(9, IDENT)).rejects.toBeInstanceOf(OutboxStoreError)
    await expect(store.openLeadsForPerson(null, [])).rejects.toBeInstanceOf(OutboxStoreError)
    await expect(store.erasureScope({ identityId: null, chatwootContactIds: [], phones: [] })).rejects.toBeInstanceOf(
      OutboxStoreError,
    )
    await expect(store.erase({ identityId: null, chatwootContactIds: [], phones: [] })).rejects.toBeInstanceOf(
      OutboxStoreError,
    )
  })
})
