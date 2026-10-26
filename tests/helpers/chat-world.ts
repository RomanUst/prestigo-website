/* eslint-disable @typescript-eslint/no-explicit-any -- test doubles are intentionally loose */
/**
 * Phase 83 (plan 83-07): the shared test world for every hook.* handler of the phase.
 *
 * In-memory doubles with the semantics of the live migrations, wired to the two network fakes:
 *   makeOutboxStore        064 claim / complete / reschedule, per-aggregate mutex, outbox_enqueue
 *   makeIdentityDouble     069 + 072 + 077 identity rules: chat basis, customer = account or booking,
 *                          attach rules, shared phones, resolve by email / phone
 *   makeChatStoreDouble    078 registry: one open chat Lead per person key, own flag, close, link,
 *                          conversation record / read, open leads, erasure scope / erase
 *   makeWebhookStoreDouble 076 webhook_ingest / webhook_ingest_espo / webhook_purge: gate off, dedup per
 *                          (source, delivery id), fuse over a 10-minute window, event allowlist
 *   makeWorld              fake-chatwoot + fake-espocrm + the site clients + the doubles, as DispatchDeps
 *   signChatwoot / signEspo  request signing helpers for the receiver tests
 *
 * No double exposes a booking, profile or auth method (HOOK-03). Later plans of Phase 83 use this
 * file; they do not edit it (use the `espo.extraRoutes` / `cw.intercept` options of makeWorld).
 */

import { createHmac } from 'node:crypto'
import { vi } from 'vitest'
import { createFakeChatwoot, FAKE_ADMIN_TOKEN, FAKE_AGENT_TOKEN, type FakeChatwootOptions } from './fake-chatwoot'
import { createFakeEspoCRM, type FakeEspoOptions } from './fake-espocrm'
import { createSiteEspoClient, type SiteEspoConfig } from '@/lib/espocrm-client'
import { createSiteChatwootClient, type SiteChatwootConfig } from '@/lib/chatwoot-client'
import { dispatchOutboxKey, type DispatchDeps, type DispatchResult } from '@/lib/lead-sync'
import { OutboxStoreError, type OutboxRow, type OutboxStore } from '@/lib/outbox-store'
import { parseOutboxKey } from '@/lib/outbox'
import { normalizePhone } from '@/lib/phone'
import { aggregateUuid } from '@/lib/sync-origin'
import type {
  AttachResult,
  ChatIdentity,
  ChatResolveResult,
  IdentityStore,
  PersonRecord,
} from '@/lib/identity-store'
import type {
  ChatConversationRecord,
  ChatStore,
  ConversationOutcome,
  ErasureScopeInput,
  ReserveResult,
} from '@/lib/chat-store'
import type {
  EspoIngestOutcome,
  IngestEspoInput,
  IngestEspoResult,
  IngestInput,
  IngestOutcome,
  WebhookStore,
} from '@/lib/webhook-store'

export const WORLD_NOW = new Date('2026-10-26T12:00:00.000Z')
export const WORLD_HOOKS_START = new Date('2026-10-20T00:00:00.000Z')
export const WORLD_ASSIGNEE = '1a2b3c4d5e6f70809'
export const WORLD_CHATWOOT_URL = 'https://chat.example.test'
export const WORLD_ACCOUNT_ID = '7'

let uuidCounter = 0
function nextUuid(): string {
  uuidCounter += 1
  return `00000000-0000-4000-8000-${uuidCounter.toString(16).padStart(12, '0')}`
}

// ── Outbox ──────────────────────────────────────────────────────────────────

function aggregateTypeFor(eventType: string): string {
  if (eventType === 'hook.chat_contact') return 'chat_contact'
  if (eventType.startsWith('hook.chat_')) return 'chat_conversation'
  if (eventType === 'hook.espo_contact') return 'person'
  if (eventType.startsWith('lead.') || eventType.startsWith('sync.booking')) return 'booking'
  return 'person'
}

