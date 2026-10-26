import { createHash } from 'node:crypto'

// Pure helpers for the EspoCRM webhook receiver (Phase 83, HOOK-03 / D-13 / D-19): which items of a
// Contact.update batch matter, a canonical JSON form and the per-item delivery id. No env access,
// no I/O, no env var names.

/** Bits of the attribute mask carried in the outbox key tag (`b<bucket>m<mask>`). */
export const ESPO_MASK = { name: 1, phone: 2, company: 4 } as const

const ESPO_ID = /^[0-9a-f]{17}$/

const NAME_ATTRS = ['firstName', 'lastName', 'name']
const PHONE_ATTRS = ['phoneNumber', 'phoneNumberData']
const COMPANY_ATTRS = ['accountId', 'accountName']

export type EspoItemClass =
  | { kind: 'ingest'; contactId: string; mask: number }
  | { kind: 'ignore'; reason: 'bad_item' | 'irrelevant_change' }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * One item of an EspoCRM batch: `{ id, <changed attributes> }`. Only a Contact whose name, phone or
 * company attribute is present is ingested (narrow surface, D-13); everything else is ignored.
 */
export function classifyEspoItem(item: unknown): EspoItemClass {
  if (!isRecord(item) || typeof item.id !== 'string' || !ESPO_ID.test(item.id)) {
    return { kind: 'ignore', reason: 'bad_item' }
  }
  const has = (attrs: string[]) => attrs.some((a) => Object.prototype.hasOwnProperty.call(item, a))
  const mask =
    (has(NAME_ATTRS) ? ESPO_MASK.name : 0) |
    (has(PHONE_ATTRS) ? ESPO_MASK.phone : 0) |
    (has(COMPANY_ATTRS) ? ESPO_MASK.company : 0)
  if (mask === 0) return { kind: 'ignore', reason: 'irrelevant_change' }
  return { kind: 'ingest', contactId: item.id, mask }
}

/** JSON with object keys sorted recursively and no whitespace: equal for any key order of equal data. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((v) => canonicalJson(v)).join(',')}]`
  if (isRecord(value)) {
    const parts: string[] = []
    for (const key of Object.keys(value).sort()) {
      if (value[key] === undefined) continue
      parts.push(`${JSON.stringify(key)}:${canonicalJson(value[key])}`)
    }
    return `{${parts.join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}

/** Delivery id of one batch item: the protocol has none, so it is the content hash (D-19 dedup key). */
export function espoDeliveryId(item: unknown): string {
  return `e${createHash('sha256').update(canonicalJson(item)).digest('hex')}`
}
