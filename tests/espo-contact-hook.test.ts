// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { makeWorld, type World } from './helpers/chat-world'
import { contactFingerprint, isSiteEcho } from '@/lib/sync-origin'

// Synthetic fixtures only.
const CONTACT = '0123456789abcdef0'

function espoWorld(
  contact: Record<string, unknown> = { firstName: 'Jan', lastName: 'Novák' },
  cwContact: Record<string, unknown> = { name: 'Jan Novak' },
): { w: World; identityId: string } {
  const w = makeWorld({
    espo: { records: { Contact: [{ id: CONTACT, ...contact }] } },
    cw: { contacts: [{ id: 7, ...cwContact } as never] },
  })
  const identityId = w.identity.seed({ email: 'jan@x.example', espoContactId: CONTACT, chatwootContactId: 7 })
  return { w, identityId }
}

const keyOf = (identityId: string, mask: number, bucket = 100) => `hook.espo_contact:${identityId}:b${bucket}m${mask}`

describe('hook.espo_contact - tracer', () => {
  it('pushes the edited name to the linked Chatwoot contact and stamps the origin fingerprint', async () => {
    const { w, identityId } = espoWorld()
    expect(await w.dispatch(keyOf(identityId, 1))).toEqual({ outcome: 'sent' })
    const cw = w.cw.state.contacts.find((c) => c.id === 7)!
    expect(cw.name).toBe('Jan Novák')
    expect(
      isSiteEcho({
        name: cw.name,
        email: cw.email,
        phone_number: cw.phone_number,
        identifier: cw.identifier,
        custom_attributes: cw.custom_attributes,
      }),
    ).toBe(true)
    expect(cw.custom_attributes.site_sync_fp).toBe(
      contactFingerprint({ name: 'Jan Novák', email: cw.email, phone_number: cw.phone_number, identifier: cw.identifier }),
    )
    expect(w.espoWrites()).toEqual([])
  })
})
