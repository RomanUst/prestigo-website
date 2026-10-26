// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any -- the Supabase client double answers canned, loosely typed shapes */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { makeWorld, signChatwoot, signEspo, incoming, type World } from './helpers/chat-world'
import { dispatchOutboxKey } from '@/lib/lead-sync'
import { createOutboxStore } from '@/lib/outbox-store'
import { createIdentityStore } from '@/lib/identity-store'
import { createChatStore } from '@/lib/chat-store'
import { createWebhookStore } from '@/lib/webhook-store'
import { aggregateUuid } from '@/lib/sync-origin'
import { parseOutboxKey } from '@/lib/outbox'

/**
 * Phase 83, plan 83-12 (HOOK-03, D-17): the runtime tripwire layer of the structural barrier.
 *
 * Both receiver routes and every hook.* handler run against the REAL webhook / chat / identity / outbox
 * stores, built on a Supabase client double that RECORDS anything the inbound path must never do:
 *   - `.from(<table>)` for any table other than the two the outbox store reads (integration_outbox,
 *     integration_config) - in particular bookings and customer_profiles, with any operation;
 *   - any `.auth` access;
 *   - any RPC outside the inbound allowlist (webhook_*, chat_*, outbox_*, and the identity RPCs of the
 *     chat path).
 * The recorded violation list must be empty after every scenario. A self-test proves the tripwire is not
 * vacuous: it records a violation when it is touched the forbidden way, also through the real stores.
 *
 * This is the behavioural complement of tests/webhook-isolation-guard.test.ts (import closure and
 * migration text). Synthetic fixtures only.
 */

const hoisted = vi.hoisted(() => ({
  client: { current: null as unknown },
  qstash: vi.fn(),
}))

vi.mock('next/server', async () => {
  const actual = await vi.importActual<typeof import('next/server')>('next/server')
  return {
    ...actual,
    after: (fn: () => unknown) => {
      void fn()
    },
  }
})
vi.mock('@upstash/qstash', () => ({
  Client: class {
    publishJSON = hoisted.qstash
  },
}))
vi.mock('@/lib/supabase', () => ({
  createSupabaseServiceClient: () => hoisted.client.current,
}))

import { POST as chatwootPost } from '@/app/api/webhooks/chatwoot/route'
import { POST as espoPost } from '@/app/api/webhooks/espocrm/route'

const CW_SECRET = 'unit-test-chatwoot-secret'
const ESPO_SECRET = 'unit-test-espo-secret'
const ESPO_WEBHOOK_ID = '5f0c1c2e11114222a'

const IDENTITY = '00000000-0000-4000-8000-0000000000aa'
const CHAT_LEAD = '00000000-0000-4000-8000-0000000000bb'
const CONTACT = '0123456789abcdef0'
const LEAD = 'abcdef01234567890'

/** The only RPC families the inbound path may call (D-17). */
const INBOUND_RPC =
  /^(?:webhook_[a-z_]+|chat_[a-z_]+|outbox_[a-z_]+|identity_chat_lookup|identity_by_chatwoot_contact|identity_resolve_chat|identity_attach_chat_contact|identity_phone_usable|identity_person|identity_set_espo_contact|identity_set_chatwoot_contact)$/

/** Tables the outbox store may read; everything else (bookings, customer_profiles, ...) is a violation. */
const INBOUND_TABLES: ReadonlySet<string> = new Set(['integration_outbox', 'integration_config'])

type RpcArgs = Record<string, any>

interface Tripwire {
  client: { from(table: string): unknown; rpc(name: string, args?: RpcArgs): Promise<{ data: unknown; error: null }>; readonly auth: unknown }
  violations: string[]
  rpcs: string[]
  tables: string[]
}

/** An awaitable query builder that answers "no row" to any chain. */
function emptyChain(): unknown {
  const chain: any = new Proxy(() => chain, {
    get: (_t, prop) => {
      if (prop === 'then') return (resolve: (v: unknown) => unknown) => resolve({ data: null, error: null, count: 0 })
      return () => chain
    },
    apply: () => chain,
  })
  return chain
}

/** What the canned database remembers between calls: a stranger becomes an identity, a recorded conversation is found. */
interface DbState {
  recorded: Set<number>
  registered: boolean
}

