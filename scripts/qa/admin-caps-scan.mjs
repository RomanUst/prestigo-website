#!/usr/bin/env node
// Phase 86 D-10: capital-typed label scanner for the admin.
//
// The light admin theme uses sentence case, and a CSS safety net can only undo
// text-transform. Labels typed in capitals in the source (label="THIS WEEK",
// own-line JSX text, column arrays) need a manual edit. This scanner lists them.
//
// Usage:
//   node scripts/qa/admin-caps-scan.mjs [file ...]
// With no arguments it scans every .tsx under components/admin and
// app/(internal)/admin. Output is one `file:line text` per match, sorted by
// file then line. Exit code 1 when anything is listed, 0 otherwise.
//
// Escape hatches: put `caps-ok` anywhere on a line to skip it (acronyms and
// codes that must stay capitals), or extend ALLOWLIST below for values that
// are capitals everywhere (HTTP verbs, currency codes, the PRESTIGO wordmark).

import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

const DEFAULT_ROOTS = ['components/admin', 'app/(internal)/admin']

const ALLOWLIST = new Set([
  'PRESTIGO',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'GET',
  'CZK',
  'EUR',
  'VAT ID',
  'SUMMER20',
  'DASH',
])

const SKIP_MARKER = 'caps-ok'

// Capitals, digits, accented capitals (U+00C0-U+017D, so REG / IČO is caught),
// space and the punctuation & / ( ) — : ' . -
const CAP_CHARS = "A-Z0-9\\u00C0-\\u017D &/()\\u2014:'.?!\\-"
const CAP_RUN = `[${CAP_CHARS}]+`
const TWO_CAPITALS = /[A-ZÀ-Ž]{2}/

// (a) JSX text after a `>` that runs to the next `<` or `{`.
const JSX_TEXT = new RegExp(`>(${CAP_RUN})(?=[<{]|$)`, 'g')
// (b) a line made only of capitals text and {...} expressions (own-line JSX text,
// headers such as a step counter: NEW BOOKING — STEP {n} OF 6).
const OWN_LINE = new RegExp(`^\\s*((?:[${CAP_CHARS}]|\\{[^}]*\\})+)\\s*$`)
// (c) a quoted literal made only of capitals text (label="THIS WEEK", column arrays).
//     The class is rebuilt per delimiter so a run can never cross its own closing
//     quote ('RETURN' : 'OUTBOUND' is two literals, not one).
const quotedFor = (quote) => {
  const chars = CAP_CHARS.split(quote).join('')
  return new RegExp(`${quote}([${chars}]+)${quote}`, 'g')
}
const QUOTED = [quotedFor('"'), quotedFor("'"), quotedFor('`')]

function walk(dir, out = []) {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (entry.isFile() && entry.name.endsWith('.tsx')) out.push(full)
  }
  return out
}

function isCommentLine(trimmed) {
  return trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*') || trimmed.startsWith('{/*')
}

function keep(text) {
  const t = text.trim()
  if (!t) return null
  // Own-line matches may contain {...} expressions; judge each text segment
  // outside them (so `{amount} EUR` passes through the allowlist).
  const segments = t.split(/\{[^}]*\}/).map((seg) => seg.trim()).filter(Boolean)
  const flagged = segments.some((seg) => TWO_CAPITALS.test(seg) && !ALLOWLIST.has(seg))
  return flagged ? t : null
}

function scanSource(file, source) {
  const hits = []
  source.split('\n').forEach((line, i) => {
    const trimmed = line.trim()
    if (!trimmed || isCommentLine(trimmed) || line.includes(SKIP_MARKER)) return
    const found = new Set()
    for (const m of line.matchAll(JSX_TEXT)) {
      const t = keep(m[1])
      if (t) found.add(t)
    }
    const own = OWN_LINE.exec(line)
    if (own) {
      const t = keep(own[1])
      if (t) found.add(t)
    }
    for (const re of QUOTED) {
      for (const m of line.matchAll(re)) {
        const t = keep(m[1])
        if (t) found.add(t)
      }
    }
    for (const text of found) hits.push({ file, line: i + 1, text })
  })
  return hits
}

function main() {
  const args = process.argv.slice(2)
  const files = args.length > 0 ? args : DEFAULT_ROOTS.flatMap((root) => walk(root))
  const hits = []
  for (const file of files) {
    const rel = path.relative(process.cwd(), path.resolve(file)).split(path.sep).join('/')
    hits.push(...scanSource(rel, readFileSync(file, 'utf8')))
  }
  hits.sort((a, b) => (a.file === b.file ? a.line - b.line : a.file.localeCompare(b.file)))
  for (const h of hits) console.log(`${h.file}:${h.line} ${h.text}`)
  process.exit(hits.length > 0 ? 1 : 0)
}

main()
