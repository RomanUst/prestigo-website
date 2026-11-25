// Phase 94 (plan 94-01): an in-memory PostgREST stand-in for the driver cabinet tables.
// Tables: drivers, driver_login_codes, driver_sessions, driver_push_subscriptions, driver_assignments, bookings.
// Supports from().select / insert / update / upsert / delete with eq, neq, in, is, gt, gte, lt, lte, order, limit,
// single, maybeSingle, a chained select() after writes, and thenable awaits. Embedded selects resolve by naming
// convention (an embed of 'drivers' joins on driver_id, 'bookings' on booking_id; '!inner' drops parent rows with no
// match) and return the FULL related row (column gates are asserted on the recorded select strings in `calls`).
// rpc('consume_driver_login_code') mirrors the SQL contract of migration 100. Defaults mirror migration 100.
// Every later cabinet test imports this helper unchanged.

import { randomUUID } from 'node:crypto'

export type Row = Record<string, unknown>
type DbError = { code: string; message: string }
type Result = { data: unknown; error: DbError | null }

export type FakeCall = {
  table: string
  op: 'select' | 'insert' | 'update' | 'upsert' | 'delete' | 'rpc'
  columns: string | null
  filters: string[]
}

export type FakeDriverCabinetDb = {
  tables: Record<string, Row[]>
  calls: FakeCall[]
  /** When set, every write (insert / update / upsert / delete) on that table fails with a database error. */
  failWritesOn: Set<string>
  /** When true, rpc() answers with an error instead of a result. */
  failRpc: { value: boolean }
  client: {
    from: (table: string) => unknown
    rpc: (name: string, args: Record<string, unknown>) => PromiseLike<Result>
  }
}

const nowIso = () => new Date().toISOString()

const DEFAULTS: Record<string, () => Row> = {
  drivers: () => ({
    id: randomUUID(),
    name: '',
    email: '',
    phone: '',
    vehicle_info: null,
    cabinet_enabled: false,
    cabinet_invited_at: null,
    vehicle_plate: null,
    created_at: nowIso(),
  }),
  driver_login_codes: () => ({
    id: randomUUID(),
    attempts: 0,
    consumed_at: null,
    created_at: nowIso(),
  }),
  driver_sessions: () => ({
    id: randomUUID(),
    created_at: nowIso(),
  }),
  driver_push_subscriptions: () => ({
    id: randomUUID(),
    created_at: nowIso(),
    updated_at: nowIso(),
  }),
  driver_assignments: () => ({
    id: randomUUID(),
    status: 'pending',
    token: randomUUID(),
    token_expires_at: null,
    token_used_at: null,
    trip_token: null,
    trip_progress: null,
    trip_note: null,
    trip_progress_updated_at: null,
    created_at: nowIso(),
  }),
  bookings: () => ({
    id: randomUUID(),
    created_at: nowIso(),
  }),
}

const UNIQUE: Record<string, string[][]> = {
  drivers: [['id']],
  driver_login_codes: [['id']],
  driver_sessions: [['id'], ['token_hash']],
  driver_push_subscriptions: [['id'], ['endpoint']],
  driver_assignments: [['id']],
  bookings: [['id']],
}

const CASCADE_FROM_DRIVERS = ['driver_login_codes', 'driver_sessions', 'driver_push_subscriptions']

const EMBED_FK: Record<string, string> = { drivers: 'driver_id', bookings: 'booking_id' }

type Embed = { name: string; inner: boolean }

