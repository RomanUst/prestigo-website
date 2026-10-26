// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'
import { incoming, makeWorld, WORLD_ACCOUNT_ID, type World, type WorldOptions } from './helpers/chat-world'
import { aggregateUuid } from '@/lib/sync-origin'

// Synthetic fixtures only (example domains, fake names). No real person, key or secret.

const EPOCH = 1729950000
const outgoing = (content: string, over: Record<string, unknown> = {}) => ({ content, message_type: 1 as const, ...over })
const activity = (content: string) => ({ content, message_type: 2 as const })

const resolveKey = (conversationId: number, epoch = EPOCH) =>
  `hook.chat_resolve:${aggregateUuid('conversation', conversationId)}:c${conversationId}r${epoch}`

interface ConversationSeed {
  id: number
  contactId?: number | null
  channel?: string
  labels?: string[]
  createdOffsetSec?: number
  messages?: Array<Record<string, unknown> & { content: string; message_type: 0 | 1 | 2 | 3 }>
}

function seedConversation(w: World, c: ConversationSeed) {
  w.cw.seedConversation({
    id: c.id,
    inbox_id: 1,
    contact_id: c.contactId === undefined ? 7 : c.contactId,
    channel: c.channel ?? 'Channel::WebWidget',
    labels: c.labels ?? [],
    created_at: w.secs(c.createdOffsetSec ?? -600),
    messages: c.messages ?? [incoming('Need a car to Vienna on Friday')],
  })
}

/** The notes of the EspoCRM fake that are resolve entries. */
function resolveNotes(w: World) {
  return w.notes().filter((n) => typeof n.post === 'string' && /resolved\n/.test(n.post as string))
}

function janWorld(options: WorldOptions = {}, conversation: Partial<ConversationSeed> = {}) {
  const w = makeWorld(options)
  w.cw.seed({ id: 7, name: 'Jan Novák', email: 'jan@x.example' })
  seedConversation(w, {
    id: 42,
    labels: ['ch-web', 'booking-new'],
    messages: [
      incoming('Need a car to Vienna on Friday'),
      outgoing('Sure, we can pick you up at 13:00'),
      outgoing('Итог: перенёс подачу на 14:00', { private: true }),
    ],
    ...conversation,
  })
  return w
}

// ── Task 1: tracer ──────────────────────────────────────────────────────────

describe('hook.chat_resolve - tracer (resolved conversation -> one history Note on the Contact)', () => {
  it('writes one Post Note with channel, dates, count, topics, first message, summary, link and marker', async () => {
    const w = janWorld()
    await w.dispatch(w.intakeKey(42))
    const contactId = w.contacts()[0].id

    const result = await w.dispatch(resolveKey(42))

    expect(result).toEqual({ outcome: 'sent' })
    const notes = resolveNotes(w)
    expect(notes).toHaveLength(1)
    const note = notes[0]
    expect(note).toMatchObject({ parentType: 'Contact', parentId: contactId, type: 'Post' })
    const post = note.post as string
    expect(post).toContain('Website chat')
    expect(post).toContain('Opened: 2026-10-26 11:50 UTC')
    expect(post).toContain('Resolved: 2024-10-26 13:40 UTC')
    expect(post).toContain('Messages: 2')
    expect(post).toContain('Topics: booking-new')
    expect(post).not.toContain('ch-web')
    expect(post).toContain('First message: Need a car to Vienna on Friday')
    expect(post).toContain('Summary: перенёс подачу на 14:00')
    expect(post).toContain(`/app/accounts/${WORLD_ACCOUNT_ID}/conversations/42`)
    expect(post.trimEnd().endsWith(`[cw:42:r${EPOCH}]`)).toBe(true)
    // No transcript: the operator reply is not copied.
    expect(post).not.toContain('pick you up at 13:00')
    expect(w.outbox.rows.get(resolveKey(42))?.status).toBe('sent')
  })

  it('the same key delivered again writes no second Note', async () => {
    const w = janWorld()
    await w.dispatch(w.intakeKey(42))
    const key = resolveKey(42)
    await w.dispatch(key)
    const writes = w.espoWrites().length

    w.reset(key)
    const again = await w.dispatch(key)

    expect(again).toEqual({ outcome: 'sent' })
    expect(resolveNotes(w)).toHaveLength(1)
    expect(w.espoWrites()).toHaveLength(writes)
  })

  it('never writes to Chatwoot', async () => {
    const w = janWorld()
    await w.dispatch(w.intakeKey(42))
    await w.dispatch(resolveKey(42))
    expect(w.cw.writes()).toEqual([])
  })

  it('is routed by the dispatcher (no longer unsupported_event)', async () => {
    const w = janWorld()
    const result = await w.dispatch(resolveKey(42))
    expect(result.code).not.toBe('unsupported_event')
  })
})

