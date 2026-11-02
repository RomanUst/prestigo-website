// @vitest-environment node
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

/**
 * Phase 86 (ADM-01/02/03, D-02, D-03, D-05, D-07, OQ2): contract test for the
 * admin theme stylesheet. It parses app/(internal)/admin/admin-theme.css and
 * checks scoping, token parity between the two themes, token completeness
 * against the TSX that references them, the light legacy-variable remap,
 * status families, WCAG contrast of the documented pairs and that
 * app/globals.css .theme-light (the public ivory section theme) is untouched.
 */

const REPO_ROOT = path.resolve(__dirname, '..')
const CSS_PATH = 'app/(internal)/admin/admin-theme.css'
const LIGHT_SEL = '.admin-shell[data-admin-theme="light"]'
const DARK_SEL = '.admin-shell[data-admin-theme="dark"]'
const BASE_SEL = '.admin-shell'

interface Rule {
  selectors: string[]
  decls: Map<string, string>
  media: string | null
}

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '')
}

/** Split on commas that are not nested inside (), [] or quotes. */
function splitTopLevel(text: string, sep: string): string[] {
  const out: string[] = []
  let depth = 0
  let quote = ''
  let cur = ''
  for (const ch of text) {
    if (quote) {
      cur += ch
      if (ch === quote) quote = ''
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      cur += ch
      continue
    }
    if (ch === '(' || ch === '[') depth++
    if (ch === ')' || ch === ']') depth--
    if (ch === sep && depth === 0) {
      out.push(cur)
      cur = ''
      continue
    }
    cur += ch
  }
  out.push(cur)
  return out.map((s) => s.trim()).filter(Boolean)
}

function parseDecls(body: string): Map<string, string> {
  const map = new Map<string, string>()
  for (const part of splitTopLevel(body, ';')) {
    const idx = part.indexOf(':')
    if (idx < 0) continue
    map.set(part.slice(0, idx).trim(), part.slice(idx + 1).trim())
  }
  return map
}

/** Brace-depth parser; descends into @media blocks (one level is enough here). */
function parseRules(src: string, media: string | null = null): Rule[] {
  const rules: Rule[] = []
  let i = 0
  while (i < src.length) {
    const open = src.indexOf('{', i)
    if (open < 0) break
    const prelude = src.slice(i, open).trim()
    let depth = 1
    let j = open + 1
    while (j < src.length && depth > 0) {
      if (src[j] === '{') depth++
      else if (src[j] === '}') depth--
      j++
    }
    const body = src.slice(open + 1, j - 1)
    if (prelude.startsWith('@media')) {
      rules.push(...parseRules(body, prelude))
    } else if (prelude.startsWith('@')) {
      // @keyframes, @supports ... not used by the admin sheet; ignore the body.
    } else if (prelude) {
      rules.push({ selectors: splitTopLevel(prelude, ','), decls: parseDecls(body), media })
    }
    i = j
  }
  return rules
}

const css = stripComments(fs.readFileSync(path.join(REPO_ROOT, CSS_PATH), 'utf8'))
const rules = parseRules(css)

function ruleBySelector(selector: string): Rule {
  const found = rules.find((r) => !r.media && r.selectors.length === 1 && r.selectors[0] === selector)
  if (!found) throw new Error(`no top-level rule with selector ${selector}`)
  return found
}

const light = ruleBySelector(LIGHT_SEL)
const dark = ruleBySelector(DARK_SEL)
const base = ruleBySelector(BASE_SEL)

const TOKEN_RE = /^--(?:admin|status)-/
const tokenNames = (r: Rule) => [...r.decls.keys()].filter((k) => TOKEN_RE.test(k)).sort()

