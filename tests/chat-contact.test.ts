// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { incoming, makeWorld, type World, type WorldOptions } from './helpers/chat-world'
import type { FakeChatwootOptions } from './helpers/fake-chatwoot'
import { contactFingerprint, hookContactKey, hookConversationKey } from '@/lib/sync-origin'
import { outboxErrorHint } from '@/lib/outbox-labels'

// Synthetic fixtures only (example domains, fake names). No real person, key or secret.

/** GET /contacts/<id>/conversations is not a built-in route of the Chatwoot fake: answer it here. */
const conversationsOfContact: NonNullable<FakeChatwootOptions['intercept']> = (req, state) => {
  const m = /^\/contacts\/(\d+)\/conversations$/.exec(req.path)
  if (req.method !== 'GET' || !m) return undefined
  const payload = state.conversations
    .filter((c) => c.contact_id === Number(m[1]))
    .map((c) => ({ id: c.id, inbox_id: c.inbox_id, status: c.status, labels: c.labels }))
  return new Response(JSON.stringify({ payload }), { status: 200, headers: { 'Content-Type': 'application/json' } })
}

function chatWorld(options: WorldOptions = {}): World {
  return makeWorld({ ...options, cw: { intercept: conversationsOfContact, ...options.cw } })
}

const contactKey = (w: World, contactId: number) => hookContactKey(contactId, w.now().getTime()).key

/** A Telegram person: Chatwoot contact 7 without email or phone, one conversation, one open chat Lead `c:7`. */
async function telegramWorld(options: WorldOptions = {}) {
  const w = chatWorld(options)
  w.cw.seed({ id: 7, name: 'Anna Kovar' })
  w.cw.seedConversation({
    id: 42,
    inbox_id: 1,
    contact_id: 7,
    channel: 'Channel::Telegram',
    created_at: w.secs(-600),
    messages: [incoming('Hello, can I book a ride to Vienna?')],
  })
  const intake = await w.dispatch(w.intakeKey(42))
  expect(intake).toEqual({ outcome: 'sent' })
  return w
}

/** What the operator does in the Chatwoot sidebar. */
function operatorEdits(w: World, contactId: number, fields: { email?: string | null; phone_number?: string | null; name?: string }) {
  const contact = w.cw.state.contacts.find((c) => c.id === contactId)!
  Object.assign(contact, fields)
}

// ── Task 1: tracer ──────────────────────────────────────────────────────────

