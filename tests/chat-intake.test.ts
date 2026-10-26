// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'
import { incoming, makeWorld, WORLD_ASSIGNEE, WORLD_ACCOUNT_ID, type World, type WorldOptions } from './helpers/chat-world'
import { aggregateUuid } from '@/lib/sync-origin'

// Synthetic fixtures only (example domains, fake names). No real person, key or secret.

const refOf = (conversationId: number) => `chat:${aggregateUuid('conversation', conversationId)}`

interface ConversationSeed {
  id: number
  contactId?: number | null
  inboxId?: number
  channel?: string
  labels?: string[]
  createdOffsetSec?: number
  messages?: Array<Record<string, unknown> & { content: string; message_type: 0 | 1 | 2 | 3 }>
}

/** Seeds a conversation (default: one incoming web-widget message) into the world's Chatwoot fake. */
function seedConversation(w: World, c: ConversationSeed) {
  w.cw.seedConversation({
    id: c.id,
    inbox_id: c.inboxId ?? 1,
    contact_id: c.contactId === undefined ? 7 : c.contactId,
    channel: c.channel ?? 'Channel::WebWidget',
    labels: c.labels ?? [],
    created_at: w.secs(c.createdOffsetSec ?? -600),
    messages: c.messages ?? [incoming('Need a car to Vienna on Friday')],
  })
}

function janWorld(options: WorldOptions = {}) {
  const w = makeWorld(options)
  w.cw.seed({ id: 7, name: 'Jan Novák', email: 'jan@x.example' })
  seedConversation(w, { id: 42 })
  return w
}

// ── Task 1: tracer ──────────────────────────────────────────────────────────

describe('hook.chat_intake - tracer (stranger -> identity + Contact + chat Lead)', () => {
  it('turns the first incoming message into one identity, one Contact and one Lead with the channel source', async () => {
    const w = janWorld()

    const result = await w.dispatch(w.intakeKey(42))

    expect(result).toEqual({ outcome: 'sent' })

    // Identity: registered by the chat path (basis chat) and linked to the Chatwoot contact.
    expect(w.identity.identities).toHaveLength(1)
    const identity = w.identity.identities[0]
    expect(identity.emails).toEqual([{ email: 'jan@x.example', basis: 'chat', viaPhone: null }])
    expect(identity.chatwootContactId).toBe(7)

    // EspoCRM Contact with the Chatwoot name.
    expect(w.contacts()).toHaveLength(1)
    const contact = w.contacts()[0]
    expect(contact).toMatchObject({ firstName: 'Jan', lastName: 'Novák', emailAddress: 'jan@x.example' })
    expect(identity.espoContactId).toBe(contact.id)

    // One Lead: status New, source from the channel, owner as assignee, linked to the Contact.
    expect(w.leads()).toHaveLength(1)
    const lead = w.leads()[0]
    expect(lead).toMatchObject({
      cSupabaseRef: refOf(42),
      status: 'New',
      source: 'Website chat',
      assignedUserId: WORLD_ASSIGNEE,
      cExistingContactId: contact.id,
      firstName: 'Jan',
      lastName: 'Novák',
      emailAddress: 'jan@x.example',
    })
    expect(lead.description).toContain('Need a car to Vienna on Friday')
    expect(lead.description).toContain(`/app/accounts/${WORLD_ACCOUNT_ID}/conversations/42`)
    expect(lead.description).toContain('Website')

    // Registry: the conversation is recorded and the person holds one open chat Lead.
    expect(w.chat.state.conversations.get(42)?.outcome).toBe('lead_created')
    const open = w.chat.state.leads.filter((l) => l.open)
    expect(open).toHaveLength(1)
    expect(open[0].personKey).toBe(`i:${identity.id}`)
    expect(open[0].espoLeadId).toBe(lead.id)

    // The outbox row is finished.
    expect(w.outbox.rows.get(w.intakeKey(42))?.status).toBe('sent')
  })

  it('running the same key again changes nothing: still one Lead and one Contact', async () => {
    const w = janWorld()
    const key = w.intakeKey(42)
    await w.dispatch(key)
    const writesAfterFirst = w.espoWrites().length

    w.reset(key)
    const again = await w.dispatch(key)

    expect(again).toEqual({ outcome: 'sent' })
    expect(w.leads()).toHaveLength(1)
    expect(w.contacts()).toHaveLength(1)
    expect(w.espoWrites()).toHaveLength(writesAfterFirst)
  })

  it('never writes to Chatwoot', async () => {
    const w = janWorld()
    await w.dispatch(w.intakeKey(42))
    expect(w.cw.writes()).toEqual([])
  })
})

// ── Task 2: who is not a Lead, and the no-email / phone-only paths ──────────

