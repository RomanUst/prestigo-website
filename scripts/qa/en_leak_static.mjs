#!/usr/bin/env node
/**
 * scripts/qa/en_leak_static.mjs — D-06 static layer of the two-layer EN-leak
 * audit (Phase 75 Plan 02, VER-01).
 *
 * AST scan of app/[locale]/** and components/** .tsx files for:
 *   R1 — hardcoded JSX text (2+ non-allowlisted Latin words)
 *   R2 — hardcoded string-literal placeholder/aria-label/alt/title/label attrs
 *   R3 — locale-dropping navigation: a raw <a href="/..."> (string or
 *        template literal), a default import from 'next/link', a useRouter
 *        import from 'next/navigation', or a redirect() call (from
 *        'next/navigation') with a root-relative string-literal argument
 *   R4 — object-literal title/body/q/a/name/description leaves (review-only,
 *        never fails the run) — excluded when the enclosing variable/
 *        property is named schema/jsonLd/ld/graph/metadata, or the literal
 *        is returned from a function named generateMetadata
 *
 * Uses the repo's already-installed `typescript` package via createRequire
 * — no new dependency (T-75-SC: package installs are the one thing this
 * scanner must never need).
 *
 * Exports:
 *   scanSource(code, filename) -> Finding[]   { file, line, rule, text }
 *   scanTree(rootDir) -> Finding[]            walks rootDir/app/[locale] and
 *                                              rootDir/components recursively
 *
 * CLI: node scripts/qa/en_leak_static.mjs [--json out.json] [--rule R1|R2|R3|R4]
 *      Exits 1 when any non-allowlisted R1/R2/R3 finding remains, 0 otherwise.
 *      R4 findings never affect the exit code.
 */
import { createRequire } from 'node:module'
import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const ts = require('typescript')

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ALLOWLIST_PATH = path.join(__dirname, 'en_leak_allowlist.json')

/** Loaded once at module scope — the single allowlist both audit layers read (Task 2 / en_leak_rendered.py). */
export const allowlist = JSON.parse(readFileSync(ALLOWLIST_PATH, 'utf8'))

const TEXT_ALLOW_TOKENS = [...(allowlist.dnt ?? []), ...(allowlist.placeNames ?? []), ...(allowlist.tierNames ?? [])]
  .map((e) => e.value)
  .filter(Boolean)
  .sort((a, b) => b.length - a.length)

const STATIC_IGNORE = allowlist.staticIgnoreFiles ?? []

const ATTR_NAMES_R2 = new Set(['placeholder', 'aria-label', 'alt', 'title', 'label'])
const R4_KEY_NAMES = new Set(['title', 'body', 'q', 'a', 'name', 'description'])
const EXCLUDED_NAME_PATTERN = /schema|jsonld|ld|graph|metadata/i
const ASSET_EXT_RE = /\.[a-zA-Z0-9]{1,5}$/

/** Removes every allowlisted DNT/place/tier token from `text` (plain substring removal — values may contain regex metacharacters). */
function stripAllowlistedTokens(text) {
  let result = text
  for (const tok of TEXT_ALLOW_TOKENS) {
    if (tok) result = result.split(tok).join(' ')
  }
  return result
}

/** True when, after allowlist stripping, `text` still contains 2+ Latin words (2+ letters) and at least one lowercase letter. */
function isEnglishLeak(rawText) {
  const stripped = stripAllowlistedTokens(rawText)
  const words = stripped.match(/[A-Za-z]{2,}/g) || []
  if (words.length < 2) return false
  if (!/[a-z]/.test(stripped)) return false
  return true
}

function lineOf(sourceFile, node) {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1
}

/** Returns the literal text preceding the first substitution (or the whole string for non-template literals), or null for a non-literal expression. */
function literalHeadText(expr) {
  if (!expr) return null
  if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) return expr.text
  if (ts.isTemplateExpression(expr)) return expr.head.text
  return null
}

/** True when `text` is a root-relative path that would drop the locale prefix if used in a raw <a href>. */
function isLocaleDroppingHref(text) {
  if (typeof text !== 'string') return false
  if (!text.startsWith('/')) return false
  if (text.startsWith('//')) return false
  if (text.startsWith('/api/')) return false
  if (text.startsWith('/_next/')) return false
  if (ASSET_EXT_RE.test(text)) return false
  return true
}

