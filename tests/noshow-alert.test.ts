// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any -- fake API payloads are intentionally loose */
/**
 * Phase 87, plan 87-06 (D-16 b): the no-show request reaches the operator as a Chatwoot PRIVATE note,
 * delivered by the QStash-invoked dispatcher. Proven end to end against the in-memory fake Chatwoot;
 * no network call, no real credential.
 */
import { describe, it, expect, vi } from 'vitest'
import { dispatchOutboxKey } from '@/lib/lead-sync'
import { noShowAlertKey } from '@/lib/outbox'
import type { NoShowAlertContext, NoShowAlertStore } from '@/lib/noshow-alert'
import { makeWorld, type World } from './helpers/chat-world'

const BOOKING_ID = '3b0f2c1e-5d3a-4e8b-9c7d-1a2b3c4d5e6f'
const REQUESTED_MS = 1_767_268_800_123 // r1767268800
const KEY = noShowAlertKey(BOOKING_ID, REQUESTED_MS)

const CLIENT_NAME = 'Zdenek Novak'
const CLIENT_EMAIL = 'zdenek.novak@example.test'
const CLIENT_PHONE = '+420777123456'

function context(over: Partial<NoShowAlertContext> = {}): NoShowAlertContext {
  return {
    status: 'on_location',
    noShowRequestedAt: new Date(REQUESTED_MS).toISOString(),
    bookingReference: 'PRG-2026-0417',
    pickupDate: '2026-11-05',
    pickupTime: '14:30',
    driverName: 'Karel Dvorak',
    conversationId: 42,
    ...over,
  }
}

function storeOf(ctx: NoShowAlertContext | null): NoShowAlertStore & { load: ReturnType<typeof vi.fn> } {
  return { load: vi.fn(async () => ctx) }
}

/** The fake Chatwoot has no message-create route (only plan 83-06 edits the helper): answer it here. */
function worldWithMessageRoute(opts: { status?: number } = {}): World {
  let nextId = 900
  return makeWorld({
    cw: {
      conversations: [{ id: 42, inbox_id: 1, contact_id: null }],
      intercept: (req, state) => {
        const m = /^\/conversations\/(\d+)\/messages$/.exec(req.path)
        if (req.method !== 'POST' || !m) return undefined
        if (opts.status && opts.status !== 200) {
          return new Response(JSON.stringify({ error: 'boom' }), { status: opts.status })
        }
        const conv = state.conversations.find((c) => c.id === Number(m[1]))
        if (!conv) return new Response('{}', { status: 404 })
        const id = nextId++
        conv.messages.push({
          id,
          content: req.body.content,
          message_type: req.body.message_type === 'outgoing' ? 1 : 0,
          private: req.body.private === true,
          content_attributes: {},
          sender: null,
          created_at: 1,
        })
        return new Response(JSON.stringify({ id }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      },
    },
  })
}

const posts = (w: World) => w.cw.requests.filter((r) => r.method === 'POST')

describe('alert.no_show: tracer (passenger conversation)', () => {
  it('posts exactly one private outgoing note to the passenger conversation', async () => {
    const w = worldWithMessageRoute()
    const store = storeOf(context())

    const res = await w.dispatch(KEY, { noShowAlert: { store, opsConversationId: null } })

    expect(res).toEqual({ outcome: 'sent' })
    expect(store.load).toHaveBeenCalledWith(BOOKING_ID)
    const sent = posts(w)
    expect(sent).toHaveLength(1)
    expect(sent[0].path).toBe('/conversations/42/messages')
    expect(sent[0].body.private).toBe(true)
    expect(sent[0].body.message_type).toBe('outgoing')
    expect(w.outbox.rows.get(KEY)?.status).toBe('sent')
  })

  it('names the booking reference, pickup date and time, the driver and the admin link', async () => {
    const w = worldWithMessageRoute()
    await w.dispatch(KEY, { noShowAlert: { store: storeOf(context()), opsConversationId: null } })

    const content: string = posts(w)[0].body.content
    expect(content).toContain('PRG-2026-0417')
    expect(content).toContain('2026-11-05')
    expect(content).toContain('14:30')
    expect(content).toContain('Karel Dvorak')
    expect(content).toContain('/admin/bookings')
  })

  it('never puts the client name, email, phone or an amount into the note', async () => {
    const w = worldWithMessageRoute()
    // Even if a store implementation leaked client data into the context object, the note is built
    // from the named fields only.
    const leaky = { ...context(), clientName: CLIENT_NAME, clientEmail: CLIENT_EMAIL, clientPhone: CLIENT_PHONE, amountEur: 120 }
    await w.dispatch(KEY, { noShowAlert: { store: storeOf(leaky as NoShowAlertContext), opsConversationId: null } })

    const content: string = posts(w)[0].body.content
    for (const secret of [CLIENT_NAME, 'Zdenek', CLIENT_EMAIL, CLIENT_PHONE, '420777', '120', 'EUR', 'CZK']) {
      expect(content).not.toContain(secret)
    }
    expect(content).not.toMatch(/[€]/)
  })

  it('sends no client-visible message: every post is private', async () => {
    const w = worldWithMessageRoute()
    await w.dispatch(KEY, { noShowAlert: { store: storeOf(context()), opsConversationId: null } })
    expect(posts(w).every((r) => r.body.private === true)).toBe(true)
    expect(w.cw.state.conversations[0].messages.every((m) => m.private)).toBe(true)
  })

  it('Chatwoot not configured: breaker chatwoot_unconfigured, no request', async () => {
    const w = makeWorld({ chatwootConfigured: false })
    const store = storeOf(context())

    const res = await w.dispatch(KEY, { noShowAlert: { store, opsConversationId: null } })

    expect(res).toEqual({ outcome: 'breaker', code: 'chatwoot_unconfigured' })
    expect(w.cw.requests).toHaveLength(0)
    expect(store.load).not.toHaveBeenCalled()
  })

  it('Chatwoot 5xx: rescheduled, and a later run posts once (no duplicate after sent)', async () => {
    const failing = worldWithMessageRoute({ status: 503 })
    const first = await failing.dispatch(KEY, { noShowAlert: { store: storeOf(context()), opsConversationId: null } })
    expect(first.outcome).toBe('rescheduled')
    expect(failing.outbox.rows.get(KEY)?.status).toBe('pending')

    // Healthy retry on a world that answers the route: sent once, a redelivery is already_done.
    const w = worldWithMessageRoute()
    const deps = { noShowAlert: { store: storeOf(context()), opsConversationId: null } }
    expect(await w.dispatch(KEY, deps)).toEqual({ outcome: 'sent' })
    expect(await dispatchOutboxKey(KEY, w.deps(deps))).toEqual({ outcome: 'already_done' })
    expect(posts(w)).toHaveLength(1)
  })
})