// ── Task 2: targets, episodes, ordering, paging and no-target cases ─────────

const CONTACT_ID_A = 'a1b2c3d4e5f6a7b8c'
const FORM_LEAD_ID = 'd1d2d3d4d5d6d7d8d'
const EPOCH_2 = EPOCH + 900

const postsOf = (w: World) => resolveNotes(w).map((n) => String(n.post))

type SeedMessages = NonNullable<ConversationSeed['messages']>

describe('hook.chat_resolve - target of the entry (D-11, D-06)', () => {
  it('Telegram conversation (Lead only, no Contact) -> the Note goes to the Lead', async () => {
    const w = makeWorld()
    w.cw.seed({ id: 7, name: 'Jan Novák' })
    seedConversation(w, { id: 42, channel: 'Channel::Telegram' })
    await w.dispatch(w.intakeKey(42))
    const leadId = w.leads()[0].id

    const result = await w.dispatch(resolveKey(42))

    expect(result).toEqual({ outcome: 'sent' })
    expect(w.contacts()).toHaveLength(0)
    expect(resolveNotes(w)).toHaveLength(1)
    expect(resolveNotes(w)[0]).toMatchObject({ parentType: 'Lead', parentId: leadId, type: 'Post' })
    expect(postsOf(w)[0]).toContain('Telegram')
  })

  it('the same Telegram person after a Contact was linked to the chat Lead -> the next resolve goes to the Contact', async () => {
    const w = makeWorld()
    w.cw.seed({ id: 7, name: 'Jan Novák' })
    seedConversation(w, { id: 42, channel: 'Channel::Telegram' })
    await w.dispatch(w.intakeKey(42))
    await w.dispatch(resolveKey(42, EPOCH))
    w.chat.state.leads[0].espoContactId = CONTACT_ID_A

    await w.dispatch(resolveKey(42, EPOCH_2))

    const notes = resolveNotes(w)
    expect(notes).toHaveLength(2)
    expect(notes[0]).toMatchObject({ parentType: 'Lead' })
    expect(notes[1]).toMatchObject({ parentType: 'Contact', parentId: CONTACT_ID_A })
  })

  it('customer conversation (identity with a booking and a Contact) -> Note on that Contact, no Lead', async () => {
    const w = janWorld({ espo: { records: { Contact: [{ id: CONTACT_ID_A, lastName: 'Novak', emailAddress: 'jan@x.example' }] } } })
    w.identity.seed({ email: 'jan@x.example', bookings: 1, espoContactId: CONTACT_ID_A })

    const result = await w.dispatch(resolveKey(42))

    expect(result).toEqual({ outcome: 'sent' })
    expect(w.leads()).toHaveLength(0)
    expect(resolveNotes(w)).toHaveLength(1)
    expect(resolveNotes(w)[0]).toMatchObject({ parentType: 'Contact', parentId: CONTACT_ID_A })
  })

  it('customer whose identity has no Contact yet -> rescheduled contact_pending, zero Notes', async () => {
    const w = janWorld()
    w.identity.seed({ email: 'jan@x.example', bookings: 1, espoContactId: null })

    const result = await w.dispatch(resolveKey(42))

    expect(result).toEqual({ outcome: 'rescheduled', code: 'contact_pending' })
    expect(w.notes()).toHaveLength(0)
    expect(w.espoWrites()).toEqual([])
  })

  it('contact_pending is retried and, once the Contact exists, the entry is written', async () => {
    const w = janWorld({ espo: { records: { Contact: [{ id: CONTACT_ID_A, lastName: 'Novak', emailAddress: 'jan@x.example' }] } } })
    const identityId = w.identity.seed({ email: 'jan@x.example', bookings: 1, espoContactId: null })
    const key = resolveKey(42)
    await w.dispatch(key)
    expect(w.notes()).toHaveLength(0)

    w.identity.byId(identityId)!.espoContactId = CONTACT_ID_A
    // The retry becomes due after its backoff.
    w.advance(60 * 60 * 1000)
    const again = await w.dispatch(key)

    expect(again).toEqual({ outcome: 'sent' })
    expect(resolveNotes(w)).toHaveLength(1)
    expect(resolveNotes(w)[0]).toMatchObject({ parentType: 'Contact', parentId: CONTACT_ID_A })
  })

  it('contact_pending becomes terminal after the attempt budget', async () => {
    const w = janWorld()
    w.identity.seed({ email: 'jan@x.example', bookings: 1, espoContactId: null })
    const key = resolveKey(42)
    w.outbox.insert(key, { attempts: 29 })

    const result = await w.dispatch(key)

    expect(result).toEqual({ outcome: 'failed', code: 'contact_pending_exhausted' })
    expect(w.notes()).toHaveLength(0)
  })

  it('known-contact conversation (EspoCRM Contact, no identity) -> Note on the recorded Contact', async () => {
    const w = janWorld({ espo: { records: { Contact: [{ id: CONTACT_ID_A, lastName: 'Novak', emailAddress: 'jan@x.example' }] } } })

    const result = await w.dispatch(resolveKey(42))

    expect(result).toEqual({ outcome: 'sent' })
    expect(w.leads()).toHaveLength(0)
    expect(w.identity.identities).toHaveLength(0)
    expect(resolveNotes(w)).toHaveLength(1)
    expect(resolveNotes(w)[0]).toMatchObject({ parentType: 'Contact', parentId: CONTACT_ID_A })
  })

  it('D-20 adopted conversation of a person without a Contact -> Note on the adopted Lead', async () => {
    const w = janWorld()
    w.espo.state.records.Lead.push({
      id: FORM_LEAD_ID,
      cSupabaseRef: 'inquiry:0b9f2c1e-5d3a-4e8b-9c7d-1a2b3c4d5e6f',
      source: 'Contact form',
      status: 'New',
      emailAddress: 'jan@x.example',
    })
    await w.chat.store.recordConversation({
      conversationId: 42,
      chatwootContactId: 7,
      identityId: null,
      chatLeadId: null,
      espoLeadId: FORM_LEAD_ID,
      espoContactId: null,
      outcome: 'lead_adopted',
    })

    const result = await w.dispatch(resolveKey(42))

    expect(result).toEqual({ outcome: 'sent' })
    expect(resolveNotes(w)).toHaveLength(1)
    expect(resolveNotes(w)[0]).toMatchObject({ parentType: 'Lead', parentId: FORM_LEAD_ID })
  })

  it('D-20 adoption of a person with an email: the Contact is the target', async () => {
    const w = janWorld()
    w.espo.state.records.Lead.push({
      id: FORM_LEAD_ID,
      cSupabaseRef: 'inquiry:0b9f2c1e-5d3a-4e8b-9c7d-1a2b3c4d5e6f',
      source: 'Contact form',
      status: 'New',
      emailAddress: 'jan@x.example',
      createdAt: new Date(w.now().getTime() - 3_600_000).toISOString().slice(0, 19).replace('T', ' '),
    })
    await w.dispatch(w.intakeKey(42))

    await w.dispatch(resolveKey(42))

    expect(resolveNotes(w)).toHaveLength(1)
    expect(resolveNotes(w)[0]).toMatchObject({ parentType: 'Contact', parentId: w.contacts()[0].id })
  })
})

