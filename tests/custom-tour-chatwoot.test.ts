// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any -- fake API payloads are intentionally loose */
/**
 * Phase 93, plan 93-30 (D-18, D-19, T-93-68, T-93-69): a custom-tour request reaches the operators as a
 * Chatwoot PRIVATE note holding the admin link only, delivered by the QStash-invoked dispatcher.
 * Proven end to end against the in-memory fake Chatwoot; no network call, no real credential.
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
import { customTourAlertKey } from '@/lib/outbox'
import { OutboxStoreError } from '@/lib/outbox-store'
import * as alertModule from '@/lib/custom-tour-alert'
import { buildCustomTourNote, type CustomTourAlertStore } from '@/lib/custom-tour-alert'
import { enqueueCustomTourAlert } from '@/lib/custom-tour-enqueue'
import { outboxEventLabel } from '@/lib/outbox-labels'
import { makeWorld, type World } from './helpers/chat-world'

const INQUIRY_ID = '3b0f2c1e-5d3a-4e8b-9c7d-1a2b3c4d5e6f'
const KEY = customTourAlertKey(INQUIRY_ID)
const SITE = 'https://rideprestigo.com'

function storeOf(exists: boolean): CustomTourAlertStore & { exists: ReturnType<typeof vi.fn> } {
  return { exists: vi.fn(async () => exists) }
}

/** The fake Chatwoot has no message-create route: answer it here. */
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

beforeEach(() => {
  enqueueMock.mockReset()
  afterDispatchMock.mockReset()
  delete process.env.NEXT_PUBLIC_SITE_URL
})

describe('alert.custom_tour: tracer (ops conversation)', () => {
  it('posts exactly one private outgoing note to the ops conversation', async () => {
    const w = worldWithMessageRoute()
    const store = storeOf(true)

    const res = await w.dispatch(KEY, { customTourAlert: { store, opsConversationId: 42 } })

    expect(res).toEqual({ outcome: 'sent' })
    expect(store.exists).toHaveBeenCalledWith(INQUIRY_ID)
    const sent = posts(w)
    expect(sent).toHaveLength(1)
    expect(sent[0].path).toBe('/conversations/42/messages')
    expect(sent[0].body.private).toBe(true)
    expect(sent[0].body.message_type).toBe('outgoing')
    expect(w.outbox.rows.get(KEY)?.status).toBe('sent')
  })

  it('reads "New custom-tour request: <site>/admin/custom-tours/<id>" and nothing else', async () => {
    const w = worldWithMessageRoute()
    await w.dispatch(KEY, { customTourAlert: { store: storeOf(true), opsConversationId: 42 } })

    expect(posts(w)[0].body.content).toBe(`New custom-tour request: ${SITE}/admin/custom-tours/${INQUIRY_ID}`)
  })

  it('carries no email, phone or currency (ids only)', () => {
    const content = buildCustomTourNote(INQUIRY_ID)
    expect(content).not.toContain('@')
    expect(content).not.toMatch(/[€]/)
    // The only digits come from the uuid (groups of at most 12): no phone-like run, nothing outside the id.
    expect(content.replace(INQUIRY_ID, '')).not.toMatch(/\d/)
    expect(INQUIRY_ID.split('-').every((part) => part.length <= 12)).toBe(true)
  })

  it('uses NEXT_PUBLIC_SITE_URL when set, without a trailing slash', () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://staging.example.test/'
    expect(buildCustomTourNote(INQUIRY_ID)).toBe(
      `New custom-tour request: https://staging.example.test/admin/custom-tours/${INQUIRY_ID}`,
    )
  })

  it('sends no client-visible message: every post is private', async () => {
    const w = worldWithMessageRoute()
    await w.dispatch(KEY, { customTourAlert: { store: storeOf(true), opsConversationId: 42 } })
    expect(posts(w).every((r) => r.body.private === true)).toBe(true)
    expect(w.cw.state.conversations[0].messages.every((m) => m.private)).toBe(true)
  })

  it('a redelivery after sent is already_done: one post only', async () => {
    const w = worldWithMessageRoute()
    const deps = { customTourAlert: { store: storeOf(true), opsConversationId: 42 } }
    expect(await w.dispatch(KEY, deps)).toEqual({ outcome: 'sent' })
    expect(await dispatchOutboxKey(KEY, w.deps(deps))).toEqual({ outcome: 'already_done' })
    expect(posts(w)).toHaveLength(1)
  })
})

