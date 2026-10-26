// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { makeWorld, type World, type WorldOptions } from './helpers/chat-world'
import { contactFingerprint, isSiteEcho } from '@/lib/sync-origin'
import type { IdentityStore } from '@/lib/identity-store'

// Synthetic fixtures only (example domains, fake names and numbers).
const CONTACT = '0123456789abcdef0'

function espoWorld(
  contact: Record<string, unknown> = { firstName: 'Jan', lastName: 'Novák' },
  cwContact: Record<string, unknown> = { name: 'Jan Novak' },
  options: WorldOptions = {},
  identity: { erasing?: boolean; espoContactId?: string | null; chatwootContactId?: number | null } = {},
): { w: World; identityId: string } {
  const w = makeWorld({
    ...options,
    espo: { records: { Contact: [{ id: CONTACT, ...contact }] } },
    cw: { contacts: [{ id: 7, ...cwContact } as never], ...options.cw },
  })
  const identityId = w.identity.seed({
    email: 'jan@x.example',
    espoContactId: identity.espoContactId === undefined ? CONTACT : identity.espoContactId,
    chatwootContactId: identity.chatwootContactId === undefined ? 7 : identity.chatwootContactId,
    erasing: identity.erasing,
  })
  return { w, identityId }
}

const keyOf = (identityId: string, mask: number, bucket = 100) => `hook.espo_contact:${identityId}:b${bucket}m${mask}`
const cwContact = (w: World) => w.cw.state.contacts.find((c) => c.id === 7)!
const cwPuts = (w: World) => w.cw.requests.filter((r) => r.method === 'PUT' && r.path === '/contacts/7')

function echoOf(c: ReturnType<typeof cwContact>): boolean {
  return isSiteEcho({
    name: c.name,
    email: c.email,
    phone_number: c.phone_number,
    identifier: c.identifier,
    custom_attributes: c.custom_attributes,
  })
}

describe('hook.espo_contact - tracer', () => {
  it('pushes the edited name to the linked Chatwoot contact and stamps the origin fingerprint', async () => {
    const { w, identityId } = espoWorld()
    expect(await w.dispatch(keyOf(identityId, 1))).toEqual({ outcome: 'sent' })
    const cw = cwContact(w)
    expect(cw.name).toBe('Jan Novák')
    expect(echoOf(cw)).toBe(true)
    expect(cw.custom_attributes.site_sync_fp).toBe(
      contactFingerprint({ name: 'Jan Novák', email: cw.email, phone_number: cw.phone_number, identifier: cw.identifier }),
    )
    expect(w.espoWrites()).toEqual([])
  })
})

