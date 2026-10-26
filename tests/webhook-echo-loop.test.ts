// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any -- the harness plays loose upstream payloads */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  incoming,
  makeWorld,
  signChatwoot,
  signEspo,
  type World,
  type WorldOptions,
} from './helpers/chat-world'
import { FAKE_AGENT_TOKEN, type FakeChatwootState } from './helpers/fake-chatwoot'
import type { FakeEspoState } from './helpers/fake-espocrm'
import { createSiteEspoClient } from '@/lib/espocrm-client'
import { dispatchOutboxKey } from '@/lib/lead-sync'
import { syncBucketKey } from '@/lib/outbox'
import type { IngestOutcome } from '@/lib/webhook-store'

/**
 * Phase 83, plan 83-12 (HOOK-04, success criterion 4): echo-loop simulation.
 *
 * The REAL Chatwoot and EspoCRM receiver routes, the REAL dispatcher and every REAL hook.* / sync.*
 * handler run against fake Chatwoot and EspoCRM instances that emit correctly signed webhooks on every
 * write:
 *   - Chatwoot: a contact_updated for every contact create / update, whoever the writer is (no actor);
 *   - EspoCRM: a signed Contact batch for every write except the ones by the webhook owner
 *     `prestigo-sync` (skipOwn); the forced-loop scenario emits for every writer.
 * Each scenario runs to quiescence (no queued webhook, no pending outbox row) and asserts a small,
 * fixed number of upstream writes. Nothing in lib/ or app/ is changed or switched off for the test; the
 * only things replaced are the two persistence seams (the webhook ingest store and the outbox publish
 * call), exactly as the route tests do.
 *
 * Synthetic fixtures only (example domains, fake names, obviously fake secrets).
 */

const h = vi.hoisted(() => ({
  store: { current: null as unknown },
  published: [] as string[],
}))

vi.mock('next/server', async () => {
  const actual = await vi.importActual<typeof import('next/server')>('next/server')
  return {
    ...actual,
    // Run the after() callback right away.
    after: (fn: () => unknown) => {
      void fn()
    },
  }
})
vi.mock('@/lib/supabase', () => ({ createSupabaseServiceClient: vi.fn() }))
vi.mock('@/lib/webhook-store', async () => {
  const actual = await vi.importActual<typeof import('@/lib/webhook-store')>('@/lib/webhook-store')
  return { ...actual, createWebhookStore: () => h.store.current }
})
vi.mock('@/lib/outbox', async () => {
  const actual = await vi.importActual<typeof import('@/lib/outbox')>('@/lib/outbox')
  return {
    ...actual,
    // The publish seam: remember which keys the receivers published (the runner dispatches by outbox state).
    publishAfterResponse: (key: string) => {
      h.published.push(key)
    },
  }
})

import { POST as chatwootPost } from '@/app/api/webhooks/chatwoot/route'
import { POST as espoPost } from '@/app/api/webhooks/espocrm/route'

const CW_SECRET = 'unit-test-chatwoot-secret'
const ESPO_SECRET = 'unit-test-espo-secret'
const ESPO_WEBHOOK_ID = '5f0c1c2e11114222a'
const SYNC_KEY = 'key_SECRET_abcdef0123'
const OPERATOR_KEY = 'key_OPERATOR_0123456789'
const CONTACT = '0123456789abcdef0'
const TICK_MS = 31_000

interface Queued {
  source: 'chatwoot' | 'espocrm'
  body: unknown
  deliveryId: string
}

interface ContactSnap {
  name: string | null
  email: string | null
  phone_number: string | null
  identifier: string | null
}

const snap = (c: { name: string; email: string | null; phone_number: string | null; identifier: string | null }): ContactSnap => ({
  name: c.name,
  email: c.email,
  phone_number: c.phone_number,
  identifier: c.identifier,
})

