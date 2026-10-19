// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'
import { dispatchOutboxKey, type DispatchDeps } from '@/lib/lead-sync'
import { syncBucketKey } from '@/lib/outbox'
import { OutboxStoreError, type OutboxRow, type OutboxStore } from '@/lib/outbox-store'
import type { IdentityStore, ResolveResult } from '@/lib/identity-store'

// ── Fixtures ────────────────────────────────────────────────────────────────

const NOW = new Date('2026-10-19T12:00:07.000Z')
const BOOKING = '0b9f2c1e-5d3a-4e8b-9c7d-1a2b3c4d5e6f'
const USER = '2d1b4e30-7f5c-4a0d-9e9f-3c4d5e6f7081'
const IDENT_I = '3e2c5f41-806d-4b1e-8fa0-4d5e6f708192'
const IDENT_P = '4f3d6052-917e-4c2f-90b1-5e6f708192a3'
const BUCKET_TAG = Math.floor(NOW.getTime() / 1000 / 90)

const bookingKey = `sync.booking:${BOOKING}:${BUCKET_TAG}`
const signupKey = `sync.signup:${USER}:${BUCKET_TAG}`

function outboxRow(key: string, eventType: string, aggregateType: string, aggregateId: string): OutboxRow {
  return {
    idempotency_key: key,
    event_type: eventType,
    aggregate_type: aggregateType,
    aggregate_id: aggregateId,
    status: 'pending',
    attempts: 0,
    available_at: new Date(NOW.getTime() - 1000).toISOString(),
    lease_until: null,
    last_error: null,
  }
}

/** In-memory OutboxStore with the claim semantics of migration 064 (copy of tests/lead-sync.test.ts). */
function makeStore(initial: OutboxRow[]) {
  const rows = new Map<string, OutboxRow>(initial.map((r) => [r.idempotency_key, { ...r }]))
  const calls = {
    complete: [] as Array<{ key: string; status: string; code: string | null }>,
    reschedule: [] as Array<{ key: string; availableAt: Date; code: string }>,
  }
  const store: OutboxStore = {
    async claim(key) {
      const row = rows.get(key)
      if (!row) return null
      const due = Date.parse(row.available_at) <= NOW.getTime()
      if (due && row.status === 'pending') {
        row.status = 'processing'
        row.attempts += 1
        row.lease_until = new Date(NOW.getTime() + 120_000).toISOString()
        return { ...row }
      }
      return null
    },
    async getByKey(key) {
      const row = rows.get(key)
      return row ? { ...row } : null
    },
    async complete(key, status, code) {
      calls.complete.push({ key, status, code })
      const row = rows.get(key)
      if (!row || row.status !== 'processing') return false
      row.status = status
      row.last_error = code
      row.lease_until = null
      return true
    },
    async reschedule(key, availableAt, code) {
      calls.reschedule.push({ key, availableAt, code })
      const row = rows.get(key)
      if (!row || row.status !== 'processing') return false
      row.status = 'pending'
      row.available_at = availableAt.toISOString()
      row.last_error = code
      row.lease_until = null
      return true
    },
    async readInquiry() {
      return null
    },
    async readBooking() {
      return null
    },
    async readReturnLeg() {
      return null
    },
    async readCaptureStart() {
      return null
    },
  }
  return { store, rows, calls }
}

type Resolver = () => ResolveResult | Promise<ResolveResult>

/** IdentityStore double. enqueueSync writes into the same row map as the OutboxStore double (064 semantics). */
function makeIdentity(
  rows: Map<string, OutboxRow>,
  opts: { booking?: Resolver; user?: Resolver; enqueueError?: boolean } = {},
) {
  const enqueued: Array<{ eventType: string; aggregateType: string; aggregateId: string; key: string; availableAt: Date }> = []
  const identity: IdentityStore = {
    resolveBooking: vi.fn(async () => (opts.booking ?? (() => result('resolved', IDENT_I)))()),
    resolveUser: vi.fn(async () => (opts.user ?? (() => result('resolved', IDENT_I)))()),
    person: vi.fn(async () => null),
    crmBooking: vi.fn(async () => null),
    emailOwners: vi.fn(async () => new Map<string, string>()),
    setEspoContact: vi.fn(async () => true),
    setChatwootContact: vi.fn(async () => true),
    async enqueueSync(input) {
      if (opts.enqueueError) throw new OutboxStoreError('db_error')
      enqueued.push(input)
      if (rows.has(input.key)) return false
      rows.set(input.key, {
        idempotency_key: input.key,
        event_type: input.eventType,
        aggregate_type: input.aggregateType,
        aggregate_id: input.aggregateId,
        status: 'pending',
        attempts: 0,
        available_at: input.availableAt.toISOString(),
        lease_until: null,
        last_error: null,
      })
      return true
    },
  }
  return { identity, enqueued }
}

