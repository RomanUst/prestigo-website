// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any -- fake API payloads are intentionally loose */
/**
 * Phase 81, Plan 06 - PII-free Lead smoke tool (infra/espocrm/lead-smoke.mjs), proven against the
 * in-memory fake. No test here makes a network call or reads a real credential.
 */
import { describe, expect, it } from 'vitest'
import { EspoConfigError, createEspoClient, loadEspoConfig } from '../infra/espocrm/lib/client.mjs'
import { parseLeadSmokeArgs, runLeadSmoke } from '../infra/espocrm/lead-smoke.mjs'
import { createFakeEspoCRM, stockEspoMetadata } from './helpers/fake-espocrm'

const BASE = 'https://crm.example.test'
const API_KEY = 'key_SECRET_abcdef0123'
const INQUIRY_REF = 'inquiry:3f2b8c1e-5a4d-4e6f-9b7a-1c2d3e4f5a6b'
const BOOKING_REF = 'booking:9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d'
const EMAIL = 'guest.person@smoke.example'
const PHONE = '+420777123456'

type Fake = ReturnType<typeof createFakeEspoCRM>

const syncClient = (fake: Fake) =>
  createEspoClient({
    config: loadEspoConfig({ identity: 'apikey', env: { ESPOCRM_BASE_URL: BASE, ESPOCRM_API_KEY: API_KEY } }),
    fetchImpl: fake.fetchImpl as any,
  })

const world = (leads: any[]) => {
  const fake = createFakeEspoCRM({ metadata: stockEspoMetadata(), records: { Lead: leads } })
  const out: string[] = []
  const run = async (argv: string[]) => ({ code: await runLeadSmoke({ argv, client: syncClient(fake), log: (l: string) => out.push(l) }), out })
  return { fake, run, out }
}

const contactFormLead = {
  id: 'a00000000000000a1',
  cSupabaseRef: INQUIRY_REF,
  status: 'New',
  source: 'Contact form',
  emailAddress: EMAIL,
  phoneNumber: PHONE,
}

describe('parseLeadSmokeArgs', () => {
  it('accepts show/delete with an inquiry or booking reference', () => {
    expect(parseLeadSmokeArgs(['show', INQUIRY_REF])).toEqual({ command: 'show', ref: INQUIRY_REF })
    expect(parseLeadSmokeArgs(['delete', BOOKING_REF])).toEqual({ command: 'delete', ref: BOOKING_REF })
  })

  it.each([['foo'], ['inquiry:not-a-uuid'], [''], ['booking:'], [`${INQUIRY_REF} OR 1=1`], ['lead:3f2b8c1e-5a4d-4e6f-9b7a-1c2d3e4f5a6b']])(
    'refuses the reference %j',
    (ref) => {
      expect(() => parseLeadSmokeArgs(['show', ref])).toThrow(EspoConfigError)
      expect(() => parseLeadSmokeArgs(['delete', ref])).toThrow(EspoConfigError)
    },
  )

  it('refuses a missing or unknown command, a missing reference and extra arguments', () => {
    expect(() => parseLeadSmokeArgs([])).toThrow(EspoConfigError)
    expect(() => parseLeadSmokeArgs(['purge', INQUIRY_REF])).toThrow(EspoConfigError)
    expect(() => parseLeadSmokeArgs(['show'])).toThrow(EspoConfigError)
    expect(() => parseLeadSmokeArgs(['show', INQUIRY_REF, 'extra'])).toThrow(EspoConfigError)
  })
})

describe('runLeadSmoke show', () => {
  it('prints the PII-free summary line of the matching Lead', async () => {
    const { run } = world([contactFormLead])
    const { code, out } = await run(['show', INQUIRY_REF])
    expect(code).toBe(0)
    expect(out).toEqual([
      'count=1 status=New source=Contact form existing_customer=false has_email=true has_phone=true has_account_name=false has_return_reference=false',
    ])
  })

  it('never prints an email address or any digit of the phone number', async () => {
    const { run } = world([{ ...contactFormLead, accountName: 'Secret Corp s.r.o.', firstName: 'Guest', lastName: 'Person' }])
    const { out } = await run(['show', INQUIRY_REF])
    const text = out.join('\n')
    expect(text).not.toContain('@')
    expect(text).not.toContain(EMAIL)
    expect(text).not.toMatch(/7771|12345|420777/)
    expect(text).not.toContain('Secret')
    expect(text).not.toContain('Guest')
    expect(text).toContain('has_account_name=true')
  })

  it('reports existing customer and return reference as booleans', async () => {
    const { run } = world([
      {
        id: 'a00000000000000a2',
        cSupabaseRef: BOOKING_REF,
        status: 'Converted',
        source: 'Website booking',
        cExistingCustomer: true,
        cReturnBookingReference: 'PRG-RET-1',
        emailAddress: '',
        phoneNumber: null,
      },
    ])
    const { out } = await run(['show', BOOKING_REF])
    expect(out).toEqual([
      'count=1 status=Converted source=Website booking existing_customer=true has_email=false has_phone=false has_account_name=false has_return_reference=true',
    ])
    expect(out.join('')).not.toContain('PRG-RET-1')
  })

  it('an unknown reference prints count=0 and exits 0', async () => {
    const { run } = world([contactFormLead])
    const { code, out } = await run(['show', BOOKING_REF])
    expect(code).toBe(0)
    expect(out).toEqual(['count=0'])
  })

  it('is read-only: only GET requests are sent', async () => {
    const { fake, run } = world([contactFormLead])
    await run(['show', INQUIRY_REF])
    expect(fake.requests.every((r) => r.method === 'GET')).toBe(true)
  })
})

describe('runLeadSmoke delete', () => {
  it('deletes every Lead with that reference and nothing else', async () => {
    const other = { id: 'a00000000000000a9', cSupabaseRef: INQUIRY_REF, status: 'New', source: 'Contact form' }
    const { fake, run } = world([
      { id: 'a00000000000000a3', cSupabaseRef: BOOKING_REF, status: 'New', source: 'Website booking' },
      { id: 'a00000000000000a4', cSupabaseRef: BOOKING_REF, status: 'New', source: 'Website booking' },
      other,
    ])
    const { code, out } = await run(['delete', BOOKING_REF])
    expect(code).toBe(0)
    expect(out).toEqual(['deleted=2'])
    expect(fake.state.records.Lead).toEqual([other])
  })

  it('an unknown reference deletes nothing', async () => {
    const { fake, run } = world([contactFormLead])
    const { out } = await run(['delete', BOOKING_REF])
    expect(out).toEqual(['deleted=0'])
    expect(fake.state.records.Lead).toHaveLength(1)
    expect(fake.requests.some((r) => r.method === 'DELETE')).toBe(false)
  })

  it('a bad reference sends no request at all', async () => {
    const { fake, run } = world([contactFormLead])
    for (const ref of ['foo', 'inquiry:not-a-uuid', '']) {
      await expect(run(['delete', ref])).rejects.toBeInstanceOf(EspoConfigError)
      await expect(run(['show', ref])).rejects.toBeInstanceOf(EspoConfigError)
    }
    expect(fake.requests).toHaveLength(0)
    expect(fake.state.records.Lead).toHaveLength(1)
  })
})
