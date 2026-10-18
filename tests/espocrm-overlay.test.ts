// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any -- fake API payloads are intentionally loose */
/**
 * Phase 81, Plan 08 extends this to Lead (--entity Lead, key cSupabaseRef); the CBooking tests stay
 * unchanged because CBooking is the default entity.
 * Phase 80, Plan 08 - CBooking unique-index overlay (D-19, D-07): merge correctness, the
 * wrong-file guard, idempotency, and the precheck / probe-unique / rebuild logic against the
 * in-memory fake. No test here makes a network call or reads a real credential.
 */
import { describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createEspoClient, loadEspoConfig } from '../infra/espocrm/lib/client.mjs'
import {
  ENTITY_SPECS,
  hasOverlay,
  mergeOverlay,
  parseArgs,
  runCheck,
  runMerge,
  runPrecheck,
  runProbeUnique,
  runRebuild,
  serialize,
} from '../infra/espocrm/overlay.mjs'
import { createFakeEspoCRM, type FakeEspoOptions } from './helpers/fake-espocrm'

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OVERLAY_FILE = join(REPO_ROOT, 'infra/espocrm/overlay/CBooking.entityDefs.json')
const OVERLAY = JSON.parse(readFileSync(OVERLAY_FILE, 'utf8'))
const LEAD_OVERLAY_FILE = join(REPO_ROOT, 'infra/espocrm/overlay/Lead.entityDefs.json')
const loadLeadOverlay = () => JSON.parse(readFileSync(LEAD_OVERLAY_FILE, 'utf8'))
const BASE = 'https://crm.example.test'

/** Shaped like the file FieldManager writes for a custom entity. */
const currentFixture = () => ({
  fields: {
    name: { type: 'varchar', required: true },
    supabaseBookingId: { type: 'varchar', maxLength: 64, isCustom: true },
    contact: { type: 'link' },
  },
  links: {
    contact: { type: 'belongsTo', entity: 'Contact', foreign: 'cBookings' },
    account: { type: 'belongsTo', entity: 'Account', foreign: 'cBookings' },
  },
  collection: { orderBy: 'createdAt', order: 'desc' },
})

function adminClient(options: FakeEspoOptions = {}) {
  const fake = createFakeEspoCRM(options)
  const client = createEspoClient({
    config: loadEspoConfig({
      identity: 'admin',
      env: { ESPOCRM_BASE_URL: BASE, ESPOCRM_ADMIN_USER: 'prestigo-config', ESPOCRM_ADMIN_PASSWORD: 'pw_SECRET_0123456789' },
    }),
    fetchImpl: fake.fetchImpl as any,
  })
  return { fake, client }
}

const collect = () => {
  const lines: string[] = []
  return { lines, log: (line: string) => lines.push(line) }
}

describe('overlay file', () => {
  it('declares the unique index on supabaseBookingId + deleteId and deleteId true', () => {
    expect(OVERLAY).toEqual({
      indexes: { supabaseBookingIdDeleteId: { type: 'unique', columns: ['supabaseBookingId', 'deleteId'] } },
      deleteId: true,
    })
  })
})

describe('mergeOverlay', () => {
  it('adds the index and deleteId and leaves fields and links deep-equal', () => {
    const current = currentFixture()
    const { result, added } = mergeOverlay(current, OVERLAY)
    expect(result.indexes.supabaseBookingIdDeleteId).toEqual(OVERLAY.indexes.supabaseBookingIdDeleteId)
    expect(result.deleteId).toBe(true)
    expect(result.fields).toEqual(currentFixture().fields)
    expect(result.links).toEqual(currentFixture().links)
    expect(added).toEqual(['indexes.supabaseBookingIdDeleteId', 'deleteId'])
  })

  it('keeps the key order of the current file', () => {
    const { result } = mergeOverlay(currentFixture(), OVERLAY)
    expect(Object.keys(result).slice(0, 3)).toEqual(['fields', 'links', 'collection'])
  })

  it('is idempotent: merging its own output changes nothing, byte for byte', () => {
    const once = mergeOverlay(currentFixture(), OVERLAY)
    const twice = mergeOverlay(once.result, OVERLAY)
    expect(twice.added).toEqual([])
    expect(serialize(twice.result)).toBe(serialize(once.result))
  })

  it('refuses a file that is not the CBooking definition', () => {
    expect(() => mergeOverlay({ fields: { name: { type: 'varchar' } }, links: {} }, OVERLAY)).toThrow(/not the CBooking definition/)
    expect(() => mergeOverlay({}, OVERLAY)).toThrow(/not the CBooking definition/)
    expect(() => mergeOverlay([] as any, OVERLAY)).toThrow(/not the CBooking definition/)
  })

  it('keeps an unrelated index already in the file', () => {
    const current: any = currentFixture()
    current.indexes = { byName: { columns: ['name'] } }
    const { result } = mergeOverlay(current, OVERLAY)
    expect(result.indexes.byName).toEqual({ columns: ['name'] })
    expect(Object.keys(result.indexes)).toEqual(['byName', 'supabaseBookingIdDeleteId'])
  })

  it('serialises with 4-space indent and a trailing newline', () => {
    const text = serialize(mergeOverlay(currentFixture(), OVERLAY).result)
    expect(text.endsWith('}\n')).toBe(true)
    expect(text).toContain('\n    "fields": {')
    expect(JSON.parse(text).deleteId).toBe(true)
  })
})

