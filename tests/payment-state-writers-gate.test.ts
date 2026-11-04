// @vitest-environment node
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

/**
 * Phase 88 (PAYF-01, D-05, D-09a, plan 88-01) - payment_state single-writer gate.
 *
 * lib/payments/state.ts is the only module that calls the three payment RPCs of migration 085
 * (apply_payment_transition, append_payment_event, claim_due_payment_work) and the only file that
 * writes a payment_state key. This source-reading gate fails when any other file under app/ or lib/
 * names one of the RPCs, or builds a bookings update / upsert / insert payload that carries a
 * payment_state key. Second rule (D-09a): the hold / settle / recovery / tick modules under
 * lib/payments/ and everything under lib/stripe-webhook/ never read card_flow_mode or
 * getPaymentSettings, so the canary gate lives at the client-facing edge only and can not strand a
 * booking that already holds a card.
 *
 * Known limit: a payload built by a function call (`.update(buildPayload())`) cannot be inspected
 * and is not flagged; object literals and `<identifier>.payment_state =` assignments are.
 */

const REPO_ROOT = path.resolve(__dirname, '..')
const SCAN_DIRS = ['app', 'lib']
const CODE_EXT = new Set(['.ts', '.tsx'])
const SCAN_FLOOR = 150

const STATE_FILE = 'lib/payments/state.ts'
const RPC_NAMES = ['apply_payment_transition', 'append_payment_event', 'claim_due_payment_work'] as const

function listCodeFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return []
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

/** Returns the text between the bracket at `open` and its match (exclusive), or null. */
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

