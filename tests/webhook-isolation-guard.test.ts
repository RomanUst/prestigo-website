// @vitest-environment node
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

/**
 * Phase 83, D-17 / HOOK-03 — import-closure layer of the structural barrier: the inbound webhook
 * path (both receiver routes and the handlers behind them) must not be able to reach a booking or
 * customer-profile write. Source-reading assertion only. The behavioural layer (a runtime tripwire over
 * the real stores) is tests/webhook-isolation-runtime.test.ts (plan 83-12).
 *
 * For every entry module that exists, the guard computes the runtime import closure (type-only
 * imports are erased by the compiler and are ignored) and enforces four rules:
 *   1. the only symbol imported from @/lib/supabase is createSupabaseServiceClient;
 *   2. no file chains .from('bookings' | 'customer_profiles') into insert/update/upsert/delete;
 *   3. no file touches auth.admin;
 *   4. no file names, as a string literal, an RPC that a migration defines with a write to bookings,
 *      customer_profiles or auth.users (directly or through another such function).
 *
 * lib/supabase.ts is the module boundary: it is not traversed (rule 1 limits what may come out of it).
 * Scope is computed from the files that exist, so routes and handlers added by later plans are
 * covered automatically, and SCOPE_FLOOR names the ten entry modules that must always be in it.
 */

const REPO_ROOT = path.resolve(__dirname, '..')
const SCAN_DIRS = ['app', 'components', 'lib', 'i18n', 'types']
const SCAN_FILES = ['middleware.ts']
const CODE_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'])
const CODE_EXT_LIST = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']

const SUPABASE_MODULE = 'lib/supabase.ts'
const ALLOWED_SUPABASE_SYMBOL = 'createSupabaseServiceClient'
const FORBIDDEN_TABLES = ['bookings', 'customer_profiles']
const WRITE_VERBS: ReadonlySet<string> = new Set(['insert', 'update', 'upsert', 'delete'])

const ENTRY_ROUTES = ['app/api/webhooks/chatwoot/route.ts', 'app/api/webhooks/espocrm/route.ts']
const ENTRY_LIB_FILES = ['lib/hook-dispatch.ts', 'lib/espo-contact-hook.ts', 'lib/sync-origin.ts']
const ENTRY_LIB_PATTERNS = [/^lib\/chat-[^/]+\.tsx?$/, /^lib\/webhook-[^/]+\.tsx?$/]
/**
 * The floor of the guard's scope (plan 83-12): these ten entry modules must always be in it, whatever the
 * patterns above match, so the guard can never silently shrink to a subset of the inbound path.
 */
const SCOPE_FLOOR = [
  'app/api/webhooks/chatwoot/route.ts',
  'app/api/webhooks/espocrm/route.ts',
  'lib/hook-dispatch.ts',
  'lib/chat-io.ts',
  'lib/chat-intake.ts',
  'lib/chat-resolve.ts',
  'lib/chat-contact.ts',
  'lib/espo-contact-hook.ts',
  'lib/chat-store.ts',
  'lib/webhook-store.ts',
]

interface Violation {
  path: string
  why: string[]
}

// ── file walking and import resolution (helpers copied from infra-vps-isolation-guard) ───────────
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

/** Removes // and block comments so a comment that mentions a table or auth.admin is not a hit. */
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

/** Symbols a file imports at runtime from the supabase module; '*' stands for anything unprovable. */
function supabaseSymbols(content: string, filePath: string, fileKeys: Set<string>): string[] {
  const code = stripTypeOnlyStatements(stripComments(content))
  const symbols: string[] = []
  const isSupabase = (spec: string) => resolveSpecifier(spec, filePath, fileKeys) === SUPABASE_MODULE

  // import <clause> from '<spec>' and export <clause> from '<spec>'
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
  for (const m of code.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    if (isSupabase(m[1])) symbols.push('*')
  }
  for (const m of code.matchAll(/\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    if (isSupabase(m[1])) symbols.push('*')
  }
  return symbols
}

// ── forbidden RPC set derived from migrations ───────────────────────────────────────────────────
function stripSqlComments(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--.*$/gm, '')
}