describe('hook.chat_resolve - episodes (D-10) and ordering (Pitfall 12)', () => {
  it('resolve, reopen, resolve again -> two Notes with different markers; the first key re-delivered -> still two', async () => {
    const w = janWorld()
    await w.dispatch(w.intakeKey(42))
    await w.dispatch(resolveKey(42, EPOCH))
    await w.dispatch(resolveKey(42, EPOCH_2))

    let posts = postsOf(w)
    expect(posts).toHaveLength(2)
    expect(posts[0]).toContain(`[cw:42:r${EPOCH}]`)
    expect(posts[1]).toContain(`[cw:42:r${EPOCH_2}]`)

    w.reset(resolveKey(42, EPOCH))
    await w.dispatch(resolveKey(42, EPOCH))
    posts = postsOf(w)
    expect(posts).toHaveLength(2)
  })

  it('two resolves 1 s apart produce two entries; the same epoch twice produces one', async () => {
    const w = janWorld()
    await w.dispatch(w.intakeKey(42))
    await w.dispatch(resolveKey(42, EPOCH))
    await w.dispatch(resolveKey(42, EPOCH + 1))
    expect(resolveNotes(w)).toHaveLength(2)

    w.reset(resolveKey(42, EPOCH + 1))
    await w.dispatch(resolveKey(42, EPOCH + 1))
    expect(resolveNotes(w)).toHaveLength(2)
  })

  it('a resolve dispatched before its intake creates Contact and Lead, then one Note; the intake row afterwards changes nothing', async () => {
    const w = janWorld()
    w.outbox.insert(w.intakeKey(42))

    const result = await w.dispatch(resolveKey(42))

    expect(result).toEqual({ outcome: 'sent' })
    expect(w.leads()).toHaveLength(1)
    expect(w.contacts()).toHaveLength(1)
    expect(resolveNotes(w)).toHaveLength(1)
    expect(resolveNotes(w)[0]).toMatchObject({ parentType: 'Contact', parentId: w.contacts()[0].id })
    const writes = w.espoWrites().length

    const intake = await w.dispatch(w.intakeKey(42))

    expect(intake).toEqual({ outcome: 'sent' })
    expect(w.leads()).toHaveLength(1)
    expect(w.contacts()).toHaveLength(1)
    expect(w.notes()).toHaveLength(1)
    expect(w.espoWrites()).toHaveLength(writes)
  })

  it('a crash after the post (row never completed) writes nothing on the retry', async () => {
    const w = janWorld()
    await w.dispatch(w.intakeKey(42))
    const key = resolveKey(42)
    await w.dispatch(key)
    // Lost completion: the row is claimable again, the Note is already in the stream.
    w.reset(key)
    const again = await w.dispatch(key)
    expect(again).toEqual({ outcome: 'sent' })
    expect(resolveNotes(w)).toHaveLength(1)
  })
})

