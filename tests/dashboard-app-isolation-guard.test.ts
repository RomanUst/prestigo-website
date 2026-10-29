// @vitest-environment node
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

/**
 * Phase 84, PANEL-02 — structural read-only and cookie-less barrier for the Chatwoot Dashboard App
 * path. Same layering as the Phase 83 D-17 webhook guard (tests/webhook-isolation-guard.test.ts):
 * source-reading assertions over the runtime import closure of the panel entry modules.
 *
 * Entries: the panel API route, lib/chatwoot-operator.ts, lib/panel-bookings.ts, lib/panel-dto.ts,
 * lib/panel-links.ts, and every file under app/embed/ (the iframe pages; none exist until plan
 * 84-07, and the pattern picks them up automatically). "Panel-owned" = the entries themselves.
 *
 * For every file in the closure (type-only imports are erased by the compiler and are ignored):
 *   1. no forbidden module: the cookie-session Supabase modules (lib/supabase/*), next/headers,
 *      @supabase/ssr, the site Chatwoot write client, the EspoCRM client, the Stripe payment-link
 *      module, the email modules, and the bare packages stripe and resend;
 *   2. the only symbol imported from @/lib/supabase is createSupabaseServiceClient;
 *   3. no getAdminUser (the admin-session helper) and no call to the request cookie store;
 *   4. no auth.admin;
 *   5. an rpc call may only name the literal 'panel_bookings'.
 * Panel-owned files additionally:
 *   6. contain no .from('<table>') table access (the RPC is the only database call);
 *   7. files under app/embed/ import @/lib/supabase not at all (a client is never created during
 *      render) and fetch no URL other than /api/chatwoot/dashboard-app, using no other transport.
 * And lib/chatwoot-operator.ts issues GET requests only.
 *
 * lib/supabase.ts is the module boundary: it is not traversed (rule 2 limits what may come out).
 */

const REPO_ROOT = path.resolve(__dirname, '..')
const SCAN_DIRS = ['app', 'components', 'lib', 'i18n', 'types']
const SCAN_FILES = ['middleware.ts']
const CODE_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'])
const CODE_EXT_LIST = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']

const SUPABASE_MODULE = 'lib/supabase.ts'
const ALLOWED_SUPABASE_SYMBOL = 'createSupabaseServiceClient'
const ALLOWED_RPC = 'panel_bookings'
const PANEL_API_PATH = '/api/chatwoot/dashboard-app'
const OPERATOR_CLIENT = 'lib/chatwoot-operator.ts'

const ENTRY_FILES = [
  'app/api/chatwoot/dashboard-app/route.ts',
  'lib/chatwoot-operator.ts',
  'lib/panel-bookings.ts',
  'lib/panel-dto.ts',
  'lib/panel-links.ts',
]
const ENTRY_PATTERNS = [/^app\/embed\//]
/** The floor of the guard's scope: these entry modules must always be in it, so it can never shrink silently. */
const SCOPE_FLOOR = [...ENTRY_FILES]

/** Module stems (extension and /index stripped) a panel file may never import, exact match. */
const FORBIDDEN_STEMS = new Set([
  'next/headers',
  '@supabase/ssr',
  'stripe',
  'resend',
  'lib/chatwoot-client',
  'lib/chatwoot-sync',
])
/** Module stem prefixes a panel file may never import. */
const FORBIDDEN_STEM_PREFIXES = ['lib/supabase/', 'lib/espocrm', 'lib/stripe', 'lib/email']

interface Violation {
  path: string
  why: string[]
}

// ── file walking and import resolution (helpers copied from webhook-isolation-guard) ─────────────
function listScanFiles(root: string): string[] {
  const results: string[] = []

  function walk(relDir: string) {
    const absDir = path.join(root, relDir)
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(absDir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name === '.next') continue
      const relPath = relDir ? `${relDir}/${entry.name}` : entry.name
      if (entry.isDirectory()) {
        walk(relPath)
      } else if (entry.isFile() && CODE_EXT.has(path.extname(entry.name))) {
        results.push(relPath)
      }
    }
  }

  for (const dir of SCAN_DIRS) walk(dir)
  for (const file of SCAN_FILES) {
    if (fs.existsSync(path.join(root, file))) results.push(file)
  }
  return results
}