const SQL_WRITE_RE = new RegExp(
  String.raw`\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+(?:(?:public\.)?(?:${FORBIDDEN_TABLES.join('|')})|auth\.users)\b`,
  'i',
)

/** Function name -> body text, for every CREATE [OR REPLACE] FUNCTION in the given migration texts. */
function parseFunctionBodies(migrations: string[]): Map<string, string[]> {
  const bodies = new Map<string, string[]>()
  for (const raw of migrations) {
    const sql = stripSqlComments(raw)
    const startRe = /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?"?(\w+)"?\s*\(/gi
    for (const m of sql.matchAll(startRe)) {
      const afterSignature = sql.slice((m.index ?? 0) + m[0].length)
      const open = afterSignature.match(/\$(\w*)\$/)
      if (!open || open.index === undefined) continue
      const tag = open[0]
      const bodyStart = open.index + tag.length
      const close = afterSignature.indexOf(tag, bodyStart)
      const body = afterSignature.slice(bodyStart, close === -1 ? undefined : close)
      const list = bodies.get(m[1]) ?? []
      list.push(body)
      bodies.set(m[1], list)
    }
  }
  return bodies
}

/** Names of functions that write bookings, customer_profiles or auth.users, directly or by calling one. */
function deriveForbiddenRpcs(migrations: string[]): Set<string> {
  const bodies = parseFunctionBodies(migrations)
  const forbidden = new Set<string>()
  for (const [name, list] of bodies) {
    if (list.some((body) => SQL_WRITE_RE.test(body))) forbidden.add(name)
  }
  let grew = true
  while (grew) {
    grew = false
    for (const [name, list] of bodies) {
      if (forbidden.has(name)) continue
      const callsForbidden = [...forbidden].some((f) => list.some((body) => new RegExp(`\\b${f}\\s*\\(`).test(body)))
      if (callsForbidden) {
        forbidden.add(name)
        grew = true
      }
    }
  }
  return forbidden
}

// ── the guard ───────────────────────────────────────────────────────────────────────────────────
/** Pure function: no fs access. `files` maps repo-relative POSIX paths to source text. */
function findIsolationViolations(
  files: Map<string, string>,
  entries: string[],
  forbiddenRpcs: Set<string>,
): Violation[] {
  const fileKeys = new Set(files.keys())
  const whyMap = new Map<string, string[]>()
  const addWhy = (filePath: string, why: string) => {
    const list = whyMap.get(filePath) ?? []
    list.push(why)
    whyMap.set(filePath, list)
  }

  // Closure, entry -> runtime imports. lib/supabase.ts is a boundary: reached but not traversed.
  const closure = new Set<string>()
  const importers = new Map<string, string>()
  const queue = entries.filter((e) => files.has(e))
  for (const e of queue) closure.add(e)
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

  const writeChainRe = new RegExp(
    String.raw`\.from\(\s*['"\x60](${FORBIDDEN_TABLES.join('|')})['"\x60]\s*\)`,
    'g',
  )

  for (const filePath of closure) {
    if (filePath === SUPABASE_MODULE) continue
    const content = files.get(filePath) ?? ''
    const code = stripComments(content)

    // Rule 1: only createSupabaseServiceClient may come out of @/lib/supabase.
    for (const symbol of supabaseSymbols(content, filePath, fileKeys)) {
      if (symbol !== ALLOWED_SUPABASE_SYMBOL) {
        addWhy(filePath, `imports '${symbol}' from @/lib/supabase (only ${ALLOWED_SUPABASE_SYMBOL} is allowed)`)
      }
    }

    // Rule 2: no write chained off a bookings / customer_profiles table handle (reads are fine).
    // supabase-js write verbs are always the first method after .from(table), so the first chained
    // call decides; a handle that does not continue into a call cannot be proven read-only.
    for (const m of code.matchAll(writeChainRe)) {
      const rest = code.slice((m.index ?? 0) + m[0].length)
      const next = rest.match(/^\s*\.\s*(\w+)/)
      if (!next) {
        addWhy(filePath, `${m[1]} table handle escapes the call chain (cannot prove it is read-only)`)
      } else if (WRITE_VERBS.has(next[1])) {
        addWhy(filePath, `writes ${m[1]} through supabase-js (.${next[1]}())`)
      }
    }

    // Rule 3: no auth admin API.
    if (/\bauth\s*\.\s*admin\b/.test(code)) addWhy(filePath, 'touches auth.admin')

    // Rule 4: no RPC that a migration defines with a booking / profile / auth.users write.
    for (const m of code.matchAll(/['"\x60](\w+)['"\x60]/g)) {
      if (forbiddenRpcs.has(m[1])) addWhy(filePath, `names write RPC '${m[1]}'`)
    }
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
  for (const f of [...ENTRY_ROUTES, ...ENTRY_LIB_FILES]) if (set.has(f)) entries.add(f)
  for (const f of allFiles) if (ENTRY_LIB_PATTERNS.some((re) => re.test(f))) entries.add(f)
  return [...entries].sort()
}

/** The floor modules that are not in the computed scope (empty = the guard covers every one of them). */
function missingFromFloor(entries: readonly string[], floor: readonly string[]): string[] {
  const set = new Set(entries)
  return floor.filter((f) => !set.has(f))
}

// ── fixtures ────────────────────────────────────────────────────────────────────────────────────
const SUPABASE_STUB = `export function createSupabaseServiceClient() { return {} }\nexport async function saveBooking() {}`

function fixture(entry: string, extra: Record<string, string> = {}): Map<string, string> {
  return new Map<string, string>([[SUPABASE_MODULE, SUPABASE_STUB], ['app/entry.ts', entry], ...Object.entries(extra)])
}

const NO_RPCS = new Set<string>()

describe('findIsolationViolations: fixtures', () => {
  it('flags an entry importing saveBooking from @/lib/supabase', () => {
    const files = fixture(`import { saveBooking } from '@/lib/supabase'\nexport const x = saveBooking`)
    const v = findIsolationViolations(files, ['app/entry.ts'], NO_RPCS)
    expect(v.map((x) => x.path)).toEqual(['app/entry.ts'])
    expect(v[0].why.join(' ')).toContain('saveBooking')
  })

  it('flags default and namespace imports of @/lib/supabase and a mixed named import', () => {
    for (const line of [
      `import * as db from '@/lib/supabase'`,
      `import db from '@/lib/supabase'`,
      `import { createSupabaseServiceClient, saveBooking as sb } from '@/lib/supabase'`,
    ]) {
      expect(findIsolationViolations(fixture(line), ['app/entry.ts'], NO_RPCS)).toHaveLength(1)
    }
  })

  it('allows { createSupabaseServiceClient } from @/lib/supabase (also with an inline type specifier)', () => {
    for (const line of [
      `import { createSupabaseServiceClient } from '@/lib/supabase'`,
      `import { createSupabaseServiceClient, type SomeType } from '@/lib/supabase'`,
    ]) {
      expect(findIsolationViolations(fixture(line), ['app/entry.ts'], NO_RPCS)).toEqual([])
    }
  })

  it('flags a helper that chains .from(customer_profiles) into .update(, naming both files', () => {
    const files = fixture(`import { patch } from '@/lib/helper'\nexport const x = patch`, {
      'lib/helper.ts': `export const patch = (db: any) =>\n  db.from('customer_profiles')\n    .update({ full_name: null })\n    .eq('id', 1)`,
    })
    const v = findIsolationViolations(files, ['app/entry.ts'], NO_RPCS)
    expect(v.map((x) => x.path)).toEqual(['lib/helper.ts'])
    expect(v[0].why.join(' ')).toContain('customer_profiles')
    expect(v[0].why.join(' ')).toContain('app/entry.ts')
  })

  it('import type does not pull the type-only module (or its writes) into the closure', () => {
    const files = fixture(
      `import type { DispatchDeps } from '@/lib/lead-sync'\nimport type {\n  Other,\n} from '@/lib/lead-sync'\nexport type { Foo } from '@/lib/lead-sync'\nexport const x = 1`,
      { 'lib/lead-sync.ts': `import { saveBooking } from '@/lib/supabase'\nexport const y = saveBooking` },
    )
    expect(findIsolationViolations(files, ['app/entry.ts'], NO_RPCS)).toEqual([])
  })

  it('a runtime import of the same module is flagged (contrast with import type)', () => {
    const files = fixture(`import { y } from '@/lib/lead-sync'\nexport const x = y`, {
      'lib/lead-sync.ts': `import { saveBooking } from '@/lib/supabase'\nexport const y = saveBooking`,
    })
    expect(findIsolationViolations(files, ['app/entry.ts'], NO_RPCS).map((x) => x.path)).toEqual(['lib/lead-sync.ts'])
  })

  it('allows reading bookings: .from(bookings).select(', () => {
    const files = fixture(
      `import { createSupabaseServiceClient } from '@/lib/supabase'\nexport const read = (db: any) => db.from('bookings').select('id').eq('id', 1)\nconst seen = new Map<string, number>()\nseen.delete('a')`,
    )
    expect(findIsolationViolations(files, ['app/entry.ts'], NO_RPCS)).toEqual([])
  })

  it('flags writes to bookings in every verb and quote style', () => {
    for (const verb of ['insert', 'update', 'upsert', 'delete']) {
      const files = fixture(`export const w = (db: any) => db.from("bookings").${verb}({})`)
      expect(findIsolationViolations(files, ['app/entry.ts'], NO_RPCS)).toHaveLength(1)
    }
  })

  it('flags a bookings table handle that escapes the call chain (cannot prove read-only)', () => {
    const files = fixture(`export const h = (db: any) => {\n  const t = db.from('bookings')\n  return t\n}`)
    const v = findIsolationViolations(files, ['app/entry.ts'], NO_RPCS)
    expect(v).toHaveLength(1)
    expect(v[0].why.join(' ')).toContain('escapes')
  })

  it('flags a literal rpc(erasure_anonymise_person)', () => {
    const files = fixture(`export const r = (db: any) => db.rpc('erasure_anonymise_person', { p: 1 })`)
    const v = findIsolationViolations(files, ['app/entry.ts'], new Set(['erasure_anonymise_person']))
    expect(v).toHaveLength(1)
    expect(v[0].why.join(' ')).toContain('erasure_anonymise_person')
  })

  it('flags auth.admin', () => {
    const files = fixture(`export const u = (db: any) => db.auth.admin.deleteUser('x')`)
    const v = findIsolationViolations(files, ['app/entry.ts'], NO_RPCS)
    expect(v).toHaveLength(1)
    expect(v[0].why.join(' ')).toContain('auth.admin')
  })

  it('ignores mentions in comments', () => {
    const files = fixture(
      `// never call auth.admin or .from('bookings').update(\n/* rpc('erasure_anonymise_person') */\nexport const x = 1`,
    )
    expect(findIsolationViolations(files, ['app/entry.ts'], new Set(['erasure_anonymise_person']))).toEqual([])
  })

  it('does not traverse into lib/supabase.ts (its own writers are the boundary)', () => {
    const files = fixture(`import { createSupabaseServiceClient } from '@/lib/supabase'\nexport const x = createSupabaseServiceClient`)
    files.set(SUPABASE_MODULE, `${SUPABASE_STUB}\nexport const w = (db: any) => db.from('bookings').update({})`)
    expect(findIsolationViolations(files, ['app/entry.ts'], NO_RPCS)).toEqual([])
  })
})

describe('scope floor: fixtures', () => {
  const present = [...SCOPE_FLOOR, 'lib/chat-payload.ts', 'lib/sync-origin.ts']

  it('names exactly the ten inbound entry modules', () => {
    expect(SCOPE_FLOOR).toHaveLength(10)
    expect(new Set(SCOPE_FLOOR).size).toBe(10)
    expect(SCOPE_FLOOR).toEqual(expect.arrayContaining(['app/api/webhooks/chatwoot/route.ts', 'app/api/webhooks/espocrm/route.ts', 'lib/espo-contact-hook.ts', 'lib/webhook-store.ts']))
  })

  it('is satisfied by a scope holding every floor module', () => {
    expect(missingFromFloor(present, SCOPE_FLOOR)).toEqual([])
  })

  it('fails when any single floor module is removed from the scope', () => {
    for (const removed of SCOPE_FLOOR) {
      const shrunk = present.filter((f) => f !== removed)
      expect(missingFromFloor(shrunk, SCOPE_FLOOR), removed).toEqual([removed])
    }
  })
})

describe('deriveForbiddenRpcs: fixtures', () => {
  const sql = `
    CREATE OR REPLACE FUNCTION public.writes_bookings(p uuid) RETURNS void LANGUAGE plpgsql AS $$
    BEGIN UPDATE public.bookings SET status = 'x' WHERE id = p; END; $$;
    CREATE OR REPLACE FUNCTION public.calls_writer(p uuid) RETURNS void LANGUAGE plpgsql AS $fn$
    BEGIN PERFORM public.writes_bookings(p); END; $fn$;
    CREATE OR REPLACE FUNCTION public.reads_only(p uuid) RETURNS integer LANGUAGE sql AS $$
    SELECT count(*)::int FROM public.bookings WHERE id = p; $$;
    UPDATE public.bookings SET status = 'y';
    CREATE OR REPLACE FUNCTION public.deletes_user(p uuid) RETURNS void LANGUAGE sql AS $$
    DELETE FROM auth.users WHERE id = p; $$;
    -- UPDATE public.bookings in a comment never counts
    CREATE OR REPLACE FUNCTION public.commented(p uuid) RETURNS void LANGUAGE sql AS $$
    -- DELETE FROM public.bookings
    SELECT 1; $$;
  `

  it('collects direct writers and functions that call them, not readers or statements between functions', () => {
    const set = deriveForbiddenRpcs([sql])
    expect([...set].sort()).toEqual(['calls_writer', 'deletes_user', 'writes_bookings'])
  })
})

// ── real tree ───────────────────────────────────────────────────────────────────────────────────
describe('webhook isolation guard: real tree', () => {
  const allFiles = listScanFiles(REPO_ROOT)
  const entries = computeEntries(allFiles)
  const migrationsDir = path.join(REPO_ROOT, 'supabase', 'migrations')
  const migrations = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .map((f) => fs.readFileSync(path.join(migrationsDir, f), 'utf-8'))
  const forbidden = deriveForbiddenRpcs(migrations)

  it('derives the forbidden RPC set from migrations (erasure_anonymise_person is in it, chat_* is not)', () => {
    expect(forbidden.has('erasure_anonymise_person')).toBe(true)
    expect([...forbidden].filter((n) => n.startsWith('chat_'))).toEqual([])
  })

  it('scope covers the ten floor modules and every entry module that exists', () => {
    expect(missingFromFloor(entries, SCOPE_FLOOR)).toEqual([])
    for (const floor of SCOPE_FLOOR) expect(fs.existsSync(path.join(REPO_ROOT, floor)), floor).toBe(true)
    for (const f of [...ENTRY_ROUTES, ...ENTRY_LIB_FILES]) {
      if (fs.existsSync(path.join(REPO_ROOT, f))) expect(entries, f).toContain(f)
    }
    for (const f of allFiles) {
      if (ENTRY_LIB_PATTERNS.some((re) => re.test(f))) expect(entries, f).toContain(f)
    }
  })

  it('has zero violations on the real tree', () => {
    const fileMap = new Map<string, string>()
    for (const f of allFiles) fileMap.set(f, fs.readFileSync(path.join(REPO_ROOT, f), 'utf-8'))
    const violations = findIsolationViolations(fileMap, entries, forbidden)
    const message = violations.map((v) => `${v.path}: ${v.why.join('; ')}`).join('\n')
    expect(violations, message).toEqual([])
  })
})