describe('hook.chat_contact - tracer (operator adds an email to a Telegram contact)', () => {
  it('registers the identity, creates the Contact and moves the open chat Lead to the identity', async () => {
    const w = await telegramWorld()
    // Telegram intake: a Lead without Contact or email, person key c:7 (D-04).
    expect(w.leads()).toHaveLength(1)
    expect(w.contacts()).toHaveLength(0)
    expect(w.chat.state.leads.filter((l) => l.open).map((l) => l.personKey)).toEqual(['c:7'])

    operatorEdits(w, 7, { email: 'anna@x.example' })
    const result = await w.dispatch(contactKey(w, 7))

    expect(result).toEqual({ outcome: 'sent' })

    // Identity: registered by the chat path (basis chat), linked to Chatwoot contact 7.
    expect(w.identity.identities).toHaveLength(1)
    const identity = w.identity.identities[0]
    expect(identity.emails).toEqual([{ email: 'anna@x.example', basis: 'chat', viaPhone: null }])
    expect(identity.chatwootContactId).toBe(7)

    // EspoCRM: a new Contact with that email and the Telegram name.
    expect(w.contacts()).toHaveLength(1)
    const contact = w.contacts()[0]
    expect(contact).toMatchObject({ firstName: 'Anna', lastName: 'Kovar', emailAddress: 'anna@x.example' })
    expect(identity.espoContactId).toBe(contact.id)

    // The Lead now points at that Contact and carries the email it had none of.
    const lead = w.leads()[0]
    expect(lead.cExistingContactId).toBe(contact.id)
    expect(lead.emailAddress).toBe('anna@x.example')

    // Registry: the lead moved from c:7 to the identity and knows the Contact.
    const open = w.chat.state.leads.filter((l) => l.open)
    expect(open).toHaveLength(1)
    expect(open[0].personKey).toBe(`i:${identity.id}`)
    expect(open[0].espoContactId).toBe(contact.id)
    expect(w.outbox.rows.get(contactKey(w, 7))?.status).toBe('sent')
  })

  it('dispatching the same key again creates no Contact and writes nothing to the Lead', async () => {
    const w = await telegramWorld()
    operatorEdits(w, 7, { email: 'anna@x.example' })
    const key = contactKey(w, 7)
    await w.dispatch(key)
    const writesAfterFirst = w.espoWrites().length

    w.reset(key)
    const again = await w.dispatch(key)

    expect(again).toEqual({ outcome: 'sent' })
    expect(w.contacts()).toHaveLength(1)
    expect(w.identity.identities).toHaveLength(1)
    expect(w.espoWrites()).toHaveLength(writesAfterFirst)
  })

  it('never writes to Chatwoot', async () => {
    const w = await telegramWorld()
    operatorEdits(w, 7, { email: 'anna@x.example' })
    await w.dispatch(contactKey(w, 7))
    expect(w.cw.writes()).toEqual([])
  })

  it('is routed by the hook dispatcher: hooks off skips, a missing contact skips, no data skips', async () => {
    const off = await telegramWorld()
    off.setHooksStart(null)
    operatorEdits(off, 7, { email: 'anna@x.example' })
    const writesBefore = off.espoWrites().length
    expect(await off.dispatch(contactKey(off, 7))).toEqual({ outcome: 'skipped', code: 'hooks_off' })
    expect(off.espoWrites()).toHaveLength(writesBefore)

    const gone = chatWorld()
    expect(await gone.dispatch(contactKey(gone, 99))).toEqual({ outcome: 'skipped', code: 'contact_missing' })

    const bare = await telegramWorld()
    expect(await bare.dispatch(contactKey(bare, 7))).toEqual({ outcome: 'skipped', code: 'no_contact_data' })
    expect(bare.identity.identities).toHaveLength(0)
  })
})

// ── Task 2: identity / known contact / customer / phone-only / echo / ambiguous ──

const PHONE = '+420777900001'
const OTHER_PHONE = '+420777900002'
const CONTACT_A = 'a1b2c3d4e5f6a7b8c'
const CONTACT_B = 'b1b2c3d4e5f6a7b8d'

/** Chatwoot contact 7 with an email, linked to a chat identity whose EspoCRM Contact already exists. */
function linkedWorld(over: { contactRecord?: Record<string, unknown>; chatwoot?: Record<string, unknown> } = {}) {
  const w = chatWorld({
    espo: {
      records: {
        Contact: [
          { id: CONTACT_A, firstName: 'Anna', lastName: 'Kovar', emailAddress: 'anna@x.example', ...(over.contactRecord ?? {}) },
        ],
      },
    },
  })
  w.cw.seed({ id: 7, name: 'Anna Kovar', email: 'anna@x.example', ...(over.chatwoot ?? {}) })
  const identityId = w.identity.seed({ email: 'anna@x.example', basis: 'chat', chatwootContactId: 7, espoContactId: CONTACT_A })
  return { w, identityId }
}