function hasHreflangSibling(openingElementLike) {
  const attrs = openingElementLike?.attributes?.properties ?? []
  return attrs.some((a) => ts.isJsxAttribute(a) && a.name && a.name.getText() === 'hreflang')
}

/** True when `node` is lexically inside a variable/property named schema/jsonLd/ld/graph/metadata, or inside a function named generateMetadata (R4 exclusion). */
function isExcludedByAncestorName(node) {
  let current = node.parent
  while (current) {
    if (ts.isVariableDeclaration(current) && ts.isIdentifier(current.name) && EXCLUDED_NAME_PATTERN.test(current.name.text)) {
      return true
    }
    if (
      ts.isPropertyAssignment(current) &&
      (ts.isIdentifier(current.name) || ts.isStringLiteral(current.name)) &&
      EXCLUDED_NAME_PATTERN.test(current.name.text)
    ) {
      return true
    }
    if (
      (ts.isFunctionDeclaration(current) || ts.isFunctionExpression(current)) &&
      current.name &&
      /generateMetadata/i.test(current.name.text)
    ) {
      return true
    }
    current = current.parent
  }
  return false
}

/**
 * Parses `code` (filename used only for diagnostics/TSX-mode) and returns
 * every R1/R2/R3/R4 finding. Pure function — no filesystem access beyond the
 * allowlist already loaded at module scope.
 */
export function scanSource(code, filename) {
  const sourceFile = ts.createSourceFile(filename, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const findings = []

  // Pass 1: collect next/navigation `redirect` local binding name(s) and
  // flag next/link default imports + next/navigation useRouter imports.
  const redirectLocalNames = new Set()
  function collectImports(node) {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const mod = node.moduleSpecifier.text
      if (mod === 'next/link' && node.importClause?.name) {
        findings.push({
          file: filename,
          line: lineOf(sourceFile, node),
          rule: 'R3',
          text: `default import from next/link ('${node.importClause.name.text}')`,
        })
      }
      if (mod === 'next/navigation' && node.importClause?.namedBindings && ts.isNamedImports(node.importClause.namedBindings)) {
        for (const el of node.importClause.namedBindings.elements) {
          const original = el.propertyName?.text ?? el.name.text
          if (original === 'useRouter') {
            findings.push({
              file: filename,
              line: lineOf(sourceFile, node),
              rule: 'R3',
              text: 'useRouter imported from next/navigation',
            })
          }
          if (original === 'redirect') {
            redirectLocalNames.add(el.name.text)
          }
        }
      }
    }
    ts.forEachChild(node, collectImports)
  }
  collectImports(sourceFile)

  // Pass 2: JSX text / attrs / anchor hrefs / redirect() calls / R4 leaves.
  function visit(node) {
    if (ts.isJsxText(node)) {
      const trimmed = node.text.trim()
      if (trimmed && isEnglishLeak(trimmed)) {
        findings.push({ file: filename, line: lineOf(sourceFile, node), rule: 'R1', text: trimmed.slice(0, 120) })
      }
    } else if (ts.isJsxAttribute(node)) {
      const attrName = node.name.getText()

      if (ATTR_NAMES_R2.has(attrName) && node.initializer) {
        const inner = ts.isJsxExpression(node.initializer) ? node.initializer.expression : node.initializer
        const text = inner && ts.isStringLiteral(inner) ? inner.text : null
        if (text && isEnglishLeak(text)) {
          findings.push({
            file: filename,
            line: lineOf(sourceFile, node),
            rule: 'R2',
            text: `${attrName}="${text.slice(0, 100)}"`,
          })
        }
      }

      if (attrName === 'href') {
        const jsxAttributesNode = node.parent
        const openingLike = jsxAttributesNode?.parent // JsxOpeningElement | JsxSelfClosingElement
        const tag = openingLike?.tagName
        if (tag && ts.isIdentifier(tag) && tag.text === 'a' && node.initializer) {
          const inner = ts.isJsxExpression(node.initializer) ? node.initializer.expression : node.initializer
          const text = literalHeadText(inner)
          if (text !== null && isLocaleDroppingHref(text) && !hasHreflangSibling(openingLike)) {
            findings.push({ file: filename, line: lineOf(sourceFile, node), rule: 'R3', text: `href="${text}"` })
          }
        }
      }
    } else if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && redirectLocalNames.has(node.expression.text)) {
      const arg = node.arguments[0]
      if (arg && ts.isStringLiteral(arg) && arg.text.startsWith('/')) {
        findings.push({ file: filename, line: lineOf(sourceFile, node), rule: 'R3', text: `redirect('${arg.text}')` })
      }
    } else if (
      ts.isPropertyAssignment(node) &&
      (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)) &&
      R4_KEY_NAMES.has(node.name.text) &&
      (ts.isStringLiteral(node.initializer) || ts.isNoSubstitutionTemplateLiteral(node.initializer))
    ) {
      const text = node.initializer.text
      if (isEnglishLeak(text) && !isExcludedByAncestorName(node)) {
        findings.push({
          file: filename,
          line: lineOf(sourceFile, node),
          rule: 'R4',
          text: `${node.name.text}: "${text.slice(0, 100)}"`,
        })
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)

  findings.sort((a, b) => a.line - b.line)
  return findings
}