/** Canned answers with the shapes the real stores parse (migrations 064, 069, 072, 076, 077, 078). */
function answer(name: string, args: RpcArgs, state: DbState): unknown {
  switch (name) {
    case 'webhook_ingest':
      return 'queued'
    case 'webhook_ingest_espo':
      return [{ outcome: 'queued', idempotency_key: `hook.espo_contact:${IDENTITY}:b100m1`, available_at: '2026-10-26T12:00:30.000Z' }]
    case 'outbox_claim': {
      const parsed = parseOutboxKey(String(args.p_key))
      if (!parsed) return []
      return [
        {
          idempotency_key: args.p_key,
          event_type: parsed.eventType,
          aggregate_type: 'person',
          aggregate_id: parsed.aggregateId,
          status: 'processing',
          attempts: 1,
          available_at: '2026-10-26T11:59:00.000Z',
          lease_until: '2026-10-26T12:02:00.000Z',
          last_error: null,
        },
      ]
    }
    case 'outbox_complete':
    case 'outbox_reschedule':
    case 'outbox_enqueue':
      return true
    case 'chat_hooks_start':
      return '2026-10-20T00:00:00.000Z'
    case 'chat_lead_reserve':
      return [{ chat_lead_id: CHAT_LEAD, lead_ref: args.p_lead_ref, espo_lead_id: null, espo_contact_id: null, own: true }]
    case 'chat_conversation_record':
      state.recorded.add(Number(args.p_conversation_id))
      return true
    case 'chat_lead_set_espo':
    case 'chat_lead_close':
      return true
    case 'chat_lead_link_identity':
      return 0
    case 'chat_open_leads_for_person':
      return []
    case 'chat_conversation':
      if (!state.recorded.has(Number(args.p_conversation_id))) return null
      return {
        conversation_id: args.p_conversation_id,
        outcome: 'lead_created',
        chatwoot_contact_id: 7,
        identity_id: IDENTITY,
        espo_lead_id: LEAD,
        espo_contact_id: CONTACT,
        chat_lead: { id: CHAT_LEAD, lead_ref: `chat:${aggregateUuid('conversation', Number(args.p_conversation_id))}`, espo_lead_id: LEAD, espo_contact_id: CONTACT, open: true },
        identity: { id: IDENTITY, customer: false, erasing: false, espo_contact_id: CONTACT, chatwoot_contact_id: 7 },
      }
    case 'identity_chat_lookup':
      if (!state.registered) return []
      return [{ identity_id: IDENTITY, customer: false, erasing: false, espo_contact_id: CONTACT, chatwoot_contact_id: 7 }]
    case 'identity_by_chatwoot_contact':
      return [{ identity_id: IDENTITY, customer: false, erasing: false, espo_contact_id: CONTACT, emails: ['jan@x.example'] }]
    case 'identity_resolve_chat':
      state.registered = true
      return [{ identity_id: IDENTITY, outcome: 'resolved', customer: false }]
    case 'identity_attach_chat_contact':
      return [{ email_outcome: 'unchanged', phone_outcome: 'none' }]
    case 'identity_phone_usable':
      return typeof args.p_phone_raw === 'string' ? args.p_phone_raw : null
    case 'identity_person':
      return {
        identity: { id: IDENTITY, user_id: null, espo_contact_id: CONTACT, chatwoot_contact_id: 7, erasing_at: null },
        emails: [{ email: 'jan@x.example', basis: 'chat', via_phone: null }],
        phones: [],
        profile: null,
        bookings: [],
      }
    case 'identity_set_espo_contact':
    case 'identity_set_chatwoot_contact':
      return true
    default:
      return null
  }
}

function makeTripwire(): Tripwire {
  const violations: string[] = []
  const rpcs: string[] = []
  const tables: string[] = []
  const state: DbState = { // Conversation 43 was handled before (it holds an open chat Lead); 42 is new until the intake records it.
    recorded: new Set([43]), registered: false }
  const client = {
    from(table: string) {
      tables.push(table)
      if (!INBOUND_TABLES.has(table)) violations.push(`from:${table}`)
      return emptyChain()
    },
    async rpc(name: string, args: RpcArgs = {}) {
      rpcs.push(name)
      if (!INBOUND_RPC.test(name)) violations.push(`rpc:${name}`)
      return { data: answer(name, args, state), error: null }
    },
    get auth(): unknown {
      violations.push('auth')
      return { admin: {} }
    },
  }
  return { client, violations, rpcs, tables }
}