describe('hook.espo_contact - D-13/D-14 field rules', () => {
  it('mask 1 (name) pushes only the name even when the EspoCRM phone also differs', async () => {
    const { w, identityId } = espoWorld(
      { firstName: 'Jan', lastName: 'Novák', phoneNumber: '+420777123456' },
      { name: 'Jan Novak', phone_number: '+420700000000' },
    )
    expect(await w.dispatch(keyOf(identityId, 1))).toEqual({ outcome: 'sent' })
    const body = cwPuts(w)[0].body as Record<string, unknown>
    expect(Object.keys(body).sort()).toEqual(['custom_attributes', 'name'])
    expect(cwContact(w).phone_number).toBe('+420700000000')
  })

  it('mask 2: the human edit wins over the operator phone and is normalised to E.164', async () => {
    const { w, identityId } = espoWorld(
      { firstName: 'Jan', lastName: 'Novák', phoneNumber: '+420 777 123 456' },
      { name: 'Jan Novák', phone_number: '+420700000000' },
    )
    expect(await w.dispatch(keyOf(identityId, 2))).toEqual({ outcome: 'sent' })
    expect(cwContact(w).phone_number).toBe('+420777123456')
    expect(echoOf(cwContact(w))).toBe(true)
  })

  it('mask 4 (company) sets additional_attributes.company_name and leaves other keys alone', async () => {
    const { w, identityId } = espoWorld(
      { firstName: 'Jan', lastName: 'Novák', accountName: 'Hotel Example' },
      { name: 'Jan Novák', additional_attributes: { city: 'Praha', company_name: 'Old Co' } },
    )
    expect(await w.dispatch(keyOf(identityId, 4))).toEqual({ outcome: 'sent' })
    expect(cwContact(w).additional_attributes).toEqual({ city: 'Praha', company_name: 'Hotel Example' })
  })

  it('mask 7 pushes every non-empty differing field in one write', async () => {
    const { w, identityId } = espoWorld(
      { firstName: 'Jan', lastName: 'Novák', phoneNumber: '+420777123456', accountName: 'Hotel Example' },
      { name: 'Jan Novak', phone_number: '+420700000000' },
    )
    expect(await w.dispatch(keyOf(identityId, 7))).toEqual({ outcome: 'sent' })
    expect(cwPuts(w)).toHaveLength(1)
    const cw = cwContact(w)
    expect([cw.name, cw.phone_number, cw.additional_attributes.company_name]).toEqual([
      'Jan Novák',
      '+420777123456',
      'Hotel Example',
    ])
    expect(echoOf(cw)).toBe(true)
  })

  it('an empty EspoCRM phone or company is never pushed over an existing Chatwoot value', async () => {
    const { w, identityId } = espoWorld(
      { firstName: 'Jan', lastName: 'Novák', phoneNumber: '', accountName: null },
      { name: 'Jan Novák', phone_number: '+420700000000', additional_attributes: { company_name: 'Kept Co' } },
    )
    expect(await w.dispatch(keyOf(identityId, 7))).toEqual({ outcome: 'sent' })
    expect(cwPuts(w)).toHaveLength(0)
    expect(cwContact(w).phone_number).toBe('+420700000000')
    expect(cwContact(w).additional_attributes.company_name).toBe('Kept Co')
  })

  it('an empty EspoCRM name is never pushed', async () => {
    const { w, identityId } = espoWorld({ firstName: '', lastName: '' }, { name: 'Jan Novák' })
    expect(await w.dispatch(keyOf(identityId, 1))).toEqual({ outcome: 'sent' })
    expect(cwPuts(w)).toHaveLength(0)
    expect(cwContact(w).name).toBe('Jan Novák')
  })

  it('a phone that does not normalise to E.164 is not pushed (the name still is)', async () => {
    const { w, identityId } = espoWorld(
      { firstName: 'Jan', lastName: 'Novák', phoneNumber: 'abc' },
      { name: 'Jan Novak', phone_number: '+420700000000' },
    )
    expect(await w.dispatch(keyOf(identityId, 3))).toEqual({ outcome: 'sent' })
    const body = cwPuts(w)[0].body as Record<string, unknown>
    expect(body.phone_number).toBeUndefined()
    expect(cwContact(w).name).toBe('Jan Novák')
    expect(cwContact(w).phone_number).toBe('+420700000000')
  })

  it('nothing differs: no PUT and the row is sent', async () => {
    const { w, identityId } = espoWorld(
      { firstName: 'Jan', lastName: 'Novák', phoneNumber: '+420777123456', accountName: 'Hotel Example' },
      { name: 'Jan Novák', phone_number: '+420777123456', additional_attributes: { company_name: 'Hotel Example' } },
    )
    expect(await w.dispatch(keyOf(identityId, 7))).toEqual({ outcome: 'sent' })
    expect(cwPuts(w)).toHaveLength(0)
    expect(w.outbox.rows.get(keyOf(identityId, 7))?.status).toBe('sent')
  })

  it('a second run of the same key changes nothing (state-convergent)', async () => {
    const { w, identityId } = espoWorld()
    await w.dispatch(keyOf(identityId, 1))
    w.reset(keyOf(identityId, 1))
    expect(await w.dispatch(keyOf(identityId, 1))).toEqual({ outcome: 'sent' })
    expect(cwPuts(w)).toHaveLength(1)
  })
})