function parseEmbeds(columns: string | null): Embed[] {
  if (!columns) return []
  const out: Embed[] = []
  const re = /([a-z_]+)(!inner)?\(/g
  let m: RegExpExecArray | null
  while ((m = re.exec(columns)) !== null) out.push({ name: m[1], inner: Boolean(m[2]) })
  return out
}

function cmp(a: unknown, b: unknown): number {
  if (a === b) return 0
  if (a === null || a === undefined) return -1
  if (b === null || b === undefined) return 1
  return (a as number | string) < (b as number | string) ? -1 : 1
}

export function createFakeDriverCabinetDb(seed: Partial<Record<string, Row[]>> = {}): FakeDriverCabinetDb {
  const tables: Record<string, Row[]> = {
    drivers: [],
    driver_login_codes: [],
    driver_sessions: [],
    driver_push_subscriptions: [],
    driver_assignments: [],
    bookings: [],
  }
  for (const [name, rows] of Object.entries(seed)) {
    tables[name] = (rows ?? []).map((r) => ({ ...(DEFAULTS[name]?.() ?? {}), ...r }))
  }
  const calls: FakeCall[] = []
  const failWritesOn = new Set<string>()
  const failRpc = { value: false }

  class Query {
    private op: 'select' | 'insert' | 'update' | 'upsert' | 'delete' | null = null
    private columns: string | null = null
    private filters: Array<(r: Row) => boolean> = []
    private filterLog: string[] = []
    private payload: Row | Row[] | null = null
    private conflict: string[] | null = null
    private orderBy: { col: string; asc: boolean } | null = null
    private max: number | null = null
    private mode: 'many' | 'maybe' | 'single' = 'many'
    private returning = false

    constructor(private table: string) {}

    select(columns?: string) {
      if (this.op === null) this.op = 'select'
      else this.returning = true
      this.columns = columns ?? '*'
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
    private add(label: string, f: (r: Row) => boolean) {
      this.filterLog.push(label)
      this.filters.push(f)
      return this
    }
    eq(col: string, val: unknown) {
      return this.add(`eq ${col}`, (r) => r[col] === val)
    }
    neq(col: string, val: unknown) {
      return this.add(`neq ${col}`, (r) => r[col] !== val)
    }
    in(col: string, vals: unknown[]) {
      return this.add(`in ${col}`, (r) => vals.includes(r[col]))
    }
    is(col: string, val: unknown) {
      return this.add(`is ${col}`, (r) => (val === null ? r[col] === null || r[col] === undefined : r[col] === val))
    }
    gt(col: string, val: unknown) {
      return this.add(`gt ${col}`, (r) => cmp(r[col], val) > 0)
    }
    gte(col: string, val: unknown) {
      return this.add(`gte ${col}`, (r) => cmp(r[col], val) >= 0)
    }
    lt(col: string, val: unknown) {
      return this.add(`lt ${col}`, (r) => cmp(r[col], val) < 0)
    }
    lte(col: string, val: unknown) {
      return this.add(`lte ${col}`, (r) => cmp(r[col], val) <= 0)
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

    private uniqueViolation(rows: Row[], p: Row, ignore?: Row): boolean {
      return (UNIQUE[this.table] ?? []).some((keys) =>
        keys.every((k) => p[k] !== undefined) && rows.some((r) => r !== ignore && keys.every((k) => r[k] === p[k])),
      )
    }

    private withEmbeds(rows: Row[]): Row[] {
      const embeds = parseEmbeds(this.columns)
      if (embeds.length === 0) return rows
      const out: Row[] = []
      for (const r of rows) {
        const next: Row = { ...r }
        let dropped = false
        for (const e of embeds) {
          const fk = EMBED_FK[e.name]
          const related = fk ? (tables[e.name] ?? []).find((x) => x.id === r[fk]) : undefined
          next[e.name] = related ? { ...related } : null
          if (e.inner && !related) dropped = true
        }
        if (!dropped) out.push(next)
      }
      return out
    }

    private run(): Result {
      const op = this.op ?? 'select'
      calls.push({ table: this.table, op, columns: this.columns, filters: [...this.filterLog] })
      const rows = (tables[this.table] ??= [])
      const isWrite = op !== 'select'
      if (isWrite && failWritesOn.has(this.table)) return this.fail('XX000')

      let affected: Row[] = []
      if (op === 'insert' || op === 'upsert') {
        const list = Array.isArray(this.payload) ? this.payload : [this.payload as Row]
        for (const p of list) {
          const conflictKeys = this.conflict
          const dup = conflictKeys ? rows.find((r) => conflictKeys.every((k) => r[k] === p[k])) : undefined
          if (dup && op === 'upsert') {
            Object.assign(dup, p)
            affected.push(dup)
            continue
          }
          if (this.uniqueViolation(rows, p)) return this.fail('23505')
          const row = { ...(DEFAULTS[this.table]?.() ?? {}), ...p }
          rows.push(row)
          affected.push(row)
        }
      } else if (op === 'update') {
        affected = rows.filter((r) => this.filters.every((f) => f(r)))
        const patch = this.payload as Row
        for (const r of affected) {
          if (this.uniqueViolation(rows, { ...r, ...patch }, r)) return this.fail('23505')
        }
        for (const r of affected) Object.assign(r, patch)
      } else if (op === 'delete') {
        const keep: Row[] = []
        for (const r of rows) (this.filters.every((f) => f(r)) ? affected : keep).push(r)
        tables[this.table] = keep
        if (this.table === 'drivers') {
          const gone = new Set(affected.map((r) => r.id))
          for (const child of CASCADE_FROM_DRIVERS) {
            tables[child] = (tables[child] ?? []).filter((r) => !gone.has(r.driver_id))
          }
        }
      } else {
        const indexed = rows.map((r, i) => ({ r, i })).filter(({ r }) => this.filters.every((f) => f(r)))
        if (this.orderBy) {
          const { col, asc } = this.orderBy
          indexed.sort((a, b) => (cmp(a.r[col], b.r[col]) || a.i - b.i) * (asc ? 1 : -1))
        }
        affected = indexed.map(({ r }) => r)
        affected = this.withEmbeds(affected)
        if (this.max !== null) affected = affected.slice(0, this.max)
      }

      if (isWrite && !this.returning) {
        return { data: null, error: null }
      }
      if (isWrite && this.returning) affected = this.withEmbeds(affected)

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

  function rpc(name: string, args: Record<string, unknown>): PromiseLike<Result> {
    calls.push({ table: name, op: 'rpc', columns: null, filters: [] })
    const done = (r: Result): PromiseLike<Result> => Promise.resolve(r)
    if (failRpc.value) return done({ data: null, error: { code: 'XX000', message: 'rpc boom' } })
    if (name !== 'consume_driver_login_code') {
      return done({ data: null, error: { code: '42883', message: `unknown function ${name}` } })
    }
    // Mirrors public.consume_driver_login_code of migration 100.
    const row = tables.driver_login_codes.find((r) => r.id === args.p_code_id && r.driver_id === args.p_driver_id)
    if (
      !row ||
      row.consumed_at !== null ||
      cmp(row.expires_at, nowIso()) <= 0 ||
      (row.attempts as number) >= 5
    ) {
      return done({ data: 'dead', error: null })
    }
    row.attempts = (row.attempts as number) + 1
    if (row.code_hash === args.p_code_hash) {
      row.consumed_at = nowIso()
      return done({ data: 'ok', error: null })
    }
    return done({ data: 'wrong', error: null })
  }

  return { tables, calls, failWritesOn, failRpc, client: { from: (table: string) => new Query(table), rpc } }
}
