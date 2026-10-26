// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createIdentityStore, type PersonRecord } from '@/lib/identity-store'
import { OutboxStoreError } from '@/lib/outbox-store'

const ID = '3e2c5f41-806d-4b1e-8fa0-4d5e6f708192'
const PREV = '4f3d6052-917e-4c2f-90b1-5e6f708192a3'

function client(data: unknown, error: unknown = null) {
  const rpc = vi.fn(async () => ({ data, error }))
  return { store: createIdentityStore({ rpc } as unknown as SupabaseClient), rpc }
}

const ENQUEUE = (key: string, at: Date) => ({
  eventType: 'sync.espo',
  aggregateType: 'person' as const,
  aggregateId: ID,
  key,
  availableAt: at,
})

describe('identity store', () => {
  it('person() maps the jsonb contract', async () => {
    const person: PersonRecord = {
      identity: { id: ID, user_id: null, espo_contact_id: null, chatwoot_contact_id: null, erasing_at: null },
      emails: [
        { email: 'a@example.com', basis: 'email', via_phone: null },
        { email: 'b@example.com', basis: 'signup', via_phone: null },
      ],
      phones: ['+420725986855'],
      profile: null,
      bookings: [],
    }
    const { store, rpc } = client(person)
    const out = await store.person(ID)
    expect(rpc).toHaveBeenCalledWith('identity_person', { p_identity_id: ID })
    expect(out?.emails.map((e) => e.email)).toEqual(['a@example.com', 'b@example.com'])
    expect(out?.phones).toEqual(['+420725986855'])
    expect(out?.profile).toBeNull()
  })

  it('person() and crmBooking() return null for a missing row', async () => {
    expect(await client(null).store.person(ID)).toBeNull()
    expect(await client(null).store.crmBooking(ID)).toBeNull()
  })

  it('resolveBooking() maps a table result row', async () => {
    const { store, rpc } = client([{ identity_id: ID, previous_identity_id: PREV, outcome: 'resolved' }])
    expect(await store.resolveBooking('b1')).toEqual({ identityId: ID, previousIdentityId: PREV, outcome: 'resolved' })
    expect(rpc).toHaveBeenCalledWith('identity_resolve_booking', { p_booking_id: 'b1' })
  })

  it('resolveUser() maps null ids and calls the user RPC', async () => {
    const { store, rpc } = client([{ identity_id: null, previous_identity_id: null, outcome: 'no_identity' }])
    expect(await store.resolveUser('u1')).toEqual({ identityId: null, previousIdentityId: null, outcome: 'no_identity' })
    expect(rpc).toHaveBeenCalledWith('identity_resolve_user', { p_user_id: 'u1' })
  })

  it('an RPC error throws OutboxStoreError db_error without leaking the message', async () => {
    const { store } = client(null, { message: 'secret detail a@example.com' })
    await expect(store.resolveBooking('b1')).rejects.toMatchObject({ name: 'OutboxStoreError', code: 'db_error' })
    await expect(store.person(ID)).rejects.toBeInstanceOf(OutboxStoreError)
    await expect(store.enqueueSync(ENQUEUE('k', new Date(0)))).rejects.toMatchObject({ code: 'db_error' })
    await expect(store.resolveBooking('b1')).rejects.not.toHaveProperty('message', expect.stringContaining('secret'))
  })

  it('an unexpected resolver result shape is a db_error', async () => {
    await expect(client([]).store.resolveBooking('b1')).rejects.toMatchObject({ code: 'db_error' })
    await expect(client([{ outcome: 'bogus' }]).store.resolveUser('u1')).rejects.toMatchObject({ code: 'db_error' })
  })

  it('enqueueSync() returns true on insert, false on a key conflict, and sends the contract arguments', async () => {
    const at = new Date('2026-10-19T12:01:00.000Z')
    const inserted = client(true)
    expect(await inserted.store.enqueueSync(ENQUEUE(`sync.espo:${ID}:5`, at))).toBe(true)
    expect(inserted.rpc).toHaveBeenCalledWith('outbox_enqueue', {
      p_event_type: 'sync.espo',
      p_aggregate_type: 'person',
      p_aggregate_id: ID,
      p_key: `sync.espo:${ID}:5`,
      p_available_at: at.toISOString(),
    })
    expect(await client(false).store.enqueueSync(ENQUEUE('k', at))).toBe(false)
  })

  it('emailOwners() maps rows and skips the RPC for an empty list', async () => {
    const { store, rpc } = client([{ email: 'a@example.com', identity_id: ID }])
    const owners = await store.emailOwners(['A@example.com'])
    expect(owners.get('a@example.com')).toBe(ID)
    expect(rpc).toHaveBeenCalledWith('identity_email_owners', { p_emails: ['A@example.com'] })
    const empty = client([])
    expect((await empty.store.emailOwners([])).size).toBe(0)
    expect(empty.rpc).not.toHaveBeenCalled()
  })

  it('setEspoContact() / setChatwootContact() pass the id and NULL clears', async () => {
    const espo = client(true)
    expect(await espo.store.setEspoContact(ID, null)).toBe(true)
    expect(espo.rpc).toHaveBeenCalledWith('identity_set_espo_contact', { p_identity_id: ID, p_contact_id: null })
    const chat = client(true)
    expect(await chat.store.setChatwootContact(ID, 42)).toBe(true)
    expect(chat.rpc).toHaveBeenCalledWith('identity_set_chatwoot_contact', { p_identity_id: ID, p_contact_id: 42 })
  })
})