describe('hook.espo_contact - 422 phone fallback', () => {
  it('a Chatwoot 422 on the phone drops it and writes the name with a recomputed fingerprint', async () => {
    const { w, identityId } = espoWorld(
      { firstName: 'Jan', lastName: 'Novák', phoneNumber: '+420777123456' },
      { name: 'Jan Novak', phone_number: '+420700000000' },
      { cw: { contacts: [{ id: 7, name: 'Jan Novak', phone_number: '+420700000000' }, { id: 8, name: 'Other', phone_number: '+420777123456' }] } },
    )
    expect(await w.dispatch(keyOf(identityId, 3))).toEqual({ outcome: 'sent' })
    const puts = cwPuts(w)
    expect(puts).toHaveLength(2)
    expect((puts[0].body as Record<string, unknown>).phone_number).toBe('+420777123456')
    expect((puts[1].body as Record<string, unknown>).phone_number).toBeUndefined()
    const cw = cwContact(w)
    expect(cw.name).toBe('Jan Novák')
    expect(cw.phone_number).toBe('+420700000000')
    // The fingerprint belongs to the post-write state: new name, the live (kept) phone.
    expect(cw.custom_attributes.site_sync_fp).toBe(
      contactFingerprint({ name: 'Jan Novák', email: cw.email, phone_number: '+420700000000', identifier: cw.identifier }),
    )
    expect(echoOf(cw)).toBe(true)
  })

  it('a phone-only edit that hits a 422 sends nothing more and completes sent', async () => {
    const { w, identityId } = espoWorld(
      { firstName: 'Jan', lastName: 'Novak', phoneNumber: '+420777123456' },
      { name: 'Jan Novak', phone_number: '+420700000000' },
      { cw: { contacts: [{ id: 7, name: 'Jan Novak', phone_number: '+420700000000' }, { id: 8, name: 'Other', phone_number: '+420777123456' }] } },
    )
    expect(await w.dispatch(keyOf(identityId, 2))).toEqual({ outcome: 'sent' })
    expect(cwPuts(w)).toHaveLength(1)
    expect(cwContact(w).phone_number).toBe('+420700000000')
  })

  it('a second 422 completes failed with cw_unprocessable', async () => {
    const reject = () => new Response(JSON.stringify({ message: 'bad' }), { status: 422, headers: { 'Content-Type': 'application/json' } })
    const { w, identityId } = espoWorld(
      { firstName: 'Jan', lastName: 'Novák', phoneNumber: '+420777123456' },
      { name: 'Jan Novak', phone_number: '+420700000000' },
      { cw: { intercept: (req) => (req.method === 'PUT' ? reject() : undefined) } },
    )
    expect(await w.dispatch(keyOf(identityId, 3))).toEqual({ outcome: 'failed', code: 'cw_unprocessable' })
    expect(w.outbox.rows.get(keyOf(identityId, 3))?.status).toBe('failed')
    expect(cwPuts(w)).toHaveLength(2)
  })

  it('a 422 on a write without a phone completes failed with cw_unprocessable after one request', async () => {
    const reject = () => new Response('{}', { status: 422, headers: { 'Content-Type': 'application/json' } })
    const { w, identityId } = espoWorld(undefined, undefined, {
      cw: { intercept: (req) => (req.method === 'PUT' ? reject() : undefined) },
    })
    expect(await w.dispatch(keyOf(identityId, 1))).toEqual({ outcome: 'failed', code: 'cw_unprocessable' })
    expect(cwPuts(w)).toHaveLength(1)
  })
})

