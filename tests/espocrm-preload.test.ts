// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any -- stub API payloads are intentionally loose */
/**
 * Phase 80 review WR-03 - the CRM preload must be complete and stable before any script
 * writes: pages are ordered by the unique id, repeats are de-duplicated, a shortfall against
 * the reported total fails closed, and the overlay precheck does not mistake a repeated page
 * row for a duplicate key (or a skipped row for a pass).
 */
import { describe, expect, it } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PartialPreloadError, fetchAll } from '../infra/espocrm/lib/crm-read.mjs'
import { runPrecheck } from '../infra/espocrm/overlay.mjs'
import { runBackfill } from '../infra/espocrm/backfill.mjs'
import { runSeed } from '../infra/espocrm/seed-accounts.mjs'

const rec = (i: number, extra: Record<string, unknown> = {}) => ({ id: `r${String(i).padStart(6, '0')}`, ...extra })

/** In-memory collection pager; `tamper(pageIndex, list)` can skip or repeat rows like a tie-shuffling server. */
function pagedClient(
  collections: Record<string, any[]>,
  tamper: (entity: string, offset: number, list: any[]) => any[] = (_e, _o, list) => list,
) {
  const urls: string[] = []
  return {
    urls,
    async request(method: string, apiPath: string) {
      expect(method).toBe('GET')
      urls.push(apiPath)
      const [pathname, query = ''] = apiPath.split('?')
      const entity = pathname.slice(1)
      const params = new URLSearchParams(query)
      const all = collections[entity] ?? []
      const offset = Number(params.get('offset') ?? 0)
      const maxSize = Math.min(Number(params.get('maxSize') ?? 20), 200)
      return { total: all.length, list: tamper(entity, offset, all.slice(offset, offset + maxSize)) }
    },
  }
}

describe('fetchAll', () => {
  it('orders pages by the unique id, never by createdAt', async () => {
    const client = pagedClient({ Contact: [rec(1)] })
    await fetchAll(client, 'Contact', ['id'])
    const params = new URLSearchParams(client.urls[0].split('?')[1])
    expect(params.get('orderBy')).toBe('id')
    expect(params.get('order')).toBe('asc')
  })

  it('loads every record across several pages', async () => {
    const all = Array.from({ length: 450 }, (_, i) => rec(i))
    const out = await fetchAll(pagedClient({ Contact: all }), 'Contact', ['id'])
    expect(out).toHaveLength(450)
  })

  it('de-duplicates a row repeated across pages when nothing is missing', async () => {
    const all = Array.from({ length: 450 }, (_, i) => rec(i))
    // Page 2 starts with the last row of page 1 and drops its own last row, then a late page
    // restores it: net result complete.
    const client = pagedClient({ Contact: [...all, rec(999)] }, (_e, offset, list) => (offset === 200 ? [all[199], ...list] : list))
    const out = await fetchAll(client, 'Contact', ['id'])
    expect(new Set(out.map((r: any) => r.id)).size).toBe(out.length)
    expect(out.length).toBe(451)
  })

  it('fails closed when a page skipped records (fewer loaded than the reported total)', async () => {
    const all = Array.from({ length: 450 }, (_, i) => rec(i))
    const client = pagedClient({ Contact: all }, (_e, offset, list) => (offset === 200 ? list.slice(1) : list))
    await expect(fetchAll(client, 'Contact', ['id'])).rejects.toBeInstanceOf(PartialPreloadError)
    await expect(fetchAll(client, 'Contact', ['id'])).rejects.toThrow(/Contact: loaded 399 of 450/)
  })

  it('fails closed on a short middle page', async () => {
    const all = Array.from({ length: 450 }, (_, i) => rec(i))
    const client = pagedClient({ Contact: all }, (_e, offset, list) => (offset === 0 ? list.slice(0, 150) : list))
    await expect(fetchAll(client, 'Contact', ['id'])).rejects.toBeInstanceOf(PartialPreloadError)
  })

  it('does not enforce a count when the server reports no total', async () => {
    const client = { async request() { return { list: [rec(1), rec(2)] } } }
    expect(await fetchAll(client, 'Contact', ['id'])).toHaveLength(2)
  })
})

describe('overlay precheck over unstable paging', () => {
  const booking = (i: number, key: string | null) => rec(i, { supabaseBookingId: key })

  it('does not count a row repeated across pages as a duplicate key', async () => {
    const all = Array.from({ length: 230 }, (_, i) => booking(i, `k${i}`))
    const client = pagedClient({ CBooking: all }, (_e, offset, list) => (offset === 200 ? [all[199], ...list] : list))
    const lines: string[] = []
    expect(await runPrecheck({ client, log: (l: string) => lines.push(l) })).toBe(0)
    expect(lines).toEqual(['cbooking_total=230', 'duplicates=0'])
  })

  it('still reports two different records that share a key', async () => {
    const all = Array.from({ length: 230 }, (_, i) => booking(i, i === 229 ? 'k0' : `k${i}`))
    const lines: string[] = []
    expect(await runPrecheck({ client: pagedClient({ CBooking: all }), log: (l: string) => lines.push(l) })).toBe(3)
    expect(lines).toEqual(['cbooking_total=230', 'duplicates=1'])
  })

  it('refuses to pass when a page skipped rows', async () => {
    const all = Array.from({ length: 230 }, (_, i) => booking(i, `k${i}`))
    const client = pagedClient({ CBooking: all }, (_e, offset, list) => (offset === 200 ? list.slice(1) : list))
    await expect(runPrecheck({ client, log: () => {} })).rejects.toBeInstanceOf(PartialPreloadError)
  })
})

describe('writers stop before the first write on a partial preload', () => {
  it('backfill does not write anything', async () => {
    const all = Array.from({ length: 250 }, (_, i) => rec(i, { emailAddress: `p${i}@example.com` }))
    const base = pagedClient({ Contact: all, CBooking: [] }, (entity, offset, list) => (entity === 'Contact' && offset === 200 ? list.slice(1) : list))
    const writes: string[] = []
    const client = {
      async request(method: string, apiPath: string, body?: unknown) {
        if (method !== 'GET') writes.push(`${method} ${apiPath}`)
        return base.request(method, apiPath, body as never)
      },
    }
    const dir = mkdtempSync(join(tmpdir(), 'espocrm-preload-'))
    const input = join(dir, 'page-01.json')
    writeFileSync(input, JSON.stringify([{ id: 'b1', created_at: '2026-01-01T00:00:00Z', status: 'confirmed' }]))
    await expect(runBackfill({ client, input, log: () => {} })).rejects.toBeInstanceOf(PartialPreloadError)
    expect(writes).toEqual([])
  })

  it('seed-accounts does not write anything', async () => {
    const all = Array.from({ length: 250 }, (_, i) => rec(i, { name: `A${i}` }))
    const base = pagedClient({ Account: all, Contact: [] }, (entity, offset, list) => (entity === 'Account' && offset === 200 ? list.slice(1) : list))
    const writes: string[] = []
    const client = {
      async request(method: string, apiPath: string) {
        if (method !== 'GET') writes.push(`${method} ${apiPath}`)
        return base.request(method, apiPath)
      },
    }
    await expect(runSeed({ client, candidates: [], rows: [], log: () => {} })).rejects.toBeInstanceOf(PartialPreloadError)
    expect(writes).toEqual([])
  })
})
