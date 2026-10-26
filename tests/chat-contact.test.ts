// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { incoming, makeWorld, type World, type WorldOptions } from './helpers/chat-world'
import type { FakeChatwootOptions } from './helpers/fake-chatwoot'
import { hookContactKey } from '@/lib/sync-origin'

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
