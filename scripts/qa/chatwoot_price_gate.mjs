#!/usr/bin/env node
/**
 * Phase 77 / D-18 price gate for Chatwoot template sources (called by
 * .husky/pre-commit). Scans the STAGED blobs (`git show :path`), not the
 * working tree, of every added/changed *.json / *.md file under infra/chatwoot
 * and exits 1 (printing the file names) when one contains a price or currency
 * token. Canned responses are sent to customers verbatim, so a baked-in price
 * would go stale and could contradict the actual charge.
 *
 * The match is case-insensitive and covers the forms used in the shipped
 * locales: the euro sign, EUR/euro/euros (en, es, fr), CZK, Kc/Kč, koruna
 * forms (cs/en), евро (ru), 欧元 (zh), يورو (ar), यूरो (hi). ASCII words use
 * word boundaries so "Europe" / "neuron" do not match; "евро" does not match
 * "Европа".
 *
 * Exit codes: 0 = clean (or nothing staged), 1 = currency token found,
 * 2 = the gate itself failed to run.
 */
import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

export const CURRENCY_RE =
  /€|\b(?:eur|euros?|czk|kc|koruna|koruny|korun)\b|kč|евро(?![а-яё])|欧元|يورو|यूरो/iu

export function hasCurrencyToken(text) {
  return CURRENCY_RE.test(text)
}

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
}

export function stagedTemplateFiles() {
  return git(['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z', '--', 'infra/chatwoot'])
    .split('\0')
    .filter((f) => /\.(json|md)$/.test(f))
}

function main() {
  const offenders = []
  for (const file of stagedTemplateFiles()) {
    if (hasCurrencyToken(git(['show', `:${file}`]))) offenders.push(file)
  }
  if (offenders.length > 0) {
    console.log(offenders.join('\n'))
    return 1
  }
  return 0
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
  try {
    process.exit(main())
  } catch (err) {
    console.error(`chatwoot_price_gate: ${err instanceof Error ? err.message : String(err)}`)
    process.exit(2)
  }
}
