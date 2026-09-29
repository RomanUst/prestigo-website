import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

/**
 * Phase 76, D-19(b) — repo guard: no synchronous site code path under app/,
 * components/, lib/, i18n/, middleware.ts, next.config.ts or vercel.json may
 * reach chat.rideprestigo.com or crm.rideprestigo.com — as a host literal, an
 * env var name, a chatwoot/espocrm package import, or transitively through an
 * import chain into a file that does any of those. This is a source-reading
 * assertion only (no browser, no network, no live render) — it proves the
 * CODE never wires a synchronous VPS dependency into the public site's
 * request path. The runtime half (a real outage test against the live VPS,
 * D-19a) is plan 76-07. The "no event lost, delivered once the VPS is back"
 * half of INFRA-05 is Phases 81/82.
 */

const REPO_ROOT = path.resolve(__dirname, '..')

const SCAN_DIRS = ['app', 'components', 'lib', 'i18n']
const SCAN_FILES = ['middleware.ts', 'next.config.ts', 'vercel.json']
const CODE_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'])
const CODE_EXT_LIST = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']
const SCAN_FLOOR = 250

// Case-insensitive, word-bounded chat/crm subdomain of rideprestigo.com.
// Deliberately does NOT match the apex (rideprestigo.com), www, a path
// (rideprestigo.com/chat) or an email local-part (booking@rideprestigo.com) —
// all of those lack a literal "chat." or "crm." immediately before the host.
const VPS_HOST_RE = /\b(?:chat|crm)\.rideprestigo\.com\b/i

// Uppercase CHATWOOT_/ESPOCRM_ prefixed env var names. No leading word
// boundary on purpose, so NEXT_PUBLIC_CHATWOOT_BASE_URL still matches.
const VPS_ENV_RE = /(?:CHATWOOT|ESPOCRM)_[A-Z0-9_]+/

// Applied only to bare package specifiers (never '.', '/' or '@/' prefixed).
const VPS_PKG_RE = /chatwoot|espocrm/i

// Phase 77 (D-09/T-77-19): a CSP allow-source is a browser permission, not a
// server dependency — the widget's origin has to appear as a literal inside
// middleware.ts's own CSP directive strings for the browser to allow it, and
// that is not the same thing this guard exists to catch (a synchronous site
// code path reaching the VPS at request time). So the host-literal check
// (step 1 below) tolerates exactly one narrow shape: a single CSP directive
// string literal, alone on its own line, in middleware.ts only. The
// exemption is intentionally this narrow — it does not cover env var names,
// package imports, any other file, or a CSP string sharing a line with any
// other statement (a fetch call, a second statement after the string, etc).
// Five fixture tests below (describe('CSP directive-line exemption...'))
// prove each of those boundaries independently.
const CSP_EXEMPT_FILE = 'middleware.ts'
const CSP_DIRECTIVE_NAMES = [
  'default-src',
  'script-src',
  'style-src',
  'img-src',
  'font-src',
  'connect-src',
  'frame-src',
  'media-src',
  'worker-src',
  'form-action',
].join('|')
// Group 1 captures the opening quote (double, single or backtick) so the
// body and closing quote can backreference it — `(?:(?!\1).)*` (a negative
// lookahead per character) stands in for "any char but the group-1 quote"
// since a backreference cannot appear inside a character class in JS regex.
const CSP_DIRECTIVE_LINE_RE = new RegExp(
  `^\\s*(?:[?:]\\s+)?(["'\`])(?:${CSP_DIRECTIVE_NAMES})\\s(?:(?!\\1).)*\\1,?\\s*$`
)

interface AllowlistEntry {
  path: string
  reason: string
}

interface Violation {
  path: string
  why: string[]
}

// An entry is permitted only when the file never runs on a synchronous user
// request path (page render, middleware, booking/payment/contact API
// route). Its reason must name the async mechanism that makes it safe (e.g.
// "QStash-invoked outbox worker route", "click-to-load consent-gated client
// widget loader") — later phases (77 widget, 81/82 outbox) add entries
// deliberately, never as a blanket exemption.
const VPS_ASYNC_ALLOWLIST: AllowlistEntry[] = [
  {
    path: 'app/api/chatwoot/identity/route.ts',
    reason:
      'on-demand identity endpoint fetched only by the chat launcher\'s click handler after the visitor clicks "Chat on site"; reads env and computes an HMAC locally, makes no network call to the VPS, and never runs on page render',
  },
]