function signedChatwoot(body: unknown, deliveryId: string): Request {
  const raw = JSON.stringify(body)
  return new Request('http://localhost/api/webhooks/chatwoot', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...signChatwoot(raw, CW_SECRET, { timestampSec: Math.floor(Date.now() / 1000), deliveryId }),
    },
    body: raw,
  })
}

function signedEspo(body: unknown): Request {
  const raw = JSON.stringify(body)
  return new Request('http://localhost/api/webhooks/espocrm', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...signEspo(raw, ESPO_SECRET, ESPO_WEBHOOK_ID) },
    body: raw,
  })
}

/** Chatwoot + EspoCRM fakes holding what the five handlers read (Jan, conversation 42, a Lead). */
function janWorld(): World {
  const w = makeWorld({
    espo: {
      records: {
        Contact: [{ id: CONTACT, firstName: 'Jan', lastName: 'Novák', emailAddress: 'jan@x.example' }],
        Lead: [{ id: LEAD, status: 'New', cSupabaseRef: 'chat:11111111-1111-4111-8111-111111111111' }],
      },
      duplicateCheck: { Lead: 'cSupabaseRef' },
    },
    cw: {
      contacts: [
        { id: 7, name: 'Jan Novak', email: 'jan@x.example' } as never,
        { id: 8, name: 'Eva Svobodová', email: 'eva@x.example' } as never,
      ],
    },
  })
  // A stranger writes in: the intake registers her, creates her Contact and her chat Lead.
  w.cw.seedConversation({
    id: 42,
    inbox_id: 1,
    contact_id: 8,
    labels: ['ch-web'],
    created_at: w.secs(-600),
    messages: [incoming('Need a car to Vienna on Friday')],
  })
  // The operator labelled this older conversation `no-lead`: its chat Lead is killed by the label handler.
  w.cw.seedConversation({
    id: 43,
    inbox_id: 1,
    contact_id: 7,
    labels: ['ch-web', 'no-lead'],
    created_at: w.secs(-3600),
    messages: [incoming('Selling you SEO services')],
  })
  return w
}

let trip: Tripwire

