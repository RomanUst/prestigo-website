// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any -- fake API payloads are intentionally loose */
/**
 * A website contact-form inquiry becomes a conversation in the Chatwoot "Email info@" inbox with one
 * PRIVATE note, delivered by the QStash-invoked dispatcher. Proven against the in-memory fake Chatwoot;
 * no network call, no real credential.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { enqueueMock, afterDispatchMock } = vi.hoisted(() => ({
  enqueueMock: vi.fn(),
  afterDispatchMock: vi.fn(),
}))

vi.mock('@/lib/outbox', async () => {
  const actual = await vi.importActual<typeof import('@/lib/outbox')>('@/lib/outbox')
  return { ...actual, enqueueOutboxEvent: enqueueMock, dispatchAfterResponse: afterDispatchMock }
})

import { dispatchOutboxKey } from '@/lib/lead-sync'
import { contactInquiryChatwootKey, parseOutboxKey } from '@/lib/outbox'
import { OutboxStoreError } from '@/lib/outbox-store'
import {
  CONTACT_INQUIRY_INBOX_NAME,
  buildContactInquiryNote,
  type ContactInquiryRecord,
  type ContactInquiryStore,
} from '@/lib/contact-inquiry-chatwoot'
import { enqueueContactInquiryChatwoot } from '@/lib/contact-inquiry-enqueue'
import { outboxEventLabel } from '@/lib/outbox-labels'
import { makeWorld, type World } from './helpers/chat-world'

const INQUIRY_ID = '1c9e7a52-3f4b-4d6e-8a10-b2c3d4e5f607'
const KEY = contactInquiryChatwootKey(INQUIRY_ID)
const EMAIL_INBOX_ID = 7

const INQUIRY: ContactInquiryRecord = {
  id: INQUIRY_ID,
  name: 'Jane Traveller',
  email: 'jane.traveller@example.com',
  phone: '+1 202 555 0143',
  service: 'Other',
  message: 'Pickup at the hotel at 7:30\nDrop-off in Dresden',
}

function storeOf(record: ContactInquiryRecord | null): ContactInquiryStore & { load: ReturnType<typeof vi.fn> } {
  return { load: vi.fn(async () => record) }
}

/** The fake Chatwoot lacks the inbox list, contact conversations, conversation create and message create. */
function world(opts: { inboxes?: any[]; contacts?: any[] } = {}): World & { attrs: Map<number, any> } {
  const attrs = new Map<number, any>()
  let nextConv = 500
  let nextMsg = 900
  const json = (body: unknown) =>
    new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
  const w = makeWorld({
    cw: {
      contacts: opts.contacts,
      intercept: (req, state) => {
        if (req.method === 'GET' && req.path === '/inboxes') {
          return json({
            payload: opts.inboxes ?? [
              { id: 1, name: 'Website', channel_type: 'Channel::WebWidget' },
              { id: EMAIL_INBOX_ID, name: CONTACT_INQUIRY_INBOX_NAME, channel_type: 'Channel::Email' },
            ],
          })
        }
        const cc = /^\/contacts\/(\d+)\/conversations$/.exec(req.path)
        if (req.method === 'GET' && cc) {
          const list = state.conversations
            .filter((c) => c.contact_id === Number(cc[1]))
            .map((c) => ({ id: c.id, inbox_id: c.inbox_id, additional_attributes: attrs.get(c.id) ?? {} }))
          return json({ payload: list })
        }
        if (req.method === 'POST' && req.path === '/conversations') {
          const id = nextConv++
          state.conversations.push({
            id,
            inbox_id: req.body.inbox_id,
            contact_id: req.body.contact_id,
            status: req.body.status ?? 'open',
            labels: [],
            created_at: 1,
            channel: 'Channel::Email',
            messages: [],
          } as any)
          attrs.set(id, req.body.additional_attributes ?? {})
          return json({ id, inbox_id: req.body.inbox_id })
        }
        const m = /^\/conversations\/(\d+)\/messages$/.exec(req.path)
        if (req.method === 'POST' && m) {
          const conv = state.conversations.find((c) => c.id === Number(m[1]))
          if (!conv) return new Response('{}', { status: 404 })
          const id = nextMsg++
          conv.messages.push({
            id,
            content: req.body.content,
            message_type: req.body.message_type === 'outgoing' ? 1 : 0,
            private: req.body.private === true,
            content_attributes: {},
            sender: null,
            created_at: 1,
          })
          return json({ id })
        }
        return undefined
      },
    },
  })
  return Object.assign(w, { attrs })
}

