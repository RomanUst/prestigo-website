// @vitest-environment node
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

/**
 * Phase 87 (PAYF-02, plan 87-03) — direct bookings.status writer gate.
 *
 * Every change of bookings.status goes through lib/booking-status-service.ts, which calls the
 * advance_booking_status compare-and-set RPC (migration 084). This source-reading gate fails when
 * any file under app/ or lib/ writes bookings.status directly (a bookings query whose update
 * payload carries a status key), except the legacy system writers in STATUS_WRITER_ALLOWLIST. The
 * database trigger of migration 084 logs those allowlisted writers as actor 'system', so no change
 * is ever unlogged. It also pins that the RPC is called from exactly one file.
 *
 * Known limit: a payload built by a function call (`.update(buildPayload())`) cannot be inspected
 * and is not flagged; object literals and `<identifier>.status =` assignments are.
 */

const REPO_ROOT = path.resolve(__dirname, '..')
const SCAN_DIRS = ['app', 'lib']
const CODE_EXT = new Set(['.ts', '.tsx'])
const SCAN_FLOOR = 150

const SERVICE_FILE = 'lib/booking-status-service.ts'
const RPC_NAME = 'advance_booking_status'

interface AllowlistEntry {
  path: string
  reason: string
}

// Each entry is a legacy SYSTEM writer that must stay a direct, unconditional or self-guarded
// write. Routing it through the strict compare-and-set service would change its behaviour (the
// service refuses transitions that VALID_TRANSITIONS forbids, e.g. completed -> cancelled).
export const STATUS_WRITER_ALLOWLIST: AllowlistEntry[] = [
  {
    path: 'app/api/webhooks/stripe/route.ts',
    reason:
      'Stripe webhook (W5/W6): payment confirmation unpaid -> confirmed and refund-driven cancels must stay unconditional, including completed -> cancelled that VALID_TRANSITIONS forbids; the trigger logs them as system',
  },
  {
    path: 'app/api/gnet/farmin/route.ts',
    reason:
      'GNet farm-in partner-originated cancel (W7): must not echo a CANCEL push back to GNet, which the status service would do for gnet bookings; the trigger logs it as system',
  },
  {
    path: 'app/api/admin/bookings/[id]/payment-link/route.ts',
    reason:
      'payment-link route (W8): documented direct move to unpaid together with the new link, a transition VALID_TRANSITIONS deliberately forbids for manual changes; guarded by payment_link_url IS NULL',
  },
  {
    path: 'lib/supabase.ts',
    reason:
      'payment reconcilers (W9): unpaid -> confirmed updates guarded by .eq(status, unpaid) and the booking row builder; self-guarded system writers called by the Stripe webhook, logged by the trigger as system',
  },
]

function listCodeFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...listCodeFiles(full))
    else if (CODE_EXT.has(path.extname(entry.name))) out.push(full)
  }
  return out
}

function scanFiles(): string[] {
  const files: string[] = []
  for (const d of SCAN_DIRS) files.push(...listCodeFiles(path.join(REPO_ROOT, d)))
  return files
}

function rel(file: string): string {
  return path.relative(REPO_ROOT, file).split(path.sep).join('/')
}

/** Returns the text between the parenthesis at `open` and its match (exclusive), or null. */
function balancedArgs(src: string, open: number): string | null {
  let depth = 0
  let quote: string | null = null
  for (let i = open; i < src.length; i++) {
    const ch = src[i]
    if (quote) {
      if (ch === '\\') i++
      else if (ch === quote) quote = null
      continue
    }
    if (ch === "'" || ch === '"' || ch === '`') quote = ch
    else if (ch === '(' || ch === '{' || ch === '[') depth++
    else if (ch === ')' || ch === '}' || ch === ']') {
      depth--
      if (depth === 0) return src.slice(open + 1, i)
    }
  }
  return null
}

