// @vitest-environment node
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

/**
 * Phase 86, ADM-03 (D-04): no hard-coded colour in admin TS/TSX.
 *
 * Scans every .ts/.tsx under components/admin and app/(internal)/admin for hex
 * literals, rgb()/rgba()/hsl()/hsla()/oklch()/oklab()/color-mix() calls and bare
 * CSS colour keywords used as colour values. The token sheet itself
 * (app/(internal)/admin/admin-theme.css) is a .css file and is intentionally
 * outside the scan.
 *
 * Closeout (D-04): the conversion ratchet is finished. LEGACY_PENDING is an
 * empty constant (asserted empty below) and the pending-ledger directory is
 * gone (asserted absent), so a single literal in any admin .ts/.tsx fails the
 * suite. Do not relocate literals into a module outside the scanned roots;
 * admin colours come only from var(--admin-*) / var(--status-*) tokens.
 */

const REPO_ROOT = path.resolve(__dirname, '..')
const SCAN_ROOTS = ['components/admin', 'app/(internal)/admin', 'app/(internal)/driver/trip']
const EXTENSIONS = new Set(['.ts', '.tsx'])
/** Removed at closeout; the guard asserts it stays gone (no silent ledger fallback). */
const REMOVED_LEDGER_DIR = 'tests/fixtures/admin-color-pending'

/** The scan can never shrink silently: these files must always be in it. */
const SCOPE_FLOOR = [
  'components/admin/AdminSidebar.tsx',
  'components/admin/BookingsTable.tsx',
  'components/admin/StatusBadge.tsx',
  'components/admin/AdminShell.tsx',
  'app/(internal)/admin/layout.tsx',
  'app/(internal)/admin/login/page.tsx',
  'app/(internal)/admin/(dashboard)/layout.tsx',
]