describe('hook.espo_contact - skips', () => {
  it('a person without a Chatwoot contact is skipped as unlinked and nothing is requested', async () => {
    const { w, identityId } = espoWorld(undefined, undefined, {}, { chatwootContactId: null })
    expect(await w.dispatch(keyOf(identityId, 1))).toEqual({ outcome: 'skipped', code: 'unlinked' })
    expect(w.cw.requests).toHaveLength(0)
    expect(w.espo.requests).toHaveLength(0)
  })

  it('a person without an EspoCRM contact is skipped as unlinked', async () => {
    const { w, identityId } = espoWorld(undefined, undefined, {}, { espoContactId: null })
    expect(await w.dispatch(keyOf(identityId, 1))).toEqual({ outcome: 'skipped', code: 'unlinked' })
  })

  it('an erasing person is skipped as identity_erasing', async () => {
    const { w, identityId } = espoWorld(undefined, undefined, {}, { erasing: true })
    expect(await w.dispatch(keyOf(identityId, 1))).toEqual({ outcome: 'skipped', code: 'identity_erasing' })
    expect(w.cw.requests).toHaveLength(0)
  })

  it('an unknown identity is skipped as identity_missing', async () => {
    const { w } = espoWorld()
    expect(await w.dispatch(keyOf('00000000-0000-4000-8000-0000000000ff', 1))).toEqual({
      outcome: 'skipped',
      code: 'identity_missing',
    })
  })

  it('an EspoCRM Contact answering 404 is skipped as contact_missing', async () => {
    const { w, identityId } = espoWorld(undefined, undefined, {}, { espoContactId: 'ffffffffffffffff0' })
    expect(await w.dispatch(keyOf(identityId, 1))).toEqual({ outcome: 'skipped', code: 'contact_missing' })
    expect(w.cw.requests).toHaveLength(0)
  })

  it('a Chatwoot contact answering 404 is skipped as contact_missing', async () => {
    const { w, identityId } = espoWorld(undefined, undefined, {}, { chatwootContactId: 999 })
    expect(await w.dispatch(keyOf(identityId, 1))).toEqual({ outcome: 'skipped', code: 'contact_missing' })
  })

  it('hooks off (no hooks start) is skipped as hooks_off before any request', async () => {
    const { w, identityId } = espoWorld(undefined, undefined, { hooksStart: null })
    expect(await w.dispatch(keyOf(identityId, 1))).toEqual({ outcome: 'skipped', code: 'hooks_off' })
    expect(w.cw.requests).toHaveLength(0)
    expect(w.espo.requests).toHaveLength(0)
  })

  it('a key tag without a mask is skipped as bad_key', async () => {
    const { w, identityId } = espoWorld()
    const key = `hook.espo_contact:${identityId}:c5`
    expect(await w.dispatch(key)).toEqual({ outcome: 'skipped', code: 'bad_key' })
  })

  it('both config gates stay in front of the handler', async () => {
    const a = espoWorld(undefined, undefined, { chatwootConfigured: false })
    expect(await a.w.dispatch(keyOf(a.identityId, 1))).toEqual({ outcome: 'breaker', code: 'chatwoot_unconfigured' })
    const b = espoWorld(undefined, undefined, { crmConfigured: false })
    expect(await b.w.dispatch(keyOf(b.identityId, 1))).toEqual({ outcome: 'breaker', code: 'crm_unconfigured' })
  })
})

describe('hook.espo_contact - ownership (read-only towards EspoCRM and Supabase)', () => {
  it('never calls an identity write method and only GETs EspoCRM', async () => {
    const { w, identityId } = espoWorld(
      { firstName: 'Jan', lastName: 'Novák', phoneNumber: '+420777123456', accountName: 'Hotel Example' },
      { name: 'Jan Novak' },
    )
    const called: string[] = []
    const spy = new Proxy(w.identity.store, {
      get(target, prop, receiver) {
        const value = Reflect.get(target, prop, receiver)
        if (typeof value !== 'function') return value
        return (...args: unknown[]) => {
          called.push(String(prop))
          return (value as (...a: unknown[]) => unknown).apply(target, args)
        }
      },
    }) as IdentityStore
    expect(await w.dispatch(keyOf(identityId, 7), { identity: spy })).toEqual({ outcome: 'sent' })
    expect(called).toEqual(['person'])
    expect(w.espo.requests.map((r) => r.method)).toEqual(['GET'])
    expect(w.espoWrites()).toEqual([])
  })

  it('the Chatwoot write touches only the contact itself', async () => {
    const { w, identityId } = espoWorld()
    await w.dispatch(keyOf(identityId, 1))
    expect(w.cw.writes().map((r) => `${r.method} ${r.path}`)).toEqual(['PUT /contacts/7'])
  })
})