const PHONE = '+420777900001'
const CONTACT_ID_A = 'a1b2c3d4e5f6a7b8c'
const CONTACT_ID_B = 'b1b2c3d4e5f6a7b8d'

/** The outbox row ended `skipped` with this code, and EspoCRM was never written. */
function expectSkippedUntouched(w: World, code: string, result: Awaited<ReturnType<World['dispatch']>>) {
  expect(result).toEqual({ outcome: 'skipped', code })
  expect(w.espoWrites()).toEqual([])
  expect(w.leads()).toHaveLength(0)
}

describe('hook.chat_intake - who is not a Lead (D-06, D-18, D-07, forward-only)', () => {
  it('customer by email (a booking exists) creates nothing and is recorded for the resolve entry', async () => {
    const w = janWorld()
    const id = w.identity.seed({ email: 'jan@x.example', bookings: 1, espoContactId: CONTACT_ID_A })

    const result = await w.dispatch(w.intakeKey(42))

    expectSkippedUntouched(w, 'customer', result)
    expect(w.chat.state.conversations.get(42)).toMatchObject({ outcome: 'customer', identityId: id, espoContactId: CONTACT_ID_A })
    expect(w.contacts()).toHaveLength(0)
  })

  it('customer by Chatwoot contact id (chatting with another email) creates nothing and no new identity', async () => {
    const w = makeWorld()
    w.cw.seed({ id: 7, name: 'Jan Novák', email: 'other@x.example' })
    seedConversation(w, { id: 42 })
    w.identity.seed({ email: 'jan@x.example', userId: '11111111-1111-4111-8111-111111111111', chatwootContactId: 7 })

    const result = await w.dispatch(w.intakeKey(42))

    expectSkippedUntouched(w, 'customer', result)
    expect(w.identity.identities).toHaveLength(1)
    expect(w.chat.state.conversations.get(42)?.outcome).toBe('customer')
  })

  it('a Chatwoot contact behind two identities is treated as a customer (no guessing)', async () => {
    const w = janWorld()
    w.identity.seed({ email: 'a@x.example', chatwootContactId: 7 })
    w.identity.seed({ email: 'b@x.example', chatwootContactId: 7 })

    const result = await w.dispatch(w.intakeKey(42))

    expectSkippedUntouched(w, 'customer', result)
  })

  it('known contact (an EspoCRM Contact with the email, no site identity) creates nothing and registers nobody', async () => {
    const w = janWorld({
      espo: { records: { Contact: [{ id: CONTACT_ID_A, lastName: 'Novak', emailAddress: 'jan@x.example' }] } },
    })

    const result = await w.dispatch(w.intakeKey(42))

    expectSkippedUntouched(w, 'known_contact', result)
    expect(w.identity.identities).toHaveLength(0)
    expect(w.chat.state.conversations.get(42)).toMatchObject({ outcome: 'known_contact', espoContactId: CONTACT_ID_A })
  })

  it('a stranger whose phone belongs to exactly one booking identity is merged and treated as a customer', async () => {
    const w = makeWorld()
    w.cw.seed({ id: 7, name: 'Jan Novák', email: 'jan@x.example', phone_number: PHONE })
    seedConversation(w, { id: 42 })
    const id = w.identity.seed({ email: 'booker@x.example', bookings: 1, phones: [PHONE] })

    const result = await w.dispatch(w.intakeKey(42))

    expectSkippedUntouched(w, 'customer', result)
    expect(w.identity.identities).toHaveLength(1)
    expect(w.identity.byId(id)?.emails.map((e) => e.email)).toContain('jan@x.example')
    expect(w.chat.state.conversations.get(42)).toMatchObject({ outcome: 'customer', identityId: id })
  })

  it('an identity that is being erased stops the intake without any record', async () => {
    const w = janWorld()
    w.identity.seed({ email: 'jan@x.example', erasing: true })

    const result = await w.dispatch(w.intakeKey(42))

    expectSkippedUntouched(w, 'identity_erasing', result)
    expect(w.chat.state.conversations.size).toBe(0)
  })

  it('auto_reply message creates nothing (filtered_auto_reply)', async () => {
    const w = janWorld()
    w.cw.state.conversations[0].messages[0].content_attributes = { email: { auto_reply: true } }

    const result = await w.dispatch(w.intakeKey(42))

    expectSkippedUntouched(w, 'filtered_auto_reply', result)
    expect(w.chat.state.conversations.get(42)?.outcome).toBe('filtered')
    expect(w.identity.identities).toHaveLength(0)
  })

  it('a no-reply sender creates nothing (filtered_no_reply)', async () => {
    const w = janWorld()
    w.cw.state.conversations[0].messages[0].sender = { id: 7, email: 'noreply@x.example' }

    const result = await w.dispatch(w.intakeKey(42))

    expectSkippedUntouched(w, 'filtered_no_reply', result)
    expect(w.chat.state.conversations.get(42)?.outcome).toBe('filtered')
  })

  it('own_domain sender creates nothing (filtered_own_domain)', async () => {
    const w = janWorld()
    w.cw.state.conversations[0].messages[0].sender = { id: 7, email: 'ops@rideprestigo.com' }

    const result = await w.dispatch(w.intakeKey(42))

    expectSkippedUntouched(w, 'filtered_own_domain', result)
    expect(w.chat.state.conversations.get(42)?.outcome).toBe('filtered')
  })

  it('a conversation labelled no-lead creates nothing', async () => {
    const w = makeWorld()
    w.cw.seed({ id: 7, name: 'Jan Novák', email: 'jan@x.example' })
    seedConversation(w, { id: 42, labels: ['no-lead'] })

    const result = await w.dispatch(w.intakeKey(42))

    expectSkippedUntouched(w, 'no_lead_label', result)
    expect(w.chat.state.conversations.get(42)?.outcome).toBe('no_lead_label')
    expect(w.identity.identities).toHaveLength(0)
  })

  it('hooks off (no start instant) writes nothing and reads nothing from Chatwoot', async () => {
    const w = janWorld({ hooksStart: null })

    const result = await w.dispatch(w.intakeKey(42))

    expectSkippedUntouched(w, 'hooks_off', result)
    expect(w.cw.requests).toHaveLength(0)
    expect(w.chat.state.conversations.size).toBe(0)
  })

  it('a conversation created before the go-live instant is skipped (before_start)', async () => {
    const w = makeWorld()
    w.cw.seed({ id: 7, name: 'Jan Novák', email: 'jan@x.example' })
    seedConversation(w, { id: 42, createdOffsetSec: -30 * 86_400 })

    const result = await w.dispatch(w.intakeKey(42))

    expectSkippedUntouched(w, 'before_start', result)
    expect(w.chat.state.conversations.size).toBe(0)
  })

  it('a missing conversation (404) is skipped as conversation_missing', async () => {
    const w = makeWorld()

    const result = await w.dispatch(w.intakeKey(99))

    expectSkippedUntouched(w, 'conversation_missing', result)
  })

  it('a conversation without an incoming message creates nothing (only an operator reply)', async () => {
    const w = makeWorld()
    w.cw.seed({ id: 7, name: 'Jan Novák', email: 'jan@x.example' })
    seedConversation(w, { id: 42, messages: [{ content: 'Hello, how can we help?', message_type: 1 }] })

    const result = await w.dispatch(w.intakeKey(42))

    expectSkippedUntouched(w, 'no_incoming_message', result)
    expect(w.chat.state.conversations.size).toBe(0)
    expect(w.identity.identities).toHaveLength(0)
  })

  it('a private incoming note does not count as the first message', async () => {
    const w = makeWorld()
    w.cw.seed({ id: 7, name: 'Jan Novák', email: 'jan@x.example' })
    seedConversation(w, { id: 42, messages: [{ content: 'internal', message_type: 0, private: true }] })

    const result = await w.dispatch(w.intakeKey(42))

    expectSkippedUntouched(w, 'no_incoming_message', result)
  })
})