describe('hasOverlay / merge / check commands', () => {
  it('hasOverlay is false before and true after the merge', () => {
    const before = currentFixture()
    expect(hasOverlay(before, OVERLAY)).toBe(false)
    expect(hasOverlay(mergeOverlay(before, OVERLAY).result, OVERLAY)).toBe(true)
    expect(hasOverlay(null as any, OVERLAY)).toBe(false)
  })

  it('hasOverlay is false when the index differs from the overlay', () => {
    const merged: any = mergeOverlay(currentFixture(), OVERLAY).result
    merged.indexes.supabaseBookingIdDeleteId.columns = ['supabaseBookingId']
    expect(hasOverlay(merged, OVERLAY)).toBe(false)
  })

  it('runMerge writes the merged file and reports added / unchanged; runCheck gates on it', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'espocrm-overlay-'))
    const currentFile = join(dir, 'current.json')
    const mergedFile = join(dir, 'merged.json')
    writeFileSync(currentFile, JSON.stringify(currentFixture(), null, 4))

    expect(runCheck({ file: currentFile, overlayFile: OVERLAY_FILE, log: () => {} })).toBe(3)

    const first = collect()
    expect(await runMerge({ currentFile, overlayFile: OVERLAY_FILE, outFile: mergedFile, log: first.log })).toBe(0)
    expect(first.lines).toEqual(['merge: added=indexes.supabaseBookingIdDeleteId,deleteId'])
    expect(runCheck({ file: mergedFile, overlayFile: OVERLAY_FILE, log: () => {} })).toBe(0)

    const second = collect()
    const again = join(dir, 'again.json')
    await runMerge({ currentFile: mergedFile, overlayFile: OVERLAY_FILE, outFile: again, log: second.log })
    expect(second.lines).toEqual(['merge: unchanged'])
    expect(readFileSync(again, 'utf8')).toBe(readFileSync(mergedFile, 'utf8'))
  })
})

describe('parseArgs', () => {
  it('parses merge arguments and rejects unknown flags', () => {
    expect(parseArgs(['merge', 'a.json', 'b.json', '--out', 'c.json'])).toEqual({
      command: 'merge',
      positional: ['a.json', 'b.json'],
      out: 'c.json',
    })
    expect(parseArgs(['merge', 'a', 'b', '--out=c']).out).toBe('c')
    expect(() => parseArgs(['merge', '--nope'])).toThrow(/Unknown argument/)
  })
})

