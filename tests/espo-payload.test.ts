// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { canonicalJson, classifyEspoItem, ESPO_MASK, espoDeliveryId } from '@/lib/espo-payload'

const ID = '0123456789abcdef0'

describe('classifyEspoItem', () => {
  it('an item without an id or with a 16-char id is a bad_item', () => {
    expect(classifyEspoItem({ firstName: 'Jan' })).toEqual({ kind: 'ignore', reason: 'bad_item' })
    expect(classifyEspoItem({ id: '0123456789abcdef', firstName: 'Jan' })).toEqual({ kind: 'ignore', reason: 'bad_item' })
    expect(classifyEspoItem({ id: '0123456789ABCDEF0', firstName: 'Jan' })).toEqual({ kind: 'ignore', reason: 'bad_item' })
    expect(classifyEspoItem(null)).toEqual({ kind: 'ignore', reason: 'bad_item' })
    expect(classifyEspoItem('x')).toEqual({ kind: 'ignore', reason: 'bad_item' })
    expect(classifyEspoItem([ID])).toEqual({ kind: 'ignore', reason: 'bad_item' })
  })

  it('an item without a name, phone or company attribute is an irrelevant_change', () => {
    expect(classifyEspoItem({ id: ID, description: 'x' })).toEqual({ kind: 'ignore', reason: 'irrelevant_change' })
    expect(classifyEspoItem({ id: ID })).toEqual({ kind: 'ignore', reason: 'irrelevant_change' })
  })

  it('maps each attribute group to its mask bit', () => {
    expect(classifyEspoItem({ id: ID, firstName: 'Jan' })).toEqual({ kind: 'ingest', contactId: ID, mask: 1 })
    expect(classifyEspoItem({ id: ID, name: 'Jan Novak' })).toEqual({ kind: 'ingest', contactId: ID, mask: 1 })
    expect(classifyEspoItem({ id: ID, phoneNumber: '+420777123456' })).toEqual({ kind: 'ingest', contactId: ID, mask: 2 })
    expect(classifyEspoItem({ id: ID, phoneNumberData: [] })).toEqual({ kind: 'ingest', contactId: ID, mask: 2 })
    expect(classifyEspoItem({ id: ID, accountName: 'Hotel' })).toEqual({ kind: 'ingest', contactId: ID, mask: 4 })
    expect(classifyEspoItem({ id: ID, lastName: 'N', phoneNumber: '+1', accountId: 'a' })).toEqual({
      kind: 'ingest',
      contactId: ID,
      mask: 7,
    })
    expect(ESPO_MASK).toEqual({ name: 1, phone: 2, company: 4 })
  })

  it('a cleared (null) attribute still counts as an edit of that group', () => {
    expect(classifyEspoItem({ id: ID, phoneNumber: null })).toEqual({ kind: 'ingest', contactId: ID, mask: 2 })
  })
})

describe('canonicalJson', () => {
  it('sorts keys recursively and writes no whitespace', () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe('{"a":{"c":3,"d":2},"b":1}')
  })

  it('keeps array order and handles primitives', () => {
    expect(canonicalJson([{ b: 1, a: 2 }, 'x', null, true, 3])).toBe('[{"a":2,"b":1},"x",null,true,3]')
    expect(canonicalJson('a"b')).toBe('"a\\"b"')
    expect(canonicalJson(null)).toBe('null')
  })
})

describe('espoDeliveryId', () => {
  it('is e + 64 hex and equal for two key orders of the same item', () => {
    const a = espoDeliveryId({ id: ID, lastName: 'Novák', phoneNumber: '+420777123456' })
    const b = espoDeliveryId({ phoneNumber: '+420777123456', lastName: 'Novák', id: ID })
    expect(a).toMatch(/^e[0-9a-f]{64}$/)
    expect(a).toBe(b)
  })

  it('differs when the content differs', () => {
    expect(espoDeliveryId({ id: ID, lastName: 'A' })).not.toBe(espoDeliveryId({ id: ID, lastName: 'B' }))
  })
})