describe('hook.chat_intake - no email and phone-only people (D-04)', () => {
  it('Telegram contact without email or phone gets a Lead with source Telegram, no Contact, no identity (person key c:7)', async () => {
    const w = makeWorld()
    w.cw.seed({ id: 7, name: 'Jan Novák' })
    seedConversation(w, { id: 42, channel: 'Channel::Telegram' })

    const result = await w.dispatch(w.intakeKey(42))

    expect(result).toEqual({ outcome: 'sent' })
    expect(w.leads()).toHaveLength(1)
    expect(w.leads()[0]).toMatchObject({ source: 'Telegram', firstName: 'Jan', lastName: 'Novák', cSupabaseRef: refOf(42) })
    expect(w.leads()[0].emailAddress).toBeUndefined()
    expect(w.leads()[0].phoneNumber).toBeUndefined()
    expect(w.leads()[0].cExistingContactId).toBeUndefined()
    expect(w.contacts()).toHaveLength(0)
    expect(w.identity.identities).toHaveLength(0)
    expect(w.chat.state.leads.map((l) => l.personKey)).toEqual(['c:7'])
  })

  it('phone-only contact without a matching Contact gets a new Contact keyed on the phone, linked from the Lead', async () => {
    const w = makeWorld()
    w.cw.seed({ id: 7, name: 'Jan Novák', phone_number: PHONE })
    seedConversation(w, { id: 42 })

    const result = await w.dispatch(w.intakeKey(42))

    expect(result).toEqual({ outcome: 'sent' })
    expect(w.contacts()).toHaveLength(1)
    expect(w.contacts()[0]).toMatchObject({ phoneNumber: PHONE, lastName: 'Novák' })
    expect(w.contacts()[0].emailAddress).toBeUndefined()
    expect(w.leads()[0]).toMatchObject({ phoneNumber: PHONE, cExistingContactId: w.contacts()[0].id })
    expect(w.identity.identities).toHaveLength(0)
    expect(w.chat.state.leads[0]).toMatchObject({ personKey: 'c:7', phone: PHONE })
  })

  it('phone-only contact with exactly one matching Contact is linked to it and no Contact is created', async () => {
    const w = makeWorld({
      espo: { records: { Contact: [{ id: CONTACT_ID_A, lastName: 'Novak', phoneNumber: PHONE }] } },
    })
    w.cw.seed({ id: 7, name: 'Jan Novák', phone_number: PHONE })
    seedConversation(w, { id: 42 })

    await w.dispatch(w.intakeKey(42))

    expect(w.contacts()).toHaveLength(1)
    expect(w.leads()[0].cExistingContactId).toBe(CONTACT_ID_A)
  })

  it('phone-only contact whose phone matches two Contacts gets a Lead without a Contact', async () => {
    const w = makeWorld({
      espo: {
        records: {
          Contact: [
            { id: CONTACT_ID_A, lastName: 'Novak', phoneNumber: PHONE },
            { id: CONTACT_ID_B, lastName: 'Svoboda', phoneNumber: PHONE },
          ],
        },
      },
    })
    w.cw.seed({ id: 7, name: 'Jan Novák', phone_number: PHONE })
    seedConversation(w, { id: 42 })

    await w.dispatch(w.intakeKey(42))

    expect(w.contacts()).toHaveLength(2)
    expect(w.leads()).toHaveLength(1)
    expect(w.leads()[0].cExistingContactId).toBeUndefined()
  })

  it('phone-only contact with a shared phone gets a Lead without a Contact and without the phone', async () => {
    const w = makeWorld({ sharedPhones: [PHONE] })
    w.cw.seed({ id: 7, name: 'Jan Novák', phone_number: PHONE })
    seedConversation(w, { id: 42 })

    await w.dispatch(w.intakeKey(42))

    expect(w.contacts()).toHaveLength(0)
    expect(w.leads()).toHaveLength(1)
    expect(w.leads()[0].cExistingContactId).toBeUndefined()
    expect(w.leads()[0].phoneNumber).toBeUndefined()
  })

  it('never creates a Contact keyed on a name only', async () => {
    const w = makeWorld()
    w.cw.seed({ id: 7, name: 'Jan Novák' })
    seedConversation(w, { id: 42, channel: 'Channel::Whatsapp' })

    await w.dispatch(w.intakeKey(42))

    expect(w.contacts()).toHaveLength(0)
    expect(w.leads()[0].source).toBe('WhatsApp')
  })
})