// A status key inside an object literal: `{ status: ... }`, `{ a: 1, status }`, `{ 'status': ... }`.
const STATUS_KEY_RE = /[{,]\s*['"]?status['"]?\s*(?::|,|\})/

function carriesStatusKey(objectText: string): boolean {
  return STATUS_KEY_RE.test(objectText)
}

function identifierWritesStatus(src: string, ident: string): boolean {
  const escaped = ident.replace(/[$]/g, '\\$')
  if (new RegExp(`\\b${escaped}\\.status\\s*=(?!=)`).test(src)) return true
  if (new RegExp(`\\b${escaped}\\[\\s*['"]status['"]\\s*\\]\\s*=(?!=)`).test(src)) return true
  const decl = new RegExp(`\\b(?:const|let|var)\\s+${escaped}\\b[^=\\n]*=\\s*(\\{)`).exec(src)
  if (decl) {
    const bracePos = decl.index + decl[0].length - 1
    const literal = balancedArgs(src, bracePos)
    if (literal !== null && carriesStatusKey('{' + literal + '}')) return true
  }
  return false
}

/**
 * Finds direct bookings.status writes in one source text: for each `.from('bookings')` take the
 * chained text up to the next table query, and flag an `.update(` / `.upsert(` whose argument is
 * an object literal with a status key, or an identifier assigned a status.
 */
export function findDirectStatusWrites(src: string): string[] {
  const hits: string[] = []
  const fromBookings = /\.from\(\s*(['"`])bookings\1\s*\)/g
  let m: RegExpExecArray | null
  while ((m = fromBookings.exec(src)) !== null) {
    const chainStart = m.index + m[0].length
    const nextFrom = src.indexOf('.from(', chainStart)
    const chain = src.slice(chainStart, nextFrom === -1 ? src.length : nextFrom)

    const writeCall = /\.(update|upsert)\(/g
    let w: RegExpExecArray | null
    while ((w = writeCall.exec(chain)) !== null) {
      const open = w.index + w[0].length - 1
      const arg = balancedArgs(chain, open)
      if (arg === null) continue
      const trimmed = arg.trim()
      if (trimmed.startsWith('{')) {
        if (carriesStatusKey(trimmed)) hits.push(`${w[1]}(${trimmed.slice(0, 60)})`)
      } else if (/^[A-Za-z_$][\w$]*$/.test(trimmed)) {
        if (identifierWritesStatus(src, trimmed)) hits.push(`${w[1]}(${trimmed}) carries a status`)
      }
    }
  }
  return hits
}

describe('findDirectStatusWrites (scanner self-tests)', () => {
  it('detects a bookings update with a status key', () => {
    const src = `await supabase.from('bookings').update({ status: 'cancelled' }).eq('id', id)`
    expect(findDirectStatusWrites(src)).toHaveLength(1)
  })

  it('detects status among other keys, shorthand and quoted keys', () => {
    expect(
      findDirectStatusWrites(`supabase.from("bookings").update({ paid_at: now, status: 'confirmed' })`),
    ).toHaveLength(1)
    expect(findDirectStatusWrites(`s.from('bookings').update({ foo, status })`)).toHaveLength(1)
    expect(findDirectStatusWrites(`s.from('bookings').update({ 'status': 'x' })`)).toHaveLength(1)
  })

  it('does not flag a trip-field update without a status key', () => {
    const src = `await s.from('bookings').update({ pickup_time: '10:00', flight_number: 'OK1' }).eq('id', id)`
    expect(findDirectStatusWrites(src)).toHaveLength(0)
  })

  it('does not flag a status filter or a value named like a status', () => {
    expect(findDirectStatusWrites(`s.from('bookings').update({ note: 'x' }).eq('status', 'unpaid')`)).toHaveLength(0)
    expect(findDirectStatusWrites(`s.from('bookings').update({ label: status })`)).toHaveLength(0)
    expect(findDirectStatusWrites(`s.from('bookings').update({ payment_status: 'x' })`)).toHaveLength(0)
  })

  it('does not flag a select or a status read', () => {
    expect(findDirectStatusWrites(`s.from('bookings').select('id, status').eq('status', 'unpaid')`)).toHaveLength(0)
  })

  it('does not flag other tables, even with a status key', () => {
    const src = `s.from('driver_assignments').update({ status: action }).eq('id', id)`
    expect(findDirectStatusWrites(src)).toHaveLength(0)
  })

  it('ends the chain at the next table query', () => {
    const src = `
      const a = await s.from('bookings').select('*').eq('id', id).single()
      const b = await s.from('gnet_bookings').update({ status: 'x' }).eq('id', id)
    `
    expect(findDirectStatusWrites(src)).toHaveLength(0)
  })

  it('detects an identifier payload assigned .status later', () => {
    const src = `
      const payload: Record<string, unknown> = {}
      payload.status = next
      await s.from('bookings').update(payload).eq('id', id)
    `
    expect(findDirectStatusWrites(src)).toHaveLength(1)
  })

  it('detects an identifier payload declared with a status key', () => {
    const src = `
      const payload = { status: 'cancelled', note: 'x' }
      await s.from('bookings').update(payload).eq('id', id)
    `
    expect(findDirectStatusWrites(src)).toHaveLength(1)
  })

  it('does not flag an identifier payload without a status', () => {
    const src = `
      const payload: Record<string, unknown> = {}
      payload.pickup_time = t
      await s.from('bookings').update(payload).eq('id', id)
    `
    expect(findDirectStatusWrites(src)).toHaveLength(0)
  })
})

describe('direct bookings.status writer gate (PAYF-02)', () => {
  const files = scanFiles()

  it('scans a real tree (guards against a silently empty scan)', () => {
    expect(files.length).toBeGreaterThan(SCAN_FLOOR)
  })

  it('only the allowlisted legacy writers write bookings.status directly', () => {
    const offenders: Record<string, string[]> = {}
    for (const file of files) {
      const hits = findDirectStatusWrites(fs.readFileSync(file, 'utf8'))
      if (hits.length > 0) offenders[rel(file)] = hits
    }
    const allowed = new Set(STATUS_WRITER_ALLOWLIST.map(e => e.path))
    const unexpected = Object.keys(offenders).filter(f => !allowed.has(f))
    expect(
      unexpected,
      `Direct bookings.status writers outside the allowlist. Route the write through ` +
        `advanceBookingStatus (lib/booking-status-service.ts), or add a reasoned entry:\n` +
        unexpected.map(f => `  ${f}: ${offenders[f].join(' | ')}`).join('\n'),
    ).toEqual([])
  })

  it('no allowlist entry is stale: each allowlisted file still writes status directly', () => {
    for (const entry of STATUS_WRITER_ALLOWLIST) {
      const full = path.join(REPO_ROOT, entry.path)
      expect(fs.existsSync(full), `${entry.path} must exist`).toBe(true)
      const hits = findDirectStatusWrites(fs.readFileSync(full, 'utf8'))
      expect(hits.length, `${entry.path} no longer writes status directly: remove it from the allowlist`).toBeGreaterThan(0)
    }
  })

  it('every allowlist entry names the writer with a reason of at least 20 characters', () => {
    for (const entry of STATUS_WRITER_ALLOWLIST) {
      expect(entry.reason.trim().length, `${entry.path} reason too short`).toBeGreaterThanOrEqual(20)
    }
    expect(new Set(STATUS_WRITER_ALLOWLIST.map(e => e.path)).size).toBe(STATUS_WRITER_ALLOWLIST.length)
  })

  it('the status service itself writes no bookings status directly', () => {
    const src = fs.readFileSync(path.join(REPO_ROOT, SERVICE_FILE), 'utf8')
    expect(findDirectStatusWrites(src)).toEqual([])
  })

  it(`the ${RPC_NAME} RPC is called only from ${SERVICE_FILE}`, () => {
    const rpcCall = new RegExp(`\\.rpc\\(\\s*['"\`]${RPC_NAME}['"\`]`)
    const callers = files.filter(f => rpcCall.test(fs.readFileSync(f, 'utf8'))).map(rel)
    expect(callers).toEqual([SERVICE_FILE])
  })
})