describe('hook.chat_contact - contact already linked to a chat identity', () => {
  it('a phone added by the operator is attached to the identity and fills the empty Contact phone only', async () => {
    const { w, identityId } = linkedWorld({ chatwoot: { phone_number: PHONE } })

    const result = await w.dispatch(contactKey(w, 7))

    expect(result).toEqual({ outcome: 'sent' })
    expect([...w.identity.byId(identityId)!.phones]).toEqual([PHONE])
    const puts = w.espo.requests.filter((r) => r.method === 'PUT')
    expect(puts).toHaveLength(1)
    expect(puts[0].path).toBe(`/Contact/${CONTACT_A}`)
    expect(puts[0].body).toEqual({ phoneNumber: PHONE })
  })

  it('a Contact that already has a phone keeps it, and no PUT ever carries a name', async () => {
    const { w } = linkedWorld({ contactRecord: { phoneNumber: '+420111222333' }, chatwoot: { phone_number: PHONE, name: 'Totally Different' } })

    const result = await w.dispatch(contactKey(w, 7))

    expect(result).toEqual({ outcome: 'sent' })
    expect(w.espo.requests.filter((r) => r.method !== 'GET')).toEqual([])
    expect(w.contacts()[0]).toMatchObject({ firstName: 'Anna', lastName: 'Kovar', phoneNumber: '+420111222333' })
  })

  it('email_owned_elsewhere: an address of another identity is not attached and nothing is merged', async () => {
    const { w, identityId } = linkedWorld()
    const other = w.identity.seed({ email: 'boris@x.example', bookings: 1, espoContactId: CONTACT_B })
    operatorEdits(w, 7, { email: 'boris@x.example' })

    const result = await w.dispatch(contactKey(w, 7))

    expect(result).toEqual({ outcome: 'skipped', code: 'email_owned_elsewhere' })
    expect(w.espoWrites()).toEqual([])
    expect(w.identity.identities).toHaveLength(2)
    expect(w.identity.byId(identityId)!.emails.map((e) => e.email)).toEqual(['anna@x.example'])
    expect(w.identity.byId(other)!.emails.map((e) => e.email)).toEqual(['boris@x.example'])
    expect(w.outbox.rows.get(contactKey(w, 7))?.last_error).toBe('email_owned_elsewhere')
  })

  it('an operator-typed second email of the same person is attached and the Contact gains it', async () => {
    const { w, identityId } = linkedWorld()
    operatorEdits(w, 7, { email: 'anna.k@y.example' })

    const result = await w.dispatch(contactKey(w, 7))

    expect(result).toEqual({ outcome: 'sent' })
    expect(w.identity.byId(identityId)!.emails.map((e) => e.email)).toEqual(['anna@x.example', 'anna.k@y.example'])
    const data = w.contacts()[0].emailAddressData as Array<{ emailAddress: string; primary: boolean }>
    expect(data.map((e) => e.emailAddress).sort()).toEqual(['anna.k@y.example', 'anna@x.example'])
    expect(data.filter((e) => e.primary)).toHaveLength(1)
  })

  it('a Contact deleted in the CRM is replaced by a new one that the identity then points at', async () => {
    const { w, identityId } = linkedWorld()
    w.espo.state.records.Contact.length = 0

    const result = await w.dispatch(contactKey(w, 7))

    expect(result).toEqual({ outcome: 'sent' })
    expect(w.contacts()).toHaveLength(1)
    expect(w.contacts()[0].id).not.toBe(CONTACT_A)
    expect(w.identity.byId(identityId)!.espoContactId).toBe(w.contacts()[0].id)
  })

  it('an identity that is being erased is left alone', async () => {
    const { w, identityId } = linkedWorld()
    w.identity.byId(identityId)!.erasing = true

    const result = await w.dispatch(contactKey(w, 7))

    expect(result).toEqual({ outcome: 'skipped', code: 'identity_erasing' })
    expect(w.espoWrites()).toEqual([])
  })

  it('two identities behind one Chatwoot contact -> cw_ambiguous, nothing written', async () => {
    const { w } = linkedWorld()
    w.identity.seed({ email: 'other@x.example', chatwootContactId: 7 })

    const result = await w.dispatch(contactKey(w, 7))

    expect(result).toEqual({ outcome: 'skipped', code: 'cw_ambiguous' })
    expect(w.espoWrites()).toEqual([])
  })
})

