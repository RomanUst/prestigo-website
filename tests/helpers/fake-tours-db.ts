// Phase 93 (plan 93-07): a small in-memory PostgREST stand-in for the admin tour routes.
// Supports from().select / insert / update / upsert / delete with eq / in filters, order, limit, single / maybeSingle.
// Unique constraints it enforces: tours.slug, (tour_id, locale) of tour_translations. Defaults mirror 092_tours.sql.

import { randomUUID } from 'node:crypto'

type Row = Record<string, unknown>
type Result = { data: unknown; error: { code: string; message: string } | null }

export type FakeToursDb = {
  tables: Record<string, Row[]>
  /** When set, every write (insert / update / upsert / delete) on that table fails with a database error. */
  failWritesOn: Set<string>
  client: { from: (table: string) => unknown }
}

const DEFAULTS: Record<string, () => Row> = {
  tours: () => ({
    id: randomUUID(),
    status: 'draft',
    sort_order: 0,
    hours_included: 4,
    drive_minutes_each_way: null,
    start_time_min: '08:00',
    start_time_max: '11:00',
    price_e_eur: null,
    price_s_eur: null,
    price_v_eur: null,
    destination_label: '',
    first_published_at: null,
    created_at: '2026-11-18T00:00:00.000Z',
    updated_at: '2026-11-18T00:00:00.000Z',
  }),
  tour_translations: () => ({
    title: '',
    short_description: '',
    description: '',
    pickup_info: '',
    important_info: '',
    seo_title: '',
    seo_description: '',
    highlights: [],
    itinerary: [],
    includes: [],
    excludes: [],
    faq: [],
    is_complete: false,
    updated_at: '2026-11-18T00:00:00.000Z',
  }),
}

const UNIQUE: Record<string, string[]> = {
  tours: ['slug'],
  tour_translations: ['tour_id', 'locale'],
}

export function createFakeToursDb(seed: Partial<Record<string, Row[]>> = {}): FakeToursDb {
  const tables: Record<string, Row[]> = {
    tours: [],
    tour_translations: [],
    tour_photos: [],
    tour_settings: [],
  }
  for (const [name, rows] of Object.entries(seed)) tables[name] = (rows ?? []).map((r) => ({ ...r }))
  const failWritesOn = new Set<string>()

  class Query {
    private op: 'select' | 'insert' | 'update' | 'upsert' | 'delete' | null = null
    private filters: Array<(r: Row) => boolean> = []
    private payload: Row | Row[] | null = null
    private conflict: string[] | null = null
    private orderBy: { col: string; asc: boolean } | null = null
    private max: number | null = null
    private mode: 'many' | 'maybe' | 'single' = 'many'

    constructor(private table: string) {}

    select() {
      if (this.op === null) this.op = 'select'
      return this
    }
    insert(p: Row | Row[]) {
      this.op = 'insert'
      this.payload = p
      return this
    }
    update(p: Row) {
      this.op = 'update'
      this.payload = p
      return this
    }
    upsert(p: Row | Row[], opts?: { onConflict?: string }) {
      this.op = 'upsert'
      this.payload = p
      this.conflict = opts?.onConflict ? opts.onConflict.split(',').map((s) => s.trim()) : null
      return this
    }
    delete() {
      this.op = 'delete'
      return this
    }
    eq(col: string, val: unknown) {
      this.filters.push((r) => r[col] === val)
      return this
    }
    in(col: string, vals: unknown[]) {
      this.filters.push((r) => vals.includes(r[col]))
      return this
    }
    order(col: string, opts?: { ascending?: boolean }) {
      this.orderBy = { col, asc: opts?.ascending !== false }
      return this
    }
    limit(n: number) {
      this.max = n
      return this
    }
    maybeSingle() {
      this.mode = 'maybe'
      return this
    }
    single() {
      this.mode = 'single'
      return this
    }

    private fail(code: string): Result {
      return { data: null, error: { code, message: 'boom with secret@example.com' } }
    }

    private run(): Result {
      const rows = (tables[this.table] ??= [])
      const isWrite = this.op !== 'select' && this.op !== null
      if (isWrite && failWritesOn.has(this.table)) return this.fail('XX000')

      let affected: Row[] = []
      if (this.op === 'insert' || this.op === 'upsert') {
        const list = Array.isArray(this.payload) ? this.payload : [this.payload as Row]
        for (const p of list) {
          const keys = this.conflict ?? UNIQUE[this.table] ?? []
          const dup = keys.length > 0 ? rows.find((r) => keys.every((k) => r[k] === p[k])) : undefined
          if (dup) {
            if (this.op === 'insert') return this.fail('23505')
            Object.assign(dup, p)
            affected.push(dup)
            continue
          }
          const unique = UNIQUE[this.table] ?? []
          if (unique.length > 0 && rows.some((r) => unique.every((k) => r[k] === p[k]))) return this.fail('23505')
          const row = { ...(DEFAULTS[this.table]?.() ?? {}), ...p }
          rows.push(row)
          affected.push(row)
        }
      } else if (this.op === 'update') {
        affected = rows.filter((r) => this.filters.every((f) => f(r)))
        const patch = this.payload as Row
        if (patch.slug !== undefined && rows.some((r) => r.slug === patch.slug && !affected.includes(r))) return this.fail('23505')
        for (const r of affected) Object.assign(r, patch)
      } else if (this.op === 'delete') {
        const keep: Row[] = []
        for (const r of rows) (this.filters.every((f) => f(r)) ? affected : keep).push(r)
        tables[this.table] = keep
      } else {
        affected = rows.filter((r) => this.filters.every((f) => f(r)))
        if (this.orderBy) {
          const { col, asc } = this.orderBy
          affected = [...affected].sort((a, b) => {
            const x = a[col] as number | string
            const y = b[col] as number | string
            return (x < y ? -1 : x > y ? 1 : 0) * (asc ? 1 : -1)
          })
        }
        if (this.max !== null) affected = affected.slice(0, this.max)
      }

      const out = affected.map((r) => ({ ...r }))
      if (this.mode === 'many') return { data: out, error: null }
      if (this.mode === 'maybe') return { data: out[0] ?? null, error: null }
      return out.length === 1 ? { data: out[0], error: null } : this.fail('PGRST116')
    }

    then<T>(resolve: (v: Result) => T, reject?: (e: unknown) => T) {
      try {
        return Promise.resolve(this.run()).then(resolve, reject)
      } catch (e) {
        return Promise.reject(e).then(resolve, reject)
      }
    }
  }

  return { tables, failWritesOn, client: { from: (table: string) => new Query(table) } }
}
