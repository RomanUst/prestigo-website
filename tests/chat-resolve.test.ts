// @vitest-environment node
import { describe, it, expect } from 'vitest'
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
