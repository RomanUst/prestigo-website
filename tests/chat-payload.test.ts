// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { classifyChatwootEvent, type ChatwootIngestPlan } from '@/lib/chat-payload'
import {
  SITE_SYNC_FP_ATTRIBUTE,
  aggregateUuid,
  contactFingerprint,
  hookContactKey,
} from '@/lib/sync-origin'
import { parseOutboxKey } from '@/lib/outbox'

const NOW_MS = 1_729_950_012_345
const HEADER_SEC = 1_729_950_000
const ctx = { nowMs: NOW_MS, headerTimestampSec: HEADER_SEC }

function plan(result: ReturnType<typeof classifyChatwootEvent>): ChatwootIngestPlan {
  if (result.kind !== 'ingest') throw new Error(`expected ingest, got ${JSON.stringify(result)}`)
  return result.plan
}

// ---------------------------------------------------------------------------------------------
// contact_updated (D-12, HOOK-04 receiver layer)
// ---------------------------------------------------------------------------------------------

const CONTACT = { name: 'Ada Lovelace', email: 'ada@example.com', phone_number: '+420111222333', identifier: null }

function contactEvent(overrides: Record<string, unknown> = {}) {
  return {
    event: 'contact_updated',
    id: 7,
    ...CONTACT,
    custom_attributes: {},
    changed_attributes: [{ email: { previous_value: null, current_value: 'ada@example.com' } }],
    ...overrides,
  }
}

describe('classifyChatwootEvent: contact_updated', () => {
  it('an email change becomes a bucketed hook.chat_contact plan with fuse limit 20', () => {
    const p = plan(classifyChatwootEvent(contactEvent(), ctx))
    const expected = hookContactKey(7, NOW_MS)
    expect(p).toMatchObject({
      eventType: 'hook.chat_contact',
      aggregateType: 'chat_contact',
      aggregateId: aggregateUuid('contact', 7),
      key: expected.key,
      entityKey: 'cw:contact:7',
      fuseLimit: 20,
    })
    expect(p.availableAt.getTime()).toBe(expected.availableAt.getTime())
    expect(parseOutboxKey(p.key)).toMatchObject({ eventType: 'hook.chat_contact', tag: `c7b${Math.floor(NOW_MS / 30000)}` })
  })

  it.each([
    ['phone_number in the array form', [{ phone_number: { previous_value: null, current_value: '+1' } }]],
    ['email in the single-object form', { email: { previous_value: 'a', current_value: 'b' } }],
    ['phone_number in the single-object form', { phone_number: { previous_value: 'a', current_value: 'b' } }],
  ])('relevant change: %s -> ingest', (_name, changed) => {
    expect(classifyChatwootEvent(contactEvent({ changed_attributes: changed }), ctx).kind).toBe('ingest')
  })

  it('an irrelevant change (last_activity_at only) is ignored as irrelevant_change', () => {
    expect(
      classifyChatwootEvent(contactEvent({ changed_attributes: [{ last_activity_at: { previous_value: 1, current_value: 2 } }] }), ctx),
    ).toEqual({ kind: 'ignore', reason: 'irrelevant_change' })
    expect(
      classifyChatwootEvent(contactEvent({ changed_attributes: { updated_at: { previous_value: 1, current_value: 2 } } }), ctx),
    ).toEqual({ kind: 'ignore', reason: 'irrelevant_change' })
  })

  it.each([
    ['absent', undefined],
    ['a string', 'email'],
    ['a number', 5],
    ['null', null],
  ])('an unreadable change set (%s) fails open to ingest', (_name, changed) => {
    const payload = contactEvent()
    if (changed === undefined) delete (payload as Record<string, unknown>).changed_attributes
    else (payload as Record<string, unknown>).changed_attributes = changed
    expect(classifyChatwootEvent(payload, ctx).kind).toBe('ingest')
  })

  it('the site\'s own fingerprinted write is dropped as echo', () => {
    const echo = contactEvent({ custom_attributes: { [SITE_SYNC_FP_ATTRIBUTE]: contactFingerprint(CONTACT) } })
    expect(classifyChatwootEvent(echo, ctx)).toEqual({ kind: 'echo' })
  })

  it('the same payload with a changed email is not an echo', () => {
    const edited = contactEvent({
      email: 'ada.new@example.com',
      custom_attributes: { [SITE_SYNC_FP_ATTRIBUTE]: contactFingerprint(CONTACT) },
    })
    expect(classifyChatwootEvent(edited, ctx).kind).toBe('ingest')
  })

  it('the echo check runs before the change-set filter', () => {
    const echo = contactEvent({
      changed_attributes: [{ last_activity_at: {} }],
      custom_attributes: { [SITE_SYNC_FP_ATTRIBUTE]: contactFingerprint(CONTACT) },
    })
    expect(classifyChatwootEvent(echo, ctx)).toEqual({ kind: 'echo' })
  })

  it.each([
    ['missing', undefined],
    ['zero', 0],
    ['negative', -3],
    ['a string', '7'],
  ])('contact id %s is invalid and reports top-level key names only', (_name, id) => {
    const payload = contactEvent({ id })
    const result = classifyChatwootEvent(payload, ctx)
    expect(result.kind).toBe('invalid')
    if (result.kind === 'invalid') {
      expect(result.keys).toContain('event')
      expect(result.keys).toContain('email')
      // names only, never a value
      expect(JSON.stringify(result.keys)).not.toContain('ada@example.com')
    }
  })
})

