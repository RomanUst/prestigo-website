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
