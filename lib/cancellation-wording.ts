// Cancellation wording for the static legal pages (Phase 89, plan 89-20; CANC-02, D-18, D-24).
//
// The terms and FAQ are JSON files, but the policy numbers are admin settings. The locale files carry
// ICU-style variables ({km}, {freeHoursShort}, ...) and this module fills them at render time from the same
// settings the engine reads, so the text and the engine cannot disagree. No hour, km or percent is typed in
// any locale file. Server-only (it reads the settings through guarded readers that build a service client).
//
// Two forms are supported, both with the same variables:
//   {freeHoursShort}                                                  a plain number
//   {freeHoursShort, plural, one {{freeHoursShort} hour} other {...}}  a plural block (Intl.PluralRules)
// A variable that is not known stays visible as written; tests reject any text that still holds one.

import { createSupabaseServiceClient } from '@/lib/supabase'
import { getCancellationPolicy } from '@/lib/cancellation-settings'
import { DEFAULT_AIRPORT_MIN, DEFAULT_CITY_MIN, getNoShowThresholds } from '@/lib/no-show-wait'

export interface PolicyNumbers {
  km: number
  freeHoursShort: number
  freeHoursLong: number
  freeHoursHourly: number
  percent: number
  waitCityMin: number
  waitAirportMin: number
}

/** Reads the live settings; any read problem degrades to the defaults, never throws (T-89-64). */
export async function getPolicyNumbers(): Promise<PolicyNumbers> {
  const policy = await getCancellationPolicy()
  let wait = { cityMin: DEFAULT_CITY_MIN, airportMin: DEFAULT_AIRPORT_MIN }
  try {
    wait = await getNoShowThresholds(createSupabaseServiceClient())
  } catch {
    // A build without Supabase env: keep the defaults.
  }
  return {
    km: policy.kmThreshold,
    freeHoursShort: policy.freeHoursShort,
    freeHoursLong: policy.freeHoursLong,
    freeHoursHourly: policy.freeHoursHourly,
    percent: policy.feePercent,
    waitCityMin: wait.cityMin,
    waitAirportMin: wait.airportMin,
  }
}

type Values = Record<string, number>

/** Index of the brace that closes the one opened at `open`, or -1. */
function closingBrace(text: string, open: number): number {
  let depth = 0
  for (let i = open; i < text.length; i++) {
    if (text[i] === '{') depth++
    else if (text[i] === '}') {
      depth--
      if (depth === 0) return i
    }
  }
  return -1
}

/** Arms of a plural block: `one {text} other {text}` or `=1 {text}`. Null when the shape is wrong. */
function parseArms(body: string): Map<string, string> | null {
  const arms = new Map<string, string>()
  let i = 0
  while (i < body.length) {
    while (i < body.length && /\s/.test(body[i])) i++
    if (i >= body.length) break
    const m = /^(=\d+|[a-z]+)\s*/.exec(body.slice(i))
    if (!m) return null
    i += m[0].length
    if (body[i] !== '{') return null
    const end = closingBrace(body, i)
    if (end === -1) return null
    arms.set(m[1], body.slice(i + 1, end))
    i = end + 1
  }
  return arms.size > 0 ? arms : null
}

function fill(text: string, values: Values, locale: string): string {
  let out = ''
  let i = 0
  while (i < text.length) {
    const open = text.indexOf('{', i)
    if (open === -1) {
      out += text.slice(i)
      break
    }
    out += text.slice(i, open)
    const close = closingBrace(text, open)
    if (close === -1) {
      out += text.slice(open)
      break
    }
    const inner = text.slice(open + 1, close)
    const plain = /^\s*(\w+)\s*$/.exec(inner)
    const plural = /^\s*(\w+)\s*,\s*plural\s*,([\s\S]*)$/.exec(inner)
    if (plain && plain[1] in values) {
      out += String(values[plain[1]])
    } else if (plural && plural[1] in values) {
      const n = values[plural[1]]
      const arms = parseArms(plural[2])
      const arm = arms && (arms.get(`=${n}`) ?? arms.get(new Intl.PluralRules(locale).select(n)) ?? arms.get('other'))
      out += arm === null || arm === undefined ? text.slice(open, close + 1) : fill(arm, values, locale)
    } else {
      out += text.slice(open, close + 1)
    }
    i = close + 1
  }
  return out
}

/** Fills the policy variables of one string. Unknown variables are left visible, never guessed. */
export function fillPolicyNumbers(text: string, numbers: PolicyNumbers, locale = 'en'): string {
  if (!text.includes('{')) return text
  return fill(text, numbers as unknown as Values, locale)
}

/** Fills every string inside a JSON-shaped value (objects, arrays, strings); other values pass through. */
export function fillPolicyDeep<T>(value: T, numbers: PolicyNumbers, locale = 'en'): T {
  if (typeof value === 'string') return fillPolicyNumbers(value, numbers, locale) as unknown as T
  if (Array.isArray(value)) return value.map((v) => fillPolicyDeep(v, numbers, locale)) as unknown as T
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, fillPolicyDeep(v, numbers, locale)]),
    ) as T
  }
  return value
}

/** Variables used by a raw string (plural blocks included), for the parity tests. */
export function policyVariablesIn(text: string): string[] {
  const found = new Set<string>()
  for (const m of text.matchAll(/\{\s*(\w+)\s*[,}]/g)) found.add(m[1])
  return [...found].sort()
}

/** Test helper: throws when a rendered string still holds a variable, so an unknown name never ships. */
export function assertNoUnresolved(text: string): void {
  const m = /[{}]/.exec(text)
  if (m) throw new Error(`Unresolved policy variable in: ${text.slice(Math.max(0, m.index - 30), m.index + 40)}`)
}
