// @vitest-environment node
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

/**
 * Phase 94 (D-04, D-01, D-11, DCAB-05, DCAB-13, plan 94-14) - cabinet security source gates.
 *
 * - every cabinet page except /driver/login re-checks the session per request (requireDriver) and is dynamic
 * - every cabinet API route caps the body; every one except request-code, verify and sign-out checks the session
 * - sign-in endpoints are fail-closed rate limited
 * - the cabinet never writes the bookings table (D-01) and never shows or selects money / client data (D-11)
 * - middleware.ts keeps the cabinet API under CSRF protection with a strict Origin
 *
 * They guard against regressions from later edits; the behaviour tests of the earlier plans stay authoritative.
 */

const REPO_ROOT = path.resolve(__dirname, '..')
const CODE_EXT = new Set(['.ts', '.tsx'])

const CABINET_ROOTS = [
  'lib/driver-cabinet',
  'app/api/driver/cabinet',
  'app/(internal)/driver/(cabinet)',
  'components/driver',
]
// lib/driver-offer.ts (the offer accept / decline core the cabinet reuses) is held to the same write and money rules.
const WRITE_AND_MONEY_ROOTS = [...CABINET_ROOTS, 'lib/driver-offer.ts']

const PAGES_ROOT = 'app/(internal)/driver/(cabinet)'
const ROUTES_ROOT = 'app/api/driver/cabinet'
const PUBLIC_PAGE = 'app/(internal)/driver/(cabinet)/login/page.tsx'
const NO_SESSION_ROUTES = ['request-code', 'verify', 'sign-out']
const FAIL_CLOSED_ROUTES = ['request-code', 'verify']

// The scan cannot silently shrink: a moved file fails here instead of dropping out of the gate.
const SCOPE_FLOOR_PAGES = [
  'app/(internal)/driver/(cabinet)/(tabs)/rides/page.tsx',
  'app/(internal)/driver/(cabinet)/(tabs)/offers/page.tsx',
  'app/(internal)/driver/(cabinet)/(tabs)/you/page.tsx',
  'app/(internal)/driver/(cabinet)/rides/[assignmentId]/page.tsx',
  PUBLIC_PAGE,
]
const SCOPE_FLOOR_ROUTES = [
  'app/api/driver/cabinet/request-code/route.ts',
  'app/api/driver/cabinet/verify/route.ts',
  'app/api/driver/cabinet/offers/[assignmentId]/respond/route.ts',
  'app/api/driver/cabinet/push/route.ts',
  'app/api/driver/cabinet/help/route.ts',
  'app/api/driver/cabinet/sign-out/route.ts',
]
const SCOPE_FLOOR_LIB = [
  'lib/driver-cabinet/auth.ts',
  'lib/driver-cabinet/rides.ts',
  'lib/driver-cabinet/offers.ts',
]

// Client fare, payment, client contact and deposit columns a cabinet select must never name (D-11).
const FORBIDDEN_SELECT_COLUMNS = ['amount_', 'payment_', 'client_email', 'client_phone', 'client_last_name', 'deposit']

function rel(file: string): string {
  return path.relative(REPO_ROOT, file).split(path.sep).join('/')
}

function walk(target: string): string[] {
  const abs = path.join(REPO_ROOT, target)
  if (!fs.existsSync(abs)) return []
  const stat = fs.statSync(abs)
  if (stat.isFile()) return CODE_EXT.has(path.extname(abs)) ? [abs] : []
  const out: string[] = []
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
    out.push(...walk(path.posix.join(target, entry.name)))
  }
  return out
}

function filesUnder(roots: string[]): string[] {
  return roots.flatMap(walk)
}

function read(file: string): string {
  return fs.readFileSync(file, 'utf8')
}

const pages = walk(PAGES_ROOT).filter(f => path.basename(f) === 'page.tsx')
const routes = walk(ROUTES_ROOT).filter(f => path.basename(f) === 'route.ts')
const libFiles = walk('lib/driver-cabinet')

function routeSegment(file: string): string {
  // app/api/driver/cabinet/<segment>/... -> first segment after the cabinet root
  return rel(file).slice(`${ROUTES_ROOT}/`.length).split('/')[0]
}

describe('driver cabinet scope floor', () => {
  it('finds every page, route and lib file this phase created', () => {
    const seen = new Set([...pages, ...routes, ...libFiles].map(rel))
    const missing = [...SCOPE_FLOOR_PAGES, ...SCOPE_FLOOR_ROUTES, ...SCOPE_FLOOR_LIB].filter(f => !seen.has(f))
    expect(missing, `phase files missing from the scan: ${missing.join(', ')}`).toEqual([])
  })
})