const posts = (w: World) => w.cw.requests.filter((r) => r.method === 'POST')

beforeEach(() => {
  enqueueMock.mockReset()
  afterDispatchMock.mockReset()
})

describe('alert.contact_inquiry: key and label', () => {
  it('round-trips through the parser', () => {
    expect(KEY).toBe(`alert.contact_inquiry:${INQUIRY_ID}`)
    expect(parseOutboxKey(KEY)).toEqual({ eventType: 'alert.contact_inquiry', aggregateId: INQUIRY_ID, leadStatus: null })
    expect(parseOutboxKey('alert.contact_inquiry:not-a-uuid')).toBeNull()
  })

  it('has an admin label', () => {
    expect(outboxEventLabel('alert.contact_inquiry')).toBe('Contact form to Chatwoot')
  })
})

describe('alert.contact_inquiry: delivery', () => {
  it('creates the contact, a conversation in the email inbox and one private note', async () => {
    const w = world()
    const res = await w.dispatch(KEY, { contactInquiry: { store: storeOf(INQUIRY) } })

    expect(res).toEqual({ outcome: 'sent' })
    const contact = w.cw.state.contacts.find((c) => c.email === INQUIRY.email)
    expect(contact?.name).toBe('Jane Traveller')
    expect(contact?.phone_number).toBe('+12025550143')

    const conv = w.cw.state.conversations.find((c) => c.inbox_id === EMAIL_INBOX_ID)
    expect(conv?.contact_id).toBe(contact?.id)
    expect(w.attrs.get(conv!.id)).toEqual({ site_inquiry_id: INQUIRY_ID, mail_subject: 'Your enquiry to Prestigo' })

    const create = posts(w).find((r) => r.path === '/conversations')!
    expect(create.body.message).toBeUndefined()
    expect(create.body.source_id).toBe(INQUIRY.email)

    expect(conv!.messages).toHaveLength(1)
    expect(conv!.messages[0].private).toBe(true)
    expect(conv!.messages[0].content).toBe(buildContactInquiryNote(INQUIRY))
    expect(w.outbox.rows.get(KEY)?.status).toBe('sent')
  })

  it('every message post is private: nothing reaches the client', async () => {
    const w = world()
    await w.dispatch(KEY, { contactInquiry: { store: storeOf(INQUIRY) } })
    const messagePosts = posts(w).filter((r) => r.path.endsWith('/messages'))
    expect(messagePosts.length).toBeGreaterThan(0)
    expect(messagePosts.every((r) => r.body.private === true)).toBe(true)
  })

  it('reuses an existing contact found by email (case-insensitive)', async () => {
    const w = world({ contacts: [{ id: 55, name: 'J. Traveller', email: 'Jane.Traveller@Example.com' }] })
    await w.dispatch(KEY, { contactInquiry: { store: storeOf(INQUIRY) } })
    expect(posts(w).some((r) => r.path === '/contacts')).toBe(false)
    expect(w.cw.state.conversations.find((c) => c.inbox_id === EMAIL_INBOX_ID)?.contact_id).toBe(55)
  })

  it('leaves a phone Chatwoot would reject off the new contact', async () => {
    const w = world()
    await w.dispatch(KEY, { contactInquiry: { store: storeOf({ ...INQUIRY, phone: 'call me' }) } })
    const create = posts(w).find((r) => r.path === '/contacts')!
    expect(create.body.phone_number).toBeUndefined()
  })

  it('note lists the form fields, with dashes for missing ones', () => {
    const note = buildContactInquiryNote({ ...INQUIRY, phone: null, service: null })
    expect(note).toContain('Name: Jane Traveller')
    expect(note).toContain(`Email: ${INQUIRY.email}`)
    expect(note).toContain('Phone: —')
    expect(note).toContain('Service: —')
    expect(note).toContain('Message:\nPickup at the hotel at 7:30\nDrop-off in Dresden')
  })
})

