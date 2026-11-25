// @vitest-environment node
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

/**
 * Phase 94 (D-07, DCAB-04, plan 94-14) - driver identity isolation gate.
 *
 * The driver cabinet has its own session (the prestigo_driver_session cookie + driver_sessions table). It never
 * touches Supabase Auth, and nothing else in the app (customer account, admin, middleware, lib/supabase) ever reads
 * the driver cookie. These source gates fail when a later edit mixes the identities. They do not replace the
 * behaviour tests of the earlier plans.
 */

const REPO_ROOT = path.resolve(__dirname, '..')
const CODE_EXT = new Set(['.ts', '.tsx'])
const COOKIE_NAME = 'prestigo_driver_session'
const COOKIE_CONST = 'DRIVER_SESSION_COOKIE'
const AUTH_FILE = 'lib/driver-cabinet/auth.ts'

const CABINET_ROOTS = [
  'lib/driver-cabinet',
  'app/api/driver/cabinet',
  'app/(internal)/driver/(cabinet)',
  'components/driver',
]

// The cookie must never be readable from these (D-07): Supabase helpers, customer account, admin app, middleware.
const FOREIGN_PATHS = ['lib/supabase', 'lib/supabase.ts', 'app/[locale]/account', 'app/(internal)/admin', 'middleware.ts']

// Whole-app scan of the literal cookie name.
const APP_SCAN_ROOTS = ['app', 'lib', 'components', 'middleware.ts']

// The scan cannot silently shrink: a moved or renamed phase file fails here instead of dropping out of the gate.
const SCOPE_FLOOR = [
  'lib/driver-cabinet/auth.ts',
  'lib/driver-cabinet/rides.ts',
  'lib/driver-cabinet/offers.ts',
  'app/(internal)/driver/(cabinet)/(tabs)/rides/page.tsx',
  'app/(internal)/driver/(cabinet)/(tabs)/offers/page.tsx',
  'app/(internal)/driver/(cabinet)/(tabs)/you/page.tsx',
  'app/(internal)/driver/(cabinet)/login/page.tsx',
  'app/api/driver/cabinet/request-code/route.ts',
  'app/api/driver/cabinet/verify/route.ts',
  'app/api/driver/cabinet/offers/[assignmentId]/respond/route.ts',
  'app/api/driver/cabinet/push/route.ts',
  'app/api/driver/cabinet/help/route.ts',
  'app/api/driver/cabinet/sign-out/route.ts',
]

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

const cabinetFiles = filesUnder(CABINET_ROOTS)

describe('driver cabinet identity isolation (D-07, DCAB-04)', () => {
  it('scope floor: the scan sees every file this phase created', () => {
    const seen = new Set(cabinetFiles.map(rel))
    const missing = SCOPE_FLOOR.filter(f => !seen.has(f))
    expect(missing, `phase files missing from the scan: ${missing.join(', ')}`).toEqual([])
    expect(cabinetFiles.length).toBeGreaterThanOrEqual(30)
  })

  it('no cabinet file imports the Supabase-Auth cookie helpers', () => {
    const offenders: string[] = []
    for (const file of cabinetFiles) {
      const src = fs.readFileSync(file, 'utf8')
      const importsFrom = [...src.matchAll(/(?:import|export)[^;]*?from\s*['"]([^'"]+)['"]/g)].map(m => m[1])
      const bad = importsFrom.filter(
        spec =>
          spec === '@/lib/supabase/server' ||
          spec === '@/lib/supabase/browser' ||
          spec === '@/lib/supabase/middleware' ||
          spec.startsWith('@supabase/ssr') ||
          spec.startsWith('@supabase/auth')
      )
      if (bad.length > 0) offenders.push(`${rel(file)}: ${bad.join(', ')}`)
    }
    expect(offenders).toEqual([])
  })

  it('no cabinet file calls Supabase Auth', () => {
    const authCall = /auth\s*\.\s*(signInWithOtp|verifyOtp|signInWithPassword|signInWithOAuth|admin|signUp|getUser|getSession|signOut)\b|\bsignUp\s*\(|\bsignInWithOtp\s*\(|\bverifyOtp\s*\(/
    const offenders = cabinetFiles.filter(f => authCall.test(fs.readFileSync(f, 'utf8'))).map(rel)
    expect(offenders).toEqual([])
  })

  it('the literal driver cookie name occurs in source only inside lib/driver-cabinet/auth.ts', () => {
    const offenders: string[] = []
    for (const file of filesUnder(APP_SCAN_ROOTS)) {
      if (rel(file) === AUTH_FILE) continue
      if (fs.readFileSync(file, 'utf8').includes(COOKIE_NAME)) offenders.push(rel(file))
    }
    expect(offenders).toEqual([])
    // and the gate has teeth: the one allowed file really defines it
    const auth = fs.readFileSync(path.join(REPO_ROOT, AUTH_FILE), 'utf8')
    expect(auth).toContain(COOKIE_NAME)
  })

  it('lib/supabase, the customer account pages, the admin app and middleware.ts never read the driver cookie', () => {
    const files = filesUnder(FOREIGN_PATHS)
    expect(files.length).toBeGreaterThan(20)
    const offenders = files
      .filter(f => {
        const src = fs.readFileSync(f, 'utf8')
        return src.includes(COOKIE_CONST) || src.includes(COOKIE_NAME)
      })
      .map(rel)
    expect(offenders).toEqual([])
  })
})