function result(
  outcome: ResolveResult['outcome'],
  identityId: string | null = null,
  previousIdentityId: string | null = null,
): ResolveResult {
  return { identityId, previousIdentityId, outcome }
}

function harness(
  key: string,
  eventType: string,
  aggregateType: string,
  aggregateId: string,
  opts: Parameters<typeof makeIdentity>[1] = {},
) {
  const s = makeStore([outboxRow(key, eventType, aggregateType, aggregateId)])
  const i = makeIdentity(s.rows, opts)
  const publish = vi.fn(async () => true)
  const deps: Partial<DispatchDeps> = {
    store: s.store,
    crm: null,
    config: null,
    identity: i.identity,
    publish: publish as unknown as DispatchDeps['publish'],
    now: () => NOW,
  }
  return { ...s, ...i, publish, deps }
}

const bookingHarness = (opts: Parameters<typeof makeIdentity>[1] = {}) =>
  harness(bookingKey, 'sync.booking', 'booking', BOOKING, opts)
const signupHarness = (opts: Parameters<typeof makeIdentity>[1] = {}) =>
  harness(signupKey, 'sync.signup', 'user', USER, opts)

function newRows(rows: Map<string, OutboxRow>, exceptKey: string): OutboxRow[] {
  return [...rows.values()].filter((r) => r.idempotency_key !== exceptKey)
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('sync.booking resolver hop', () => {
  it('tracer: resolves the booking and fans out one sync.espo and one sync.chatwoot row for the person', async () => {
    const h = bookingHarness()
    const out = await dispatchOutboxKey(bookingKey, h.deps)

    expect(out).toEqual({ outcome: 'sent' })
    expect(h.identity.resolveBooking).toHaveBeenCalledWith(BOOKING)

    const espo = syncBucketKey('sync.espo', IDENT_I, NOW.getTime())
    const chatwoot = syncBucketKey('sync.chatwoot', IDENT_I, NOW.getTime())
    const created = newRows(h.rows, bookingKey)
    expect(created.map((r) => r.idempotency_key).sort()).toEqual([chatwoot.key, espo.key].sort())
    for (const r of created) {
      expect(r.aggregate_type).toBe('person')
      expect(r.aggregate_id).toBe(IDENT_I)
      expect(r.available_at).toBe(espo.availableAt.toISOString())
      expect(Date.parse(r.available_at)).toBeGreaterThan(NOW.getTime())
    }
    expect(h.publish).toHaveBeenCalledTimes(2)
    const delay = Math.ceil((espo.availableAt.getTime() - NOW.getTime()) / 1000)
    expect(h.publish).toHaveBeenCalledWith(espo.key, { delaySeconds: delay, dedupSuffix: 'f' })
    expect(h.publish).toHaveBeenCalledWith(chatwoot.key, { delaySeconds: delay, dedupSuffix: 'f' })
    expect(h.rows.get(bookingKey)?.status).toBe('sent')
  })

  it('fans out the previously linked identity as well when the link moved', async () => {
    const h = bookingHarness({ booking: () => result('resolved', IDENT_I, IDENT_P) })
    expect(await dispatchOutboxKey(bookingKey, h.deps)).toEqual({ outcome: 'sent' })

    const created = newRows(h.rows, bookingKey)
    expect(created).toHaveLength(4)
    for (const id of [IDENT_I, IDENT_P]) {
      expect(created.filter((r) => r.aggregate_id === id).map((r) => r.event_type).sort()).toEqual([
        'sync.chatwoot',
        'sync.espo',
      ])
    }
  })

  it('no usable email: one orphan sync.espo row keyed by the booking, aggregate type booking', async () => {
    const h = bookingHarness({ booking: () => result('no_identity') })
    expect(await dispatchOutboxKey(bookingKey, h.deps)).toEqual({ outcome: 'sent' })

    const orphan = syncBucketKey('sync.espo', BOOKING, NOW.getTime())
    const created = newRows(h.rows, bookingKey)
    expect(created).toHaveLength(1)
    expect(created[0]).toMatchObject({
      idempotency_key: orphan.key,
      event_type: 'sync.espo',
      aggregate_type: 'booking',
      aggregate_id: BOOKING,
      available_at: orphan.availableAt.toISOString(),
    })
  })

  it('no usable email but a previous identity: orphan row plus the previous person', async () => {
    const h = bookingHarness({ booking: () => result('no_identity', null, IDENT_P) })
    expect(await dispatchOutboxKey(bookingKey, h.deps)).toEqual({ outcome: 'sent' })
    const created = newRows(h.rows, bookingKey)
    expect(created).toHaveLength(3)
    expect(created.filter((r) => r.aggregate_type === 'booking')).toHaveLength(1)
    expect(created.filter((r) => r.aggregate_id === IDENT_P)).toHaveLength(2)
  })

  it('abandoned checkout: no fan-out, skipped abandoned_checkout', async () => {
    const h = bookingHarness({ booking: () => result('abandoned') })
    expect(await dispatchOutboxKey(bookingKey, h.deps)).toEqual({ outcome: 'skipped', code: 'abandoned_checkout' })
    expect(newRows(h.rows, bookingKey)).toHaveLength(0)
    expect(h.publish).not.toHaveBeenCalled()
  })

  it('abandoned checkout that was linked before: the previous person is refreshed, then skipped', async () => {
    const h = bookingHarness({ booking: () => result('abandoned', null, IDENT_P) })
    expect(await dispatchOutboxKey(bookingKey, h.deps)).toEqual({ outcome: 'skipped', code: 'abandoned_checkout' })
    const created = newRows(h.rows, bookingKey)
    expect(created).toHaveLength(2)
    expect(created.every((r) => r.aggregate_id === IDENT_P)).toBe(true)
  })

  it('erasing identity: rescheduled with identity_erasing, nothing fanned out', async () => {
    const h = bookingHarness({ booking: () => result('erasing', IDENT_I) })
    expect(await dispatchOutboxKey(bookingKey, h.deps)).toEqual({ outcome: 'rescheduled', code: 'identity_erasing' })
    expect(newRows(h.rows, bookingKey)).toHaveLength(0)
    expect(h.calls.reschedule).toHaveLength(1)
    expect(h.rows.get(bookingKey)?.status).toBe('pending')
  })

  it('source_missing: skipped source_missing', async () => {
    const h = bookingHarness({ booking: () => result('source_missing') })
    expect(await dispatchOutboxKey(bookingKey, h.deps)).toEqual({ outcome: 'skipped', code: 'source_missing' })
    expect(newRows(h.rows, bookingKey)).toHaveLength(0)
  })

  it('an enqueue RPC error reschedules with db_error (the fan-out is never silently lost)', async () => {
    const h = bookingHarness({ enqueueError: true })
    expect(await dispatchOutboxKey(bookingKey, h.deps)).toEqual({ outcome: 'rescheduled', code: 'db_error' })
    expect(h.rows.get(bookingKey)?.status).toBe('pending')
    expect(newRows(h.rows, bookingKey)).toHaveLength(0)
  })

  it('a resolver RPC error reschedules with db_error', async () => {
    const h = bookingHarness({
      booking: () => {
        throw new OutboxStoreError('db_error')
      },
    })
    expect(await dispatchOutboxKey(bookingKey, h.deps)).toEqual({ outcome: 'rescheduled', code: 'db_error' })
  })

  it('a retried hop re-enqueues the same bucket keys without duplicating rows', async () => {
    const h = bookingHarness()
    await dispatchOutboxKey(bookingKey, h.deps)
    const before = h.rows.size
    // Second delivery of the same bucket (a duplicate QStash message after a lost reply).
    h.rows.get(bookingKey)!.status = 'pending'
    await dispatchOutboxKey(bookingKey, h.deps)
    expect(h.rows.size).toBe(before)
  })
})

describe('dispatcher gating', () => {
  it('sync.booking resolves even when the CRM is not configured (no crm_unconfigured breaker on the hop)', async () => {
    const h = bookingHarness()
    expect(h.deps.crm).toBeNull()
    expect(h.deps.config).toBeNull()
    const out = await dispatchOutboxKey(bookingKey, h.deps)
    expect(out.outcome).toBe('sent')
  })

  it('a lead.booking key with no CRM still breaks with crm_unconfigured (unchanged)', async () => {
    const key = `lead.booking:${BOOKING}:converted`
    const s = makeStore([outboxRow(key, 'lead.booking', 'booking', BOOKING)])
    const i = makeIdentity(s.rows)
    const publish = vi.fn(async () => true)
    const out = await dispatchOutboxKey(key, {
      store: s.store,
      crm: null,
      config: null,
      identity: i.identity,
      publish: publish as unknown as DispatchDeps['publish'],
      now: () => NOW,
    })
    expect(out).toEqual({ outcome: 'breaker', code: 'crm_unconfigured' })
    expect(i.identity.resolveBooking).not.toHaveBeenCalled()
  })

  // sync.espo has its handler since plan 82-07 (tests/crm-sync.test.ts); here it only proves the CRM gate.
  it('sync.espo needs the CRM (crm_unconfigured breaker, never unsupported_event)', async () => {
    const key = `sync.espo:${IDENT_I}:12345`
    const h = harness(key, 'sync.espo', 'person', IDENT_I)
    expect(await dispatchOutboxKey(key, h.deps)).toEqual({ outcome: 'breaker', code: 'crm_unconfigured' })
  })

  it('sync.chatwoot is failed unsupported_event until its handler plan lands', async () => {
    const key = `sync.chatwoot:${IDENT_I}:12345`
    const h = harness(key, 'sync.chatwoot', 'person', IDENT_I)
    expect(await dispatchOutboxKey(key, h.deps)).toEqual({ outcome: 'failed', code: 'unsupported_event' })
  })

  it('erase.person is failed unsupported_event until plan 82-12', async () => {
    const key = `erase.person:${IDENT_I}`
    const h = harness(key, 'erase.person', 'person', IDENT_I)
    expect(await dispatchOutboxKey(key, h.deps)).toEqual({ outcome: 'failed', code: 'unsupported_event' })
  })
})

describe('sync.signup resolver hop', () => {
  it('resolves the user and fans out two person rows', async () => {
    const h = signupHarness({ user: () => result('resolved', IDENT_I) })
    expect(await dispatchOutboxKey(signupKey, h.deps)).toEqual({ outcome: 'sent' })
    expect(h.identity.resolveUser).toHaveBeenCalledWith(USER)
    expect(h.identity.resolveBooking).not.toHaveBeenCalled()

    const created = newRows(h.rows, signupKey)
    expect(created.map((r) => r.event_type).sort()).toEqual(['sync.chatwoot', 'sync.espo'])
    expect(created.every((r) => r.aggregate_type === 'person' && r.aggregate_id === IDENT_I)).toBe(true)
    expect(h.publish).toHaveBeenCalledTimes(2)
  })

  it('also fans out the previously linked identity', async () => {
    const h = signupHarness({ user: () => result('resolved', IDENT_I, IDENT_P) })
    expect(await dispatchOutboxKey(signupKey, h.deps)).toEqual({ outcome: 'sent' })
    expect(newRows(h.rows, signupKey)).toHaveLength(4)
  })

  it('an unusable auth email: skipped no_email, nothing fanned out', async () => {
    const h = signupHarness({ user: () => result('no_identity') })
    expect(await dispatchOutboxKey(signupKey, h.deps)).toEqual({ outcome: 'skipped', code: 'no_email' })
    expect(newRows(h.rows, signupKey)).toHaveLength(0)
  })

  it('erasing identity: rescheduled identity_erasing', async () => {
    const h = signupHarness({ user: () => result('erasing', IDENT_I) })
    expect(await dispatchOutboxKey(signupKey, h.deps)).toEqual({ outcome: 'rescheduled', code: 'identity_erasing' })
    expect(newRows(h.rows, signupKey)).toHaveLength(0)
  })

  it('the profile is gone (user deleted): skipped source_missing', async () => {
    const h = signupHarness({ user: () => result('source_missing') })
    expect(await dispatchOutboxKey(signupKey, h.deps)).toEqual({ outcome: 'skipped', code: 'source_missing' })
  })

  it('an enqueue RPC error reschedules with db_error', async () => {
    const h = signupHarness({ enqueueError: true })
    expect(await dispatchOutboxKey(signupKey, h.deps)).toEqual({ outcome: 'rescheduled', code: 'db_error' })
  })

  it('resolves without any CRM configured', async () => {
    const h = signupHarness()
    expect(h.deps.crm).toBeNull()
    expect((await dispatchOutboxKey(signupKey, h.deps)).outcome).toBe('sent')
  })
})

/**
 * Store double that models the 069 core rules (email rule only): an address belongs to one identity,
 * a signup claims the identity that owns its address (or joins the user's own identity), a new
 * address creates a new identity. Used to prove the ordering edge: either order ends with ONE identity.
 */
function makeIdentityModel() {
  const identities = new Map<string, { userId: string | null; emails: Set<string> }>()
  const owner = new Map<string, string>()
  const bookingEmail = new Map<string, string>()
  const userEmail = new Map<string, string>()
  const bookingLink = new Map<string, string>()
  let seq = 0

  const norm = (raw: string): string | null => {
    const e = raw.trim().toLowerCase()
    return e.includes('@') && !e.endsWith('@gnet.local') ? e : null
  }
  const identityOfUser = (userId: string): string | null =>
    [...identities.entries()].find(([, v]) => v.userId === userId)?.[0] ?? null

  function core(raw: string, userId: string | null): ResolveResult {
    const email = norm(raw)
    if (!email) return result('no_identity')
    const existing = owner.get(email)
    if (existing) {
      const ident = identities.get(existing)!
      if (userId && ident.userId === null && !identityOfUser(userId)) ident.userId = userId
      return result('resolved', existing)
    }
    const own = userId ? identityOfUser(userId) : null
    if (own) {
      identities.get(own)!.emails.add(email)
      owner.set(email, own)
      return result('resolved', own)
    }
    const id = `ident-${++seq}`
    identities.set(id, { userId, emails: new Set([email]) })
    owner.set(email, id)
    return result('resolved', id)
  }

  const resolveBooking = (bookingId: string): ResolveResult => {
    const raw = bookingEmail.get(bookingId)
    if (raw === undefined) return result('source_missing')
    const prev = bookingLink.get(bookingId) ?? null
    const r = core(raw, null)
    if (r.outcome === 'resolved') bookingLink.set(bookingId, r.identityId!)
    return { ...r, previousIdentityId: prev && prev !== r.identityId ? prev : null }
  }
  const resolveUser = (userId: string): ResolveResult => {
    const raw = userEmail.get(userId)
    if (raw === undefined) return result('source_missing')
    const prev = identityOfUser(userId)
    const r = core(raw, userId)
    return { ...r, previousIdentityId: prev && prev !== r.identityId ? prev : null }
  }

  return {
    identities,
    addBooking: (id: string, email: string) => bookingEmail.set(id, email),
    addUser: (id: string, email: string) => userEmail.set(id, email),
    resolveBooking,
    resolveUser,
  }
}

describe('ordering: signup and booking with one email end with one identity', () => {
  const B2 = '5a4e7163-a28f-4d30-81c2-6f708192a3b4'
  const bKey = (id: string) => `sync.booking:${id}:${BUCKET_TAG}`

  async function runBoth(order: Array<'booking' | 'signup'>) {
    const model = makeIdentityModel()
    model.addBooking(B2, '  Anna@Example.COM ')
    model.addUser(USER, 'anna@example.com')

    const s = makeStore([
      outboxRow(bKey(B2), 'sync.booking', 'booking', B2),
      outboxRow(signupKey, 'sync.signup', 'user', USER),
    ])
    const i = makeIdentity(s.rows, {})
    i.identity.resolveBooking = vi.fn(async (id: string) => model.resolveBooking(id))
    i.identity.resolveUser = vi.fn(async (id: string) => model.resolveUser(id))
    const publish = vi.fn(async () => true)
    const deps: Partial<DispatchDeps> = {
      store: s.store,
      crm: null,
      config: null,
      identity: i.identity,
      publish: publish as unknown as DispatchDeps['publish'],
      now: () => NOW,
    }
    for (const step of order) {
      const key = step === 'booking' ? bKey(B2) : signupKey
      expect((await dispatchOutboxKey(key, deps)).outcome).toBe('sent')
    }
    return model
  }

  it.each([
    ['booking then signup', ['booking', 'signup'] as const],
    ['signup then booking', ['signup', 'booking'] as const],
  ])('%s', async (_name, order) => {
    const model = await runBoth([...order])
    expect(model.identities.size).toBe(1)
    const only = [...model.identities.values()][0]
    expect([...only.emails]).toEqual(['anna@example.com'])
    expect(only.userId).toBe(USER)
  })

  it('a signup whose email changed joins the user identity instead of creating a second one', () => {
    const model = makeIdentityModel()
    model.addUser(USER, 'a@example.com')
    model.resolveUser(USER)
    model.addUser(USER, 'a-new@example.com')
    const r = model.resolveUser(USER)
    expect(r.outcome).toBe('resolved')
    expect(model.identities.size).toBe(1)
    expect([...[...model.identities.values()][0].emails].sort()).toEqual(['a-new@example.com', 'a@example.com'])
  })
})