describe('alert.contact_inquiry: retries', () => {
  it('a retry after the conversation exists reuses it and does not post the note twice', async () => {
    const w = world()
    const deps = { contactInquiry: { store: storeOf(INQUIRY) } }
    await w.dispatch(KEY, deps)
    // Simulate a lost completion: the row is due again.
    w.outbox.rows.get(KEY)!.status = 'pending'
    const again = await dispatchOutboxKey(KEY, w.deps(deps))
    expect(['already_done', 'sent']).toContain(again.outcome)
    expect(w.cw.state.conversations.filter((c) => c.inbox_id === EMAIL_INBOX_ID)).toHaveLength(1)
    expect(posts(w).filter((r) => r.path === '/conversations')).toHaveLength(1)
    expect(posts(w).filter((r) => r.path.endsWith('/messages'))).toHaveLength(1)
  })

  it('a conversation without the note (crash between create and note) gets the note', async () => {
    const w = world()
    const store = storeOf(INQUIRY)
    // First run fails on the note post.
    let failNote = true
    const res1 = await w.dispatch(KEY, {
      contactInquiry: { store },
      chatwoot: {
        ...w.deps().chatwoot!,
        post: async (path: string, body: unknown) => {
          if (failNote && path.endsWith('/messages')) {
            failNote = false
            throw new Error('boom')
          }
          return w.deps().chatwoot!.post(path, body)
        },
      },
    })
    expect(res1.outcome).not.toBe('sent')
    w.outbox.rows.get(KEY)!.status = 'pending'
    w.outbox.rows.get(KEY)!.available_at = new Date(0).toISOString()
    const res2 = await dispatchOutboxKey(KEY, w.deps({ contactInquiry: { store } }))
    expect(res2).toEqual({ outcome: 'sent' })
    const conv = w.cw.state.conversations.filter((c) => c.inbox_id === EMAIL_INBOX_ID)
    expect(conv).toHaveLength(1)
    expect(conv[0].messages.filter((m) => m.private)).toHaveLength(1)
  })
})

describe('alert.contact_inquiry: gates and skips', () => {
  it('Chatwoot not configured: breaker, no request, no read', async () => {
    const w = makeWorld({ chatwootConfigured: false })
    const store = storeOf(INQUIRY)
    const res = await w.dispatch(KEY, { contactInquiry: { store } })
    expect(res).toEqual({ outcome: 'breaker', code: 'chatwoot_unconfigured' })
    expect(w.cw.requests).toHaveLength(0)
    expect(store.load).not.toHaveBeenCalled()
  })

  it('inquiry gone (erased or not a contact inquiry): skipped, no request', async () => {
    const w = world()
    const res = await w.dispatch(KEY, { contactInquiry: { store: storeOf(null) } })
    expect(res).toEqual({ outcome: 'skipped', code: 'inquiry_gone' })
    expect(w.cw.requests).toHaveLength(0)
  })

  it('no "Email info@" inbox: skipped no_inbox, nothing created', async () => {
    const w = world({ inboxes: [{ id: 1, name: 'Website', channel_type: 'Channel::WebWidget' }] })
    const res = await w.dispatch(KEY, { contactInquiry: { store: storeOf(INQUIRY) } })
    expect(res).toEqual({ outcome: 'skipped', code: 'no_inbox' })
    expect(posts(w)).toHaveLength(0)
  })

  it('a database error is retried, not skipped', async () => {
    const w = world()
    const store: ContactInquiryStore = {
      load: vi.fn(async () => {
        throw new OutboxStoreError('db_error')
      }),
    }
    const res = await w.dispatch(KEY, { contactInquiry: { store } })
    expect(['rescheduled', 'deferred', 'failed']).toContain(res.outcome)
    expect(w.cw.requests.filter((r) => r.method === 'POST')).toHaveLength(0)
  })
})

describe('enqueueContactInquiryChatwoot (request path)', () => {
  it('writes one ids-only row and arms the dispatcher', async () => {
    enqueueMock.mockResolvedValue(true)
    await enqueueContactInquiryChatwoot(INQUIRY_ID)
    expect(enqueueMock).toHaveBeenCalledWith({
      eventType: 'alert.contact_inquiry',
      aggregateType: 'inquiry',
      aggregateId: INQUIRY_ID,
      idempotencyKey: KEY,
    })
    expect(afterDispatchMock).toHaveBeenCalledWith(KEY)
  })

  it('a duplicate row is not re-armed; a failure never throws', async () => {
    enqueueMock.mockResolvedValue(false)
    await enqueueContactInquiryChatwoot(INQUIRY_ID)
    expect(afterDispatchMock).not.toHaveBeenCalled()
    enqueueMock.mockRejectedValue(new Error('down'))
    await expect(enqueueContactInquiryChatwoot(INQUIRY_ID)).resolves.toBeUndefined()
  })
})