describe('probe-unique', () => {
  it('prints unique=enforced and deletes the first record when the duplicate is rejected', async () => {
    const { client, fake } = adminClient({ duplicateCheck: { CBooking: 'supabaseBookingId' } })
    const out = collect()
    expect(await runProbeUnique({ client, log: out.log })).toBe(0)
    expect(out.lines).toEqual(['unique=enforced'])
    expect(fake.state.records.CBooking ?? []).toEqual([])
    // first record, rejected duplicate, control record with another key (all deleted afterwards)
    expect(fake.requests.filter((r) => r.method === 'POST' && r.path === '/CBooking')).toHaveLength(3)
    expect(fake.requests.filter((r) => r.method === 'DELETE')).toHaveLength(2)
  })

  it('treats a 500 from the database as enforced too', async () => {
    let posts = 0
    const { client, fake } = adminClient({
      extraRoutes: (req) => {
        if (req.method === 'POST' && req.path === '/CBooking' && ++posts === 2) return new Response('', { status: 500 })
        return undefined
      },
    })
    const out = collect()
    expect(await runProbeUnique({ client, log: out.log })).toBe(0)
    expect(out.lines).toEqual(['unique=enforced'])
    expect(fake.state.records.CBooking ?? []).toEqual([])
  })

  it.each([400, 409, 500])('counts a %i on the duplicate as the database refusing it', async (status) => {
    let posts = 0
    const { client, fake } = adminClient({
      extraRoutes: (req) => {
        if (req.method === 'POST' && req.path === '/CBooking' && ++posts === 2) return new Response('', { status })
        return undefined
      },
    })
    const out = collect()
    expect(await runProbeUnique({ client, log: out.log })).toBe(0)
    expect(out.lines).toEqual(['unique=enforced'])
    expect(fake.state.records.CBooking ?? []).toEqual([])
  })

  it.each([404, 429, 502, 503, 504])('surfaces a %i on the duplicate instead of calling it enforced', async (status) => {
    let posts = 0
    const { client, fake } = adminClient({
      extraRoutes: (req) => {
        if (req.method === 'POST' && req.path === '/CBooking' && ++posts === 2) return new Response('', { status })
        return undefined
      },
    })
    await expect(runProbeUnique({ client, log: () => {} })).rejects.toMatchObject({ status })
    expect(fake.state.records.CBooking ?? []).toEqual([])
  })

  it('does not call a 500 enforced when a control record with another key fails too', async () => {
    let posts = 0
    const { client, fake } = adminClient({
      extraRoutes: (req) => {
        if (req.method === 'POST' && req.path === '/CBooking' && ++posts >= 2) return new Response('', { status: 500 })
        return undefined
      },
    })
    await expect(runProbeUnique({ client, log: () => {} })).rejects.toMatchObject({ status: 500 })
    expect(fake.state.records.CBooking ?? []).toEqual([])
  })

  it('prints unique=absent, exits 3 and deletes both records when the duplicate is accepted', async () => {
    const { client, fake } = adminClient()
    const out = collect()
    expect(await runProbeUnique({ client, log: out.log })).toBe(3)
    expect(out.lines).toEqual(['unique=absent'])
    expect(fake.state.records.CBooking ?? []).toEqual([])
    expect(fake.requests.filter((r) => r.method === 'DELETE')).toHaveLength(2)
  })

  it('uses a fresh key per run and never prints it', async () => {
    const { client, fake } = adminClient({ duplicateCheck: { CBooking: 'supabaseBookingId' } })
    const out = collect()
    await runProbeUnique({ client, log: out.log })
    await runProbeUnique({ client, log: out.log })
    const keys = fake.requests
      .filter((r) => r.method === 'POST')
      .map((r) => r.body.supabaseBookingId as string)
      .filter((k) => !k.endsWith('-control'))
    expect(new Set(keys).size).toBe(2)
    expect(keys[0]).toMatch(/^unique-probe-\d+-[0-9a-f]{8}$/)
    expect(out.lines.join('\n')).not.toContain('unique-probe-')
  })

  it('surfaces a 403 on the duplicate instead of calling it enforced', async () => {
    let posts = 0
    const { client, fake } = adminClient({
      extraRoutes: (req) => {
        if (req.method === 'POST' && req.path === '/CBooking' && ++posts === 2) return new Response('', { status: 403 })
        return undefined
      },
    })
    await expect(runProbeUnique({ client, log: () => {} })).rejects.toMatchObject({ status: 403 })
    expect(fake.state.records.CBooking ?? []).toEqual([])
  })
})