describe('hook.chat_resolve - entry content', () => {
  it('no summary note -> no Summary line; a public "Summary: x" reply is ignored', async () => {
    const w = janWorld({}, {
      messages: [incoming('Need a car'), outgoing('Summary: this is a public reply'), outgoing('internal remark', { private: true })],
    })
    await w.dispatch(w.intakeKey(42))

    await w.dispatch(resolveKey(42))

    const post = postsOf(w)[0]
    expect(post).not.toContain('Summary:')
    expect(post).toContain('Messages: 2')
  })

  it('the last Итог / Summary private note wins', async () => {
    const w = janWorld({}, {
      messages: [
        incoming('Need a car'),
        outgoing('Итог: первая версия', { private: true }),
        outgoing('Summary: final version', { private: true }),
      ],
    })
    await w.dispatch(w.intakeKey(42))

    await w.dispatch(resolveKey(42))

    const post = postsOf(w)[0]
    expect(post).toContain('Summary: final version')
    expect(post).not.toContain('первая версия')
  })

  it('150 messages (10 activity, 5 private) are paged and counted: Messages: 135', async () => {
    const messages: SeedMessages = [incoming('first question')]
    for (let i = 0; i < 134; i++) messages.push(outgoing(`reply ${i}`))
    for (let i = 0; i < 10; i++) messages.push(activity(`status ${i}`))
    for (let i = 0; i < 5; i++) messages.push(outgoing(`private ${i}`, { private: true }))
    expect(messages).toHaveLength(150)
    const w = janWorld({}, { messages })
    await w.dispatch(w.intakeKey(42))

    await w.dispatch(resolveKey(42))

    expect(postsOf(w)[0]).toContain('Messages: 135\n')
    const pageRequests = w.cw.requests.filter((r) => /\/conversations\/42\/messages/.test(r.path))
    expect(pageRequests.length).toBeGreaterThanOrEqual(2)
  })

  it('more than 20 pages stops the count: Messages: 2000+', async () => {
    const messages: SeedMessages = [incoming('first question')]
    for (let i = 0; i < 2099; i++) messages.push(outgoing(`reply ${i}`))
    const w = janWorld({}, { messages })
    await w.dispatch(w.intakeKey(42))

    await w.dispatch(resolveKey(42))

    expect(postsOf(w)[0]).toContain('Messages: 2000+')
    const pages = w.cw.requests.filter((r) => /\/conversations\/42\/messages/.test(r.path))
    // 1 page for the intake + 20 for the resolve.
    expect(pages.length).toBe(21)
  })

  it('the first message is truncated to 300 characters', async () => {
    const w = janWorld({}, { messages: [incoming('x'.repeat(900))] })
    await w.dispatch(w.intakeKey(42))

    await w.dispatch(resolveKey(42))

    const line = postsOf(w)[0].split('\n').find((l) => l.startsWith('First message: ')) as string
    expect(line.length).toBeLessThanOrEqual('First message: '.length + 300)
  })
})