describe('hook.chat_contact - email of a person that already exists elsewhere', () => {
  it('known contact: an EspoCRM Contact with the email and no identity is linked, nobody is registered', async () => {
    const w = await telegramWorld({
      espo: { records: { Contact: [{ id: CONTACT_B, lastName: 'Novak', emailAddress: 'anna@x.example' }] } },
    })
    operatorEdits(w, 7, { email: 'anna@x.example' })

    const result = await w.dispatch(contactKey(w, 7))

    expect(result).toEqual({ outcome: 'sent' })
    expect(w.identity.identities).toHaveLength(0)
    expect(w.contacts()).toHaveLength(1)
    expect(w.leads()[0]).toMatchObject({ cExistingContactId: CONTACT_B, emailAddress: 'anna@x.example' })
    expect(w.contacts()[0]).toMatchObject({ lastName: 'Novak' })
    expect(w.contacts()[0].firstName).toBeUndefined()
    expect(w.chat.state.leads.find((l) => l.open)).toMatchObject({ personKey: 'c:7', espoContactId: CONTACT_B })
  })

  it('customer identity: it gains the Chatwoot contact when it had none and the chat Lead joins its Contact', async () => {
    const w = await telegramWorld({
      espo: { records: { Contact: [{ id: CONTACT_B, firstName: 'Boris', lastName: 'Ivanov', emailAddress: 'boris@x.example' }] } },
    })
    const customer = w.identity.seed({ email: 'boris@x.example', bookings: 2, espoContactId: CONTACT_B })
    operatorEdits(w, 7, { email: 'boris@x.example' })

    const result = await w.dispatch(contactKey(w, 7))

    expect(result).toEqual({ outcome: 'sent' })
    expect(w.identity.identities).toHaveLength(1)
    expect(w.identity.byId(customer)!.chatwootContactId).toBe(7)
    expect(w.leads()[0].cExistingContactId).toBe(CONTACT_B)
    expect(w.chat.state.leads.find((l) => l.open)?.personKey).toBe(`i:${customer}`)
    expect(w.contacts()).toHaveLength(1)
    expect(w.contacts()[0]).toMatchObject({ firstName: 'Boris', lastName: 'Ivanov' })
  })

  it("a customer's existing Chatwoot contact id is never overwritten", async () => {
    const w = await telegramWorld({
      espo: { records: { Contact: [{ id: CONTACT_B, firstName: 'Boris', lastName: 'Ivanov', emailAddress: 'boris@x.example' }] } },
    })
    const customer = w.identity.seed({ email: 'boris@x.example', bookings: 1, espoContactId: CONTACT_B, chatwootContactId: 3 })
    operatorEdits(w, 7, { email: 'boris@x.example' })

    const result = await w.dispatch(contactKey(w, 7))

    expect(result).toEqual({ outcome: 'sent' })
    expect(w.identity.byId(customer)!.chatwootContactId).toBe(3)
    expect(w.leads()[0].cExistingContactId).toBe(CONTACT_B)
  })

  it('an identity being erased stops the handler', async () => {
    const w = await telegramWorld()
    w.identity.seed({ email: 'anna@x.example', erasing: true })
    operatorEdits(w, 7, { email: 'anna@x.example' })

    const writesBefore = w.espoWrites().length
    const result = await w.dispatch(contactKey(w, 7))

    expect(result).toEqual({ outcome: 'skipped', code: 'identity_erasing' })
    expect(w.espoWrites()).toHaveLength(writesBefore)
  })

  it('a contact_updated that overtakes the intake leaves the Lead to the intake, which then follows the email path', async () => {
    const w = chatWorld()
    w.cw.seed({ id: 7, name: 'Anna Kovar', email: 'anna@x.example' })
    w.cw.seedConversation({
      id: 42,
      inbox_id: 1,
      contact_id: 7,
      created_at: w.secs(-600),
      messages: [incoming('Need a car on Friday')],
    })

    expect(await w.dispatch(contactKey(w, 7))).toEqual({ outcome: 'sent' })
    expect(w.leads()).toHaveLength(0)
    expect(w.contacts()).toHaveLength(1)

    expect(await w.dispatch(w.intakeKey(42))).toEqual({ outcome: 'sent' })
    expect(w.leads()).toHaveLength(1)
    expect(w.contacts()).toHaveLength(1)
    expect(w.identity.identities).toHaveLength(1)
    expect(w.leads()[0].cExistingContactId).toBe(w.contacts()[0].id)
  })
})