describe('precheck', () => {
  const row = (supabaseBookingId: string | null, i: number) => ({ id: `a${String(i).padStart(16, '0')}`, name: `b${i}`, supabaseBookingId })

  it('exits 0 with cbooking_total=0 on an empty entity', async () => {
    const { client } = adminClient()
    const out = collect()
    expect(await runPrecheck({ client, log: out.log })).toBe(0)
    expect(out.lines).toEqual(['cbooking_total=0'])
  })

  it('exits 0 when every key is distinct', async () => {
    const { client } = adminClient({ records: { CBooking: [row('x1', 1), row('x2', 2), row(null, 3), row('', 4)] } })
    const out = collect()
    expect(await runPrecheck({ client, log: out.log })).toBe(0)
    expect(out.lines).toEqual(['cbooking_total=4', 'duplicates=0'])
  })

  it('exits 3 when two rows share a supabaseBookingId, without printing the key', async () => {
    const { client } = adminClient({ records: { CBooking: [row('dup-key-77', 1), row('x2', 2), row('dup-key-77', 3)] } })
    const out = collect()
    expect(await runPrecheck({ client, log: out.log })).toBe(3)
    expect(out.lines).toEqual(['cbooking_total=3', 'duplicates=1'])
    expect(out.lines.join('\n')).not.toContain('dup-key-77')
  })
})

describe('rebuild', () => {
  it('POSTs /Admin/rebuild with the admin identity', async () => {
    const { client, fake } = adminClient({
      extraRoutes: (req) => (req.method === 'POST' && req.path === '/Admin/rebuild' ? new Response('true') : undefined),
    })
    const out = collect()
    expect(await runRebuild({ client, log: out.log })).toBe(0)
    expect(out.lines).toEqual(['rebuild: done'])
    expect(fake.requests.some((r) => r.method === 'POST' && r.path === '/Admin/rebuild')).toBe(true)
  })

  it('propagates a failed rebuild as an API error', async () => {
    const { client } = adminClient({
      extraRoutes: (req) => (req.path === '/Admin/rebuild' ? new Response('', { status: 500 }) : undefined),
    })
    await expect(runRebuild({ client, log: () => {} })).rejects.toMatchObject({ status: 500 })
  })
})

// ---------------------------------------------------------------------------------------------
// Phase 81, Plan 08 - the same overlay tool for Lead.cSupabaseRef (--entity Lead)
// ---------------------------------------------------------------------------------------------

/** Shaped like the Lead entityDefs FieldManager wrote when plan 81-03 created the c-fields. */
const leadFixture = () => ({
  fields: {
    lastName: { type: 'varchar', required: true },
    cSupabaseRef: { type: 'varchar', maxLength: 64, isCustom: true },
    cBookingReference: { type: 'varchar', maxLength: 64, isCustom: true },
  },
  links: {
    cExistingContact: { type: 'belongsTo', entity: 'Contact', foreign: 'cExistingLeads' },
  },
})

describe('Lead overlay file', () => {
  it('declares the unique index on cSupabaseRef + deleteId and deleteId true', () => {
    expect(loadLeadOverlay()).toEqual({
      indexes: { cSupabaseRefDeleteId: { type: 'unique', columns: ['cSupabaseRef', 'deleteId'] } },
      deleteId: true,
    })
  })

  it('is registered in ENTITY_SPECS next to CBooking with its key field', () => {
    expect(ENTITY_SPECS.CBooking.keyField).toBe('supabaseBookingId')
    expect(ENTITY_SPECS.Lead.keyField).toBe('cSupabaseRef')
    expect(ENTITY_SPECS.Lead.overlayFile).toBe(LEAD_OVERLAY_FILE)
    expect(ENTITY_SPECS.CBooking.overlayFile).toBe(OVERLAY_FILE)
  })
})