beforeEach(() => {
  trip = makeTripwire()
  hoisted.client.current = trip.client
  hoisted.qstash.mockReset().mockResolvedValue({ messageId: 'm1' })
  vi.stubEnv('CHATWOOT_WEBHOOK_SECRET', CW_SECRET)
  vi.stubEnv('CHATWOOT_WEBHOOK_SECRET_PREVIOUS', '')
  vi.stubEnv('ESPOCRM_WEBHOOK_SECRET', ESPO_SECRET)
  vi.stubEnv('ESPOCRM_WEBHOOK_SECRET_PREVIOUS', '')
  vi.stubEnv('ESPOCRM_WEBHOOK_ID', '')
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://example.test')
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('webhook isolation runtime: tripwire is not vacuous', () => {
  it('records a violation for from(bookings), from(customer_profiles), an erasure RPC and any auth access', async () => {
    const t = makeTripwire()
    t.client.from('bookings')
    t.client.from('customer_profiles')
    await t.client.rpc('erasure_anonymise_person', {})
    void t.client.auth
    expect(t.violations).toEqual(['from:bookings', 'from:customer_profiles', 'rpc:erasure_anonymise_person', 'auth'])
  })

  it('does not record the allowed inbound surface', async () => {
    const t = makeTripwire()
    t.client.from('integration_outbox')
    for (const name of ['webhook_ingest', 'chat_lead_reserve', 'outbox_claim', 'identity_chat_lookup', 'identity_person']) {
      await t.client.rpc(name, {})
    }
    expect(t.violations).toEqual([])
  })

  it('catches a booking read made through the REAL outbox store (the mock is wired into the stores)', async () => {
    await createOutboxStore().readBooking('00000000-0000-4000-8000-000000000001')
    expect(trip.violations).toEqual(['from:bookings'])
  })

  it('catches an off-allowlist RPC made through the REAL identity store', async () => {
    await createIdentityStore().resolveBooking('00000000-0000-4000-8000-000000000001').catch(() => undefined)
    expect(trip.violations).toEqual(['rpc:identity_resolve_booking'])
  })
})

describe('webhook isolation runtime: the inbound path touches nothing it must not', () => {
  it('tripwire: both receivers run on the real webhook store and record no violation', async () => {
    const w = janWorld()
    vi.setSystemTime(w.now())

    const messageRes = await chatwootPost(
      signedChatwoot({ event: 'message_created', message_type: 'incoming', private: false, conversation: { id: 42 } }, 'cwd-000001'),
    )
    const contactRes = await chatwootPost(
      signedChatwoot(
        {
          event: 'contact_updated',
          id: 7,
          name: 'Jan Novak',
          email: 'jan@x.example',
          phone_number: '+420777123456',
          changed_attributes: [{ phone_number: { previous_value: null, current_value: '+420777123456' } }],
        },
        'cwd-000002',
      ),
    )
    const espoRes = await espoPost(signedEspo([{ id: CONTACT, lastName: 'Novák' }]))

    expect([messageRes.status, contactRes.status, espoRes.status]).toEqual([200, 200, 200])
    // Every call went through the allowlisted ingest RPCs, nothing else.
    expect(trip.rpcs).toEqual(['webhook_ingest', 'webhook_ingest', 'webhook_ingest_espo'])
    expect(trip.tables).toEqual([])
    expect(trip.violations).toEqual([])
    // The signed receivers also published the queued rows (the publish seam is the QStash client).
    expect(hoisted.qstash).toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('tripwire: one dispatch of each hook type (intake, resolve, label, contact, espo_contact) on the real stores records no violation', async () => {
    const w = janWorld()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(w.now())
    const keys = {
      intake: `hook.chat_intake:${aggregateUuid('conversation', 42)}:c42`,
      resolve: `hook.chat_resolve:${aggregateUuid('conversation', 42)}:c42r${w.secs(0)}`,
      label: `hook.chat_label:${aggregateUuid('conversation', 43)}:c43`,
      contact: `hook.chat_contact:${aggregateUuid('contact', 7)}:c7b100`,
      espoContact: `hook.espo_contact:${IDENTITY}:b100m1`,
    }
    const deps = () =>
      w.deps({ store: createOutboxStore(), identity: createIdentityStore(), chat: createChatStore() })

    const outcomes: Record<string, string> = {}
    for (const [name, key] of Object.entries(keys)) {
      const result = await dispatchOutboxKey(key, deps())
      outcomes[name] = result.outcome
    }

    // Each handler ran to a normal end (none crashed or failed on the canned shapes).
    expect(outcomes).toEqual({ intake: 'sent', resolve: 'sent', label: 'sent', contact: 'sent', espoContact: 'sent' })
    // The handlers did real work through the real stores and the fakes (not a vacuous early exit).
    for (const rpc of ['outbox_claim', 'outbox_complete', 'chat_hooks_start', 'chat_lead_reserve', 'chat_conversation_record', 'chat_lead_close', 'identity_resolve_chat', 'identity_by_chatwoot_contact', 'identity_person']) {
      expect(trip.rpcs, rpc).toContain(rpc)
    }
    expect(w.leads().map((l) => l.status)).toContain('Dead') // label handler
    expect(w.leads()).toHaveLength(2) // the seeded one + the intake's
    expect(w.notes()).toHaveLength(1) // resolve
    expect(w.cw.writes().map((r) => `${r.method} ${r.path}`)).toEqual(['PUT /contacts/7']) // espo_contact handler
    expect(trip.violations).toEqual([])
    vi.useRealTimers()
  })

  it('tripwire: the real webhook store, called directly, stays inside the ingest and purge RPCs', async () => {
    const store = createWebhookStore()
    await store.ingest({
      source: 'chatwoot',
      deliveryId: 'cwd-000009',
      entityKey: 'cw:conv:42',
      fuseLimit: null,
      eventType: 'hook.chat_intake',
      aggregateType: 'chat_conversation',
      aggregateId: aggregateUuid('conversation', 42),
      key: `hook.chat_intake:${aggregateUuid('conversation', 42)}:c42`,
      availableAt: new Date('2026-10-26T12:00:00.000Z'),
    })
    expect(trip.rpcs).toEqual(['webhook_ingest'])
    expect(trip.violations).toEqual([])
  })
})