/** Everything one scenario needs: the world, the emitters, the queues and the runner. */
function harness(options: { worldOptions?: WorldOptions; emitForEveryWriter?: boolean; tickMs?: number } = {}) {
  const queue: Queued[] = []
  const ingestOutcomes: IngestOutcome[] = []
  const logs: string[] = []
  const errors: string[] = []
  const espoWriters: Array<{ writer: string; method: string; path: string }> = []
  const prev = new Map<number, ContactSnap>()
  let counter = 0
  const tickMs = options.tickMs ?? TICK_MS

  const nextDeliveryId = (prefix: string) => `${prefix}-${String(++counter).padStart(6, '0')}`

  // ── Chatwoot emitter ──────────────────────────────────────────────────────
  function emitContact(state: FakeChatwootState, id: number): void {
    const c = state.contacts.find((x) => x.id === id)
    if (!c) return
    const before = prev.get(id) ?? { name: null, email: null, phone_number: null, identifier: null }
    const after = snap(c)
    const changed: Array<Record<string, unknown>> = []
    for (const key of Object.keys(after) as Array<keyof ContactSnap>) {
      if (after[key] !== before[key]) changed.push({ [key]: { previous_value: before[key], current_value: after[key] } })
    }
    prev.set(id, after)
    queue.push({
      source: 'chatwoot',
      deliveryId: nextDeliveryId('cwd'),
      body: {
        event: 'contact_updated',
        id: c.id,
        name: c.name,
        email: c.email,
        phone_number: c.phone_number,
        identifier: c.identifier,
        custom_attributes: c.custom_attributes,
        additional_attributes: c.additional_attributes,
        changed_attributes: changed,
      },
    })
  }

  const onWrite = (req: { method: string; path: string }, state: FakeChatwootState) => {
    const id = req.method === 'POST' ? state.contacts[state.contacts.length - 1].id : Number(/^\/contacts\/(\d+)$/.exec(req.path)![1])
    emitContact(state, id)
  }

  // The fake authenticates API keys through this map: the site's sync user and one human operator.
  const espoUsers: Record<string, string> = { [SYNC_KEY]: 'prestigo-sync', [OPERATOR_KEY]: 'operator' }
  const w: World = makeWorld({
    ...options.worldOptions,
    cw: { ...options.worldOptions?.cw, onWrite },
    espo: { ...options.worldOptions?.espo, apiKeys: espoUsers },
  })
  expect(w.config.apiKey).toBe(SYNC_KEY)

  // ── EspoCRM emitter (a fetch wrapper around the fake) ─────────────────────
  const espoFetch = async (url: string | URL, init: any = {}): Promise<Response> => {
    const res = await w.espo.fetchImpl(url, init)
    const method = String(init.method ?? 'GET').toUpperCase()
    const apiPath = new URL(String(url)).pathname.replace(/^\/api\/v1/, '')
    const m = /^\/Contact(?:\/([0-9a-f]{17}))?$/.exec(apiPath)
    if ((method === 'PUT' || method === 'POST') && m && res.ok) {
      const headers: Record<string, string> = {}
      for (const [k, v] of Object.entries(init.headers ?? {})) headers[k.toLowerCase()] = String(v)
      const writer = espoUsers[headers['x-api-key']] ?? 'unknown'
      espoWriters.push({ writer, method, path: apiPath })
      const body = JSON.parse(String(init.body ?? '{}'))
      const id = m[1] ?? ((await res.clone().json()) as { id: string }).id
      // skipOwn: EspoCRM does not deliver an event to the webhook owner for its own writes.
      if (writer !== 'prestigo-sync' || options.emitForEveryWriter) {
        queue.push({ source: 'espocrm', deliveryId: nextDeliveryId('esd'), body: [{ id, ...body }] })
      }
    }
    return res
  }
  const crm = createSiteEspoClient({ config: w.config, fetchImpl: espoFetch as unknown as typeof fetch, timeoutMs: 500 })
  const deps = () => w.deps({ crm })

  // The webhook ingest double, observed.
  const store = {
    ...w.webhook.store,
    ingest: async (input: Parameters<typeof w.webhook.store.ingest>[0]) => {
      const outcome = await w.webhook.store.ingest(input)
      ingestOutcomes.push(outcome)
      return outcome
    },
  }
  h.store.current = store

  const logSpy = vi.spyOn(console, 'log').mockImplementation((line: unknown) => {
    logs.push(String(line))
  })
  const errSpy = vi.spyOn(console, 'error').mockImplementation((line: unknown) => {
    errors.push(String(line))
  })
  void logSpy
  void errSpy

  function syncClock(): void {
    vi.setSystemTime(w.now())
  }

  function track(): void {
    for (const c of w.cw.state.contacts) prev.set(c.id, snap(c))
  }

  /** A human edit in EspoCRM: a PUT through the emitting wrapper with the operator's key. */
  async function operatorEspoPut(id: string, body: Record<string, unknown>): Promise<void> {
    const res = await espoFetch(`${w.config.baseUrl}/api/v1/Contact/${id}`, {
      method: 'PUT',
      headers: { 'X-Api-Key': OPERATOR_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    expect(res.status).toBe(200)
  }

  /** A human edit in the Chatwoot sidebar: the fake emits contact_updated, with no actor. */
  async function operatorChatwootPut(id: number, body: Record<string, unknown>): Promise<void> {
    const res = await w.cw.fetchImpl(`${w.chatwootConfig.baseUrl}/api/v1/accounts/${w.chatwootConfig.accountId}/contacts/${id}`, {
      method: 'PUT',
      redirect: 'error',
      headers: { 'api-access-token': FAKE_AGENT_TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    expect(res.status).toBe(200)
  }

  /** Signed Chatwoot webhooks that Chatwoot itself would send for conversation activity. */
  function chatwootEvent(body: unknown): void {
    queue.push({ source: 'chatwoot', deliveryId: nextDeliveryId('cwd'), body })
  }

  const statuses: number[] = []

  async function deliver(item: Queued): Promise<void> {
    const raw = JSON.stringify(item.body)
    const nowSec = Math.floor(Date.now() / 1000)
    let res: Response
    if (item.source === 'chatwoot') {
      res = await chatwootPost(
        new Request('http://localhost/api/webhooks/chatwoot', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...signChatwoot(raw, CW_SECRET, { timestampSec: nowSec, deliveryId: item.deliveryId }),
          },
          body: raw,
        }),
      )
    } else {
      res = await espoPost(
        new Request('http://localhost/api/webhooks/espocrm', {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...signEspo(raw, ESPO_SECRET, ESPO_WEBHOOK_ID) },
          body: raw,
        }),
      )
    }
    statuses.push(res.status)
  }

  const isOpen = (status: string) => status === 'pending' || status === 'processing'

  /** Hook for the pathological upstream: called after every delivered Chatwoot contact event. */
  let afterDelivery: ((item: Queued) => void) | null = null

  /**
   * Deliver queued webhooks, dispatch every due outbox row, advance the clock; repeat until both queues
   * are empty (or `maxIterations`). Returns the number of iterations used.
   */
  async function run(maxIterations = 200): Promise<number> {
    for (let i = 1; i <= maxIterations; i++) {
      syncClock()
      while (queue.length > 0) {
        const item = queue.shift()!
        await deliver(item)
        afterDelivery?.(item)
      }
      const nowMs = w.now().getTime()
      for (const row of [...w.outbox.rows.values()]) {
        if (row.status === 'pending' && Date.parse(row.available_at) <= nowMs) {
          await dispatchOutboxKey(row.idempotency_key, deps())
        }
      }
      const open = [...w.outbox.rows.values()].some((r) => isOpen(r.status))
      if (queue.length === 0 && !open) return i
      w.advance(tickMs)
    }
    return maxIterations
  }

  const rows = () => [...w.outbox.rows.values()]
  const rowsOf = (prefix: string) => rows().filter((r) => r.event_type === prefix)

  return {
    w,
    queue,
    logs,
    errors,
    statuses,
    ingestOutcomes,
    espoWriters,
    crm,
    deps,
    track,
    emitContact: (id: number) => emitContact(w.cw.state, id),
    operatorEspoPut,
    operatorChatwootPut,
    chatwootEvent,
    setAfterDelivery: (fn: (item: Queued) => void) => {
      afterDelivery = fn
    },
    run,
    rows,
    rowsOf,
    pending: () => rows().filter((r) => isOpen(r.status)),
    echoLogs: () => logs.filter((l) => l.includes('source=chatwoot event=contact_updated outcome=ignored code=echo')),
    cwContactWrites: () => w.cw.writes().filter((r) => r.path.startsWith('/contacts')),
    espoState: (): FakeEspoState => w.espo.state,
  }
}

type Harness = ReturnType<typeof harness>

/** Jan: one identity linked to EspoCRM Contact CONTACT and Chatwoot contact 7. */
function makeLinkedWorld(extra: { emitForEveryWriter?: boolean; tickMs?: number } = {}): { x: Harness; identityId: string } {
  const x = harness({
    ...extra,
    worldOptions: {
      espo: { records: { Contact: [{ id: CONTACT, firstName: 'Jan', lastName: 'Novak', emailAddress: 'jan@x.example' }] } },
      cw: { contacts: [{ id: 7, name: 'Jan Novak', email: 'jan@x.example' } as never] },
    },
  })
  x.track()
  const identityId = x.w.identity.seed({ email: 'jan@x.example', espoContactId: CONTACT, chatwootContactId: 7 })
  return { x, identityId }
}

beforeEach(() => {
  vi.stubEnv('CHATWOOT_WEBHOOK_SECRET', CW_SECRET)
  vi.stubEnv('CHATWOOT_WEBHOOK_SECRET_PREVIOUS', '')
  vi.stubEnv('ESPOCRM_WEBHOOK_SECRET', ESPO_SECRET)
  vi.stubEnv('ESPOCRM_WEBHOOK_SECRET_PREVIOUS', '')
  vi.stubEnv('ESPOCRM_WEBHOOK_ID', '')
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://example.test')
  h.published.length = 0
  vi.useFakeTimers({ toFake: ['Date'] })
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('webhook echo loop: tracer (operator EspoCRM edit)', () => {
  it('operator EspoCRM edit: one batch, one fingerprinted Chatwoot write, its echo dropped, then quiet', async () => {
    const { x, identityId } = makeLinkedWorld()
    vi.setSystemTime(x.w.now())

    await x.operatorEspoPut(CONTACT, { lastName: 'Novák' })
    // The one human edit produced exactly one signed batch.
    expect(x.queue.filter((q) => q.source === 'espocrm')).toHaveLength(1)

    const iterations = await x.run()

    expect(iterations).toBeLessThan(10)
    expect(x.statuses.every((s) => s === 200)).toBe(true)

    // One hook.espo_contact row for this person, finished.
    const hooks = x.rows().filter((r) => r.event_type.startsWith('hook.'))
    expect(hooks.map((r) => r.event_type)).toEqual(['hook.espo_contact'])
    expect(hooks[0].aggregate_id).toBe(identityId)
    expect(hooks[0].status).toBe('sent')

    // One Chatwoot write, carrying the fingerprint; its echo reached the receiver and was dropped.
    const puts = x.cwContactWrites()
    expect(puts).toHaveLength(1)
    expect(puts[0]).toMatchObject({ method: 'PUT', path: '/contacts/7' })
    expect((puts[0].body as any).name).toBe('Jan Novák')
    expect((puts[0].body as any).custom_attributes.site_sync_fp).toEqual(expect.any(String))
    expect(x.echoLogs()).toHaveLength(1)
    expect(x.rowsOf('hook.chat_contact')).toHaveLength(0)
    expect(x.w.webhook.deliveries.filter((d) => d.source === 'chatwoot')).toHaveLength(0)

    // Nothing left, and no EspoCRM write by the site (it only read).
    expect(x.pending()).toHaveLength(0)
    expect(x.queue).toHaveLength(0)
    expect(x.w.espoWrites()).toHaveLength(1) // the operator's own PUT
    expect(x.espoWriters).toEqual([{ writer: 'operator', method: 'PUT', path: `/Contact/${CONTACT}` }])
  })
})

describe('webhook echo loop: the other directions', () => {
  it('site-origin: sync.chatwoot and sync.espo writes echo into nothing and create no hook row', async () => {
    const x = harness()
      vi.setSystemTime(x.w.now())

    const identityId = x.w.identity.seed({ email: 'jan@x.example', userId: '11111111-1111-4111-8111-111111111111' })
    for (const kind of ['sync.chatwoot', 'sync.espo'] as const) {
      const { key, availableAt } = syncBucketKey(kind, identityId, x.w.now().getTime())
      expect(x.w.outbox.enqueue({ key, availableAt })).toBe(true)
    }

    const iterations = await x.run()
    expect(iterations).toBeLessThan(10)

    // Phase 82 path: the Chatwoot contact exists, the EspoCRM Contact exists, both linked.
    expect(x.w.cw.state.contacts).toHaveLength(1)
    expect(x.w.contacts()).toHaveLength(1)
    expect(x.w.identity.byId(identityId)?.chatwootContactId).toBe(x.w.cw.state.contacts[0].id)
    expect(x.w.identity.byId(identityId)?.espoContactId).toBe(x.w.contacts()[0].id)

    // Every Chatwoot write produced a contact_updated; every one of them was dropped by the fingerprint.
    const cwWrites = x.cwContactWrites()
    // The create, then the refresh that carries the CRM link once sync.espo has stored the Contact id.
    expect(cwWrites.map((r) => `${r.method} ${r.path}`)).toEqual(['POST /contacts', 'PUT /contacts/1'])
    expect(x.echoLogs()).toHaveLength(cwWrites.length)
    expect(x.w.webhook.deliveries).toHaveLength(0)

    // EspoCRM writes were all by the sync user: no event, no batch.
    expect(x.espoWriters).toEqual([{ writer: 'prestigo-sync', method: 'POST', path: '/Contact' }])
    expect(x.rows().filter((r) => r.event_type.startsWith('hook.'))).toHaveLength(0)
    expect(h.published).toHaveLength(0)
    expect(x.pending()).toHaveLength(0)
  })

  it('operator Chatwoot edit (phone added): one hook.chat_contact row, an EspoCRM fill-empty by the sync user, no Chatwoot write', async () => {
    const { x, identityId } = makeLinkedWorld()
    vi.setSystemTime(x.w.now())

    await x.operatorChatwootPut(7, { phone_number: '+420777123456' })
    expect(x.queue).toHaveLength(1)

    const iterations = await x.run()
    expect(iterations).toBeLessThan(10)
    expect(x.statuses.every((s) => s === 200)).toBe(true)

    const hooks = x.rows().filter((r) => r.event_type.startsWith('hook.'))
    expect(hooks.map((r) => r.event_type)).toEqual(['hook.chat_contact'])
    expect(hooks[0].status).toBe('sent')

    // The Contact gained the phone, written by prestigo-sync (so EspoCRM sent nothing back).
    expect(x.w.contacts()[0].phoneNumber).toBe('+420777123456')
    expect(x.espoWriters).toEqual([{ writer: 'prestigo-sync', method: 'PUT', path: `/Contact/${CONTACT}` }])
    expect(x.rowsOf('hook.espo_contact')).toHaveLength(0)

    // Chatwoot saw the operator's write only.
    expect(x.cwContactWrites()).toHaveLength(1)
    expect(x.w.identity.byId(identityId)?.phones.has('+420777123456')).toBe(true)
    expect(x.pending()).toHaveLength(0)
    expect(x.queue).toHaveLength(0)
  })

  it('chat lifecycle: incoming message -> intake -> resolve gives one Lead, one Contact, one Note and no echo rows', async () => {
    const x = harness({ worldOptions: { cw: { contacts: [{ id: 7, name: 'Jan Novák', email: 'jan@x.example' } as never] } } })
      x.track()
    vi.setSystemTime(x.w.now())
    x.w.cw.seedConversation({
      id: 42,
      inbox_id: 1,
      contact_id: 7,
      labels: ['ch-web'],
      created_at: x.w.secs(-600),
      messages: [incoming('Need a car to Vienna on Friday')],
    })

    x.chatwootEvent({ event: 'message_created', message_type: 'incoming', private: false, conversation: { id: 42 } })
    await x.run()
    expect(x.w.leads()).toHaveLength(1)
    expect(x.w.contacts()).toHaveLength(1)

    x.w.cw.state.conversations[0].status = 'resolved'
    x.chatwootEvent({ event: 'conversation_status_changed', id: 42, status: 'resolved', updated_at: x.w.secs(0) })
    const iterations = await x.run()
    expect(iterations).toBeLessThan(10)

    expect(x.w.leads()).toHaveLength(1)
    expect(x.w.contacts()).toHaveLength(1)
    expect(x.w.notes().filter((n) => typeof n.post === 'string' && /resolved\n/.test(n.post as string))).toHaveLength(1)
    expect(x.rows().map((r) => r.event_type).sort()).toEqual(['hook.chat_intake', 'hook.chat_resolve'])
    expect(x.rowsOf('hook.chat_contact')).toHaveLength(0)
    expect(x.rowsOf('hook.espo_contact')).toHaveLength(0)
    // The chat path wrote nothing back into Chatwoot, and every EspoCRM write was the sync user's.
    expect(x.w.cw.writes()).toEqual([])
    expect(x.espoWriters.every((e) => e.writer === 'prestigo-sync')).toBe(true)
    expect(x.statuses.every((s) => s === 200)).toBe(true)
    expect(x.pending()).toHaveLength(0)
    expect(x.queue).toHaveLength(0)
  })
})

describe('webhook echo loop: a pathological upstream', () => {
  it('forced loop: every delivered contact event is answered by another one; the fuse stops it at the 21st delivery', async () => {
    const { x } = makeLinkedWorld({ emitForEveryWriter: true, tickMs: 5_000 })
    vi.setSystemTime(x.w.now())

    // The misbehaving upstream: after each delivered contact event it edits the email and re-emits with a
    // fresh delivery id, until the receiver reports the delivery as fused.
    let edits = 0
    x.setAfterDelivery((item) => {
      const body = item.body as { event?: string; id?: number }
      if (item.source !== 'chatwoot' || body.event !== 'contact_updated' || body.id !== 7) return
      if (x.ingestOutcomes.at(-1) === 'fused') return
      edits += 1
      x.w.cw.state.contacts.find((c) => c.id === 7)!.email = `loop${edits}@x.example`
      x.emitContact(7)
    })

    // The first event is a human edit in the Chatwoot sidebar.
    await x.operatorChatwootPut(7, { email: 'loop0@x.example' })
    const iterations = await x.run()

    // Bounded: the run stopped long before the 200-iteration ceiling, with nothing pending.
    expect(iterations).toBeLessThan(60)
    expect(x.queue).toHaveLength(0)
    expect(x.pending()).toHaveLength(0)

    // The contact fuse (20 deliveries in 10 minutes) answered `fused` exactly once, at the 21st delivery.
    const contactDeliveries = x.ingestOutcomes.filter((o) => o !== 'duplicate')
    expect(contactDeliveries.indexOf('fused')).toBe(20)
    expect(contactDeliveries.filter((o) => o === 'fused')).toHaveLength(1)
    expect(x.ingestOutcomes).toHaveLength(21)

    // One ALERT line (ids only), and the emitter stopped re-emitting once the delivery was fused.
    const alerts = x.errors.filter((l) => l.includes('ALERT webhook_loop_fused'))
    expect(alerts).toEqual(['[webhook] ALERT webhook_loop_fused source=chatwoot entity=cw:contact:7'])
    expect(edits).toBe(20)
  })
})