describe('hook.chat_intake - names and text', () => {
  it('a haikunator contact name falls back to the email local part (lastName jan)', async () => {
    const w = makeWorld()
    w.cw.seed({ id: 7, name: 'autumn-dew-482', email: 'jan@x.example' })
    seedConversation(w, { id: 42 })

    await w.dispatch(w.intakeKey(42))

    expect(w.leads()[0]).toMatchObject({ lastName: 'jan' })
    expect(w.leads()[0].firstName).toBeUndefined()
    expect(w.contacts()[0]).toMatchObject({ lastName: 'jan' })
  })

  it('a 900-char first message is cut to at most 500 chars in the description', async () => {
    const w = makeWorld()
    w.cw.seed({ id: 7, name: 'Jan Novák', email: 'jan@x.example' })
    seedConversation(w, { id: 42, messages: [incoming('y'.repeat(900))] })

    await w.dispatch(w.intakeKey(42))

    const description = String(w.leads()[0].description)
    expect(description).toContain('y'.repeat(400))
    expect(description).not.toContain('y'.repeat(501))
  })

  it('logs carry the key, outcome and code only: no email, name, phone or message', async () => {
    const w = makeWorld()
    w.cw.seed({ id: 7, name: 'Jan Novák', email: 'jan@x.example', phone_number: PHONE })
    seedConversation(w, { id: 42, messages: [incoming('Secret message about Vienna')] })
    const spies = (['log', 'error', 'warn'] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => undefined))

    await w.dispatch(w.intakeKey(42))
    w.reset(w.intakeKey(42))
    await w.dispatch(w.intakeKey(42))

    const output = spies.flatMap((s) => s.mock.calls.map((c) => c.join(' '))).join('\n')
    spies.forEach((s) => s.mockRestore())
    expect(output).toContain('[chat-intake]')
    for (const secret of ['jan@x.example', 'Jan', 'Novák', '+420', 'Vienna', 'Secret message']) {
      expect(output).not.toContain(secret)
    }
  })
})