describe('identity store: chat identity (Phase 83)', () => {
  it('resolveChat() sends email and phone and maps the result row', async () => {
    const { store, rpc } = client([{ identity_id: ID, outcome: 'resolved', customer: false }])
    expect(await store.resolveChat('A@x.example ', null)).toEqual({ identityId: ID, outcome: 'resolved', customer: false })
    expect(rpc).toHaveBeenCalledWith('identity_resolve_chat', { p_email_raw: 'A@x.example ', p_phone_raw: null })
  })

  it('resolveChat() maps no_identity to a null id and customer false', async () => {
    const { store } = client([{ identity_id: null, outcome: 'no_identity', customer: null }])
    expect(await store.resolveChat(null, '+420725986855')).toEqual({ identityId: null, outcome: 'no_identity', customer: false })
  })

  it('resolveChat() rejects an unknown outcome and an RPC error with db_error', async () => {
    await expect(client([{ identity_id: ID, outcome: 'bogus', customer: false }]).store.resolveChat('a@x.example', null)).rejects.toMatchObject({
      name: 'OutboxStoreError',
      code: 'db_error',
    })
    await expect(client([]).store.resolveChat('a@x.example', null)).rejects.toMatchObject({ code: 'db_error' })
    await expect(client(null, { message: 'boom' }).store.resolveChat('a@x.example', null)).rejects.toMatchObject({ code: 'db_error' })
  })

  it('chatLookup() maps one row to ChatIdentity and zero rows to null', async () => {
    const { store, rpc } = client([
      { identity_id: ID, customer: true, erasing: false, espo_contact_id: '0123456789abcdef0', chatwoot_contact_id: 77 },
    ])
    expect(await store.chatLookup('a@x.example')).toEqual({
      identityId: ID,
      customer: true,
      erasing: false,
      espoContactId: '0123456789abcdef0',
      chatwootContactId: 77,
    })
    expect(rpc).toHaveBeenCalledWith('identity_chat_lookup', { p_email_raw: 'a@x.example' })
    expect(await client([]).store.chatLookup('a@x.example')).toBeNull()
    expect(await client(null).store.chatLookup('a@x.example')).toBeNull()
  })

  it('chatLookup() treats a malformed row as db_error', async () => {
    await expect(client([{ nope: 1 }]).store.chatLookup('a@x.example')).rejects.toMatchObject({ code: 'db_error' })
  })

  it('byChatwootContact() maps 0, 1 and 2 rows and keeps the emails array', async () => {
    const none = client([])
    expect(await none.store.byChatwootContact(9)).toEqual([])
    expect(none.rpc).toHaveBeenCalledWith('identity_by_chatwoot_contact', { p_contact_id: 9 })
    const row = (id: string) => ({ identity_id: id, customer: false, erasing: false, espo_contact_id: null, emails: ['a@x.example', 'b@x.example'] })
    const one = await client([row(ID)]).store.byChatwootContact(9)
    expect(one).toEqual([
      { identityId: ID, customer: false, erasing: false, espoContactId: null, chatwootContactId: 9, emails: ['a@x.example', 'b@x.example'] },
    ])
    expect((await client([row(ID), row(PREV)]).store.byChatwootContact(9)).map((i) => i.identityId)).toEqual([ID, PREV])
    expect(await client(null).store.byChatwootContact(9)).toEqual([])
    await expect(client([{ nope: 1 }]).store.byChatwootContact(9)).rejects.toMatchObject({ code: 'db_error' })
  })

  it('attach: attachChatContact() maps (attached, owned_elsewhere) and sends the contract arguments', async () => {
    const { store, rpc } = client([{ email_outcome: 'attached', phone_outcome: 'owned_elsewhere' }])
    expect(await store.attachChatContact(ID, 'A@x.example', '+420700000083')).toEqual({ email: 'attached', phone: 'owned_elsewhere' })
    expect(rpc).toHaveBeenCalledWith('identity_attach_chat_contact', {
      p_identity_id: ID,
      p_email_raw: 'A@x.example',
      p_phone_raw: '+420700000083',
    })
  })

  it('attach: an unknown outcome, an empty result and an RPC error are db_error', async () => {
    await expect(client([{ email_outcome: 'merged', phone_outcome: 'none' }]).store.attachChatContact(ID, null, null)).rejects.toMatchObject({ code: 'db_error' })
    await expect(client([]).store.attachChatContact(ID, null, null)).rejects.toMatchObject({ code: 'db_error' })
    await expect(client(null, { message: 'x' }).store.attachChatContact(ID, null, null)).rejects.toMatchObject({ code: 'db_error' })
  })

  it('phoneUsable() returns the E.164 string or null and skips the RPC for null', async () => {
    const ok = client('+420725986855')
    expect(await ok.store.phoneUsable('+420 725 986 855')).toBe('+420725986855')
    expect(ok.rpc).toHaveBeenCalledWith('identity_phone_usable', { p_phone_raw: '+420 725 986 855' })
    expect(await client(null).store.phoneUsable('123')).toBeNull()
    const nul = client('+420725986855')
    expect(await nul.store.phoneUsable(null)).toBeNull()
    expect(nul.rpc).not.toHaveBeenCalled()
    await expect(client(null, { message: 'x' }).store.phoneUsable('1')).rejects.toMatchObject({ code: 'db_error' })
  })
})