// (?<![\w&]) keeps HTML entities such as &#10003; and word-internal # out.
const HEX = /(?<![\w&])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})(?![\w-])/g
const COLOR_FN = /\b(?:rgb|rgba|hsl|hsla|oklch|oklab|color-mix)\(/g
const COLOR_KEYWORD =
  /\b(?:color|background(?:Color)?|border(?:Color|Top|Right|Bottom|Left)?|fill|stroke|outline|boxShadow)\s*:\s*['"`]?\s*(?:white|black|red|green|blue|gray|grey|orange|yellow|purple)\b/g

const PATTERNS = [HEX, COLOR_FN, COLOR_KEYWORD]

/** Frequent legacy literal -> UI-SPEC Token Map target. */
const TOKEN_HINTS: Record<string, string> = {
  '#f87171': '--status-danger-fg',
  '#ff6b6b': '--status-danger-fg',
  '#ef4444': '--status-danger-fg',
  '#e74c3c': '--status-danger-fg',
  '#c0392b': '--admin-danger-solid',
  '#4ade80': '--status-ok-fg',
  '#27ae60': '--status-ok-fg',
  '#60a5fa': '--status-info-fg',
  '#cfc9c2': '--admin-text-muted',
  '#f5f2ee': '--admin-text',
  '#4e4e56': '--admin-border or --admin-border-strong',
  '#b87333': '--admin-accent',
  '#28282b': '--admin-sidebar-bg or --admin-surface',
  '#36363b': '--admin-sidebar-bg or --admin-surface',
}
const DEFAULT_HINT = 'a var(--admin-*|--status-*) token'
const RGBA_HINT = '--admin-scrim / --admin-accent-tint / --status-*-border'

function tokenHint(literal: string): string {
  const key = literal.toLowerCase()
  if (TOKEN_HINTS[key]) return TOKEN_HINTS[key]
  if (/^rgba?\($/.test(key)) return RGBA_HINT
  return DEFAULT_HINT
}

interface Hit {
  file: string
  line: number
  literal: string
}

function walk(rel: string, out: string[] = []): string[] {
  const abs = path.join(REPO_ROOT, rel)
  if (!fs.existsSync(abs)) return out
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    const child = `${rel}/${entry.name}`
    if (entry.isDirectory()) walk(child, out)
    else if (EXTENSIONS.has(path.extname(entry.name))) out.push(child)
  }
  return out
}

/** Path-sorted list of every scanned file. */
function scanFiles(): string[] {
  return SCAN_ROOTS.flatMap((root) => walk(root)).sort()
}

/** Colour literals on one line, in the order they appear. */
function literalsInLine(line: string): string[] {
  const found: { index: number; text: string }[] = []
  for (const re of PATTERNS) {
    re.lastIndex = 0
    for (const m of line.matchAll(re)) found.push({ index: m.index ?? 0, text: m[0] })
  }
  return found.sort((a, b) => a.index - b.index).map((f) => f.text)
}

function hitsInSource(file: string, source: string): Hit[] {
  const hits: Hit[] = []
  source.split('\n').forEach((line, i) => {
    for (const literal of literalsInLine(line)) hits.push({ file, line: i + 1, literal })
  })
  return hits
}

/** Deterministic report order: file path, then line number. */
function sortHits(hits: Hit[]): Hit[] {
  return [...hits].sort((a, b) => (a.file === b.file ? a.line - b.line : a.file.localeCompare(b.file)))
}

function formatHit(h: Hit): string {
  return `${h.file}:${h.line} ${h.literal} -> ${tokenHint(h.literal)}`
}

function readSource(file: string): string {
  return fs.readFileSync(path.join(REPO_ROOT, file), 'utf8')
}

/** Every colour literal in the given sources, as sorted report lines. */
function violations(sources: Record<string, string>): string[] {
  const hits: Hit[] = []
  for (const [file, source] of Object.entries(sources)) hits.push(...hitsInSource(file, source))
  return sortHits(hits).map(formatHit)
}

const FILES = scanFiles()
const SOURCES: Record<string, string> = Object.fromEntries(FILES.map((f) => [f, readSource(f)]))
/** D-04 closeout: no file is allowed to keep a colour literal. Must stay empty. */
const LEGACY_PENDING: readonly string[] = []

describe('admin colour guard: regexes (D-04)', () => {
  it.each([
    "'#fff'",
    '"#B87333"',
    "'#B8733380'",
    "'rgba(0,0,0,0.5)'",
    "'hsl(10 20% 30%)'",
    "'color-mix(in srgb, red, blue)'",
    "{ color: 'white' }",
    '{ background: "black" }',
    "'oklch(0.5 0.1 200)'",
  ])('detects %s', (line) => {
    expect(literalsInLine(line).length).toBeGreaterThan(0)
  })

  it.each([
    "'&#10003;'",
    "'var(--admin-text)'",
    "'transparent'",
    "'currentColor'",
    "'inherit'",
    "'none'",
    "href='#section-1'",
    "{ border: '1px solid var(--admin-border)' }",
  ])('ignores %s', (line) => {
    expect(literalsInLine(line)).toEqual([])
  })
})

describe('admin colour guard: scan scope', () => {
  it('scans a non-empty, path-sorted file set', () => {
    expect(FILES.length).toBeGreaterThan(0)
    expect([...FILES].sort()).toEqual(FILES)
  })

  it('covers .ts and .tsx only (the .css token file is not scanned)', () => {
    for (const f of FILES) expect(['.ts', '.tsx']).toContain(path.extname(f))
  })

  it('never loses a SCOPE_FLOOR file', () => {
    for (const f of SCOPE_FLOOR) expect(FILES).toContain(f)
  })
})

describe('admin colour guard: report behaviour', () => {
  it('every literal fails', () => {
    const out = violations({ 'components/admin/X.tsx': "const a = '#123456'\nconst b = 'rgba(1,2,3,0.5)'" })
    expect(out).toHaveLength(2)
  })

  it('a file with zero literals passes', () => {
    expect(violations({ 'components/admin/Y.tsx': "const a = 'var(--admin-text)'" })).toEqual([])
  })

  it('names file:line literal -> token, sorted by file then line', () => {
    const out = violations(
      {
        'components/admin/B.tsx': "x\ny = '#f87171'",
        'components/admin/A.tsx': "a = '#b87333'\nb\nc = '#4ade80'",
      },
    )
    expect(out).toEqual([
      'components/admin/A.tsx:1 #b87333 -> --admin-accent',
      'components/admin/A.tsx:3 #4ade80 -> --status-ok-fg',
      'components/admin/B.tsx:2 #f87171 -> --status-danger-fg',
    ])
  })
})

describe('admin colour guard: the tree (ADM-03, D-04 closeout)', () => {
  it('LEGACY_PENDING is empty: no admin file is allowed a colour literal', () => {
    expect(LEGACY_PENDING).toHaveLength(0)
  })

  it('the pending-ledger directory no longer exists and must not come back', () => {
    expect(fs.existsSync(path.join(REPO_ROOT, REMOVED_LEDGER_DIR))).toBe(false)
  })

  it('has no colour literal in any admin .ts/.tsx', () => {
    expect(violations(SOURCES)).toEqual([])
  })
})
