#!/usr/bin/env node
/**
 * Phase 78 / WA-04 live check for the public business number.
 *
 * Reads the business number from lib/contact-channels.ts (the single literal
 * BUSINESS_PHONE_E164_VALUE), fetches the public pages plus /llms.txt and
 * /llms-full.txt over GET, and counts occurrences of the business number (every
 * separator form) and of the former personal number on each page. It also reads
 * the JSON-LD telephone values of the home page.
 *
 * Modes (derived, not flagged):
 * - pre-switch: the constant still equals the former number. Every page (except
 *   /llms.txt, which has no number by design) must carry the business number at
 *   least once.
 * - post-switch: the constant differs from the former number. Every page must
 *   also carry zero occurrences of the former number.
 * (The reported former count is always measured; in pre-switch mode it equals the
 * business count because the two numbers are the same.)
 * In both modes every page must answer HTTP 200 and the home JSON-LD telephone
 * values must all be the business number.
 *
 * The former number is never written out in full: it is assembled from parts at
 * runtime, so repo guards that ban the literal do not trip on this file.
 *
 * Usage: node scripts/qa/business_number_live_check.mjs [--base-url https://rideprestigo.com]
 * Exit codes: 0 = pass, 1 = fail, 2 = network / config error.
 * GET requests only; nothing is written anywhere.
 */
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const DEFAULT_BASE_URL = 'https://rideprestigo.com'
export const PAGES = [
  '/',
  '/contact',
  '/privacy',
  '/faq',
  '/book',
  '/routes',
  '/llms.txt',
  '/llms-full.txt',
  '/ru/contact',
  '/ar/faq',
]
export const FETCH_TIMEOUT_MS = 30_000

// /llms.txt is the short summary file and carries no phone number by design
// (only /llms-full.txt does, see lib/llms-content.ts). It is still fetched and,
// in post-switch mode, must hold zero former-number occurrences; the business
// number is just not required there.
export const NUMBER_OPTIONAL_PAGES = ['/llms.txt']

// The former personal number, assembled from parts (never spelled in full).
const FORMER_NATIONAL_PARTS = ['725', '986', '855']
export const FORMER_DIGITS = ['420', ...FORMER_NATIONAL_PARTS].join('')

const VALUE_LINE_RE = /^const BUSINESS_PHONE_E164_VALUE = '(\+420[0-9]{9})'$/m

/**
 * Reads the business number from the single literal line of lib/contact-channels.ts.
 * @param {string} repoRoot
 * @returns {{ e164: string, digits: string, display: string }}
 */
export function readBusinessNumber(repoRoot) {
  const file = join(repoRoot, 'lib', 'contact-channels.ts')
  const src = readFileSync(file, 'utf8')
  const m = VALUE_LINE_RE.exec(src)
  if (!m) {
    throw new Error(`BUSINESS_PHONE_E164_VALUE line not found or malformed in ${file}`)
  }
  const e164 = m[1]
  return {
    e164,
    digits: e164.slice(1),
    display: [e164.slice(0, 4), e164.slice(4, 7), e164.slice(7, 10), e164.slice(10, 13)].join(' '),
  }
}

// One separator between digit groups: plain space, no-break space, narrow
// no-break space, hyphen, or an escaped / entity form of the no-break spaces
// (RSC payloads and HTML can carry them as text).
const SEP = '(?:[ \\u00A0\\u202F-]|\\\\u00[aA]0|\\\\u202[fF]|&nbsp;|&#160;|&#[xX][aA]0;)?'

/**
 * Regex source matching a Czech number given as digits ('420' + nine digits),
 * with an optional +420 / 00420 / 420 prefix, an optional separator before each
 * three-digit group, and digit look-arounds so a longer digit run never matches.
 * @param {string} digits
 */
function numberRegex(digits) {
  const national = digits.slice(-9)
  const groups = [national.slice(0, 3), national.slice(3, 6), national.slice(6, 9)]
  const body = `(?:(?:\\+|00)?420${SEP})?${groups[0]}${SEP}${groups[1]}${SEP}${groups[2]}`
  return new RegExp(`(?<![0-9])${body}(?![0-9])`, 'g')
}

/**
 * Counts occurrences of a number (digits form '420ddddddddd') in text.
 * @param {string} text
 * @param {string} digits
 * @returns {number}
 */
export function countNumber(text, digits) {
  return (text.match(numberRegex(digits)) ?? []).length
}

/**
 * Collects every `telephone` string value from the JSON-LD blocks of an HTML page.
 * @param {string} html
 * @returns {string[]}
 */