function existsInternal(p) {
  try {
    statSync(p)
    return true
  } catch {
    return false
  }
}

function getIgnoreEntry(relPath) {
  return STATIC_IGNORE.find((e) => e.value === relPath)
}

function walkDir(dir, rootDir, skipAdmin, findings) {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '.next') continue
    if (skipAdmin && entry.name === 'admin') continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walkDir(full, rootDir, skipAdmin, findings)
    } else if (entry.isFile() && entry.name.endsWith('.tsx')) {
      const relPath = path.relative(rootDir, full).split(path.sep).join('/')
      const code = readFileSync(full, 'utf8')
      const fileFindings = scanSource(code, relPath)
      const ignoreEntry = getIgnoreEntry(relPath)
      if (!ignoreEntry) {
        findings.push(...fileFindings)
        continue
      }
      const ignoredRules =
        Array.isArray(ignoreEntry.rules) && ignoreEntry.rules.length ? new Set(ignoreEntry.rules) : new Set(['R1', 'R2', 'R3', 'R4'])
      findings.push(...fileFindings.filter((f) => !ignoredRules.has(f.rule)))
    }
  }
}

/** Walks rootDir/app/[locale] and rootDir/components recursively (skip app/admin, skip staticIgnoreFiles per-file/per-rule). */
export function scanTree(rootDir) {
  const findings = []
  const roots = [
    { dir: path.join(rootDir, 'app', '[locale]'), skipAdmin: true },
    { dir: path.join(rootDir, 'components'), skipAdmin: false },
  ]
  for (const { dir, skipAdmin } of roots) {
    if (!existsInternal(dir)) continue
    walkDir(dir, rootDir, skipAdmin, findings)
  }
  return findings.sort((a, b) => (a.file === b.file ? a.line - b.line : a.file.localeCompare(b.file)))
}

function main() {
  const args = process.argv.slice(2)
  const jsonIdx = args.indexOf('--json')
  const jsonOut = jsonIdx >= 0 ? args[jsonIdx + 1] : null
  const ruleIdx = args.indexOf('--rule')
  const ruleFilter = ruleIdx >= 0 ? args[ruleIdx + 1] : null

  const rootDir = process.cwd()
  let findings = scanTree(rootDir)
  if (ruleFilter) findings = findings.filter((f) => f.rule === ruleFilter)

  const byFile = new Map()
  for (const f of findings) {
    if (!byFile.has(f.file)) byFile.set(f.file, { R1: 0, R2: 0, R3: 0, R4: 0 })
    byFile.get(f.file)[f.rule]++
  }
  const files = [...byFile.keys()].sort()
  console.log('File'.padEnd(72), 'R1', 'R2', 'R3', 'R4')
  for (const f of files) {
    const c = byFile.get(f)
    console.log(f.padEnd(72), c.R1, c.R2, c.R3, c.R4)
  }
  console.log(`\n${files.length} files with findings, ${findings.length} total findings`)

  if (jsonOut) {
    mkdirSync(path.dirname(jsonOut), { recursive: true })
    writeFileSync(jsonOut, JSON.stringify(findings, null, 2))
    console.log(`\nWrote ${jsonOut}`)
  }

  const failing = findings.filter((f) => f.rule !== 'R4')
  process.exit(failing.length > 0 ? 1 : 0)
}

const isMain = (() => {
  try {
    return import.meta.url === `file://${path.resolve(process.argv[1] ?? '')}`
  } catch {
    return false
  }
})()
if (isMain) {
  main()
}
