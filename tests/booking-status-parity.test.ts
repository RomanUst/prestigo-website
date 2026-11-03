// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'fs'
import { join, relative } from 'path'
import { latestFunctionBody, latestStatusCheckValues } from './helpers/latest-migration'
import {
  BOOKING_STATUSES,
  BOOKING_STATUS_LABELS,
  CALENDAR_ACTIVE_STATUSES,
  REVENUE_STATUSES,
} from '@/lib/booking-status'
import { VALID_TRANSITIONS } from '@/lib/booking-transitions'
import { BOOKING_LEAD_STATUS } from '@/lib/lead-mapping'
import { PANEL_VALUE_STATUSES } from '@/lib/panel-bookings'
import { CALENDAR_ACTIVE_STATUSES as GCAL_ACTIVE } from '@/lib/google-calendar'
import * as bookingMap from '../infra/espocrm/lib/booking-map.mjs'

// Phase 87 (D-02, Pitfall 4): SQL-vs-TypeScript parity on the LATEST migration definitions.
//
// A later `CREATE OR REPLACE FUNCTION` silently supersedes an earlier body, so every comparison here
// reads the LAST definition in filename order (tests/helpers/latest-migration.ts) and never a
// specific migration file. If a migration, lib/booking-status.ts or one of the mappers drifts, this
// suite fails instead of the drift reaching production.

const sorted = (xs: Iterable<string>) => [...xs].sort()

// ── SQL parsers (small and commented so a SQL formatting change fails loudly, not silently) ──

/** Every `WHEN 'x' THEN 'y'` pair of a CASE expression, as { x: y }. Quoted literals only. */
function parseWhenThenPairs(sql: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const m of sql.matchAll(/WHEN\s+'([a-z_]+)'\s+THEN\s+'([a-z_]+)'/g)) out[m[1]] = m[2]
  return out
}

/** Quoted values of the LAST `<alias>.status IN ( ... )` list in a function body. */
function parseLastStatusInList(sql: string): string[] {
  const matches = [...sql.matchAll(/\bb\.status\s+IN\s*\(([^)]*)\)/g)]
  if (matches.length === 0) throw new Error('no `b.status IN (...)` list found')
  return [...matches[matches.length - 1][1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1])
}

/** Quoted values of the `ARRAY[...]` literal bound to the `active` constant. */
function parseActiveArray(sql: string): string[] {
  const m = sql.match(/active\s+constant\s+text\[\]\s*:=\s*ARRAY\[([^\]]*)\]/)
  if (!m) throw new Error('no `active constant text[] := ARRAY[...]` literal found')
  return [...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1])
}

// ── Vocabulary ───────────────────────────────────────────────────────────────

describe('bookings_status_check vs lib/booking-status.ts', () => {
  it('the latest CHECK equals BOOKING_STATUSES, order included', () => {
    expect(latestStatusCheckValues()).toEqual([...BOOKING_STATUSES])
  })

  it('VALID_TRANSITIONS and BOOKING_STATUS_LABELS have exactly the CHECK statuses as keys', () => {
    const check = sorted(latestStatusCheckValues())
    expect(sorted(Object.keys(VALID_TRANSITIONS))).toEqual(check)
    expect(sorted(Object.keys(BOOKING_STATUS_LABELS))).toEqual(check)
  })

  it('the EspoCRM mapper keeps its own copy (infra never imports lib/) equal to the latest CHECK', () => {
    expect(bookingMap.BOOKING_STATUS_VALUES).toEqual(latestStatusCheckValues())
  })
})

// ── Lead status ──────────────────────────────────────────────────────────────

describe('booking_lead_status() vs BOOKING_LEAD_STATUS (D-10)', () => {
  const sqlPairs = parseWhenThenPairs(latestFunctionBody('booking_lead_status'))

  it('the parser reads the real pairs of the latest body', () => {
    expect(Object.keys(sqlPairs).length).toBe(BOOKING_STATUSES.length)
    expect(sqlPairs.on_board).toBe('converted')
    expect(sqlPairs.no_show).toBe('converted')
  })

  it('every WHEN/THEN pair equals the TypeScript map, keys and values', () => {
    expect(sqlPairs).toEqual({ ...BOOKING_LEAD_STATUS })
  })

  it('self-test: a drifted copy of the TypeScript map is detected', () => {
    const drifted = { ...BOOKING_LEAD_STATUS, no_show: 'dead' }
    expect(sqlPairs).not.toEqual(drifted)
    const { no_show: _dropped, ...missingKey } = BOOKING_LEAD_STATUS
    void _dropped
    expect(sqlPairs).not.toEqual(missingKey)
  })
})