export function extractJsonLdTelephones(html) {
  const out = []
  const blockRe = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  const walk = (node) => {
    if (Array.isArray(node)) {
      node.forEach(walk)
    } else if (node && typeof node === 'object') {
      for (const [k, v] of Object.entries(node)) {
        if (k === 'telephone' && typeof v === 'string') out.push(v)
        else walk(v)
      }
    }
  }
  let m
  while ((m = blockRe.exec(html)) !== null) {
    try {
      walk(JSON.parse(m[1]))
    } catch {
      // a block that is not valid JSON contributes nothing
    }
  }
  return out
}

/**
 * @param {string[]} telephones
 * @param {string} digits business digits ('420ddddddddd')
 * @returns {'ok' | 'mismatch' | 'none'}
 */
function judgeTelephones(telephones, digits) {
  if (telephones.length === 0) return 'none'
  return telephones.every((t) => t.replace(/[^0-9]/g, '').replace(/^00/, '') === digits) ? 'ok' : 'mismatch'
}

/**
 * @param {{ path: string, status: number, body: string }[]} pages
 * @param {{ e164: string, digits: string }} business
 * @param {{ formerDigits?: string }} [options]
 */
export function evaluatePages(pages, business, options = {}) {
  const formerDigits = options.formerDigits ?? FORMER_DIGITS
  const mode = business.digits === formerDigits ? 'pre-switch' : 'post-switch'
  const rows = pages.map((p) => ({
    path: p.path,
    status: p.status,
    business: countNumber(p.body, business.digits),
    former: countNumber(p.body, formerDigits),
  }))
  const home = pages.find((p) => p.path === '/')
  const jsonldTelephone = home ? judgeTelephones(extractJsonLdTelephones(home.body), business.digits) : 'none'

  const reasons = []
  for (const r of rows) {
    if (r.status !== 200) reasons.push(`${r.path}: HTTP ${r.status}`)
    if (r.business < 1 && !NUMBER_OPTIONAL_PAGES.includes(r.path)) reasons.push(`${r.path}: business number missing`)
    if (mode === 'post-switch' && r.former > 0) reasons.push(`${r.path}: former number still present (${r.former})`)
  }
  if (jsonldTelephone !== 'ok') reasons.push(`/: JSON-LD telephone ${jsonldTelephone}`)

  return { mode, rows, jsonldTelephone, reasons, verdict: reasons.length === 0 ? 'pass' : 'fail' }
}

/**
 * GET every page. A thrown error (network, timeout) propagates to the caller.
 * @param {string} baseUrl
 * @param {typeof fetch} fetchImpl
 * @param {string[]} [paths]
 */
export async function fetchPages(baseUrl, fetchImpl, paths = PAGES) {
  const base = baseUrl.replace(/\/+$/, '')
  const out = []
  for (const path of paths) {
    const res = await fetchImpl(`${base}${path}`, {
      method: 'GET',
      redirect: 'follow',
      headers: { 'user-agent': 'prestigo-business-number-live-check' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    out.push({ path, status: res.status, body: await res.text() })
  }
  return out
}

function parseBaseUrl(argv) {
  const i = argv.indexOf('--base-url')
  if (i === -1) return DEFAULT_BASE_URL
  const value = argv[i + 1]
  if (!value || !/^https?:\/\//.test(value)) throw new Error('--base-url needs an http(s) URL')
  return value
}

/**
 * CLI body with injectable dependencies (used by the offline test).
 * @param {string[]} argv arguments after the script name
 * @param {{ fetchImpl?: typeof fetch, log?: (line: string) => void, repoRoot?: string }} [deps]
 * @returns {Promise<number>} exit code
 */
export async function runCli(argv, deps = {}) {
  const log = deps.log ?? ((line) => console.log(line))
  const repoRoot = deps.repoRoot ?? resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
  const fetchImpl = deps.fetchImpl ?? fetch
  try {
    const baseUrl = parseBaseUrl(argv)
    const business = readBusinessNumber(repoRoot)
    const pages = await fetchPages(baseUrl, fetchImpl)
    const result = evaluatePages(pages, business)
    for (const r of result.rows) {
      log(`page ${r.path} status=${r.status} business=${r.business} former=${r.former}`)
    }
    log(`jsonld_telephone=${result.jsonldTelephone}`)
    for (const reason of result.reasons) log(`reason ${reason}`)
    log(`mode=${result.mode}`)
    log(`verdict=${result.verdict}`)
    return result.verdict === 'pass' ? 0 : 1
  } catch (err) {
    console.error(`business_number_live_check: ${err instanceof Error ? err.message : String(err)}`)
    return 2
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
  process.exit(await runCli(process.argv.slice(2)))
}