describe('hook.chat_contact - phone-only update (no email)', () => {
  it('phone-only: exactly one Contact with the phone is linked to the Lead, nobody is registered', async () => {
    const w = await telegramWorld({
      espo: { records: { Contact: [{ id: CONTACT_B, lastName: 'Novak', phoneNumber: PHONE }] } },
    })
    operatorEdits(w, 7, { phone_number: PHONE })

    const result = await w.dispatch(contactKey(w, 7))

    expect(result).toEqual({ outcome: 'sent' })
    expect(w.identity.identities).toHaveLength(0)
    expect(w.contacts()).toHaveLength(1)
    expect(w.leads()[0].cExistingContactId).toBe(CONTACT_B)
    expect(w.leads()[0].emailAddress).toBeUndefined()
  })

  it('phone-only: no Contact with the phone -> one is created keyed on the phone', async () => {
    const w = await telegramWorld()
    operatorEdits(w, 7, { phone_number: PHONE })

    const result = await w.dispatch(contactKey(w, 7))

    expect(result).toEqual({ outcome: 'sent' })
    expect(w.identity.identities).toHaveLength(0)
    expect(w.contacts()).toHaveLength(1)
    expect(w.contacts()[0]).toMatchObject({ firstName: 'Anna', lastName: 'Kovar', phoneNumber: PHONE })
    expect(w.leads()[0].cExistingContactId).toBe(w.contacts()[0].id)
  })

  it('phone-only: two Contacts share the phone -> no Contact is picked and the Lead is untouched', async () => {
    const w = await telegramWorld({
      espo: {
        records: {
          Contact: [
            { id: CONTACT_A, lastName: 'One', phoneNumber: PHONE },
            { id: CONTACT_B, lastName: 'Two', phoneNumber: PHONE },
          ],
        },
      },
    })
    operatorEdits(w, 7, { phone_number: PHONE })
    const writesBefore = w.espoWrites().length

    const result = await w.dispatch(contactKey(w, 7))

    expect(result).toEqual({ outcome: 'sent' })
    expect(w.espoWrites()).toHaveLength(writesBefore)
    expect(w.leads()[0].cExistingContactId).toBeUndefined()
  })

  it('phone-only: a shared phone is not usable -> no_contact_data', async () => {
    const w = await telegramWorld({ sharedPhones: [OTHER_PHONE] })
    operatorEdits(w, 7, { phone_number: OTHER_PHONE })
    const writesBefore = w.espoWrites().length

    const result = await w.dispatch(contactKey(w, 7))

    expect(result).toEqual({ outcome: 'skipped', code: 'no_contact_data' })
    expect(w.espoWrites()).toHaveLength(writesBefore)
  })

  it('a phone-only Lead of the person (registry phone, no identity) moves to the identity once an email appears', async () => {
    const w = chatWorld()
    w.cw.seed({ id: 7, name: 'Anna Kovar', phone_number: PHONE })
    w.cw.seedConversation({
      id: 42,
      inbox_id: 1,
      contact_id: 7,
      channel: 'Channel::Whatsapp',
      created_at: w.secs(-600),
      messages: [incoming('Hello')],
    })
    expect(await w.dispatch(w.intakeKey(42))).toEqual({ outcome: 'sent' })
    expect(w.chat.state.leads.find((l) => l.open)).toMatchObject({ personKey: 'c:7', phone: PHONE })

    operatorEdits(w, 7, { email: 'anna@x.example' })
    const result = await w.dispatch(contactKey(w, 7))

    expect(result).toEqual({ outcome: 'sent' })
    expect(w.identity.identities).toHaveLength(1)
    const open = w.chat.state.leads.filter((l) => l.open)
    expect(open).toHaveLength(1)
    expect(open[0].personKey).toBe(`i:${w.identity.identities[0].id}`)
    expect(w.contacts()).toHaveLength(1)
    expect(w.leads()[0].cExistingContactId).toBe(w.contacts()[0].id)
  })
})