// ---------------------------------------------------------------------------------------------
// message_created (D-03)
// ---------------------------------------------------------------------------------------------

function message(overrides: Record<string, unknown> = {}) {
  return {
    event: 'message_created',
    message_type: 'incoming',
    private: false,
    content: 'a customer sentence that must never be logged',
    conversation: { id: 42 },
    ...overrides,
  }
}

describe('classifyChatwootEvent: message_created', () => {
  it.each([
    ['incoming string', 'incoming'],
    ['incoming integer 0', 0],
  ])('%s -> hook.chat_intake keyed by the conversation', (_name, messageType) => {
    const p = plan(classifyChatwootEvent(message({ message_type: messageType }), ctx))
    expect(p).toMatchObject({
      eventType: 'hook.chat_intake',
      aggregateType: 'chat_conversation',
      aggregateId: aggregateUuid('conversation', 42),
      entityKey: 'cw:conv:42',
      fuseLimit: null,
    })
    expect(p.key.endsWith(':c42')).toBe(true)
    expect(p.availableAt.getTime()).toBe(NOW_MS)
  })

  it.each([
    ['outgoing', 'outgoing'],
    ['1', 1],
    ['activity', 'activity'],
    ['2', 2],
    ['template', 'template'],
    ['3', 3],
    ['missing', undefined],
  ])('message_type %s is ignored as not_incoming', (_name, messageType) => {
    const payload = message({ message_type: messageType })
    expect(classifyChatwootEvent(payload, ctx)).toEqual({ kind: 'ignore', reason: 'not_incoming' })
  })

  it('an incoming private note is ignored as private', () => {
    expect(classifyChatwootEvent(message({ private: true }), ctx)).toEqual({ kind: 'ignore', reason: 'private' })
  })

  it.each([
    ['missing', undefined],
    ['zero', { id: 0 }],
    ['not an object', 'x'],
  ])('conversation id %s is invalid with top-level key names only', (_name, conversation) => {
    const result = classifyChatwootEvent(message({ conversation }), ctx)
    expect(result.kind).toBe('invalid')
    if (result.kind === 'invalid') {
      expect(result.keys).toEqual(expect.arrayContaining(['event', 'content', 'conversation']))
      expect(JSON.stringify(result.keys)).not.toContain('customer sentence')
    }
  })
})

// ---------------------------------------------------------------------------------------------
// conversation_status_changed (D-10)
// ---------------------------------------------------------------------------------------------

function statusEvent(overrides: Record<string, unknown> = {}) {
  return {
    event: 'conversation_status_changed',
    id: 42,
    status: 'resolved',
    updated_at: 1729950000.73,
    changed_attributes: [{ status: { previous_value: 'open', current_value: 'resolved' } }],
    ...overrides,
  }
}