// --- contrast helpers (WCAG 2.x relative luminance) -------------------------

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function luminance([r, g, b]: [number, number, number]): number {
  const lin = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

/** Contrast ratio for two 6-digit hex values, or null when either is not one. */
function contrast(fg: string, bg: string): number | null {
  const a = hexToRgb(fg)
  const b = hexToRgb(bg)
  if (!a || !b) return null
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

// --- filesystem helpers -----------------------------------------------------

function walk(rel: string, out: string[] = []): string[] {
  const abs = path.join(REPO_ROOT, rel)
  if (!fs.existsSync(abs)) return out
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    const p = `${rel}/${e.name}`
    if (e.isDirectory()) walk(p, out)
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(p)
  }
  return out.sort()
}

const STATUS_FAMILIES = ['ok', 'danger', 'warn', 'amber', 'info', 'teal', 'violet', 'neutral']
const LEGACY_BARE = [
  '--anthracite',
  '--anthracite-mid',
  '--anthracite-light',
  '--offwhite',
  '--warmgrey',
  '--copper',
  '--copper-light',
  '--copper-pale',
]
const LEGACY_COLOR = LEGACY_BARE.map((n) => `--color-${n.slice(2)}`)

describe('admin-theme.css scoping (D-02, T-86-05)', () => {
  it('parses the three core rules', () => {
    expect(base.decls.size).toBeGreaterThan(0)
    expect(light.decls.size).toBeGreaterThan(0)
    expect(dark.decls.size).toBeGreaterThan(0)
  })

  it('every selector starts with .admin-shell except the single OQ2 html/body edge rule', () => {
    const edgeStart = [
      'html:has(.admin-shell[data-admin-theme="light"])',
      'body:has(.admin-shell[data-admin-theme="light"])',
    ]
    const offenders: string[] = []
    const edgeRules: Rule[] = []
    for (const r of rules) {
      const scoped = r.selectors.every((s) => s.startsWith('.admin-shell'))
      if (scoped) continue
      const isEdge = r.selectors.every((s) => edgeStart.some((e) => s.startsWith(e)))
      if (isEdge) edgeRules.push(r)
      else offenders.push(r.selectors.join(', '))
    }
    expect(offenders).toEqual([])
    expect(edgeRules).toHaveLength(1)
    const allowed = new Set(['background', 'background-color', 'color-scheme'])
    for (const prop of edgeRules[0].decls.keys()) expect(allowed.has(prop)).toBe(true)
    expect(edgeRules[0].media).toBeNull()
  })

  it('no selector mentions :root or .theme-light', () => {
    for (const r of rules) {
      for (const s of r.selectors) {
        expect(s).not.toContain(':root')
        expect(s).not.toContain('.theme-light')
      }
    }
  })

  it('never touches Google Maps attribution (gm-style, gmnoprint)', () => {
    for (const r of rules) {
      for (const s of r.selectors) {
        expect(s).not.toContain('gm-style')
        expect(s).not.toContain('gmnoprint')
      }
    }
  })

  it('wrapper rules declare nothing that creates a containing block', () => {
    const banned = ['transform', 'filter', 'will-change', 'contain', 'perspective', 'backdrop-filter']
    for (const r of rules) {
      const wrapperRule = r.selectors.some((s) => s === BASE_SEL || /^\.admin-shell\[data-admin-theme="[a-z]+"\]$/.test(s))
      if (!wrapperRule) continue
      for (const prop of banned) expect(r.decls.has(prop)).toBe(false)
    }
  })
})

describe('admin-theme.css token parity (D-03, D-07)', () => {
  it('light and dark declare identical --admin-* / --status-* name sets', () => {
    expect(tokenNames(light)).toEqual(tokenNames(dark))
    expect(tokenNames(light).length).toBeGreaterThan(40)
  })

  it.each(STATUS_FAMILIES)('status family %s has -fg, -bg, -border in both themes', (family) => {
    for (const r of [light, dark]) {
      for (const part of ['fg', 'bg', 'border']) {
        expect(r.decls.has(`--status-${family}-${part}`)).toBe(true)
      }
    }
  })

  it('sidebar and content surfaces never merge (adjacency)', () => {
    for (const r of [light, dark]) {
      expect(r.decls.get('--admin-sidebar-bg')).toBeTruthy()
      expect(r.decls.get('--admin-sidebar-bg')).not.toBe(r.decls.get('--admin-bg'))
    }
  })
})

describe('admin-theme.css completeness', () => {
  const declared = new Set([
    ...tokenNames(base),
    ...tokenNames(light).filter((n) => tokenNames(dark).includes(n)),
  ])
  const consumers = [
    ...walk('components/admin'),
    ...walk('app/(internal)/admin'),
    'components/booking/steps/Step5Passenger.tsx',
    'components/booking/steps/Step1TripType.tsx',
    'components/booking/steps/Step2DateTime.tsx',
    'components/booking/AddressInput.tsx',
  ]

  it('every referenced --admin-* / --status-* var is declared for both themes', () => {
    const missing: string[] = []
    for (const f of consumers) {
      const abs = path.join(REPO_ROOT, f)
      if (!fs.existsSync(abs)) continue
      const src = fs.readFileSync(abs, 'utf8')
      for (const m of src.matchAll(/var\(\s*(--(?:admin|status)-[a-z0-9-]+)/g)) {
        if (!declared.has(m[1])) missing.push(`${f}: ${m[1]}`)
      }
    }
    expect(missing).toEqual([])
  })
})

describe('admin-theme.css light legacy remap (D-05)', () => {
  it('light remaps the 8 bare legacy vars, the 8 --color-* twins and --font-cormorant', () => {
    for (const n of [...LEGACY_BARE, ...LEGACY_COLOR]) expect(light.decls.has(n)).toBe(true)
    expect(light.decls.get('--font-cormorant')).toBe('var(--admin-font-heading)')
  })

  it('dark declares none of them (dark keeps the global navy palette)', () => {
    for (const n of [...LEGACY_BARE, ...LEGACY_COLOR, '--font-cormorant']) expect(dark.decls.has(n)).toBe(false)
  })

  it('app/globals.css .theme-light still holds the public ivory values', () => {
    const globals = fs.readFileSync(path.join(REPO_ROOT, 'app/globals.css'), 'utf8')
    expect(globals).toContain('.theme-light')
    expect(globals).toContain('--anthracite: #EFE8DA;')
    expect(globals).toContain('--offwhite: #16202A;')
    expect(globals).toContain('--copper: #8C6A34;')
    expect(globals).toContain('--warmgrey: #5E6B75;')
  })
})

describe('admin-theme.css contrast (WCAG)', () => {
  type Pair = { fg: string; bg: string; min: number }
  const t = (r: Rule, n: string) => {
    const v = r.decls.get(n)
    if (!v) throw new Error(`token ${n} not declared`)
    return v
  }

  function pairsFor(r: Rule): Pair[] {
    const pairs: Pair[] = []
    const add = (fg: string, bg: string, min = 4.5) => pairs.push({ fg, bg, min })
    for (const bg of ['--admin-bg', '--admin-sidebar-bg', '--admin-surface', '--admin-hover', '--admin-input-bg', '--admin-sidebar-active']) {
      add('--admin-text', bg)
    }
    for (const bg of ['--admin-bg', '--admin-sidebar-bg', '--admin-surface', '--admin-hover']) {
      add('--admin-text-muted', bg)
    }
    for (const fg of ['--admin-accent-text', '--admin-accent']) {
      for (const bg of ['--admin-bg', '--admin-sidebar-bg', '--admin-surface']) add(fg, bg)
    }
    add('--admin-kpi-label', '--admin-surface')
    add('--admin-on-accent', '--admin-accent')
    add('--admin-on-danger', '--admin-danger-solid')
    add('--admin-tooltip-fg', '--admin-tooltip-bg')
    for (const f of STATUS_FAMILIES) {
      add(`--status-${f}-fg`, `--status-${f}-bg`)
      add(`--status-${f}-fg`, '--admin-bg')
    }
    for (const bg of ['--admin-input-bg', '--admin-bg']) add('--admin-border-strong', bg, 3)
    for (const bg of ['--admin-bg', '--admin-surface']) add('--admin-focus', bg, 3)
    void r
    return pairs
  }

  for (const [name, rule] of [['light', light], ['dark', dark]] as const) {
    it(`${name}: every listed pair reaches its threshold and none is skipped`, () => {
      const failures: string[] = []
      const skipped: string[] = []
      for (const p of pairsFor(rule)) {
        const fg = t(rule, p.fg)
        const bg = t(rule, p.bg)
        const ratio = contrast(fg, bg)
        if (ratio === null) {
          skipped.push(`${p.fg} (${fg}) on ${p.bg} (${bg})`)
          continue
        }
        if (ratio < p.min) failures.push(`${p.fg} ${fg} on ${p.bg} ${bg}: ${ratio.toFixed(2)} < ${p.min}`)
      }
      expect(skipped).toEqual([])
      expect(failures).toEqual([])
    })
  }
})

describe('admin-theme.css sidebar rail contract (ADM-01, D-13, D-16)', () => {
  const DESKTOP = /min-width:\s*768px/
  const inDesktop = (r: Rule) => r.media !== null && DESKTOP.test(r.media)
  const has = (r: Rule, sel: string) => r.selectors.includes(sel)

  it('the base wrapper declares the expanded width token (280px)', () => {
    expect(base.decls.get('--admin-sidebar-w')).toBe('280px')
  })

  it('the only 72px width declaration is the collapsed wrapper inside the desktop media block', () => {
    const narrow = rules.filter((r) => r.decls.get('--admin-sidebar-w') === '72px')
    expect(narrow).toHaveLength(1)
    expect(narrow[0].selectors).toEqual(['.admin-shell[data-admin-sidebar="collapsed"]'])
    expect(inDesktop(narrow[0])).toBe(true)
  })

  it('every selector that mentions the collapsed state sits inside a (min-width: 768px) block (Pitfall 5)', () => {
    const offenders: string[] = []
    let seen = 0
    for (const r of rules) {
      for (const s of r.selectors) {
        if (!s.includes('data-admin-sidebar="collapsed"')) continue
        seen++
        if (!inDesktop(r)) offenders.push(s)
      }
    }
    expect(offenders).toEqual([])
    expect(seen).toBeGreaterThan(0)
  })

  it('main margin and aside width both resolve from the single --admin-sidebar-w value', () => {
    const main = rules.find((r) => inDesktop(r) && has(r, '.admin-shell .admin-main'))
    const aside = rules.find((r) => inDesktop(r) && has(r, '.admin-shell .admin-aside') && r.decls.has('width'))
    expect(main?.decls.get('margin-left')).toBe('var(--admin-sidebar-w)')
    expect(aside?.decls.get('width')).toBe('var(--admin-sidebar-w)')
    expect(main?.decls.get('transition')).toContain('200ms')
    expect(aside?.decls.get('transition')).toContain('200ms')
  })

  it('below 768px main has no left margin and the aside is a fixed 280px panel', () => {
    const main = rules.find((r) => r.media === null && has(r, '.admin-shell .admin-main'))
    const aside = rules.find((r) => r.media === null && has(r, '.admin-shell .admin-aside'))
    expect(main?.decls.get('margin-left')).toBe('0')
    expect(aside?.decls.get('width')).toBe('280px')
    expect(aside?.decls.get('position')).toBe('fixed')
  })

  it('collapsed nav labels use the visually-hidden pattern, never display: none', () => {
    const hidden = rules.find((r) => has(r, '.admin-shell[data-admin-sidebar="collapsed"] .admin-nav-label'))
    expect(hidden).toBeDefined()
    expect(hidden?.decls.get('position')).toBe('absolute')
    expect(hidden?.decls.get('clip')).toBe('rect(0 0 0 0)')
    expect(hidden?.decls.has('display')).toBe(false)
  })

  it('the collapse button is desktop-only through CSS', () => {
    const sel = '.admin-shell .admin-icon-btn.admin-collapse-btn'
    const top = rules.find((r) => r.media === null && has(r, sel))
    const wide = rules.find((r) => inDesktop(r) && has(r, sel))
    expect(top?.decls.get('display')).toBe('none')
    expect(wide?.decls.get('display')).toBe('inline-flex')
  })

  it('prefers-reduced-motion switches both width transitions off', () => {
    const reduced = rules.find(
      (r) => r.media !== null && /prefers-reduced-motion:\s*reduce/.test(r.media) && has(r, '.admin-shell .admin-main'),
    )
    expect(reduced).toBeDefined()
    expect(reduced?.selectors).toContain('.admin-shell .admin-aside')
    expect(reduced?.decls.get('transition')).toBe('none')
  })
})

describe('admin-theme.css light safety net (D-08, D-10, Pitfall 1)', () => {
  const styleSelectors = rules.flatMap((r) => r.selectors.filter((s) => s.includes('[style*=')))
  const subOf = (s: string) => /\[style\*="([^"]+)"\]/.exec(s)?.[1] ?? ''
  const subs = styleSelectors.map(subOf)

  it('declares the four serialisation selectors', () => {
    for (const form of ['text-transform:uppercase', 'text-transform: uppercase', 'font-weight:300', 'font-weight: 300']) {
      expect(styleSelectors).toContain(`${LIGHT_SEL} [style*="${form}"]`)
    }
  })

  it('every no-space selector has its spaced twin and vice versa', () => {
    expect(subs.length).toBeGreaterThan(0)
    for (const sub of subs) {
      const twin = sub.includes(': ') ? sub.replace(': ', ':') : sub.replace(':', ': ')
      expect(subs).toContain(twin)
    }
  })

  it('no [style*=] selector is scoped to the dark theme or unscoped', () => {
    for (const s of styleSelectors) {
      expect(s.startsWith(LIGHT_SEL)).toBe(true)
      expect(s).not.toContain('data-admin-theme="dark"')
    }
  })

  it('uppercase rule resets case and tracking, weight rule lifts 300 to 400', () => {
    const upper = rules.find((r) => r.selectors.includes(`${LIGHT_SEL} [style*="text-transform:uppercase"]`))
    const weight = rules.find((r) => r.selectors.includes(`${LIGHT_SEL} [style*="font-weight:300"]`))
    expect(upper?.decls.get('text-transform')).toBe('none !important')
    expect(upper?.decls.get('letter-spacing')).toBe('normal !important')
    expect(weight?.decls.get('font-weight')).toBe('400 !important')
  })
})