describe('cabinet pages (D-04, Pitfall 4)', () => {
  it('every page except /driver/login calls requireDriver( and exports dynamic = force-dynamic', () => {
    const gated = pages.filter(f => rel(f) !== PUBLIC_PAGE)
    expect(gated.length).toBeGreaterThanOrEqual(4)
    const noGuard = gated.filter(f => !read(f).includes('requireDriver(')).map(rel)
    const notDynamic = gated.filter(f => !/export const dynamic\s*=\s*['"]force-dynamic['"]/.test(read(f))).map(rel)
    expect(noGuard, 'pages without requireDriver(').toEqual([])
    expect(notDynamic, 'pages without force-dynamic').toEqual([])
  })

  it('the public login page is dynamic too (no cached sign-in state)', () => {
    const login = read(path.join(REPO_ROOT, PUBLIC_PAGE))
    expect(login).toMatch(/export const dynamic\s*=\s*['"]force-dynamic['"]/)
  })
})

describe('cabinet API routes (D-04, DCAB-05)', () => {
  it('every route caps the request body with enforceMaxBody(', () => {
    expect(routes.length).toBeGreaterThanOrEqual(6)
    const offenders = routes.filter(f => !read(f).includes('enforceMaxBody(')).map(rel)
    expect(offenders).toEqual([])
  })

  it('every route except request-code, verify and sign-out calls getDriverSession(', () => {
    const gated = routes.filter(f => !NO_SESSION_ROUTES.includes(routeSegment(f)))
    expect(gated.length).toBeGreaterThanOrEqual(3)
    const offenders = gated.filter(f => !read(f).includes('getDriverSession(')).map(rel)
    expect(offenders).toEqual([])
  })

  it('request-code and verify rate limit with failClosed: true', () => {
    const limited = routes.filter(f => FAIL_CLOSED_ROUTES.includes(routeSegment(f)))
    expect(limited.map(routeSegment).sort()).toEqual([...FAIL_CLOSED_ROUTES].sort())
    const offenders = limited.filter(f => !/failClosed:\s*true/.test(read(f))).map(rel)
    expect(offenders).toEqual([])
  })
})

describe('middleware CSRF coverage (DCAB-13)', () => {
  const middleware = read(path.join(REPO_ROOT, 'middleware.ts'))

  function listBody(name: string): string {
    const m = middleware.match(new RegExp(`const ${name}\\s*=\\s*\\[([\\s\\S]*?)\\n\\]`))
    expect(m, `${name} not found in middleware.ts`).not.toBeNull()
    return m![1]
  }

  it("lists '/api/driver/cabinet' in CSRF_PROTECTED_PREFIXES", () => {
    expect(listBody('CSRF_PROTECTED_PREFIXES')).toContain("'/api/driver/cabinet'")
  })

  it("lists '/api/driver/cabinet' in CSRF_STRICT_ORIGIN_REQUIRED", () => {
    expect(listBody('CSRF_STRICT_ORIGIN_REQUIRED')).toContain("'/api/driver/cabinet'")
  })
})

describe('bookings are never written by the cabinet (D-01)', () => {
  /** Text of the statement that follows each from('bookings'): up to the next blank line, semicolon or from(. */
  function bookingStatements(src: string): string[] {
    const out: string[] = []
    const re = /from\(\s*['"`]bookings['"`]\s*\)/g
    let m: RegExpExecArray | null
    while ((m = re.exec(src)) !== null) {
      const rest = src.slice(m.index + m[0].length)
      const end = rest.search(/\n\s*\n|;|\bfrom\(/)
      out.push(end === -1 ? rest : rest.slice(0, end))
    }
    return out
  }

  it('no file writes the bookings table', () => {
    const files = filesUnder(WRITE_AND_MONEY_ROOTS)
    expect(files.length).toBeGreaterThan(30)
    const offenders: string[] = []
    for (const file of files) {
      const stmts = bookingStatements(read(file))
      if (stmts.some(s => /\.\s*(update|insert|upsert|delete)\s*\(/.test(s))) offenders.push(rel(file))
    }
    expect(offenders).toEqual([])
  })

  it('no file reaches the status service or the status RPC', () => {
    const offenders = filesUnder(WRITE_AND_MONEY_ROOTS)
      .filter(f => /booking-status-service|advance_booking_status/.test(read(f)))
      .map(rel)
    expect(offenders).toEqual([])
  })

  it('the detector sees a write (self-test)', () => {
    const sample = "const x = await supabase\n  .from('bookings')\n  .update({ status: 'x' })\n  .eq('id', 1)\n"
    expect(bookingStatements(sample).some(s => /\.\s*(update|insert|upsert|delete)\s*\(/.test(s))).toBe(true)
  })
})

describe('no money or client data in the cabinet (D-11)', () => {
  it('no file contains a euro sign, formatEUR or czkToEur', () => {
    const offenders = filesUnder(WRITE_AND_MONEY_ROOTS)
      .filter(f => /€|formatEUR|czkToEur/.test(read(f)))
      .map(rel)
    expect(offenders).toEqual([])
  })

  it('no select string in lib/driver-cabinet names a fare, payment, client contact or deposit column', () => {
    const selects: Array<{ file: string; text: string }> = []
    for (const file of libFiles) {
      const src = read(file)
      // `.select('...')` literals and `<NAME>_SELECT = '...'` constants
      for (const m of src.matchAll(/\.select\(\s*(['"`])([\s\S]*?)\1/g)) selects.push({ file: rel(file), text: m[2] })
      for (const m of src.matchAll(/\b[A-Z_]*SELECT\s*=\s*(['"`])([\s\S]*?)\1/g)) selects.push({ file: rel(file), text: m[2] })
    }
    // teeth: the three booking-bearing selects of the phase are found
    expect(selects.filter(s => s.text.includes('bookings!inner(')).length).toBeGreaterThanOrEqual(3)
    const offenders = selects
      .filter(s => FORBIDDEN_SELECT_COLUMNS.some(col => s.text.includes(col)))
      .map(s => `${s.file}: ${s.text}`)
    expect(offenders).toEqual([])
  })

  it('no file uses dangerouslySetInnerHTML', () => {
    const offenders = filesUnder(WRITE_AND_MONEY_ROOTS)
      .filter(f => read(f).includes('dangerouslySetInnerHTML'))
      .map(rel)
    expect(offenders).toEqual([])
  })
})
