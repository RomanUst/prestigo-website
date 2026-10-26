// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
  SITE_SYNC_FP_ATTRIBUTE,
  contactFingerprint,
  isSiteEcho,
  postWriteFingerprint,
  aggregateUuid,
  hookConversationKey,
  hookResolveKey,
  hookContactKey,
} from '@/lib/sync-origin'
import { parseOutboxKey } from '@/lib/outbox'

const UUID_V5 = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

describe('aggregateUuid', () => {
  it('is stable, v5-shaped and separates conversation from contact', () => {
    expect(aggregateUuid('conversation', 42)).toBe(aggregateUuid('conversation', 42))
    expect(aggregateUuid('conversation', 42)).toMatch(UUID_V5)
    expect(aggregateUuid('contact', 42)).toMatch(UUID_V5)
    expect(aggregateUuid('conversation', 42)).not.toBe(aggregateUuid('contact', 42))
    expect(aggregateUuid('conversation', 42)).not.toBe(aggregateUuid('conversation', 43))
  })
})

describe('hook key builders round-trip through parseOutboxKey', () => {
  it('intake and label keys carry tag c<convId>', () => {
    for (const type of ['hook.chat_intake', 'hook.chat_label'] as const) {
      const { key, aggregateId } = hookConversationKey(type, 42)
      expect(key).toBe(`${type}:${aggregateId}:c42`)
      expect(aggregateId).toBe(aggregateUuid('conversation', 42))
      const parsed = parseOutboxKey(key)
      expect(parsed).toMatchObject({ eventType: type, aggregateId, tag: 'c42' })
      expect(key.length).toBeLessThanOrEqual(120)
    }
  })

  it('resolve key carries c<convId>r<epoch>', () => {
    const { key, aggregateId } = hookResolveKey(42, 1729950000.7)
    const parsed = parseOutboxKey(key)
    expect(parsed).toMatchObject({ eventType: 'hook.chat_resolve', aggregateId, tag: 'c42r1729950000' })
    expect(key.length).toBeLessThanOrEqual(120)
  })

  it('contact key carries c<id>b<bucket> and is available at the bucket end', () => {
    const nowMs = 1_729_950_012_345
    const { key, aggregateId, availableAt } = hookContactKey(7, nowMs)
    const bucket = Math.floor(nowMs / 1000 / 30)
    expect(aggregateId).toBe(aggregateUuid('contact', 7))
    expect(parseOutboxKey(key)).toMatchObject({ eventType: 'hook.chat_contact', aggregateId, tag: `c7b${bucket}` })
    expect(availableAt.getTime()).toBe((bucket + 1) * 30 * 1000)
    expect(availableAt.getTime()).toBeGreaterThan(nowMs)
    expect(key.length).toBeLessThanOrEqual(120)
  })

  it('two instants in one bucket share a key, the next bucket does not', () => {
    const base = 1_729_950_000_000
    const a = hookContactKey(7, base)
    expect(hookContactKey(7, base + 5_000).key).toBe(a.key)
    expect(hookContactKey(7, base + 45_000).key).not.toBe(a.key)
  })
})

describe('postWriteFingerprint', () => {
  const live = { name: 'Ada', email: 'ada@example.com', phone: '+420111222333', identifier: 'user-1' }

  it('uses the body value for keys present in the body and the live value for the rest', () => {
    expect(postWriteFingerprint(live, { name: 'B' })).toBe(
      contactFingerprint({ name: 'B', email: live.email, phone_number: live.phone, identifier: live.identifier }),
    )
    expect(postWriteFingerprint(live, { phone_number: '+420999888777', identifier: 'user-2' })).toBe(
      contactFingerprint({ name: live.name, email: live.email, phone_number: '+420999888777', identifier: 'user-2' }),
    )
  })

  it('an empty body is the fingerprint of the live contact; a key set to undefined counts as absent', () => {
    const fp = contactFingerprint({ name: live.name, email: live.email, phone_number: live.phone, identifier: live.identifier })
    expect(postWriteFingerprint(live, {})).toBe(fp)
    expect(postWriteFingerprint(live, { name: undefined })).toBe(fp)
  })

  it('without a live contact (create) only the body counts', () => {
    expect(postWriteFingerprint(null, { name: 'Ada', email: 'ada@example.com' })).toBe(
      contactFingerprint({ name: 'Ada', email: 'ada@example.com' }),
    )
    expect(postWriteFingerprint(null, {})).toBe(contactFingerprint({}))
  })

  it('a stamp made with it is recognised by isSiteEcho on the resulting contact', () => {
    const body = { name: 'Ada Lovelace', email: 'ada@example.com' }
    const fp = postWriteFingerprint(live, body)
    const after = { name: body.name, email: body.email, phone_number: live.phone, identifier: live.identifier }
    expect(isSiteEcho({ ...after, custom_attributes: { [SITE_SYNC_FP_ATTRIBUTE]: fp } })).toBe(true)
  })
})

