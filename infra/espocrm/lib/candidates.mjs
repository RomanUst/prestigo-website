// Pure module: D-14 Account candidate builder.
//
// Groups booking rows by corporate email domain and by customer_profiles.company_name
// and proposes likely partner Accounts. Nothing here touches the network or the disk.
// A candidate is only a proposal: every one starts with confirm:false and type:null and
// nothing becomes an Account until the owner flips confirm and picks a D-02 type.
// Candidates carry counts and names only - no booker addresses are stored (PII-light).

import { amountEur, normalizeEmail } from './booking-map.mjs'

// D-02 stored Account type values.
export const ACCOUNT_TYPE_VALUES = ['Hotel', 'Agency', 'Corporate', 'Embassy', 'Other']

// The restore-drill canary Account must never be proposed, seeded or deleted.
export const CANARY_ACCOUNT_NAME = 'Restore Drill Canary'

// RESEARCH Pattern 7 free-mail list, plus the own domain (rideprestigo.com).
export const FREE_MAIL_DOMAINS = [
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'ymail.com',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'msn.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'aol.com',
  'proton.me',
  'protonmail.com',
  'gmx.com',
  'gmx.de',
  'gmx.net',
  'web.de',
  'mail.ru',
  'bk.ru',
  'list.ru',
  'inbox.ru',
  'yandex.ru',
  'yandex.com',
  'ya.ru',
  'seznam.cz',
  'email.cz',
  'centrum.cz',
  'volny.cz',
  'qq.com',
  '163.com',
  '126.com',
  't-online.de',
  'orange.fr',
  'free.fr',
  'wanadoo.fr',
  'rideprestigo.com',
]

const collapse = (s) => String(s ?? '').replace(/\s+/g, ' ').trim()
const companyKey = (name) => collapse(name).toLowerCase()
const isCanary = (name) => companyKey(name) === CANARY_ACCOUNT_NAME.toLowerCase()

/** Lower-cased domain of a valid-looking address, else null. */
export function emailDomain(address) {
  const e = normalizeEmail(address)
  const at = e.lastIndexOf('@')
  if (at < 1 || at === e.length - 1) return null
  const domain = e.slice(at + 1)
  return /^[^\s@]+\.[^\s@]+$/.test(domain) ? domain : null
}

const TYPE_RULES = [
  ['Hotel', /hotel|resort|palace|residence/i],
  ['Agency', /travel|tour|\bdmc\b|transfer|express|\btlt|agency/i],
  ['Embassy', /embassy|consulate|events?/i],
]

/** Keyword guess of the D-02 Account type; the owner confirms or overrides it. */
export function guessAccountType(name) {
  const text = collapse(name)
  for (const [type, re] of TYPE_RULES) if (re.test(text)) return type
  return 'Other'
}

const SECOND_LEVEL = new Set(['co', 'com', 'org', 'net', 'ac', 'gov', 'edu'])

function domainLabelName(domain) {
  const labels = domain.split('.')
  let label = labels[labels.length - 2] ?? labels[0]
  if (labels.length >= 3 && SECOND_LEVEL.has(label)) label = labels[labels.length - 3]
  return label.charAt(0).toUpperCase() + label.slice(1)
}

function newGroup(key, domain) {
  return { key, domain, bookingCount: 0, totalEur: 0, bookers: new Set(), companyCounts: new Map() }
}

function addRow(group, row, bookerKey, company) {
  group.bookingCount += 1
  const eur = amountEur(row)
  if (eur !== null) group.totalEur += eur
  group.bookers.add(bookerKey)
  if (company) group.companyCounts.set(company, (group.companyCounts.get(company) ?? 0) + 1)
}

function mergeInto(target, source) {
  target.bookingCount += source.bookingCount
  target.totalEur += source.totalEur
  for (const b of source.bookers) target.bookers.add(b)
  for (const [name, count] of source.companyCounts) {
    target.companyCounts.set(name, (target.companyCounts.get(name) ?? 0) + count)
  }
}

/** Most frequent exact company spelling inside one normalized key; ties by plain string order. */
function pickName(companyCounts) {
  const byNorm = new Map()
  for (const [exact, count] of companyCounts) {
    const k = companyKey(exact)
    byNorm.set(k, (byNorm.get(k) ?? 0) + count)
  }
  const bestNorm = [...byNorm.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0]?.[0]
  if (bestNorm === undefined) return null
  const forms = [...companyCounts.entries()]
    .filter(([exact]) => companyKey(exact) === bestNorm)
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
  return forms[0][0]
}