// A payment_state key inside an object literal: `{ payment_state: ... }`, `{ a: 1, payment_state }`.
const STATE_KEY_RE = /[{,]\s*['"]?payment_state['"]?\s*(?::|,|\})/

function carriesStateKey(objectText: string): boolean {
  return STATE_KEY_RE.test(objectText)
}

function identifierWritesState(src: string, ident: string): boolean {
  const escaped = ident.replace(/[$]/g, '\\$')
  if (new RegExp(`\\b${escaped}\\.payment_state\\s*=(?!=)`).test(src)) return true
  if (new RegExp(`\\b${escaped}\\[\\s*['"]payment_state['"]\\s*\\]\\s*=(?!=)`).test(src)) return true
  const decl = new RegExp(`\\b(?:const|let|var)\\s+${escaped}\\b[^=\\n]*=\\s*(\\{)`).exec(src)
  if (decl) {
    const bracePos = decl.index + decl[0].length - 1
    const literal = balancedArgs(src, bracePos)
    if (literal !== null && carriesStateKey('{' + literal + '}')) return true
  }
  return false
}

/**
 * Finds direct bookings.payment_state writes in one source text: for each `.from('bookings')` take
 * the chained text up to the next table query, and flag an `.update(` / `.upsert(` / `.insert(`
 * whose argument is an object literal (or an array of them) with a payment_state key, or an
 * identifier assigned a payment_state.
 */
export function findDirectPaymentStateWrites(src: string): string[] {
  const hits: string[] = []
  const fromBookings = /\.from\(\s*(['"`])bookings\1\s*\)/g
  let m: RegExpExecArray | null
  while ((m = fromBookings.exec(src)) !== null) {
    const chainStart = m.index + m[0].length
    const nextFrom = src.indexOf('.from(', chainStart)
    const chain = src.slice(chainStart, nextFrom === -1 ? src.length : nextFrom)

    const writeCall = /\.(update|upsert|insert)\(/g
    let w: RegExpExecArray | null
    while ((w = writeCall.exec(chain)) !== null) {
      const open = w.index + w[0].length - 1
      const arg = balancedArgs(chain, open)
      if (arg === null) continue
      const trimmed = arg.trim()
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        if (carriesStateKey(trimmed)) hits.push(`${w[1]}(${trimmed.slice(0, 60)})`)
      } else if (/^[A-Za-z_$][\w$]*$/.test(trimmed)) {
        if (identifierWritesState(src, trimmed)) hits.push(`${w[1]}(${trimmed}) carries a payment_state`)
      }
    }
  }
  return hits
}

const D09A_NEEDLE = /\b(card_flow_mode|getPaymentSettings)\b/

/** D-09a scope: tick / hold / settle / recovery modules under lib/payments/ and lib/stripe-webhook/. */
export function inD09aScope(relPath: string): boolean {
  if (relPath.startsWith('lib/stripe-webhook/')) return true
  if (!relPath.startsWith('lib/payments/')) return false
  const base = path.posix.basename(relPath).replace(/\.[^.]+$/, '')
  return /(^|[-_.])(tick|hold|settle|recovery)([-_.]|$)/.test(base)
}

describe('findDirectPaymentStateWrites (scanner self-tests)', () => {
  it('detects a bookings update with a payment_state key', () => {
    const src = `await supabase.from('bookings').update({ payment_state: 'failed' }).eq('id', id)`
    expect(findDirectPaymentStateWrites(src)).toHaveLength(1)
  })

  it('detects a payment_state key outside lib/payments/state.ts in a scratch source', () => {
    const src = `
      const res = await createSupabaseServiceClient()
        .from("bookings")
        .update({ captured_at: now, payment_state: 'captured' })
        .eq('id', bookingId)
    `
    expect(findDirectPaymentStateWrites(src)).toHaveLength(1)
  })

  it('detects shorthand, quoted keys, upsert and insert', () => {
    expect(findDirectPaymentStateWrites(`s.from('bookings').update({ foo, payment_state })`)).toHaveLength(1)
    expect(findDirectPaymentStateWrites(`s.from('bookings').update({ 'payment_state': 'x' })`)).toHaveLength(1)
    expect(findDirectPaymentStateWrites(`s.from('bookings').upsert({ id, payment_state: 'x' })`)).toHaveLength(1)
    expect(findDirectPaymentStateWrites(`s.from('bookings').insert([{ payment_state: 'none' }])`)).toHaveLength(1)
  })

  it('detects an identifier payload assigned or declared with a payment_state', () => {
    const assigned = `
      const payload: Record<string, unknown> = {}
      payload.payment_state = next
      await s.from('bookings').update(payload).eq('id', id)
    `
    const declared = `
      const payload = { payment_state: 'released', note: 'x' }
      await s.from('bookings').update(payload).eq('id', id)
    `
    expect(findDirectPaymentStateWrites(assigned)).toHaveLength(1)
    expect(findDirectPaymentStateWrites(declared)).toHaveLength(1)
  })

  it('does not flag a filter, a read, a similarly named key or another table', () => {
    expect(findDirectPaymentStateWrites(`s.from('bookings').update({ note: 'x' }).eq('payment_state', 'captured')`)).toHaveLength(0)
    expect(findDirectPaymentStateWrites(`s.from('bookings').select('id, payment_state').eq('payment_state', 'failed')`)).toHaveLength(0)
    expect(findDirectPaymentStateWrites(`s.from('bookings').update({ payment_state_note: 'x' })`)).toHaveLength(0)
    expect(findDirectPaymentStateWrites(`s.from('booking_payment_events').insert({ payment_state: 'x' })`)).toHaveLength(0)
  })

  it('ends the chain at the next table query', () => {
    const src = `
      const a = await s.from('bookings').select('*').eq('id', id).single()
      const b = await s.from('other').update({ payment_state: 'x' }).eq('id', id)
    `
    expect(findDirectPaymentStateWrites(src)).toHaveLength(0)
  })
})

describe('inD09aScope (scanner self-tests)', () => {
  it('covers tick / hold / settle / recovery modules and the webhook directory', () => {
    expect(inD09aScope('lib/payments/tick.ts')).toBe(true)
    expect(inD09aScope('lib/payments/hold.ts')).toBe(true)
    expect(inD09aScope('lib/payments/settle.ts')).toBe(true)
    expect(inD09aScope('lib/payments/recovery.ts')).toBe(true)
    expect(inD09aScope('lib/stripe-webhook/card-events.ts')).toBe(true)
  })

  it('leaves the client-facing edge and the state module out of scope', () => {
    expect(inD09aScope('lib/payments/state.ts')).toBe(false)
    expect(inD09aScope('lib/payments/config.ts')).toBe(false)
    expect(inD09aScope('lib/payments/checkout.ts')).toBe(false)
    expect(inD09aScope('app/api/card-checkout/intent/route.ts')).toBe(false)
  })

  it('the D-09a needle matches both names and nothing similar', () => {
    expect(D09A_NEEDLE.test('const m = settings.card_flow_mode')).toBe(true)
    expect(D09A_NEEDLE.test('await getPaymentSettings()')).toBe(true)
    expect(D09A_NEEDLE.test('card_flow_canary_emails')).toBe(false)
  })
})

describe('payment_state single-writer gate (PAYF-01, D-05)', () => {
  const files = scanFiles()

  it('scans a real tree (guards against a silently empty scan)', () => {
    expect(files.length).toBeGreaterThan(SCAN_FLOOR)
  })

  it('the state module exists', () => {
    expect(fs.existsSync(path.join(REPO_ROOT, STATE_FILE))).toBe(true)
  })

  it('no file writes a bookings payment_state key directly, the state module included', () => {
    const offenders: Record<string, string[]> = {}
    for (const file of files) {
      const hits = findDirectPaymentStateWrites(fs.readFileSync(file, 'utf8'))
      if (hits.length > 0) offenders[rel(file)] = hits
    }
    expect(
      offenders,
      `Direct bookings.payment_state writers. Route the write through applyTransition ` +
        `(${STATE_FILE}):\n` +
        Object.entries(offenders)
          .map(([f, h]) => `  ${f}: ${h.join(' | ')}`)
          .join('\n'),
    ).toEqual({})
  })

  for (const rpc of RPC_NAMES) {
    it(`the ${rpc} RPC is named as a string literal only in ${STATE_FILE}`, () => {
      const literal = new RegExp(`['"\`]${rpc}['"\`]`)
      const callers = files.filter((f) => literal.test(fs.readFileSync(f, 'utf8'))).map(rel)
      expect(callers).toEqual([STATE_FILE])
    })

    it(`no file other than ${STATE_FILE} mentions ${rpc} in any form`, () => {
      const mentions = files.filter((f) => fs.readFileSync(f, 'utf8').includes(rpc)).map(rel)
      expect(mentions).toEqual([STATE_FILE])
    })
  }

  it('calls each RPC through .rpc( in the state module', () => {
    const src = fs.readFileSync(path.join(REPO_ROOT, STATE_FILE), 'utf8')
    for (const rpc of RPC_NAMES) {
      expect(src, `${rpc} must be called with rpc('${rpc}'`).toMatch(new RegExp(`\\.rpc\\(\\s*['"\`]${rpc}['"\`]`))
    }
  })
})

describe('D-09a: hold / settle / recovery / webhook code never reads the canary gate', () => {
  const scoped = scanFiles().map(rel).filter(inD09aScope)

  it('no in-scope file references card_flow_mode or getPaymentSettings', () => {
    const offenders = scoped.filter((f) => D09A_NEEDLE.test(fs.readFileSync(path.join(REPO_ROOT, f), 'utf8')))
    expect(
      offenders,
      `D-09a: a booking that already holds a card must not be gated by the client-facing canary mode:\n` +
        offenders.map((f) => `  ${f}`).join('\n'),
    ).toEqual([])
  })

  it('the scope list is computed from files that exist (it may be empty before the engine lands)', () => {
    for (const f of scoped) expect(fs.existsSync(path.join(REPO_ROOT, f))).toBe(true)
  })
})