describe('mergeOverlay for Lead', () => {
  const opts = { keyField: 'cSupabaseRef' }

  it('adds the index and deleteId and leaves fields and links deep-equal', () => {
    const { result, added } = mergeOverlay(leadFixture(), loadLeadOverlay(), opts)
    expect(result.indexes.cSupabaseRefDeleteId).toEqual({ type: 'unique', columns: ['cSupabaseRef', 'deleteId'] })
    expect(result.deleteId).toBe(true)
    expect(result.fields).toEqual(leadFixture().fields)
    expect(result.links).toEqual(leadFixture().links)
    expect(added).toEqual(['indexes.cSupabaseRefDeleteId', 'deleteId'])
  })

  it('is idempotent: second merge adds nothing and is byte-identical', () => {
    const once = mergeOverlay(leadFixture(), loadLeadOverlay(), opts)
    const twice = mergeOverlay(once.result, loadLeadOverlay(), opts)
    expect(twice.added).toEqual([])
    expect(serialize(twice.result)).toBe(serialize(once.result))
  })

  it('refuses a file without fields.cSupabaseRef (including the CBooking definition)', () => {
    expect(() => mergeOverlay({ fields: { lastName: { type: 'varchar' } }, links: {} }, loadLeadOverlay(), opts)).toThrow(/cSupabaseRef/)
    expect(() => mergeOverlay(currentFixture(), loadLeadOverlay(), opts)).toThrow(/cSupabaseRef/)
    expect(() => mergeOverlay({}, loadLeadOverlay(), opts)).toThrow(/cSupabaseRef/)
  })

  it('still refuses a Lead file when called without options (CBooking default key)', () => {
    expect(() => mergeOverlay(leadFixture(), loadLeadOverlay())).toThrow(/not the CBooking definition/)
  })

  it('runMerge / runCheck with entity Lead write the merged file and gate on it', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'espocrm-overlay-lead-'))
    const currentFile = join(dir, 'Lead.current.json')
    const mergedFile = join(dir, 'Lead.merged.json')
    writeFileSync(currentFile, JSON.stringify(leadFixture(), null, 4))

    expect(runCheck({ file: currentFile, entity: 'Lead', log: () => {} })).toBe(3)
    const out = collect()
    expect(await runMerge({ currentFile, overlayFile: LEAD_OVERLAY_FILE, outFile: mergedFile, entity: 'Lead', log: out.log })).toBe(0)
    expect(out.lines).toEqual(['merge: added=indexes.cSupabaseRefDeleteId,deleteId'])
    expect(runCheck({ file: mergedFile, entity: 'Lead', log: () => {} })).toBe(0)
    // without --entity the check uses the CBooking overlay, which a Lead file does not satisfy
    expect(runCheck({ file: mergedFile, log: () => {} })).toBe(3)
  })

  it('runMerge with entity Lead refuses the CBooking file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'espocrm-overlay-lead-'))
    const currentFile = join(dir, 'wrong.json')
    writeFileSync(currentFile, JSON.stringify(currentFixture(), null, 4))
    await expect(
      runMerge({ currentFile, overlayFile: LEAD_OVERLAY_FILE, outFile: join(dir, 'out.json'), entity: 'Lead', log: () => {} }),
    ).rejects.toThrow(/not the Lead definition/)
  })
})

describe('parseArgs --entity', () => {
  it('accepts --entity Lead (and --entity=Lead) and leaves it undefined when absent', () => {
    expect(parseArgs(['probe-unique', '--entity', 'Lead']).entity).toBe('Lead')
    expect(parseArgs(['precheck', '--entity=Lead']).entity).toBe('Lead')
    expect(parseArgs(['probe-unique', '--entity', 'CBooking']).entity).toBe('CBooking')
    expect(parseArgs(['probe-unique']).entity).toBeUndefined()
    expect(parseArgs(['check', 'f.json', '--entity', 'Lead'])).toMatchObject({ command: 'check', positional: ['f.json'], entity: 'Lead' })
  })

  it('rejects an unknown entity and a missing value with a config error', () => {
    expect(() => parseArgs(['probe-unique', '--entity', 'Foo'])).toThrow(/entity/i)
    expect(() => parseArgs(['probe-unique', '--entity'])).toThrow(/entity/i)
  })
})