/**
 * Build the D-14 candidate list.
 * @param {Array<object>} rows export rows (client_email, company_name, amount_eur/amount_czk, user_id, id)
 * @param {{ freeMailDomains?: string[] }} [options]
 */
export function buildCandidates(rows, options = {}) {
  const free = new Set((options.freeMailDomains ?? FREE_MAIL_DOMAINS).map((d) => d.toLowerCase()))
  const domainGroups = new Map()
  const companyGroups = new Map()

  for (const row of rows ?? []) {
    const company = collapse(row.company_name)
    if (company && isCanary(company)) continue
    const normalized = normalizeEmail(row.client_email)
    const domain = emailDomain(normalized)
    const bookerKey = domain ? normalized : `anon:${row.user_id ?? row.id ?? ''}`

    if (domain && !free.has(domain)) {
      const key = `domain:${domain}`
      if (!domainGroups.has(key)) domainGroups.set(key, newGroup(key, domain))
      addRow(domainGroups.get(key), row, bookerKey, company)
    } else if (company) {
      const key = `company:${companyKey(company)}`
      if (!companyGroups.has(key)) companyGroups.set(key, newGroup(key, null))
      addRow(companyGroups.get(key), row, bookerKey, company)
    }
  }

  // A company-only group joins a corporate-domain group that already carries the same
  // company name (smallest key wins, so the result does not depend on input order).
  for (const [ckey, cgroup] of [...companyGroups.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const wanted = ckey.slice('company:'.length)
    const host = [...domainGroups.values()]
      .filter((g) => [...g.companyCounts.keys()].some((n) => companyKey(n) === wanted))
      .sort((a, b) => (a.key < b.key ? -1 : 1))[0]
    if (host) {
      mergeInto(host, cgroup)
      companyGroups.delete(ckey)
    }
  }

  const candidates = []
  for (const group of [...domainGroups.values(), ...companyGroups.values()]) {
    const hasCompany = group.companyCounts.size > 0
    if (!hasCompany && group.bookers.size < 2) continue
    const name = pickName(group.companyCounts) ?? domainLabelName(group.domain)
    const companyNames = [...new Set([...group.companyCounts.keys()])].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    candidates.push({
      key: group.key,
      name,
      domain: group.domain,
      companyNames,
      bookerCount: group.bookers.size,
      bookingCount: group.bookingCount,
      totalEur: Math.round(group.totalEur * 100) / 100,
      suggestedType: guessAccountType(name),
      confirm: false,
      type: null,
    })
  }

  return candidates.sort(
    (a, b) =>
      b.bookingCount - a.bookingCount ||
      (a.name.toLowerCase() < b.name.toLowerCase() ? -1 : a.name.toLowerCase() > b.name.toLowerCase() ? 1 : 0) ||
      (a.key < b.key ? -1 : a.key > b.key ? 1 : 0),
  )
}

/** Only owner-confirmed entries; a confirmed entry needs a D-02 type and must not be the canary. */
export function selectConfirmed(candidates) {
  const out = []
  for (const c of candidates ?? []) {
    if (c.confirm !== true) continue
    if (isCanary(c.name)) throw new Error(`candidate "${c.name}" is the restore-drill canary and cannot be seeded`)
    if (!ACCOUNT_TYPE_VALUES.includes(c.type)) {
      throw new Error(`candidate "${c.name}" is confirmed with invalid type ${JSON.stringify(c.type)}`)
    }
    out.push(c)
  }
  return out
}

/** Console table for the owner: names, domains, company names and counts only. */
export function formatCandidateTable(candidates) {
  const header = ['#', 'Name', 'Domain', 'Companies', 'Bookers', 'Bookings', 'EUR', 'Suggested type']
  const lines = (candidates ?? []).map((c, i) => [
    String(i + 1),
    c.name,
    c.domain ?? '-',
    c.companyNames.join(' | ') || '-',
    String(c.bookerCount),
    String(c.bookingCount),
    String(c.totalEur),
    c.suggestedType,
  ])
  const all = [header, ...lines]
  const widths = header.map((_, col) => Math.max(...all.map((line) => line[col].length)))
  const fmt = (line) => line.map((cell, col) => cell.padEnd(widths[col])).join('  ').trimEnd()
  const body = [fmt(header), widths.map((w) => '-'.repeat(w)).join('  '), ...lines.map(fmt)]
  if (lines.length === 0) body.push('(no candidates)')
  return body.join('\n')
}