/** Recursive fs.readdirSync walk — no glob dependency, matches the repo's
 * existing zero-dependency test-file convention. Skips node_modules/.next.
 * Returns repo-relative POSIX paths. */
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

/** Extracts import/require specifiers via regex (no AST parser). Covers
 * static `import ... from '...'`, `export ... from '...'`, side-effect
 * `import '...'`, dynamic `import('...')` and `require('...')`. */
function extractImportSpecifiers(content: string): string[] {
  const specifiers = new Set<string>()

  for (const m of content.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)) {
    specifiers.add(m[1])
  }
  for (const m of content.matchAll(/^\s*import\s+['"]([^'"]+)['"]/gm)) {
    specifiers.add(m[1])
  }
  for (const m of content.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    specifiers.add(m[1])
  }
  for (const m of content.matchAll(/\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    specifiers.add(m[1])
  }

  return [...specifiers]
}

/** Resolves `@/x` against the repo root and relative specifiers against the
 * importing file's directory. Tries the exact path, then each CODE_EXT, then
 * /index plus each CODE_EXT — only among keys actually present in the scan
 * set. Bare package specifiers (no '.', '/' or '@/' prefix) resolve to null:
 * they are never file-graph edges, only direct package-import hits. */
function resolveSpecifier(spec: string, importerPath: string, fileKeys: Set<string>): string | null {
  let basePath: string
  if (spec.startsWith('@/')) {
    basePath = spec.slice(2)
  } else if (spec.startsWith('.')) {
    const importerDir = path.posix.dirname(importerPath)
    basePath = path.posix.normalize(path.posix.join(importerDir, spec))
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

/** Non-global test against a single line, avoiding lastIndex statefulness. */
function getLineNumbers(content: string, re: RegExp): number[] {
  const testRe = new RegExp(re.source, re.flags.replace('g', ''))
  const nums: number[] = []
  content.split('\n').forEach((line, i) => {
    if (testRe.test(line)) nums.push(i + 1)
  })
  return nums
}

/** Pure function: no fs access, no side effects. */
function findVpsViolations(files: Map<string, string>, allowlist: AllowlistEntry[]): Violation[] {
  const allowlistPaths = new Set(allowlist.map((e) => e.path))
  const whyMap = new Map<string, string[]>()

  function addWhy(filePath: string, why: string) {
    if (!whyMap.has(filePath)) whyMap.set(filePath, [])
    whyMap.get(filePath)!.push(why)
  }

  // Step 1: direct hits (host literal, env var, bare package import).
  for (const [filePath, content] of files) {
    const lines = content.split('\n')
    lines.forEach((line, i) => {
      if (!VPS_HOST_RE.test(line)) return
      // Only host-literal hits are exempted, only in CSP_EXEMPT_FILE, and
      // only for a line matching the single-directive shape above — the
      // env-var and package-import checks below are never exempted.
      if (filePath === CSP_EXEMPT_FILE && CSP_DIRECTIVE_LINE_RE.test(line)) return
      addWhy(filePath, `host literal at line ${i + 1}`)
    })
    for (const ln of getLineNumbers(content, VPS_ENV_RE)) {
      addWhy(filePath, `env var reference at line ${ln}`)
    }
    for (const spec of extractImportSpecifiers(content)) {
      const isBarePackage = !spec.startsWith('.') && !spec.startsWith('/') && !spec.startsWith('@/')
      if (isBarePackage && VPS_PKG_RE.test(spec)) {
        addWhy(filePath, `package import '${spec}'`)
      }
    }
  }

  // Step 2: reverse import graph — target file -> set of files that import it.
  const fileKeys = new Set(files.keys())
  const importedBy = new Map<string, Set<string>>()
  for (const [filePath, content] of files) {
    for (const spec of extractImportSpecifiers(content)) {
      const resolved = resolveSpecifier(spec, filePath, fileKeys)
      if (resolved && resolved !== filePath) {
        if (!importedBy.has(resolved)) importedBy.set(resolved, new Set())
        importedBy.get(resolved)!.add(filePath)
      }
    }
  }

  // Step 3: BFS from every direct-hit file through its importers.
  const queue = [...whyMap.keys()]
  const reached = new Set(queue)
  while (queue.length) {
    const current = queue.shift()!
    const importers = importedBy.get(current)
    if (!importers) continue
    for (const importer of importers) {
      if (!reached.has(importer)) {
        reached.add(importer)
        addWhy(importer, `imports ${current}`)
        queue.push(importer)
      }
    }
  }

  // Step 4: every reached file not on the allowlist becomes a Violation,
  // sorted by path so a failing run is reproducible.
  const violations: Violation[] = []
  for (const filePath of reached) {
    if (allowlistPaths.has(filePath)) continue
    violations.push({ path: filePath, why: whyMap.get(filePath) ?? [] })
  }

  return violations.sort((a, b) => a.path.localeCompare(b.path))
}

describe('scan set — real tree', () => {
  const scanFiles = listScanFiles(REPO_ROOT)

  it('is non-vacuous and includes the known sync-path files', () => {
    expect(scanFiles.length).toBeGreaterThanOrEqual(SCAN_FLOOR)
    expect(scanFiles).toContain('middleware.ts')
    expect(scanFiles).toContain('app/api/contact/route.ts')
    expect(scanFiles).toContain('app/api/create-payment-intent/route.ts')
  })

  it('has zero violations on the real tree', () => {
    const fileMap = new Map<string, string>()
    for (const f of scanFiles) {
      fileMap.set(f, fs.readFileSync(path.join(REPO_ROOT, f), 'utf-8'))
    }
    const violations = findVpsViolations(fileMap, VPS_ASYNC_ALLOWLIST)
    const message = violations.map((v) => `${v.path}: ${v.why.join('; ')}`).join('\n')
    expect(violations, message).toEqual([])
  })
})

describe('allowlist hygiene', () => {
  it('every allowlist entry points at an existing file', () => {
    for (const entry of VPS_ASYNC_ALLOWLIST) {
      expect(fs.existsSync(path.join(REPO_ROOT, entry.path)), entry.path).toBe(true)
    }
  })

  it('every allowlist entry has a reason of at least 20 characters', () => {
    for (const entry of VPS_ASYNC_ALLOWLIST) {
      expect(entry.reason.length, `${entry.path}: reason too short`).toBeGreaterThanOrEqual(20)
    }
  })
})

describe('findVpsViolations — fixture self-tests', () => {
  it('flags a host literal with its line number', () => {
    const files = new Map([['lib/a.ts', 'line1\nconst url = "https://chat.rideprestigo.com/api"\nline3']])
    const violations = findVpsViolations(files, [])
    expect(violations).toHaveLength(1)
    expect(violations[0].path).toBe('lib/a.ts')
    expect(violations[0].why.some((w) => w.includes('line 2'))).toBe(true)
  })

  it('flags an uppercase host literal case-insensitively', () => {
    const files = new Map([['lib/b.ts', 'const url = "CRM.RIDEPRESTIGO.COM"']])
    const violations = findVpsViolations(files, [])
    expect(violations).toHaveLength(1)
    expect(violations[0].path).toBe('lib/b.ts')
  })

  it('does not flag adjacency non-matches (apex, www, path, email)', () => {
    const files = new Map([
      [
        'lib/c.ts',
        [
          'const apex = "https://rideprestigo.com"',
          'const www = "https://www.rideprestigo.com"',
          'const withPath = "https://rideprestigo.com/chat"',
          'const email = "booking@rideprestigo.com"',
        ].join('\n'),
      ],
    ])
    expect(findVpsViolations(files, [])).toEqual([])
  })

  it('flags env var references with no leading word boundary', () => {
    const files = new Map([
      [
        'lib/d.ts',
        'const a = process.env.ESPOCRM_API_URL\nconst b = process.env.NEXT_PUBLIC_CHATWOOT_BASE_URL',
      ],
    ])
    const violations = findVpsViolations(files, [])
    expect(violations).toHaveLength(1)
    expect(violations[0].path).toBe('lib/d.ts')
    expect(violations[0].why.length).toBeGreaterThanOrEqual(2)
  })

  it('flags a bare package import whose specifier contains chatwoot or espocrm', () => {
    const files = new Map([
      ['lib/e.ts', "import { Client } from '@chatwoot/sdk'"],
      ['lib/f.ts', "import EspoCrm from 'espocrm-client'"],
    ])
    const violations = findVpsViolations(files, [])
    expect(violations.map((v) => v.path).sort()).toEqual(['lib/e.ts', 'lib/f.ts'])
  })

  it('flags a transitive import chain sorted by path', () => {
    const files = new Map([
      ['app/api/route.ts', "import { call } from '@/lib/a'"],
      ['lib/a.ts', "import { client } from './vps-client'"],
      ['lib/vps-client.ts', 'const url = "https://chat.rideprestigo.com"'],
    ])
    const violations = findVpsViolations(files, [])
    expect(violations.map((v) => v.path)).toEqual(['app/api/route.ts', 'lib/a.ts', 'lib/vps-client.ts'])
    const routeViolation = violations.find((v) => v.path === 'app/api/route.ts')!
    expect(routeViolation.why.some((w) => w.includes('imports lib/a.ts'))).toBe(true)
  })

  it('allows an allowlisted client with an allowlisted importer, but flags a second non-allowlisted importer', () => {
    const files = new Map([
      ['lib/vps-client.ts', 'const url = "https://chat.rideprestigo.com"'],
      ['workers/outbox.ts', "import { client } from '@/lib/vps-client'"],
      ['app/api/route.ts', "import { client } from '@/lib/vps-client'"],
    ])
    const allowlist: AllowlistEntry[] = [
      { path: 'lib/vps-client.ts', reason: 'QStash-invoked outbox worker client, never called synchronously' },
      { path: 'workers/outbox.ts', reason: 'QStash-invoked outbox worker route, async job runner' },
    ]
    const violations = findVpsViolations(files, allowlist)
    expect(violations.map((v) => v.path)).toEqual(['app/api/route.ts'])
  })

  it('returns an empty list for an empty file map', () => {
    expect(findVpsViolations(new Map(), [])).toEqual([])
  })
})

describe('CSP directive-line exemption (Phase 77, D-09/T-77-19)', () => {
  it('(a) a middleware.ts connect-src directive line with the host literal is exempt', () => {
    const files = new Map([
      [
        'middleware.ts',
        '    "connect-src \'self\' https://chat.rideprestigo.com wss://chat.rideprestigo.com",',
      ],
    ])
    expect(findVpsViolations(files, [])).toEqual([])
  })

  it('(b) a middleware.ts fetch() call to the host is still a violation (not a CSP directive line)', () => {
    const files = new Map([
      ['middleware.ts', 'const res = await fetch("https://chat.rideprestigo.com/api")'],
    ])
    const violations = findVpsViolations(files, [])
    expect(violations).toHaveLength(1)
    expect(violations[0].path).toBe('middleware.ts')
  })

  it('(c) the identical CSP-shaped line in a non-middleware file is still a violation', () => {
    const files = new Map([
      ['lib/x.ts', '    "connect-src \'self\' https://chat.rideprestigo.com",'],
    ])
    const violations = findVpsViolations(files, [])
    expect(violations).toHaveLength(1)
    expect(violations[0].path).toBe('lib/x.ts')
  })

  it('(d) a middleware.ts CSP-shaped line with an uppercase CHATWOOT_ env name is still a violation (env check not exempted)', () => {
    const files = new Map([
      ['middleware.ts', '    "connect-src \'self\' CHATWOOT_WIDGET_HMAC_SECRET",'],
    ])
    const violations = findVpsViolations(files, [])
    expect(violations).toHaveLength(1)
    expect(violations[0].path).toBe('middleware.ts')
    expect(violations[0].why.some((w) => w.includes('env var reference'))).toBe(true)
  })

  it('(e) a middleware.ts line where the CSP string is followed by another statement is still a violation', () => {
    const files = new Map([
      [
        'middleware.ts',
        '    "connect-src \'self\' https://chat.rideprestigo.com"; doSomethingElse();',
      ],
    ])
    const violations = findVpsViolations(files, [])
    expect(violations).toHaveLength(1)
    expect(violations[0].path).toBe('middleware.ts')
  })
})

/**
 * Phase 78 (D-12), plan 78-02 — the public site never talks to the WhatsApp
 * Cloud API. Every outbound WhatsApp message in Phase 78 is chosen by an
 * operator in Chatwoot; the site must not hold the messaging credentials, call
 * the template endpoint, or name a WhatsApp Business permission. Scans the SAME
 * site files as the guard above (same walk, same scan floor). There is NO
 * allowlist for this block: an entry here would be the exact regression it
 * exists to catch.
 */
const WA_API_RE = /META_WA_[A-Z0-9_]+|message_templates|whatsapp_business_(?:messaging|management)/

/** Pure function: file map -> one Violation per file with a match. */
function findWhatsAppApiUses(files: Map<string, string>): Violation[] {
  const violations: Violation[] = []
  for (const [filePath, content] of files) {
    const lines = getLineNumbers(content, WA_API_RE)
    if (lines.length > 0) {
      violations.push({ path: filePath, why: lines.map((n) => `WhatsApp Cloud API reference at line ${n}`) })
    }
  }
  return violations.sort((a, b) => a.path.localeCompare(b.path))
}

describe('Phase 78 (D-12): no site code uses the WhatsApp Cloud API', () => {
  it('scans a non-vacuous set of site files', () => {
    expect(listScanFiles(REPO_ROOT).length).toBeGreaterThanOrEqual(SCAN_FLOOR)
  })

  it('has zero WhatsApp Cloud API references on the real tree', () => {
    const fileMap = new Map<string, string>()
    for (const f of listScanFiles(REPO_ROOT)) {
      fileMap.set(f, fs.readFileSync(path.join(REPO_ROOT, f), 'utf-8'))
    }
    const violations = findWhatsAppApiUses(fileMap)
    const message = violations.map((v) => `${v.path}: ${v.why.join('; ')}`).join('\n')
    expect(violations, message).toEqual([])
  })

  it('flags a META_WA_ environment variable name (assembled from parts)', () => {
    const token = ['META', 'WA', 'SYSTEM_USER_TOKEN'].join('_')
    const files = new Map([['lib/a.ts', `line1\nconst t = process.env.${token}\nline3`]])
    const violations = findWhatsAppApiUses(files)
    expect(violations).toHaveLength(1)
    expect(violations[0].path).toBe('lib/a.ts')
    expect(violations[0].why[0]).toContain('line 2')
  })

  it('flags the message_templates endpoint (assembled from parts)', () => {
    const endpoint = ['message', 'templates'].join('_')
    const files = new Map([['app/api/x/route.ts', `fetch("https://graph.facebook.com/v25.0/1/${endpoint}")`]])
    expect(findWhatsAppApiUses(files)).toHaveLength(1)
  })

  it('flags both whatsapp_business_ permissions (assembled from parts)', () => {
    const messaging = ['whatsapp', 'business', 'messaging'].join('_')
    const management = ['whatsapp', 'business', 'management'].join('_')
    const files = new Map([
      ['lib/m.ts', `const scope = "${messaging}"`],
      ['lib/n.ts', `const scope = "${management}"`],
    ])
    expect(findWhatsAppApiUses(files).map((v) => v.path)).toEqual(['lib/m.ts', 'lib/n.ts'])
  })

  it('ignores the site META_APP_SECRET and a plain graph.facebook.com Pixel URL', () => {
    const files = new Map([
      ['app/api/facebook/data-deletion/route.ts', 'const s = process.env.META_APP_SECRET'],
      ['app/api/meta-capi/route.ts', 'const url = `https://graph.facebook.com/v21.0/${pixelId}/events`'],
    ])
    expect(findWhatsAppApiUses(files)).toEqual([])
  })

  it('whatsapp-meta.env.example: every non-comment line is NAME= with an empty value and no name contains PIN', () => {
    const raw = fs.readFileSync(path.join(REPO_ROOT, 'infra/vps/env/whatsapp-meta.env.example'), 'utf-8')
    const assignments = raw
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l !== '' && !l.startsWith('#'))
    expect(assignments.length).toBeGreaterThanOrEqual(6)
    for (const line of assignments) {
      expect(line, `not an empty NAME= assignment: ${line.split('=')[0]}`).toMatch(/^[A-Z][A-Z0-9_]*=$/)
      expect(line.split('=')[0], `PIN-like name: ${line}`).not.toMatch(/PIN/)
    }
  })
})