function resolveSpecifier(spec: string, importerPath: string, fileKeys: Set<string>): string | null {
  let basePath: string
  if (spec.startsWith('@/')) {
    basePath = spec.slice(2)
  } else if (spec.startsWith('.')) {
    basePath = path.posix.normalize(path.posix.join(path.posix.dirname(importerPath), spec))
  } else {
    return null
  }

  const candidates = [basePath]
  for (const ext of CODE_EXT_LIST) candidates.push(basePath + ext)
  for (const ext of CODE_EXT_LIST) candidates.push(path.posix.join(basePath, `index${ext}`))

  for (const candidate of candidates) {
    if (fileKeys.has(candidate)) return candidate
  }
  return null
}

/** Removes // and block comments so a comment that mentions a forbidden name is not a hit. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1')
}

/** Removes `import type ... from '..'` and `export type ... from '..'` statements (erased at compile time). */
function stripTypeOnlyStatements(source: string): string {
  return source.replace(/\b(?:import|export)\s+type\b[^;'"`]*?\bfrom\s*['"][^'"]+['"]/g, '')
}

/** Runtime import specifiers: type-only statements are ignored. */
function extractRuntimeSpecifiers(content: string): string[] {
  const code = stripTypeOnlyStatements(stripComments(content))
  const specifiers = new Set<string>()
  for (const m of code.matchAll(/\bfrom\s*['"]([^'"]+)['"]/g)) specifiers.add(m[1])
  for (const m of code.matchAll(/^\s*import\s+['"]([^'"]+)['"]/gm)) specifiers.add(m[1])
  for (const m of code.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) specifiers.add(m[1])
  for (const m of code.matchAll(/\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) specifiers.add(m[1])
  return [...specifiers]
}

/**
 * The module a specifier names, without extension or /index, resolved for aliases and relative
 * paths but NOT dependent on the file existing, so a fixture can name a module it does not define.
 */
function specifierStem(spec: string, importerPath: string): string {
  let stem: string
  if (spec.startsWith('@/')) stem = spec.slice(2)
  else if (spec.startsWith('.')) stem = path.posix.normalize(path.posix.join(path.posix.dirname(importerPath), spec))
  else stem = spec
  stem = stem.replace(/\/index(\.[a-z]+)?$/, '').replace(/\.(tsx?|jsx?|mjs|cjs)$/, '')
  return stem
}

function forbiddenModuleReason(stem: string): string | null {
  // supabase.ts itself (the service-client module) is the one allowed Supabase module.
  if (FORBIDDEN_STEMS.has(stem)) return stem
  if (stem.startsWith('stripe/') || stem.startsWith('resend/')) return stem
  if (FORBIDDEN_STEM_PREFIXES.some((p) => stem.startsWith(p))) return stem
  return null
}

/** Symbols a file imports at runtime from the supabase module; '*' stands for anything unprovable. */
function supabaseSymbols(content: string, filePath: string, fileKeys: Set<string>): string[] {
  const code = stripTypeOnlyStatements(stripComments(content))
  const symbols: string[] = []
  const isSupabase = (spec: string) =>
    resolveSpecifier(spec, filePath, fileKeys) === SUPABASE_MODULE || specifierStem(spec, filePath) === 'lib/supabase'

  for (const m of code.matchAll(/\b(?:import|export)\s+([^;'"`]*?)\s*\bfrom\s*['"]([^'"]+)['"]/g)) {
    if (!isSupabase(m[2])) continue
    const clause = m[1].trim()
    const named = clause.match(/\{([\s\S]*)\}/)
    const withoutNamed = clause.replace(/\{[\s\S]*\}/, '').replace(/,/g, ' ').trim()
    if (withoutNamed !== '') symbols.push('*') // default import, namespace import or export *
    if (named) {
      for (const part of named[1].split(',')) {
        const item = part.trim()
        if (item === '' || /^type\s/.test(item)) continue
        symbols.push(item.split(/\s+as\s+/)[0].trim())
      }
    }
  }
  for (const m of code.matchAll(/^\s*import\s+['"]([^'"]+)['"]/gm)) {
    if (isSupabase(m[1])) symbols.push('*')
  }
  for (const m of code.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    if (isSupabase(m[1])) symbols.push('*')
  }
  for (const m of code.matchAll(/\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    if (isSupabase(m[1])) symbols.push('*')
  }
  return symbols
}

// ── per-rule checks ─────────────────────────────────────────────────────────────────────────────
/** rpc calls: every one must name the literal 'panel_bookings'. Returns the offending call texts. */
function rpcViolations(code: string): string[] {
  const out: string[] = []
  for (const m of code.matchAll(/\.rpc\s*\(\s*([^,)]*)/g)) {
    const arg = m[1].trim()
    const literal = arg.match(/^(['"`])([^'"`]*)\1$/)
    if (!literal) out.push(`rpc call with a non-literal name (${arg || 'empty'})`)
    else if (literal[2] !== ALLOWED_RPC) out.push(`names rpc '${literal[2]}' (only '${ALLOWED_RPC}' is allowed)`)
  }
  return out
}

/** lib/chatwoot-operator.ts: GET only. */
function operatorMethodViolations(code: string): string[] {
  const out: string[] = []
  for (const m of code.matchAll(/['"`](POST|PUT|PATCH|DELETE)['"`]/gi)) out.push(`names HTTP method '${m[1]}'`)
  // `{ method: X }` object properties and `const|let method = X` declarations must be the literal 'GET'.
  const decls = [...code.matchAll(/[{,][ \t]*method\s*:\s*([^,}\n]*)/g), ...code.matchAll(/\b(?:const|let|var)\s+method\s*=\s*([^;\n]*)/g)]
  for (const m of decls) {
    const value = m[1].trim()
    if (!/^(['"`])GET\1$/.test(value)) out.push(`method is not the literal 'GET' (${value || 'empty'})`)
  }
  if (!/['"`]GET['"`]/.test(code)) out.push("never states 'GET'")
  return out
}

/** app/embed files: the only fetch target is the panel API path, and no other transport is used. */
function embedFetchViolations(code: string): string[] {
  const out: string[] = []
  const constants = new Map<string, string>()
  for (const m of code.matchAll(/\bconst\s+(\w+)\s*(?::\s*[\w<>[\]| ]+)?=\s*(['"`])([^'"`]*)\2/g)) constants.set(m[1], m[3])
  for (const m of code.matchAll(/\bfetch\s*\(\s*([^,)]*)/g)) {
    const arg = m[1].trim()
    const literal = arg.match(/^(['"`])([^'"`]*)\1$/)
    const target = literal ? literal[2] : /^\w+$/.test(arg) ? constants.get(arg) : undefined
    if (target !== PANEL_API_PATH) out.push(`fetches ${literal ? `'${literal[2]}'` : arg || 'an unprovable target'} (only ${PANEL_API_PATH} is allowed)`)
  }
  if (/\b(XMLHttpRequest|sendBeacon|WebSocket|EventSource)\b/.test(code)) {
    out.push('uses a network transport other than fetch')
  }
  return out
}

// ── the guard ───────────────────────────────────────────────────────────────────────────────────
/** Pure function: no fs access. `files` maps repo-relative POSIX paths to source text. */
function findPanelViolations(files: Map<string, string>, entries: string[]): Violation[] {
  const fileKeys = new Set(files.keys())
  const panelOwned = new Set(entries.filter((e) => files.has(e)))
  const whyMap = new Map<string, string[]>()
  const addWhy = (filePath: string, why: string) => {
    const list = whyMap.get(filePath) ?? []
    list.push(why)
    whyMap.set(filePath, list)
  }

  // Closure, entry -> runtime imports. lib/supabase.ts is a boundary: reached but not traversed.
  const closure = new Set<string>(panelOwned)
  const importers = new Map<string, string>()
  const queue = [...panelOwned]
  while (queue.length) {
    const current = queue.shift()!
    if (current === SUPABASE_MODULE) continue
    for (const spec of extractRuntimeSpecifiers(files.get(current) ?? '')) {
      const resolved = resolveSpecifier(spec, current, fileKeys)
      if (resolved && !closure.has(resolved)) {
        closure.add(resolved)
        importers.set(resolved, current)
        queue.push(resolved)
      }
    }
  }

  for (const filePath of closure) {
    if (filePath === SUPABASE_MODULE) continue
    const content = files.get(filePath) ?? ''
    const code = stripComments(content)
    const isEmbed = filePath.startsWith('app/embed/')

    // Rule 1: forbidden modules, matched by alias-resolved stem.
    for (const spec of extractRuntimeSpecifiers(content)) {
      const bad = forbiddenModuleReason(specifierStem(spec, filePath))
      if (bad) addWhy(filePath, `imports forbidden module '${spec}'`)
    }

    // Rule 2: only createSupabaseServiceClient may come out of @/lib/supabase; embed files import nothing.
    for (const symbol of supabaseSymbols(content, filePath, fileKeys)) {
      if (isEmbed) addWhy(filePath, `imports '${symbol}' from @/lib/supabase (embed files must not import it at all)`)
      else if (symbol !== ALLOWED_SUPABASE_SYMBOL) {
        addWhy(filePath, `imports '${symbol}' from @/lib/supabase (only ${ALLOWED_SUPABASE_SYMBOL} is allowed)`)
      }
    }

    // Rule 3: no admin-session helper, no request cookie store.
    if (/\bgetAdminUser\b/.test(code)) addWhy(filePath, 'names getAdminUser (admin session helper)')
    if (/\bcookies\s*\(/.test(code)) addWhy(filePath, 'calls cookies( (request cookie store)')

    // Rule 4: no auth admin API.
    if (/\bauth\s*\.\s*admin\b/.test(code)) addWhy(filePath, 'touches auth.admin')

    // Rule 5: only the panel_bookings RPC.
    for (const why of rpcViolations(code)) addWhy(filePath, why)

    if (panelOwned.has(filePath)) {
      // Rule 6: panel-owned files make no table access.
      for (const m of code.matchAll(/\.from\(\s*['"`](\w+)['"`]\s*\)?/g)) {
        addWhy(filePath, `table access .from('${m[1]}') (the RPC is the only database call)`)
      }
    }

    // Rule 7: the operator client is GET-only; embed files fetch only the panel API.
    if (filePath === OPERATOR_CLIENT) for (const why of operatorMethodViolations(code)) addWhy(filePath, why)
    if (isEmbed) for (const why of embedFetchViolations(code)) addWhy(filePath, why)
  }

  const violations: Violation[] = []
  for (const [filePath, why] of whyMap) {
    const chain: string[] = []
    for (let at = importers.get(filePath); at; at = importers.get(at)) chain.push(at)
    violations.push({ path: filePath, why: chain.length ? [...why, `reached via ${chain.join(' <- ')}`] : why })
  }
  return violations.sort((a, b) => a.path.localeCompare(b.path))
}

function computeEntries(allFiles: string[]): string[] {
  const set = new Set(allFiles)
  const entries = new Set<string>()
  for (const f of ENTRY_FILES) if (set.has(f)) entries.add(f)
  for (const f of allFiles) if (ENTRY_PATTERNS.some((re) => re.test(f))) entries.add(f)
  return [...entries].sort()
}

/** The floor modules that are not in the computed scope (empty = the guard covers every one of them). */
function missingFromFloor(entries: readonly string[], floor: readonly string[]): string[] {
  const set = new Set(entries)
  return floor.filter((f) => !set.has(f))
}

// ── fixtures ────────────────────────────────────────────────────────────────────────────────────
const SUPABASE_STUB = `export function createSupabaseServiceClient() { return {} }\nexport async function saveBooking() {}`
const ROUTE = 'app/api/chatwoot/dashboard-app/route.ts'

/** A tree whose route is `entry`, plus any extra files. */
function fixture(entry: string, extra: Record<string, string> = {}): Map<string, string> {
  return new Map<string, string>([[SUPABASE_MODULE, SUPABASE_STUB], [ROUTE, entry], ...Object.entries(extra)])
}

function violationsOf(files: Map<string, string>, extraEntries: string[] = []) {
  return findPanelViolations(files, [ROUTE, ...extraEntries])
}

function whyOf(files: Map<string, string>, extraEntries: string[] = []): string {
  return violationsOf(files, extraEntries)
    .flatMap((v) => v.why)
    .join(' | ')
}

describe('findPanelViolations: forbidden modules', () => {
  it('a clean route passes', () => {
    const files = fixture(
      `import { createSupabaseServiceClient } from '@/lib/supabase'\nexport const x = (db: any) => db.rpc('panel_bookings', {})`,
    )
    expect(violationsOf(files)).toEqual([])
  })

  it.each([
    ['the cookie-session Supabase module', `import { createClient } from '@/lib/supabase/server'`],
    ['the Supabase middleware module', `import { updateSession } from '@/lib/supabase/middleware'`],
    ['the Supabase browser module', `import { createBrowserClient } from '@/lib/supabase/browser'`],
    ['next/headers', `import { headers } from 'next/headers'`],
    ['@supabase/ssr', `import { createServerClient } from '@supabase/ssr'`],
    ['the site Chatwoot client', `import { createChatwootClient } from '@/lib/chatwoot-client'`],
    ['the EspoCRM client', `import { espo } from '@/lib/espocrm-client'`],
    ['the Stripe payment-link module', `import { createLink } from '@/lib/stripe-payment-links'`],
    ['the email module', `import { sendEmail } from '@/lib/email'`],
    ['an email variant', `import { sendEmail } from '@/lib/email-corporate'`],
    ['the stripe package', `import Stripe from 'stripe'`],
    ['the resend package', `import { Resend } from 'resend'`],
    ['a relative path to the cookie-session module', `import { createClient } from '../../../../lib/supabase/server'`],
  ])('flags %s in the route', (_name, line) => {
    expect(whyOf(fixture(`${line}\nexport const x = 1`))).toContain('forbidden module')
  })

  it('flags a forbidden module reached through a helper, naming both files', () => {
    const files = fixture(`import { h } from '@/lib/helper'\nexport const x = h`, {
      'lib/helper.ts': `import { headers } from 'next/headers'\nexport const h = headers`,
    })
    const v = violationsOf(files)
    expect(v.map((x) => x.path)).toEqual(['lib/helper.ts'])
    expect(v[0].why.join(' ')).toContain(ROUTE)
  })

  it('import type of a forbidden module is erased and ignored', () => {
    const files = fixture(`import type { Cookies } from 'next/headers'\nexport const x = 1`)
    expect(violationsOf(files)).toEqual([])
  })

  it('a bare dynamic import() of a forbidden module is flagged', () => {
    expect(whyOf(fixture(`export const x = () => import('next/headers')`))).toContain('forbidden module')
  })
})

describe('findPanelViolations: supabase symbols, admin session, cookies', () => {
  it('flags any symbol other than createSupabaseServiceClient', () => {
    const files = fixture(`import { saveBooking } from '@/lib/supabase'\nexport const x = saveBooking`)
    expect(whyOf(files)).toContain('saveBooking')
  })

  it('flags default, namespace and mixed imports of @/lib/supabase', () => {
    for (const line of [
      `import * as db from '@/lib/supabase'`,
      `import db from '@/lib/supabase'`,
      `import { createSupabaseServiceClient, saveBooking as sb } from '@/lib/supabase'`,
    ]) {
      expect(violationsOf(fixture(line))).toHaveLength(1)
    }
  })

  it('allows createSupabaseServiceClient (also with an inline type specifier)', () => {
    for (const line of [
      `import { createSupabaseServiceClient } from '@/lib/supabase'`,
      `import { createSupabaseServiceClient, type SomeType } from '@/lib/supabase'`,
    ]) {
      expect(violationsOf(fixture(line))).toEqual([])
    }
  })

  it('flags getAdminUser', () => {
    expect(whyOf(fixture(`export const x = async () => getAdminUser()`))).toContain('getAdminUser')
  })

  it('flags a cookies( call', () => {
    expect(whyOf(fixture(`export const x = async () => (await cookies()).get('sb')`))).toContain('cookies(')
  })

  it('flags auth.admin', () => {
    expect(whyOf(fixture(`export const u = (db: any) => db.auth.admin.deleteUser('x')`))).toContain('auth.admin')
  })

  it('ignores mentions in comments', () => {
    const files = fixture(
      `// never call getAdminUser or cookies( or auth.admin\n/* import 'next/headers' rpc('erase') .from('bookings') */\nexport const x = 1`,
    )
    expect(violationsOf(files)).toEqual([])
  })

  it('does not traverse into lib/supabase.ts (its own writers are the boundary)', () => {
    const files = fixture(`import { createSupabaseServiceClient } from '@/lib/supabase'\nexport const x = createSupabaseServiceClient`)
    files.set(SUPABASE_MODULE, `${SUPABASE_STUB}\nexport const w = (db: any) => db.from('bookings').update({})`)
    expect(violationsOf(files)).toEqual([])
  })
})

describe('findPanelViolations: rpc allowlist and table access', () => {
  it('allows only panel_bookings', () => {
    expect(violationsOf(fixture(`export const r = (db: any) => db.rpc('panel_bookings', { p: 1 })`))).toEqual([])
    expect(violationsOf(fixture(`export const r = (db: any) => db.rpc("panel_bookings")`))).toEqual([])
  })

  it('flags any other rpc literal', () => {
    expect(whyOf(fixture(`export const r = (db: any) => db.rpc('erasure_anonymise_person', {})`))).toContain(
      'erasure_anonymise_person',
    )
    expect(whyOf(fixture(`export const r = (db: any) => db.rpc('chat_ingest', {})`))).toContain('chat_ingest')
  })

  it('flags an rpc whose name is not a literal (cannot prove it is panel_bookings)', () => {
    expect(whyOf(fixture(`export const r = (db: any, n: string) => db.rpc(n, {})`))).toContain('non-literal')
  })

  it('flags a rpc in a closure helper too', () => {
    const files = fixture(`import { h } from '@/lib/helper'\nexport const x = h`, {
      'lib/helper.ts': `export const h = (db: any) => db.rpc('enqueue_outbox', {})`,
    })
    expect(violationsOf(files).map((v) => v.path)).toEqual(['lib/helper.ts'])
  })

  it('flags .from(<table>) in a panel-owned file (reads included)', () => {
    expect(whyOf(fixture(`export const r = (db: any) => db.from('bookings').select('id')`))).toContain("from('bookings')")
    expect(whyOf(fixture(`export const r = (db: any) => db.from("customer_profiles").update({})`))).toContain(
      'customer_profiles',
    )
  })

  it('does not flag Array.from or a non-literal from in a panel-owned file', () => {
    expect(violationsOf(fixture(`export const r = Array.from(new Set([1]))`))).toEqual([])
  })

  it('does not apply the table rule to a non-panel closure helper', () => {
    const files = fixture(`import { h } from '@/lib/helper'\nexport const x = h`, {
      'lib/helper.ts': `export const h = (db: any) => db.from('some_table').select('id')`,
    })
    expect(violationsOf(files)).toEqual([])
  })
})

describe('findPanelViolations: operator client is GET only', () => {
  const GOOD = `export async function get() {\n  const method = 'GET'\n  return fetch('https://x.test', { method, redirect: 'error' })\n}`

  it('passes a GET-only client', () => {
    expect(violationsOf(fixture(`export const x = 1`, { [OPERATOR_CLIENT]: GOOD }), [OPERATOR_CLIENT])).toEqual([])
  })

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('flags method %s', (verb) => {
    const bad = `export async function w() { return fetch('https://x.test', { method: '${verb}' }) }\nconst g = 'GET'`
    expect(whyOf(fixture(`export const x = 1`, { [OPERATOR_CLIENT]: bad }), [OPERATOR_CLIENT])).toContain(verb)
  })

  it('flags a method that is not a literal GET', () => {
    const bad = `export async function w(m: string) { return fetch('https://x.test', { method: m }) }\nconst g = 'GET'`
    expect(whyOf(fixture(`export const x = 1`, { [OPERATOR_CLIENT]: bad }), [OPERATOR_CLIENT])).toContain('not the literal')
  })
})

describe('findPanelViolations: app/embed files', () => {
  const EMBED = 'app/embed/chatwoot-panel/page.tsx'
  const withEmbed = (src: string, extra: Record<string, string> = {}) =>
    fixture(`export const x = 1`, { [EMBED]: src, ...extra })

  it('allows fetching the panel API path (literal or a const holding it)', () => {
    const lit = `export const f = () => fetch('/api/chatwoot/dashboard-app', { method: 'POST' })`
    const cst = `const API = '/api/chatwoot/dashboard-app'\nexport const f = () => fetch(API, { method: 'POST' })`
    expect(violationsOf(withEmbed(lit), [EMBED])).toEqual([])
    expect(violationsOf(withEmbed(cst), [EMBED])).toEqual([])
  })

  it('flags a fetch of any other URL', () => {
    for (const src of [
      `export const f = () => fetch('/api/admin/bookings')`,
      `export const f = () => fetch('https://evil.test/collect')`,
      `export const f = (u: string) => fetch(u)`,
      `const API = '/api/other'\nexport const f = () => fetch(API)`,
    ]) {
      expect(whyOf(withEmbed(src), [EMBED]), src).toContain('fetches')
    }
  })

  it('flags other network transports', () => {
    for (const src of [
      `export const f = () => navigator.sendBeacon('/x')`,
      `export const f = () => new XMLHttpRequest()`,
      `export const f = () => new WebSocket('wss://x.test')`,
    ]) {
      expect(whyOf(withEmbed(src), [EMBED]), src).toContain('transport')
    }
  })

  it('flags an embed file importing @/lib/supabase at all', () => {
    const src = `import { createSupabaseServiceClient } from '@/lib/supabase'\nexport const x = createSupabaseServiceClient`
    expect(whyOf(withEmbed(src), [EMBED])).toContain('embed files must not import it at all')
  })

  it('applies the table rule to embed files', () => {
    expect(whyOf(withEmbed(`export const r = (db: any) => db.from('bookings')`), [EMBED])).toContain('table access')
  })

  it('the fetch rule is scoped to app/embed: the route may fetch whatever it needs through its imports', () => {
    expect(violationsOf(fixture(`export const f = () => fetch('/api/other')`))).toEqual([])
  })
})

describe('scope floor: fixtures', () => {
  it('names exactly the five panel entry modules', () => {
    expect(SCOPE_FLOOR).toHaveLength(5)
    expect(new Set(SCOPE_FLOOR).size).toBe(5)
    expect(SCOPE_FLOOR).toEqual(
      expect.arrayContaining([ROUTE, 'lib/chatwoot-operator.ts', 'lib/panel-bookings.ts', 'lib/panel-dto.ts', 'lib/panel-links.ts']),
    )
  })

  it('fails when any single floor module is removed from the scope', () => {
    for (const removed of SCOPE_FLOOR) {
      expect(missingFromFloor(SCOPE_FLOOR.filter((f) => f !== removed), SCOPE_FLOOR), removed).toEqual([removed])
    }
  })

  it('picks up files under app/embed/ by pattern', () => {
    const all = [...SCOPE_FLOOR, 'app/embed/chatwoot-panel/page.tsx', 'app/embed-other/x.ts', 'lib/other.ts']
    expect(computeEntries(all)).toEqual([...SCOPE_FLOOR, 'app/embed/chatwoot-panel/page.tsx'].sort())
  })
})

// ── real tree ───────────────────────────────────────────────────────────────────────────────────
describe('dashboard app isolation guard: real tree', () => {
  const allFiles = listScanFiles(REPO_ROOT)
  const entries = computeEntries(allFiles)

  it('scope covers the five floor modules and every file under app/embed/', () => {
    expect(missingFromFloor(entries, SCOPE_FLOOR)).toEqual([])
    for (const floor of SCOPE_FLOOR) expect(fs.existsSync(path.join(REPO_ROOT, floor)), floor).toBe(true)
    for (const f of allFiles) {
      if (ENTRY_PATTERNS.some((re) => re.test(f))) expect(entries, f).toContain(f)
    }
  })

  it('has zero violations on the real tree', () => {
    const fileMap = new Map<string, string>()
    for (const f of allFiles) fileMap.set(f, fs.readFileSync(path.join(REPO_ROOT, f), 'utf-8'))
    const violations = findPanelViolations(fileMap, entries)
    const message = violations.map((v) => `${v.path}: ${v.why.join('; ')}`).join('\n')
    expect(violations, message).toEqual([])
  })

  it('the route and the operator client really are in the checked closure (the guard is not vacuous)', () => {
    // Point the guard at a deliberately broken copy of the real route: it must object.
    const fileMap = new Map<string, string>()
    for (const f of allFiles) fileMap.set(f, fs.readFileSync(path.join(REPO_ROOT, f), 'utf-8'))
    fileMap.set(ROUTE, `${fileMap.get(ROUTE)}\nimport { cookies } from 'next/headers'\n`)
    expect(findPanelViolations(fileMap, entries).map((v) => v.path)).toContain(ROUTE)
  })
})