describe('classifyChatwootEvent: conversation_status_changed', () => {
  it('resolved with a float updated_at -> hook.chat_resolve keyed by conversation and resolve second', () => {
    const p = plan(classifyChatwootEvent(statusEvent(), ctx))
    expect(p).toMatchObject({
      eventType: 'hook.chat_resolve',
      aggregateType: 'chat_conversation',
      aggregateId: aggregateUuid('conversation', 42),
      entityKey: 'cw:conv:42',
      fuseLimit: null,
    })
    expect(parseOutboxKey(p.key)).toMatchObject({ eventType: 'hook.chat_resolve', tag: 'c42r1729950000' })
    expect(p.availableAt.getTime()).toBe(NOW_MS)
  })

  it('resolved with an ISO updated_at uses the matching epoch second', () => {
    const iso = '2026-10-26T10:00:00Z'
    const p = plan(classifyChatwootEvent(statusEvent({ updated_at: iso }), ctx))
    expect(parseOutboxKey(p.key)).toMatchObject({ tag: `c42r${Date.parse(iso) / 1000}` })
  })

  it('resolved without updated_at falls back to the signed header timestamp', () => {
    const payload = statusEvent()
    delete (payload as Record<string, unknown>).updated_at
    const p = plan(classifyChatwootEvent(payload, ctx))
    expect(parseOutboxKey(p.key)).toMatchObject({ tag: `c42r${HEADER_SEC}` })
  })

  it('an unparseable updated_at also falls back to the header timestamp', () => {
    const p = plan(classifyChatwootEvent(statusEvent({ updated_at: 'not a time' }), ctx))
    expect(parseOutboxKey(p.key)).toMatchObject({ tag: `c42r${HEADER_SEC}` })
  })

  it('a changed_attributes block carrying another time does not change the resolved epoch', () => {
    const withBlock = statusEvent({
      changed_attributes: [{ updated_at: { previous_value: 1, current_value: 1800000000 } }],
    })
    const plain = statusEvent()
    expect(plan(classifyChatwootEvent(withBlock, ctx)).key).toBe(plan(classifyChatwootEvent(plain, ctx)).key)
    const noUpdatedAt = statusEvent({ changed_attributes: [{ updated_at: { current_value: 1800000000 } }] })
    delete (noUpdatedAt as Record<string, unknown>).updated_at
    expect(parseOutboxKey(plan(classifyChatwootEvent(noUpdatedAt, ctx)).key)).toMatchObject({ tag: `c42r${HEADER_SEC}` })
  })

  it.each(['open', 'pending', 'snoozed'])('status %s is ignored as not_resolved', (status) => {
    expect(classifyChatwootEvent(statusEvent({ status }), ctx)).toEqual({ kind: 'ignore', reason: 'not_resolved' })
  })

  it('a missing conversation id is invalid', () => {
    expect(classifyChatwootEvent(statusEvent({ id: undefined }), ctx).kind).toBe('invalid')
  })
})

// ---------------------------------------------------------------------------------------------
// conversation_updated (D-20, D-07/D-18)
// ---------------------------------------------------------------------------------------------

describe('classifyChatwootEvent: conversation_updated', () => {
  const updated = (labels: unknown) => ({ event: 'conversation_updated', id: 42, labels, status: 'open' })

  it('labels containing no-lead -> hook.chat_label keyed by the conversation', () => {
    const p = plan(classifyChatwootEvent(updated(['b2b', 'no-lead']), ctx))
    expect(p).toMatchObject({
      eventType: 'hook.chat_label',
      aggregateType: 'chat_conversation',
      aggregateId: aggregateUuid('conversation', 42),
      entityKey: 'cw:conv:42',
      fuseLimit: null,
    })
    expect(parseOutboxKey(p.key)).toMatchObject({ eventType: 'hook.chat_label', tag: 'c42' })
  })

  it.each([
    ['labels without no-lead', ['b2b', 'vip']],
    ['empty labels', []],
    ['labels absent', undefined],
    ['labels not an array', 'no-lead'],
  ])('%s is ignored as no_label', (_name, labels) => {
    expect(classifyChatwootEvent(updated(labels), ctx)).toEqual({ kind: 'ignore', reason: 'no_label' })
  })

  it('a missing conversation id is invalid', () => {
    expect(classifyChatwootEvent({ event: 'conversation_updated', labels: ['no-lead'] }, ctx).kind).toBe('invalid')
  })
})

// ---------------------------------------------------------------------------------------------
// everything else
// ---------------------------------------------------------------------------------------------

describe('classifyChatwootEvent: unsubscribed events and shapes', () => {
  it.each(['conversation_created', 'message_updated', 'webwidget_triggered', 'something_new'])(
    'event %s is ignored as unsubscribed_event',
    (event) => {
      expect(classifyChatwootEvent({ event, id: 1 }, ctx)).toEqual({ kind: 'ignore', reason: 'unsubscribed_event' })
    },
  )

  it.each([null, 'text', 5, [], {}, { event: '' }, { event: 5 }])('a non-event body %j is invalid', (body) => {
    expect(classifyChatwootEvent(body, ctx).kind).toBe('invalid')
  })
})