export function makeOutboxStore(opts: { now?: () => Date } = {}) {
  const now = opts.now ?? (() => WORLD_NOW)
  const rows = new Map<string, OutboxRow>()
  const calls = {
    claim: [] as string[],
    complete: [] as Array<{ key: string; status: string; code: string | null }>,
    reschedule: [] as Array<{ key: string; availableAt: Date; code: string }>,
  }

  function insert(key: string, over: Partial<OutboxRow> = {}): OutboxRow {
    const parsed = parseOutboxKey(key)
    if (!parsed) throw new Error('outbox double: unparseable key')
    const row: OutboxRow = {
      idempotency_key: key,
      event_type: parsed.eventType,
      aggregate_type: aggregateTypeFor(parsed.eventType),
      aggregate_id: parsed.aggregateId,
      status: 'pending',
      attempts: 0,
      available_at: new Date(now().getTime() - 1000).toISOString(),
      lease_until: null,
      last_error: null,
      ...over,
    }
    rows.set(key, row)
    return row
  }

  const store: OutboxStore = {
    async claim(key) {
      calls.claim.push(key)
      const row = rows.get(key)
      if (!row) return null
      const t = now().getTime()
      const due = Date.parse(row.available_at) <= t
      const leaseLive = row.lease_until !== null && Date.parse(row.lease_until) > t
      const siblingBusy = [...rows.values()].some(
        (x) =>
          x !== row &&
          x.aggregate_type === row.aggregate_type &&
          x.aggregate_id === row.aggregate_id &&
          x.status === 'processing' &&
          x.lease_until !== null &&
          Date.parse(x.lease_until) > t,
      )
      if (due && !siblingBusy && (row.status === 'pending' || (row.status === 'processing' && !leaseLive))) {
        row.status = 'processing'
        row.attempts += 1
        row.lease_until = new Date(t + 120_000).toISOString()
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

  /** outbox_enqueue: true when a row was inserted, false on a key conflict. */
  function enqueue(input: { key: string; availableAt?: Date }): boolean {
    if (rows.has(input.key)) return false
    insert(input.key, { available_at: (input.availableAt ?? now()).toISOString() })
    return true
  }

  return { store, rows, calls, insert, enqueue }
}
export type OutboxDouble = ReturnType<typeof makeOutboxStore>

// ── Identity ────────────────────────────────────────────────────────────────

interface IdentityRec {
  id: string
  seq: number
  userId: string | null
  espoContactId: string | null
  chatwootContactId: number | null
  erasing: boolean
  bookings: number
  emails: Array<{ email: string; basis: string; viaPhone: string | null }>
  phones: Set<string>
}

function normEmail(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null
  const email = raw.trim().toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null
}

export function makeIdentityDouble(opts: { outbox?: OutboxDouble; sharedPhones?: string[] } = {}) {
  const identities: IdentityRec[] = []
  const sharedPhones = new Set<string>(opts.sharedPhones ?? [])
  const enqueued: Array<{ eventType: string; key: string }> = []
  let seq = 0

  function seed(input: {
    email?: string
    emails?: string[]
    userId?: string | null
    bookings?: number
    espoContactId?: string | null
    chatwootContactId?: number | null
    phones?: string[]
    erasing?: boolean
    basis?: string
  } = {}): string {
    const rec: IdentityRec = {
      id: nextUuid(),
      seq: ++seq,
      userId: input.userId ?? null,
      espoContactId: input.espoContactId ?? null,
      chatwootContactId: input.chatwootContactId ?? null,
      erasing: input.erasing ?? false,
      bookings: input.bookings ?? 0,
      emails: [],
      phones: new Set(),
    }
    for (const e of [...(input.email ? [input.email] : []), ...(input.emails ?? [])]) {
      const n = normEmail(e)
      if (n) rec.emails.push({ email: n, basis: input.basis ?? 'email', viaPhone: null })
    }
    for (const p of input.phones ?? []) {
      const n = normalizePhone(p)
      if (n) rec.phones.add(n)
    }
    identities.push(rec)
    return rec.id
  }

  const byId = (id: string) => identities.find((i) => i.id === id)
  const byEmail = (email: string) => identities.find((i) => i.emails.some((e) => e.email === email))
  const isCustomer = (i: IdentityRec) => i.userId !== null || i.bookings > 0

  const toChat = (i: IdentityRec): ChatIdentity => ({
    identityId: i.id,
    customer: isCustomer(i),
    erasing: i.erasing,
    espoContactId: i.espoContactId,
    chatwootContactId: i.chatwootContactId,
  })

  function usablePhone(raw: string | null): string | null {
    const n = normalizePhone(raw)
    return n && !sharedPhones.has(n) ? n : null
  }

  function liveOwnersOf(phone: string, except?: string): IdentityRec[] {
    return identities.filter((i) => i.phones.has(phone) && i.id !== except && !i.erasing)
  }

  function storePhone(rec: IdentityRec, phone: string | null): void {
    if (!phone) return
    if (liveOwnersOf(phone, rec.id).length > 0) {
      sharedPhones.add(phone)
      return
    }
    rec.phones.add(phone)
  }

  const store: IdentityStore = {
    async resolveBooking() {
      return { identityId: null, previousIdentityId: null, outcome: 'source_missing' }
    },
    async resolveUser() {
      return { identityId: null, previousIdentityId: null, outcome: 'source_missing' }
    },
    async person(identityId) {
      const i = byId(identityId)
      if (!i) return null
      const record: PersonRecord = {
        identity: {
          id: i.id,
          user_id: i.userId,
          espo_contact_id: i.espoContactId,
          chatwoot_contact_id: i.chatwootContactId,
          erasing_at: i.erasing ? WORLD_NOW.toISOString() : null,
        },
        emails: i.emails.map((e) => ({ email: e.email, basis: e.basis, via_phone: e.viaPhone })),
        phones: [...i.phones].filter((p) => !sharedPhones.has(p)),
        profile: null,
        bookings: [],
      }
      return record
    },
    async crmBooking() {
      return null
    },
    async emailOwners(emails) {
      const owners = new Map<string, string>()
      for (const e of emails) {
        const owner = byEmail(e)
        if (owner) owners.set(e, owner.id)
      }
      return owners
    },
    async setEspoContact(identityId, contactId) {
      const i = byId(identityId)
      if (!i) return false
      i.espoContactId = contactId
      return true
    },
    async setChatwootContact(identityId, contactId) {
      const i = byId(identityId)
      if (!i) return false
      i.chatwootContactId = contactId
      return true
    },
    async chatLookup(email) {
      const n = normEmail(email)
      const owner = n ? byEmail(n) : undefined
      return owner ? toChat(owner) : null
    },
    async byChatwootContact(contactId) {
      return identities
        .filter((i) => i.chatwootContactId === contactId)
        .sort((a, b) => a.seq - b.seq)
        .slice(0, 2)
        .map((i) => ({ ...toChat(i), emails: i.emails.map((e) => e.email) }))
    },
    async resolveChat(emailRaw, phoneRaw): Promise<ChatResolveResult> {
      const email = normEmail(emailRaw)
      if (!email) return { identityId: null, outcome: 'no_identity', customer: false }
      const phone = usablePhone(phoneRaw)

      const owner = byEmail(email)
      if (owner) {
        if (owner.erasing) return { identityId: owner.id, outcome: 'erasing', customer: isCustomer(owner) }
        storePhone(owner, phone)
        return { identityId: owner.id, outcome: 'resolved', customer: isCustomer(owner) }
      }

      if (phone) {
        const owners = identities.filter((i) => i.phones.has(phone))
        if (owners.length === 1 && !owners[0].erasing) {
          owners[0].emails.push({ email, basis: 'phone', viaPhone: phone })
          sharedPhones.add(phone)
          return { identityId: owners[0].id, outcome: 'resolved', customer: isCustomer(owners[0]) }
        }
      }

      const id = seed({ email, basis: 'chat' })
      storePhone(byId(id)!, phone)
      return { identityId: id, outcome: 'resolved', customer: false }
    },
    async attachChatContact(identityId, emailRaw, phoneRaw): Promise<AttachResult> {
      const i = byId(identityId)
      if (!i) return { email: 'identity_missing', phone: 'identity_missing' }
      if (i.erasing) return { email: 'erasing', phone: 'erasing' }
      let email: AttachResult['email'] = 'none'
      let phone: AttachResult['phone'] = 'none'
      const e = normEmail(emailRaw)
      if (e) {
        const owner = byEmail(e)
        if (!owner) {
          i.emails.push({ email: e, basis: 'chat', viaPhone: null })
          email = 'attached'
        } else {
          email = owner.id === i.id ? 'unchanged' : 'owned_elsewhere'
        }
      }
      const p = normalizePhone(phoneRaw)
      if (p) {
        if (sharedPhones.has(p)) phone = 'shared'
        else if (liveOwnersOf(p, i.id).length > 0) phone = 'owned_elsewhere'
        else if (i.phones.has(p)) phone = 'unchanged'
        else {
          i.phones.add(p)
          phone = 'attached'
        }
      }
      return { email, phone }
    },
    async phoneUsable(phone) {
      return phone === null ? null : usablePhone(phone)
    },
    async enqueueSync(input) {
      if (opts.outbox) {
        const inserted = opts.outbox.enqueue({ key: input.key, availableAt: input.availableAt })
        if (inserted) enqueued.push({ eventType: input.eventType, key: input.key })
        return inserted
      }
      if (enqueued.some((e) => e.key === input.key)) return false
      enqueued.push({ eventType: input.eventType, key: input.key })
      return true
    },
  }

  return { store, identities, sharedPhones, enqueued, seed, byId, byEmail }
}
export type IdentityDouble = ReturnType<typeof makeIdentityDouble>

// ── Chat registry ───────────────────────────────────────────────────────────

interface LeadRow {
  id: string
  leadRef: string
  personKey: string
  identityId: string | null
  chatwootContactId: number | null
  phone: string | null
  espoLeadId: string | null
  espoContactId: string | null
  open: boolean
  closedReason: string | null
  convertedBookingId: string | null
  createdAt: string
}

interface ConversationRow {
  conversationId: number
  chatwootContactId: number | null
  identityId: string | null
  chatLeadId: string | null
  espoLeadId: string | null
  espoContactId: string | null
  outcome: ConversationOutcome
}

export function makeChatStoreDouble(opts: {
  identity?: IdentityDouble
  hooksStart?: Date | null
  now?: () => Date
} = {}) {
  const now = opts.now ?? (() => WORLD_NOW)
  const state = {
    hooksStart: opts.hooksStart === undefined ? WORLD_HOOKS_START : opts.hooksStart,
    leads: [] as LeadRow[],
    conversations: new Map<number, ConversationRow>(),
  }
  const calls = { reserve: 0, close: 0, record: 0 }

  const matchesScope = (l: LeadRow, input: ErasureScopeInput) =>
    (input.identityId !== null && l.identityId === input.identityId) ||
    (l.chatwootContactId !== null && input.chatwootContactIds.includes(l.chatwootContactId)) ||
    (l.phone !== null && input.phones.includes(l.phone))

  const store: ChatStore = {
    async hooksStart() {
      return state.hooksStart
    },
    async reserveLead(input): Promise<ReserveResult> {
      calls.reserve++
      const open = state.leads.find((l) => l.personKey === input.personKey && l.open)
      if (open) {
        return {
          chatLeadId: open.id,
          leadRef: open.leadRef,
          espoLeadId: open.espoLeadId,
          espoContactId: open.espoContactId,
          own: open.leadRef === input.leadRef,
        }
      }
      const byRef = state.leads.find((l) => l.leadRef === input.leadRef)
      if (byRef) {
        return {
          chatLeadId: byRef.id,
          leadRef: byRef.leadRef,
          espoLeadId: byRef.espoLeadId,
          espoContactId: byRef.espoContactId,
          own: true,
        }
      }
      const row: LeadRow = {
        id: nextUuid(),
        leadRef: input.leadRef,
        personKey: input.personKey,
        identityId: input.identityId,
        chatwootContactId: input.chatwootContactId,
        phone: input.phone,
        espoLeadId: null,
        espoContactId: null,
        open: true,
        closedReason: null,
        convertedBookingId: null,
        createdAt: now().toISOString(),
      }
      state.leads.push(row)
      return { chatLeadId: row.id, leadRef: row.leadRef, espoLeadId: null, espoContactId: null, own: true }
    },
    async setLeadEspo(chatLeadId, espoLeadId, espoContactId) {
      const l = state.leads.find((x) => x.id === chatLeadId)
      if (!l) return false
      l.espoLeadId = espoLeadId ?? l.espoLeadId
      l.espoContactId = espoContactId ?? l.espoContactId
      return true
    },
    async closeLead(chatLeadId, reason, bookingId) {
      calls.close++
      const l = state.leads.find((x) => x.id === chatLeadId)
      if (!l || !l.open) return false
      l.open = false
      l.closedReason = reason
      l.convertedBookingId = bookingId ?? null
      return true
    },
    async linkIdentity(chatwootContactId, identityId) {
      const cKey = `c:${chatwootContactId}`
      const iKey = `i:${identityId}`
      let moved = 0
      const lead = state.leads.find((l) => l.personKey === cKey && l.open)
      if (lead) {
        if (!state.leads.some((l) => l.personKey === iKey && l.open)) {
          lead.personKey = iKey
          lead.identityId = identityId
          lead.phone = null
          moved = 1
        } else {
          lead.identityId = identityId
        }
      }
      for (const c of state.conversations.values()) {
        if (c.chatwootContactId === chatwootContactId && c.identityId === null) c.identityId = identityId
      }
      return moved
    },
    async recordConversation(input) {
      calls.record++
      const prev = state.conversations.get(input.conversationId)
      state.conversations.set(input.conversationId, {
        conversationId: input.conversationId,
        chatwootContactId: input.chatwootContactId ?? prev?.chatwootContactId ?? null,
        identityId: input.identityId ?? prev?.identityId ?? null,
        chatLeadId: input.chatLeadId ?? prev?.chatLeadId ?? null,
        espoLeadId: input.espoLeadId ?? prev?.espoLeadId ?? null,
        espoContactId: input.espoContactId ?? prev?.espoContactId ?? null,
        outcome: input.outcome,
      })
      return true
    },
    async conversation(conversationId): Promise<ChatConversationRecord | null> {
      const c = state.conversations.get(conversationId)
      if (!c) return null
      const lead = c.chatLeadId ? state.leads.find((l) => l.id === c.chatLeadId) : undefined
      const ident = c.identityId ? opts.identity?.byId(c.identityId) : undefined
      return {
        conversationId: c.conversationId,
        outcome: c.outcome,
        chatwootContactId: c.chatwootContactId,
        identityId: c.identityId,
        espoLeadId: c.espoLeadId,
        espoContactId: c.espoContactId,
        chatLead: lead
          ? {
              id: lead.id,
              leadRef: lead.leadRef,
              espoLeadId: lead.espoLeadId,
              espoContactId: lead.espoContactId,
              open: lead.open,
            }
          : null,
        identity: ident
          ? {
              id: ident.id,
              customer: ident.userId !== null || ident.bookings > 0,
              erasing: ident.erasing,
              espoContactId: ident.espoContactId,
              chatwootContactId: ident.chatwootContactId,
            }
          : null,
      }
    },
    async openLeadsForPerson(identityId, phones) {
      return state.leads
        .filter((l) => l.open && ((identityId !== null && l.identityId === identityId) || (l.identityId === null && l.phone !== null && phones.includes(l.phone))))
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .map((l) => ({ chatLeadId: l.id, leadRef: l.leadRef, espoLeadId: l.espoLeadId, createdAt: l.createdAt }))
    },
    async erasureScope(input) {
      const leadIds = new Set(state.leads.filter((l) => matchesScope(l, input)).map((l) => l.id))
      const out: Array<{ leadRef: string; espoLeadId: string | null; espoContactId: string | null }> = []
      for (const l of state.leads) {
        if (leadIds.has(l.id)) out.push({ leadRef: l.leadRef, espoLeadId: l.espoLeadId, espoContactId: l.espoContactId })
      }
      for (const c of state.conversations.values()) {
        if (!c.espoLeadId && !c.espoContactId) continue
        const inScope =
          (input.identityId !== null && c.identityId === input.identityId) ||
          (c.chatwootContactId !== null && input.chatwootContactIds.includes(c.chatwootContactId)) ||
          (c.chatLeadId !== null && leadIds.has(c.chatLeadId))
        if (!inScope) continue
        const lead = c.chatLeadId ? state.leads.find((l) => l.id === c.chatLeadId) : undefined
        out.push({ leadRef: lead?.leadRef ?? '', espoLeadId: c.espoLeadId, espoContactId: c.espoContactId })
      }
      return out
    },
    async erase(input) {
      const leadIds = new Set(state.leads.filter((l) => matchesScope(l, input)).map((l) => l.id))
      let removed = 0
      for (const [id, c] of [...state.conversations]) {
        const inScope =
          (input.identityId !== null && c.identityId === input.identityId) ||
          (c.chatwootContactId !== null && input.chatwootContactIds.includes(c.chatwootContactId)) ||
          (c.chatLeadId !== null && leadIds.has(c.chatLeadId))
        if (inScope) {
          state.conversations.delete(id)
          removed++
        }
      }
      const before = state.leads.length
      state.leads = state.leads.filter((l) => !leadIds.has(l.id))
      return removed + (before - state.leads.length)
    },
  }

  return { store, state, calls }
}
export type ChatStoreDouble = ReturnType<typeof makeChatStoreDouble>

// ── Webhook ingest ──────────────────────────────────────────────────────────

const FUSE_WINDOW_MS = 10 * 60 * 1000
const CHATWOOT_EVENT_RE = /^hook\.(chat_intake|chat_resolve|chat_label|chat_contact)$/

export function makeWebhookStoreDouble(opts: {
  outbox: OutboxDouble
  identity?: IdentityDouble
  hooksStart: () => Date | null
  now?: () => Date
}) {
  const now = opts.now ?? (() => WORLD_NOW)
  const deliveries: Array<{ source: string; deliveryId: string; entityKey: string; receivedAt: number }> = []

  function recordDelivery(source: string, deliveryId: string, entityKey: string): boolean {
    if (deliveries.some((d) => d.source === source && d.deliveryId === deliveryId)) return false
    deliveries.push({ source, deliveryId, entityKey, receivedAt: now().getTime() })
    return true
  }
  const recent = (source: string, entityKey: string) =>
    deliveries.filter((d) => d.source === source && d.entityKey === entityKey && d.receivedAt > now().getTime() - FUSE_WINDOW_MS).length

  const store: WebhookStore = {
    async ingest(input: IngestInput): Promise<IngestOutcome> {
      if (input.source !== 'chatwoot' || !CHATWOOT_EVENT_RE.test(input.eventType) || !input.key.startsWith(`${input.eventType}:`)) {
        throw new OutboxStoreError('db_error')
      }
      if (!opts.hooksStart()) return 'off'
      if (!recordDelivery(input.source, input.deliveryId, input.entityKey)) return 'duplicate'
      if (input.fuseLimit !== null && recent(input.source, input.entityKey) > input.fuseLimit) return 'fused'
      return opts.outbox.enqueue({ key: input.key, availableAt: input.availableAt }) ? 'queued' : 'exists'
    },
    async ingestEspo(input: IngestEspoInput): Promise<IngestEspoResult> {
      if (
        !/^[0-9a-f]{17}$/.test(input.espoContactId) ||
        !/^m[1-7]$/.test(input.tagSuffix) ||
        input.bucketSeconds < 10 ||
        input.bucketSeconds > 300
      ) {
        throw new OutboxStoreError('db_error')
      }
      const result = (outcome: EspoIngestOutcome, key: string | null = null, availableAt: Date | null = null) => ({ outcome, key, availableAt })
      if (!opts.hooksStart()) return result('off')
      const entityKey = `espo:contact:${input.espoContactId}`
      if (!recordDelivery('espocrm', input.deliveryId, entityKey)) return result('duplicate')
      const person = opts.identity?.identities.find((i) => i.espoContactId === input.espoContactId)
      if (!person) return result('unlinked')
      if (person.erasing) return result('erasing')
      if (input.fuseLimit !== null && recent('espocrm', entityKey) > input.fuseLimit) return result('fused')
      const bucket = Math.floor(now().getTime() / 1000 / input.bucketSeconds)
      const key = `hook.espo_contact:${person.id}:b${bucket}${input.tagSuffix}`
      const availableAt = new Date((bucket + 1) * input.bucketSeconds * 1000)
      return result(opts.outbox.enqueue({ key, availableAt }) ? 'queued' : 'exists', key, availableAt)
    },
    async purge(input) {
      const t = now().getTime()
      const before = deliveries.length
      for (let i = deliveries.length - 1; i >= 0; i--) {
        const days = deliveries[i].source === 'chatwoot' ? input.chatwootDays : input.espoDays
        if (deliveries[i].receivedAt < t - days * 86_400_000) deliveries.splice(i, 1)
      }
      return before - deliveries.length
    },
  }
  return { store, deliveries }
}
export type WebhookStoreDouble = ReturnType<typeof makeWebhookStoreDouble>

// ── Signing helpers ─────────────────────────────────────────────────────────

/** Headers of a Chatwoot account webhook: HMAC-SHA256 over `<timestamp>.<raw body>`. */
export function signChatwoot(
  rawBody: string | Buffer,
  secret: string,
  opts: { timestampSec?: number; deliveryId?: string } = {},
): Record<string, string> {
  const timestamp = String(opts.timestampSec ?? Math.floor(WORLD_NOW.getTime() / 1000))
  const body = typeof rawBody === 'string' ? Buffer.from(rawBody) : rawBody
  const signature = 'sha256=' + createHmac('sha256', secret).update(Buffer.concat([Buffer.from(`${timestamp}.`), body])).digest('hex')
  const headers: Record<string, string> = {
    'X-Chatwoot-Signature': signature,
    'X-Chatwoot-Timestamp': timestamp,
  }
  if (opts.deliveryId) headers['X-Chatwoot-Delivery'] = opts.deliveryId
  return headers
}

/** Header of an EspoCRM webhook: `Signature` = base64("<webhookId>:<hex HMAC-SHA256 of the body>"). */
export function signEspo(rawBody: string | Buffer, secret: string, webhookId: string): Record<string, string> {
  const hex = createHmac('sha256', secret).update(typeof rawBody === 'string' ? Buffer.from(rawBody) : rawBody).digest('hex')
  return { Signature: Buffer.from(`${webhookId}:${hex}`).toString('base64') }
}

// ── The world ───────────────────────────────────────────────────────────────

export interface WorldOptions {
  now?: Date
  /** null = hooks off (gate absent). Default: WORLD_HOOKS_START. */
  hooksStart?: Date | null
  cw?: FakeChatwootOptions
  espo?: FakeEspoOptions
  sharedPhones?: string[]
  /** Leave the Chatwoot / EspoCRM clients unconfigured to exercise the breaker gates. */
  chatwootConfigured?: boolean
  crmConfigured?: boolean
}

const API_KEY = 'key_SECRET_abcdef0123'

/** A Chatwoot message seed for makeWorld().cw.seedConversation. */
export function incoming(content: string, over: Record<string, unknown> = {}) {
  return { content, message_type: 0 as const, ...over }
}

export function makeWorld(options: WorldOptions = {}) {
  let nowMs = (options.now ?? WORLD_NOW).getTime()
  const now = () => new Date(nowMs)
  let hooksStart: Date | null = options.hooksStart === undefined ? WORLD_HOOKS_START : options.hooksStart

  const outbox = makeOutboxStore({ now })
  const identity = makeIdentityDouble({ outbox, sharedPhones: options.sharedPhones })
  const chat = makeChatStoreDouble({ identity, hooksStart, now })
  // hooksStart is read through the double's state so a test can flip it after construction.
  chat.state.hooksStart = hooksStart
  const webhook = makeWebhookStoreDouble({ outbox, identity, hooksStart: () => chat.state.hooksStart, now })

  const cw = createFakeChatwoot({
    accountId: WORLD_ACCOUNT_ID,
    inboxes: [{ id: 1, name: 'Website', channel_type: 'Channel::WebWidget' }],
    ...options.cw,
  })
  const espo = createFakeEspoCRM({
    ...options.espo,
    records: { Lead: [], Contact: [], Note: [], ...(options.espo?.records ?? {}) },
    // The unique index on Lead.cSupabaseRef: a second POST with the same ref answers 409.
    duplicateCheck: { Lead: 'cSupabaseRef', ...(options.espo?.duplicateCheck ?? {}) },
    extraRoutes: async (req, state) => {
      const stream = /^\/(Lead|Contact)\/([0-9a-f]{17})\/stream$/.exec(req.path)
      if (req.method === 'GET' && stream) {
        const size = Number(new URLSearchParams(req.query).get('maxSize') ?? 20)
        const notes = (state.records.Note ?? []).filter((n) => n.parentType === stream[1] && n.parentId === stream[2])
        return new Response(JSON.stringify({ total: notes.length, list: [...notes].reverse().slice(0, size) }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      return options.espo?.extraRoutes?.(req, state)
    },
  })

  const config: SiteEspoConfig = { baseUrl: 'https://crm.example.test', apiKey: API_KEY, leadAssigneeId: WORLD_ASSIGNEE }
  const chatwootConfig: SiteChatwootConfig = {
    baseUrl: WORLD_CHATWOOT_URL,
    accountId: WORLD_ACCOUNT_ID,
    token: FAKE_AGENT_TOKEN,
    adminToken: FAKE_ADMIN_TOKEN,
  }
  const crm = createSiteEspoClient({ config, fetchImpl: espo.fetchImpl as unknown as typeof fetch, timeoutMs: 500 })
  const chatwoot = createSiteChatwootClient({ config: chatwootConfig, fetchImpl: cw.fetchImpl as unknown as typeof fetch, timeoutMs: 500 })
  const chatwootAdmin = createSiteChatwootClient({
    config: chatwootConfig,
    admin: true,
    fetchImpl: cw.fetchImpl as unknown as typeof fetch,
    timeoutMs: 500,
  })
  const publish = vi.fn(async () => true)

  function deps(over: Partial<DispatchDeps> = {}): Partial<DispatchDeps> {
    return {
      store: outbox.store,
      crm: options.crmConfigured === false ? null : crm,
      config: options.crmConfigured === false ? null : config,
      chatwoot: options.chatwootConfigured === false ? null : chatwoot,
      chatwootAdmin: options.chatwootConfigured === false ? null : chatwootAdmin,
      chatwootConfig: options.chatwootConfigured === false ? null : chatwootConfig,
      identity: identity.store,
      chat: chat.store,
      publish: publish as unknown as DispatchDeps['publish'],
      now,
      ...over,
    }
  }

  /** Dispatches one outbox key through the real dispatcher; the row is created when it is not there yet. */
  async function dispatch(key: string, over: Partial<DispatchDeps> = {}): Promise<DispatchResult> {
    if (!outbox.rows.has(key)) outbox.insert(key)
    return dispatchOutboxKey(key, deps(over))
  }

  /** Puts a finished row back to pending, as a QStash redelivery after a lost completion would. */
  function reset(key: string): void {
    const row = outbox.rows.get(key)
    if (row) Object.assign(row, { status: 'pending', lease_until: null, last_error: null })
  }

  const intakeKey = (conversationId: number) =>
    `hook.chat_intake:${aggregateUuid('conversation', conversationId)}:c${conversationId}`

  return {
    outbox,
    identity,
    chat,
    webhook,
    cw,
    espo,
    crm,
    chatwoot,
    config,
    chatwootConfig,
    publish,
    deps,
    dispatch,
    reset,
    intakeKey,
    now,
    advance: (ms: number) => {
      nowMs += ms
    },
    setHooksStart: (value: Date | null) => {
      hooksStart = value
      chat.state.hooksStart = value
    },
    /** Unix seconds `offsetSec` after the world's now (negative = before). */
    secs: (offsetSec = 0) => Math.floor(nowMs / 1000) + offsetSec,
    leads: () => espo.state.records.Lead,
    contacts: () => espo.state.records.Contact,
    notes: () => espo.state.records.Note,
    /** EspoCRM requests that changed something. */
    espoWrites: () => espo.requests.filter((r) => r.method !== 'GET'),
  }
}
export type World = ReturnType<typeof makeWorld>
