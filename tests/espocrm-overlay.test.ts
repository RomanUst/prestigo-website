// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any -- fake API payloads are intentionally loose */
/**
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