describe('hook.chat_contact - echo (HOOK-04 handler layer)', () => {
  it('a contact whose stored fingerprint matches its fields is skipped after the contact GET only', async () => {
    const w = chatWorld()
    w.cw.seed({ id: 7, name: 'Anna Kovar', email: 'anna@x.example', phone_number: PHONE })
    const contact = w.cw.state.contacts[0]
    contact.custom_attributes = {
      site_sync_fp: contactFingerprint({
        name: contact.name,
        email: contact.email,
        phone_number: contact.phone_number,
        identifier: contact.identifier,
      }),
    }
    const cwBefore = w.cw.requests.length

    const result = await w.dispatch(contactKey(w, 7))

    expect(result).toEqual({ outcome: 'skipped', code: 'echo' })
    expect(w.cw.requests.slice(cwBefore).map((r) => `${r.method} ${r.path}`)).toEqual(['GET /contacts/7'])
    expect(w.espo.requests).toHaveLength(0)
    expect(w.identity.identities).toHaveLength(0)
  })

  it('a stale fingerprint (the operator changed a field afterwards) is processed', async () => {
    const w = chatWorld()
    w.cw.seed({ id: 7, name: 'Anna Kovar', email: 'anna@x.example', custom_attributes: { site_sync_fp: 'deadbeefdeadbeef' } })

    const result = await w.dispatch(contactKey(w, 7))

    expect(result).toEqual({ outcome: 'sent' })
    expect(w.contacts()).toHaveLength(1)
  })
})

// ── hook.chat_label: the no-lead label (D-07) ───────────────────────────────

const labelKey = (conversationId: number) => hookConversationKey('hook.chat_label', conversationId).key
const FORM_LEAD_ID = 'd1d2d3d4d5d6d7d8d'

/** Jan wrote on the website chat; the intake created his chat Lead. */
async function janWithLead(options: WorldOptions = {}) {
  const w = chatWorld(options)
  w.cw.seed({ id: 7, name: 'Jan Novak', email: 'jan@x.example' })
  w.cw.seedConversation({
    id: 42,
    inbox_id: 1,
    contact_id: 7,
    created_at: w.secs(-600),
    messages: [incoming('Cheap SEO services for your site')],
  })
  return w
}

const addLabel = (w: World, conversationId: number, label = 'no-lead') => {
  w.cw.state.conversations.find((c) => c.id === conversationId)!.labels.push(label)
}