// ── Revenue (D-11) ───────────────────────────────────────────────────────────

describe('revenue status lists vs REVENUE_STATUSES (D-11)', () => {
  const statsList = parseLastStatusInList(latestFunctionBody('stats_trips'))
  const panelList = parseLastStatusInList(latestFunctionBody('panel_bookings'))

  it('stats_trips() counts exactly REVENUE_STATUSES', () => {
    expect(sorted(statsList)).toEqual(sorted(REVENUE_STATUSES))
  })

  it('panel_bookings() counts exactly REVENUE_STATUSES', () => {
    expect(sorted(panelList)).toEqual(sorted(REVENUE_STATUSES))
  })

  it('no_show is a trip but never revenue; on_board is revenue', () => {
    for (const list of [statsList, panelList]) {
      expect(list).toContain('on_board')
      expect(list).not.toContain('no_show')
    }
  })

  it('the TypeScript panel value set is the shared revenue set', () => {
    expect(sorted(PANEL_VALUE_STATUSES)).toEqual(sorted(REVENUE_STATUSES))
  })
})

// ── Calendar (A5) ────────────────────────────────────────────────────────────

describe('notify_booking_gcal_sync() vs CALENDAR_ACTIVE_STATUSES (A5)', () => {
  const active = parseActiveArray(latestFunctionBody('notify_booking_gcal_sync'))

  it('the active array equals the shared set, as a set', () => {
    expect(sorted(active)).toEqual(sorted(CALENDAR_ACTIVE_STATUSES))
  })

  it('lib/google-calendar.ts re-exports the same set', () => {
    expect(GCAL_ACTIVE).toBe(CALENDAR_ACTIVE_STATUSES)
  })

  it('on_board and no_show keep their event, cancelled does not', () => {
    expect(active).toContain('on_board')
    expect(active).toContain('no_show')
    expect(active).not.toContain('cancelled')
  })
})

// ── Stray-list guard ─────────────────────────────────────────────────────────

// An inline hand-written status list (`'en_route', 'on_location'` side by side) is how the previous
// per-module copies drifted. Scope: lib/ and infra/ (the modules plan 87-04 owns); admin components
// are converted by plan 87-05. Every allowlist entry needs a reason and must still match its file.
const STRAY_LIST_RE = /['"]en_route['"],\s*['"]on_location['"]/
const SCAN_ROOTS = ['lib', 'infra']
const SCAN_EXT = /\.(ts|mjs)$/
const SKIP_DIRS = new Set(['node_modules', '.next', '.git'])

const ALLOWLIST: Array<{ file: string; reason: string }> = [
  {
    file: 'lib/booking-status.ts',
    reason: 'the single TypeScript status vocabulary; every other module derives from it',
  },
  {
    file: 'infra/espocrm/lib/booking-map.mjs',
    reason: 'infra code cannot import lib/; its copy is pinned to the latest CHECK by the parity test above',
  },
]

function walk(dir: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue
    const full = join(dir, name)
    const st = statSync(full)
    if (st.isDirectory()) walk(full, out)
    else if (SCAN_EXT.test(name)) out.push(full)
  }
}

function filesWithStrayList(): string[] {
  const root = process.cwd()
  const files: string[] = []
  for (const r of SCAN_ROOTS) walk(join(root, r), files)
  return files
    .filter((f) => STRAY_LIST_RE.test(readFileSync(f, 'utf8')))
    .map((f) => relative(root, f).split('\\').join('/'))
    .sort()
}

describe('no hand-written status lists in lib/ and infra/', () => {
  const found = filesWithStrayList()

  it('only the allowlisted files carry an inline status list', () => {
    const allowed = new Set(ALLOWLIST.map((a) => a.file))
    expect(found.filter((f) => !allowed.has(f))).toEqual([])
  })

  it('every allowlist entry has a real reason (20+ characters)', () => {
    for (const a of ALLOWLIST) expect(a.reason.trim().length).toBeGreaterThanOrEqual(20)
  })

  it('no allowlist entry is stale: each listed file still matches the pattern', () => {
    for (const a of ALLOWLIST) expect(found, `stale allowlist entry ${a.file}`).toContain(a.file)
  })

  it('self-test: the pattern matches a multi-line hand-written list', () => {
    expect(STRAY_LIST_RE.test("const x = [\n  'en_route',\n  'on_location',\n]")).toBe(true)
    expect(STRAY_LIST_RE.test("const x = ['en_route']")).toBe(false)
  })
})