describe('alert.custom_tour: gates and skips', () => {
  it('Chatwoot not configured: breaker chatwoot_unconfigured, no request, no read', async () => {
    const w = makeWorld({ chatwootConfigured: false })
    const store = storeOf(true)

    const res = await w.dispatch(KEY, { customTourAlert: { store, opsConversationId: 42 } })

    expect(res).toEqual({ outcome: 'breaker', code: 'chatwoot_unconfigured' })
    expect(w.cw.requests).toHaveLength(0)
    expect(store.exists).not.toHaveBeenCalled()
  })

  it('no ops conversation id: skipped no_conversation, zero requests', async () => {
    const w = worldWithMessageRoute()
    const res = await w.dispatch(KEY, { customTourAlert: { store: storeOf(true), opsConversationId: null } })

    expect(res).toEqual({ outcome: 'skipped', code: 'no_conversation' })
    expect(w.cw.requests).toHaveLength(0)
    expect(w.outbox.rows.get(KEY)?.status).toBe('skipped')
  })

  it('erased or missing inquiry: skipped inquiry_gone, zero requests', async () => {
    const w = worldWithMessageRoute()
    const res = await w.dispatch(KEY, { customTourAlert: { store: storeOf(false), opsConversationId: 42 } })

    expect(res).toEqual({ outcome: 'skipped', code: 'inquiry_gone' })
    expect(w.cw.requests).toHaveLength(0)
  })
})

describe('alert.custom_tour: retry and terminal failures (same as the no-show alert)', () => {
  it('Chatwoot 500: rescheduled with backoff, row stays pending', async () => {
    const w = worldWithMessageRoute({ status: 500 })
    const res = await w.dispatch(KEY, { customTourAlert: { store: storeOf(true), opsConversationId: 42 } })

    expect(res.outcome).toBe('rescheduled')
    expect(w.outbox.rows.get(KEY)?.status).toBe('pending')
  })

  it('ops conversation 404: terminal failed with a code, not retried', async () => {
    const w = worldWithMessageRoute()
    const res = await w.dispatch(KEY, { customTourAlert: { store: storeOf(true), opsConversationId: 999 } })

    expect(res.outcome).toBe('failed')
    expect(res.code).toBeTruthy()
    expect(w.outbox.rows.get(KEY)?.status).toBe('failed')
  })

  it('a database error reading the inquiry is retried, not lost', async () => {
    const w = worldWithMessageRoute()
    const store = {
      exists: vi.fn(async () => {
        throw new OutboxStoreError('db_error')
      }),
    }
    const res = await w.dispatch(KEY, { customTourAlert: { store, opsConversationId: 42 } })

    expect(res.outcome).toBe('rescheduled')
    expect(w.cw.requests).toHaveLength(0)
  })
})

describe('enqueueCustomTourAlert', () => {
  it('is also exported from lib/custom-tour-alert.ts (same function)', () => {
    expect(alertModule.enqueueCustomTourAlert).toBe(enqueueCustomTourAlert)
  })

  it('enqueues the keyed row and arms the dispatcher when queued', async () => {
    enqueueMock.mockResolvedValue(true)
    await enqueueCustomTourAlert(INQUIRY_ID)

    expect(enqueueMock).toHaveBeenCalledWith({
      eventType: 'alert.custom_tour',
      aggregateType: 'inquiry',
      aggregateId: INQUIRY_ID,
      idempotencyKey: KEY,
    })
    expect(afterDispatchMock).toHaveBeenCalledWith(KEY)
  })

  it('does not arm the dispatcher when the key already exists', async () => {
    enqueueMock.mockResolvedValue(false)
    await enqueueCustomTourAlert(INQUIRY_ID)
    expect(afterDispatchMock).not.toHaveBeenCalled()
  })

  it('swallows an enqueue error and logs the id only', async () => {
    enqueueMock.mockRejectedValue(new Error('rpc down for visitor@example.test'))
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(enqueueCustomTourAlert(INQUIRY_ID)).resolves.toBeUndefined()

    const logged = JSON.stringify(err.mock.calls)
    expect(logged).toContain(INQUIRY_ID)
    expect(logged).not.toContain('visitor@example.test')
    err.mockRestore()
  })
})

describe('outbox label', () => {
  it('names the event type for the Outbox admin page', () => {
    expect(outboxEventLabel('alert.custom_tour')).toBe('Custom tour alert')
  })
})