describe('hook.chat_label - no-lead label (D-07)', () => {
  it('no-lead on a conversation with an open chat Lead moves the Lead to Dead and closes the registry row', async () => {
    const w = await janWithLead()
    await w.dispatch(w.intakeKey(42))
    addLabel(w, 42)

    const result = await w.dispatch(labelKey(42))

    expect(result).toEqual({ outcome: 'sent' })
    expect(w.leads()).toHaveLength(1)
    expect(w.leads()[0].status).toBe('Dead')
    expect(w.chat.state.leads[0]).toMatchObject({ open: false, closedReason: 'dead' })
  })

  it('the label is matched case-insensitively and the same key again changes nothing', async () => {
    const w = await janWithLead()
    await w.dispatch(w.intakeKey(42))
    addLabel(w, 42, 'No-Lead')
    const key = labelKey(42)
    await w.dispatch(key)
    const writes = w.espoWrites().length

    w.reset(key)
    const again = await w.dispatch(key)

    expect(again).toEqual({ outcome: 'skipped', code: 'lead_not_open' })
    expect(w.espoWrites()).toHaveLength(writes)
    expect(w.leads()[0].status).toBe('Dead')
  })

  it('adopted: a Phase 81 Lead that the chat only took a Note on is never killed', async () => {
    const w = await janWithLead()
    w.espo.state.records.Lead.push({
      id: FORM_LEAD_ID,
      cSupabaseRef: 'inquiry:0b9f2c1e-5d3a-4e8b-9c7d-1a2b3c4d5e6f',
      source: 'Contact form',
      status: 'New',
      emailAddress: 'jan@x.example',
      createdAt: new Date(w.now().getTime() - 3_600_000).toISOString().slice(0, 19).replace('T', ' '),
    })
    await w.dispatch(w.intakeKey(42))
    expect(w.chat.state.conversations.get(42)?.outcome).toBe('lead_adopted')
    addLabel(w, 42)
    const writes = w.espoWrites().length

    const result = await w.dispatch(labelKey(42))

    expect(result).toEqual({ outcome: 'skipped', code: 'no_chat_lead' })
    expect(w.espoWrites()).toHaveLength(writes)
    expect(w.leads().find((l) => l.id === FORM_LEAD_ID)?.status).toBe('New')
  })

  it('a customer conversation (no Lead was ever created) is skipped no_chat_lead', async () => {
    const w = await janWithLead()
    w.identity.seed({ email: 'jan@x.example', bookings: 1, espoContactId: CONTACT_A })
    await w.dispatch(w.intakeKey(42))
    addLabel(w, 42)

    expect(await w.dispatch(labelKey(42))).toEqual({ outcome: 'skipped', code: 'no_chat_lead' })
    expect(w.leads()).toHaveLength(0)
  })

  it('a conversation the registry never saw is skipped no_chat_lead', async () => {
    const w = await janWithLead()
    addLabel(w, 42)

    expect(await w.dispatch(labelKey(42))).toEqual({ outcome: 'skipped', code: 'no_chat_lead' })
    expect(w.espoWrites()).toEqual([])
  })

  it('the label removed before the row ran -> no_label and the Lead stays', async () => {
    const w = await janWithLead()
    await w.dispatch(w.intakeKey(42))
    const writes = w.espoWrites().length

    expect(await w.dispatch(labelKey(42))).toEqual({ outcome: 'skipped', code: 'no_label' })
    expect(w.espoWrites()).toHaveLength(writes)
    expect(w.leads()[0].status).toBe('New')
  })

  it('a Lead the owner already converted -> lead_not_open and the registry row is closed as closed_in_crm', async () => {
    const w = await janWithLead()
    await w.dispatch(w.intakeKey(42))
    w.leads()[0].status = 'Converted'
    addLabel(w, 42)
    const writes = w.espoWrites().length

    expect(await w.dispatch(labelKey(42))).toEqual({ outcome: 'skipped', code: 'lead_not_open' })
    expect(w.espoWrites()).toHaveLength(writes)
    expect(w.leads()[0].status).toBe('Converted')
    expect(w.chat.state.leads[0]).toMatchObject({ open: false, closedReason: 'closed_in_crm' })
  })

  it('a Lead deleted in the CRM -> lead_not_open and the registry row is closed', async () => {
    const w = await janWithLead()
    await w.dispatch(w.intakeKey(42))
    w.espo.state.records.Lead.length = 0
    addLabel(w, 42)

    expect(await w.dispatch(labelKey(42))).toEqual({ outcome: 'skipped', code: 'lead_not_open' })
    expect(w.chat.state.leads[0]).toMatchObject({ open: false, closedReason: 'closed_in_crm' })
  })

  it('a Lead id the registry never stored is found by its ref and killed', async () => {
    const w = await janWithLead()
    await w.dispatch(w.intakeKey(42))
    w.chat.state.leads[0].espoLeadId = null
    addLabel(w, 42)

    expect(await w.dispatch(labelKey(42))).toEqual({ outcome: 'sent' })
    expect(w.leads()[0].status).toBe('Dead')
    expect(w.chat.state.leads[0]).toMatchObject({ open: false, closedReason: 'dead' })
  })

  it('a Lead that is not visible yet is retried, never closed (the intake may be creating it)', async () => {
    const w = await janWithLead()
    await w.dispatch(w.intakeKey(42))
    w.chat.state.leads[0].espoLeadId = null
    w.espo.state.records.Lead.length = 0
    addLabel(w, 42)

    expect(await w.dispatch(labelKey(42))).toEqual({ outcome: 'rescheduled', code: 'lead_pending' })
    expect(w.chat.state.leads[0].open).toBe(true)
  })

  it('missing conversation and hooks off are skipped without a write', async () => {
    const w = await janWithLead()
    expect(await w.dispatch(labelKey(99))).toEqual({ outcome: 'skipped', code: 'conversation_missing' })
    w.setHooksStart(null)
    expect(await w.dispatch(labelKey(42))).toEqual({ outcome: 'skipped', code: 'hooks_off' })
    expect(w.espo.requests).toHaveLength(0)
  })
})

describe('outbox hint', () => {
  it('email_owned_elsewhere has an admin hint pointing at /admin/identities', () => {
    expect(outboxErrorHint('email_owned_elsewhere')).toMatch(/\/admin\/identities/)
  })
})