describe('hook.chat_resolve - no target and gates', () => {
  it('a filtered (auto-reply) conversation of an unknown sender -> skipped no_target, zero EspoCRM writes', async () => {
    const w = janWorld()
    w.cw.state.conversations[0].messages[0].content_attributes = { email: { auto_reply: true } }

    const result = await w.dispatch(resolveKey(42))

    expect(result).toEqual({ outcome: 'skipped', code: 'no_target' })
    expect(w.espoWrites()).toEqual([])
    expect(w.notes()).toHaveLength(0)
  })

  it('a no-lead conversation of an unknown person -> skipped no_target', async () => {
    const w = janWorld({}, { labels: ['no-lead'] })

    const result = await w.dispatch(resolveKey(42))

    expect(result).toEqual({ outcome: 'skipped', code: 'no_target' })
    expect(w.espoWrites()).toEqual([])
  })

  it('hooksStart null -> skipped hooks_off', async () => {
    const w = janWorld({ hooksStart: null })

    const result = await w.dispatch(resolveKey(42))

    expect(result).toEqual({ outcome: 'skipped', code: 'hooks_off' })
    expect(w.espoWrites()).toEqual([])
  })

  it('a conversation older than the go-live instant is skipped before_start', async () => {
    const w = janWorld({}, { createdOffsetSec: -30 * 86_400 })

    const result = await w.dispatch(resolveKey(42))

    expect(result).toEqual({ outcome: 'skipped', code: 'before_start' })
    expect(w.espoWrites()).toEqual([])
  })

  it('a conversation that is gone from Chatwoot is skipped conversation_missing', async () => {
    const w = makeWorld()

    const result = await w.dispatch(resolveKey(99))

    expect(result).toEqual({ outcome: 'skipped', code: 'conversation_missing' })
  })

  it('an erasing identity gets no entry', async () => {
    const w = janWorld()
    w.identity.seed({ email: 'jan@x.example', erasing: true })

    const result = await w.dispatch(resolveKey(42))

    expect(result).toEqual({ outcome: 'skipped', code: 'identity_erasing' })
    expect(w.espoWrites()).toEqual([])
  })

  it('unconfigured Chatwoot or CRM waits at the breaker and writes nothing', async () => {
    const a = janWorld({ chatwootConfigured: false })
    expect((await a.dispatch(resolveKey(42))).outcome).toBe('breaker')
    const b = janWorld({ crmConfigured: false })
    expect((await b.dispatch(resolveKey(42))).outcome).toBe('breaker')
    expect(a.espoWrites()).toEqual([])
  })
})

describe('hook.chat_resolve - logs carry no personal data (T-83-29)', () => {
  it('console output holds the key, outcome and code only', async () => {
    const w = janWorld()
    await w.dispatch(w.intakeKey(42))
    const spies = (['log', 'warn', 'error', 'info'] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}))
    try {
      await w.dispatch(resolveKey(42))
      const out = spies.flatMap((s) => s.mock.calls.map((c) => c.map(String).join(' '))).join('\n')
      expect(out).toContain('[chat-resolve]')
      expect(out).toContain(`key=${resolveKey(42)}`)
      for (const secret of ['перенёс', 'Need a car', 'jan@x.example', 'Jan', 'Novák', 'pick you up']) {
        expect(out).not.toContain(secret)
      }
    } finally {
      for (const s of spies) s.mockRestore()
    }
  })
})