describe('contactFingerprint / isSiteEcho', () => {
  const contact = { name: ' Ada Lovelace ', email: 'ADA@Example.com', phone_number: '+420111222333', identifier: null }

  it('is 16 hex chars and ignores case and surrounding whitespace', () => {
    const fp = contactFingerprint(contact)
    expect(fp).toMatch(/^[0-9a-f]{16}$/)
    expect(contactFingerprint({ ...contact, name: 'ada lovelace', email: 'ada@example.com' })).toBe(fp)
  })

  it('treats null, undefined and an empty string alike', () => {
    const base = { name: 'Ada', email: 'ada@example.com' }
    const fp = contactFingerprint({ ...base, phone_number: null, identifier: null })
    expect(contactFingerprint({ ...base, phone_number: undefined, identifier: '' })).toBe(fp)
    expect(contactFingerprint({ ...base, phone_number: '', identifier: undefined })).toBe(fp)
    expect(contactFingerprint(base)).toBe(fp)
    expect(contactFingerprint({ ...base, phone_number: '   ' })).toBe(fp)
  })

  it('changes when any of the four fields changes', () => {
    expect(contactFingerprint({ ...contact, name: 'Someone Else' })).not.toBe(contactFingerprint(contact))
    expect(contactFingerprint({ ...contact, email: 'else@example.com' })).not.toBe(contactFingerprint(contact))
    const fp = contactFingerprint(contact)
    expect(contactFingerprint({ ...contact, phone_number: '+420999999999' })).not.toBe(fp)
    expect(contactFingerprint({ ...contact, identifier: 'x' })).not.toBe(fp)
  })

  it('the field separator prevents boundary collisions', () => {
    expect(contactFingerprint({ name: 'ab', email: 'c' })).not.toBe(contactFingerprint({ name: 'a', email: 'bc' }))
  })

  it('isSiteEcho is true only while the stored fingerprint matches the fields', () => {
    const tagged = { ...contact, custom_attributes: { [SITE_SYNC_FP_ATTRIBUTE]: contactFingerprint(contact) } }
    expect(isSiteEcho(tagged)).toBe(true)
    expect(isSiteEcho({ ...tagged, email: 'other@example.com' })).toBe(false)
    expect(isSiteEcho({ ...contact, custom_attributes: {} })).toBe(false)
    expect(isSiteEcho({ ...contact, custom_attributes: { [SITE_SYNC_FP_ATTRIBUTE]: 42 } })).toBe(false)
    expect(isSiteEcho({ ...contact, custom_attributes: null })).toBe(false)
    expect(isSiteEcho(null)).toBe(false)
  })

  it('isSiteEcho is false when site_sync_fp is absent, not a string, or custom_attributes is not an object', () => {
    expect(isSiteEcho(contact)).toBe(false)
    expect(isSiteEcho({ ...contact, custom_attributes: { other: 'x' } })).toBe(false)
    expect(isSiteEcho({ ...contact, custom_attributes: { [SITE_SYNC_FP_ATTRIBUTE]: null } })).toBe(false)
    expect(isSiteEcho({ ...contact, custom_attributes: { [SITE_SYNC_FP_ATTRIBUTE]: ['x'] } })).toBe(false)
    expect(isSiteEcho(undefined)).toBe(false)
  })
})
