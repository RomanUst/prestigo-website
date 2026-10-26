// @vitest-environment node
import { describe, it, expect } from 'vitest'
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