describe('probe-unique --entity Lead', () => {
  const leadPosts = (fake: ReturnType<typeof adminClient>['fake']) => fake.requests.filter((r) => r.method === 'POST' && r.path === '/Lead')
  /** Rejects the n-th POST /Lead with the given status. */
  const rejectNth = (n: number, status: number) => {
    let posts = 0
    return (req: { method: string; path: string }) =>
      req.method === 'POST' && req.path === '/Lead' && ++posts === n ? new Response('', { status }) : undefined
  }

  it('prints unique=enforced and empty_keys=allowed, and deletes every probe record', async () => {
    const { client, fake } = adminClient({ duplicateCheck: { Lead: 'cSupabaseRef' } })
    const out = collect()
    expect(await runProbeUnique({ client, entity: 'Lead', log: out.log })).toBe(0)
    expect(out.lines).toEqual(['unique=enforced', 'empty_keys=allowed'])
    expect(fake.state.records.Lead ?? []).toEqual([])
    expect(fake.state.records.CBooking ?? []).toEqual([])
    // keyed: first + rejected duplicate + control; then two records without a key
    const posts = leadPosts(fake)
    expect(posts).toHaveLength(5)
    expect(posts[0].body).toMatchObject({ lastName: 'unique-probe' })
    expect(posts[0].body.cSupabaseRef).toMatch(/^unique-probe-\d+-[0-9a-f]{8}$/)
    expect(posts[3].body.cSupabaseRef).toBeUndefined()
    expect(posts[4].body.cSupabaseRef).toBeUndefined()
    expect(out.lines.join('\n')).not.toContain('unique-probe-')
  })

  it('prints unique=absent, exits 3 and deletes both records when the duplicate is accepted', async () => {
    const { client, fake } = adminClient()
    const out = collect()
    expect(await runProbeUnique({ client, entity: 'Lead', log: out.log })).toBe(3)
    expect(out.lines).toEqual(['unique=absent'])
    expect(fake.state.records.Lead ?? []).toEqual([])
    expect(fake.requests.filter((r) => r.method === 'DELETE' && r.path.startsWith('/Lead/'))).toHaveLength(2)
  })

  it('treats a 409 on the second POST /Lead as the index refusing the duplicate', async () => {
    const { client, fake } = adminClient({ extraRoutes: rejectNth(2, 409) })
    const out = collect()
    expect(await runProbeUnique({ client, entity: 'Lead', log: out.log })).toBe(0)
    expect(out.lines[0]).toBe('unique=enforced')
    expect(fake.state.records.Lead ?? []).toEqual([])
  })

  it('prints empty_keys=blocked and exits 3 when a second Lead without a key is rejected; all probe records deleted', async () => {
    const { client, fake } = adminClient({ duplicateCheck: { Lead: 'cSupabaseRef' }, extraRoutes: rejectNth(5, 409) })
    const out = collect()
    expect(await runProbeUnique({ client, entity: 'Lead', log: out.log })).toBe(3)
    expect(out.lines).toEqual(['unique=enforced', 'empty_keys=blocked'])
    expect(fake.state.records.Lead ?? []).toEqual([])
  })

  it('surfaces a non-refusal status (503) on the unkeyed create instead of guessing; records still deleted', async () => {
    const { client, fake } = adminClient({ duplicateCheck: { Lead: 'cSupabaseRef' }, extraRoutes: rejectNth(5, 503) })
    await expect(runProbeUnique({ client, entity: 'Lead', log: () => {} })).rejects.toMatchObject({ status: 503 })
    expect(fake.state.records.Lead ?? []).toEqual([])
  })

  it('does not run the empty-key probe for CBooking (default entity output unchanged)', async () => {
    const { client, fake } = adminClient({ duplicateCheck: { CBooking: 'supabaseBookingId' } })
    const out = collect()
    expect(await runProbeUnique({ client, entity: 'CBooking', log: out.log })).toBe(0)
    expect(out.lines).toEqual(['unique=enforced'])
    expect(fake.requests.filter((r) => r.method === 'POST' && r.path === '/CBooking')).toHaveLength(3)
  })
})

describe('precheck --entity Lead', () => {
  const lead = (cSupabaseRef: string | null, i: number) => ({ id: `l${String(i).padStart(16, '0')}`, lastName: `n${i}`, cSupabaseRef })

  it('prints lead_total=N and exits 0 when keys are distinct or empty', async () => {
    const { client } = adminClient({ records: { Lead: [lead('r1', 1), lead('r2', 2), lead(null, 3), lead('', 4), lead(null, 5)] } })
    const out = collect()
    expect(await runPrecheck({ client, entity: 'Lead', log: out.log })).toBe(0)
    expect(out.lines).toEqual(['lead_total=5', 'duplicates=0'])
  })

  it('exits 3 when two Leads share a cSupabaseRef, without printing the key', async () => {
    const { client } = adminClient({ records: { Lead: [lead('dup-ref-9', 1), lead('r2', 2), lead('dup-ref-9', 3)] } })
    const out = collect()
    expect(await runPrecheck({ client, entity: 'Lead', log: out.log })).toBe(3)
    expect(out.lines).toEqual(['lead_total=3', 'duplicates=1'])
    expect(out.lines.join('\n')).not.toContain('dup-ref-9')
  })

  it('queries /Lead, not /CBooking', async () => {
    const { client, fake } = adminClient()
    await runPrecheck({ client, entity: 'Lead', log: () => {} })
    expect(fake.requests.every((r) => !r.path.startsWith('/CBooking'))).toBe(true)
    expect(fake.requests.some((r) => r.path.startsWith('/Lead'))).toBe(true)
  })
})
