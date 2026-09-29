// @vitest-environment node
/**
 * Phase 78, WA-04 — offline test of scripts/qa/business_number_live_check.mjs
 * with a fake fetch. No test string spells the business number: everything is
 * built from lib/contact-channels.ts, and the "other" number used for the
 * post-switch cases is derived by reversing the nine national digits.
 */
import { describe, it, expect } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import {
  BUSINESS_PHONE_DIGITS,
  BUSINESS_PHONE_DISPLAY,
  BUSINESS_PHONE_E164,
  BUSINESS_PHONE_SCHEMA_HYPHEN,
} from '@/lib/contact-channels'
import {
  PAGES,
  countNumber,
  evaluatePages,
  extractJsonLdTelephones,
  readBusinessNumber,
  runCli,
} from '../scripts/qa/business_number_live_check.mjs'

const REPO_ROOT = resolve(__dirname, '..')

const reverseNational = (digits: string): string => '420' + digits.slice(3).split('').reverse().join('')
const OTHER_DIGITS = reverseNational(BUSINESS_PHONE_DIGITS)
const OTHER_E164 = `+${OTHER_DIGITS}`
const groupsOf = (digits: string): string[] => {
  const n = digits.slice(3)
  return [n.slice(0, 3), n.slice(3, 6), n.slice(6, 9)]
}
const displayOf = (digits: string): string => `+420 ${groupsOf(digits).join(' ')}`

const jsonLd = (...phones: string[]): string =>
  `<script type="application/ld+json">${JSON.stringify({
    '@graph': phones.map((telephone) => ({ '@type': 'Thing', telephone })),
  })}</script>`

function pageBody(path: string, display: string, e164: string, hyphen: string): string {
  // /llms.txt is the short summary and carries no number by design.
  if (path === '/llms.txt') return '# Prestigo summary'
  const base = `<main>Call ${display}</main>`
  return path === '/' ? `${base}${jsonLd(e164, hyphen)}` : base
}

function pages(display: string, e164: string, hyphen: string) {
  return PAGES.map((path: string) => ({ path, status: 200, body: pageBody(path, display, e164, hyphen) }))
}

const CURRENT_PAGES = pages(BUSINESS_PHONE_DISPLAY, BUSINESS_PHONE_E164, BUSINESS_PHONE_SCHEMA_HYPHEN)

function fakeFetch(map: (url: string) => { status?: number; body: string } | Error): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const r = map(String(input))
    if (r instanceof Error) throw r
    return { status: r.status ?? 200, text: async () => r.body } as Response
  }) as typeof fetch
}

function tempRepoWith(valueLine: string | null): string {
  const root = mkdtempSync(join(tmpdir(), 'bn-live-check-'))
  mkdirSync(join(root, 'lib'))
  writeFileSync(join(root, 'lib', 'contact-channels.ts'), valueLine === null ? 'export const X = 1\n' : `${valueLine}\n`)
  return root
}

describe('readBusinessNumber', () => {
  it('reads the constant from the real repo file', () => {
    expect(readBusinessNumber(REPO_ROOT)).toEqual({
      e164: BUSINESS_PHONE_E164,
      digits: BUSINESS_PHONE_DIGITS,
      display: BUSINESS_PHONE_DISPLAY,
    })
  })

  it('throws when the value line is missing', () => {
    expect(() => readBusinessNumber(tempRepoWith(null))).toThrow(/BUSINESS_PHONE_E164_VALUE/)
  })

  it('throws when the value line is malformed', () => {
    expect(() => readBusinessNumber(tempRepoWith("const BUSINESS_PHONE_E164_VALUE = '+42072598'"))).toThrow(
      /BUSINESS_PHONE_E164_VALUE/,
    )
  })
})

describe('countNumber', () => {
  const [g1, g2, g3] = groupsOf(BUSINESS_PHONE_DIGITS)

  it.each([
    ['plain spaces', ` ${g1} ${g2} ${g3}`],
    ['no-break spaces', ` ${g1} ${g2} ${g3}`],
    ['narrow no-break spaces', ` ${g1} ${g2} ${g3}`],
    ['hyphens', `-${g1}-${g2}-${g3}`],
    ['no separators', `${g1}${g2}${g3}`],
  ])('counts the +420 form with %s', (_label, tail) => {
    expect(countNumber(`call +420${tail} now`, BUSINESS_PHONE_DIGITS)).toBe(1)
  })

  it('counts the 00 and bare 420 prefixes and the national form', () => {
    expect(countNumber(`00${BUSINESS_PHONE_DIGITS}`, BUSINESS_PHONE_DIGITS)).toBe(1)
    expect(countNumber(BUSINESS_PHONE_DIGITS, BUSINESS_PHONE_DIGITS)).toBe(1)
    expect(countNumber(`${g1} ${g2} ${g3}`, BUSINESS_PHONE_DIGITS)).toBe(1)
  })

  it('counts wa.me, tel: and escaped no-break-space occurrences', () => {
    const text = [
      `https://wa.me/${BUSINESS_PHONE_DIGITS}`,
      `tel:${BUSINESS_PHONE_E164}`,
      `+420\\u00a0${g1}\\u00a0${g2}\\u00a0${g3}`,
      `+420&nbsp;${g1}&nbsp;${g2}&nbsp;${g3}`,
    ].join(' | ')
    expect(countNumber(text, BUSINESS_PHONE_DIGITS)).toBe(4)
  })

  it('ignores the digits inside a longer digit run', () => {
    expect(countNumber(`1${BUSINESS_PHONE_DIGITS}`, BUSINESS_PHONE_DIGITS)).toBe(0)
    expect(countNumber(`${BUSINESS_PHONE_DIGITS}7`, BUSINESS_PHONE_DIGITS)).toBe(0)
    expect(countNumber(`1${g1}${g2}${g3}`, BUSINESS_PHONE_DIGITS)).toBe(0)
  })

  it('does not count a different number', () => {
    expect(countNumber(displayOf(OTHER_DIGITS), BUSINESS_PHONE_DIGITS)).toBe(0)
  })
})

describe('extractJsonLdTelephones', () => {
  it('collects telephone values from every ld+json block, nested or not', () => {
    const html =
      jsonLd(BUSINESS_PHONE_E164) +
      `<script type="application/ld+json">${JSON.stringify({ a: { contactPoint: { telephone: BUSINESS_PHONE_SCHEMA_HYPHEN } } })}</script>` +
      '<script type="application/ld+json">{not json</script>'
    expect(extractJsonLdTelephones(html)).toEqual([BUSINESS_PHONE_E164, BUSINESS_PHONE_SCHEMA_HYPHEN])
  })
})

describe('evaluatePages, pre-switch (constant equals the former number)', () => {
  const business = { e164: BUSINESS_PHONE_E164, digits: BUSINESS_PHONE_DIGITS }

  it('passes when every page carries the number and the JSON-LD matches', () => {
    const result = evaluatePages(CURRENT_PAGES, business)
    expect(result.mode).toBe('pre-switch')
    expect(result.jsonldTelephone).toBe('ok')
    expect(result.verdict).toBe('pass')
    expect(result.rows).toHaveLength(PAGES.length)
    expect(
      result.rows.filter((r: { path: string }) => r.path !== '/llms.txt').every((r: { business: number }) => r.business >= 1),
    ).toBe(true)
  })

  it('fails when one page has no business number', () => {
    const broken = CURRENT_PAGES.map((p: { path: string; status: number; body: string }) =>
      p.path === '/faq' ? { ...p, body: '<main>nothing here</main>' } : p,
    )
    const result = evaluatePages(broken, business)
    expect(result.verdict).toBe('fail')
    expect(result.reasons.join('\n')).toContain('/faq')
  })

  it('does not require the number on /llms.txt but does require it elsewhere', () => {
    const llms = CURRENT_PAGES.find((p: { path: string }) => p.path === '/llms.txt')
    expect(llms?.body).not.toContain(BUSINESS_PHONE_DISPLAY)
    const result = evaluatePages(CURRENT_PAGES, business)
    expect(result.rows.find((r: { path: string }) => r.path === '/llms.txt')?.business).toBe(0)
    expect(result.verdict).toBe('pass')
  })

  it('fails on a non-200 page', () => {
    const broken = CURRENT_PAGES.map((p: { path: string; status: number; body: string }) =>
      p.path === '/book' ? { ...p, status: 404 } : p,
    )
    expect(evaluatePages(broken, business).verdict).toBe('fail')
  })
})

describe('evaluatePages, post-switch (business number differs from the former one)', () => {
  const business = { e164: OTHER_E164, digits: OTHER_DIGITS }
  const otherHyphen = displayOf(OTHER_DIGITS).replace(/ /g, '-')
  const options = { formerDigits: BUSINESS_PHONE_DIGITS }

  it('the derived number really differs from the constant', () => {
    expect(OTHER_DIGITS).not.toBe(BUSINESS_PHONE_DIGITS)
  })

  it('passes when every page carries the new number only', () => {
    const result = evaluatePages(pages(displayOf(OTHER_DIGITS), OTHER_E164, otherHyphen), business, options)
    expect(result.mode).toBe('post-switch')
    expect(result.rows.every((r: { former: number }) => r.former === 0)).toBe(true)
    expect(result.verdict).toBe('pass')
  })

  it('fails when a page still shows the former number', () => {
    const mixed = pages(displayOf(OTHER_DIGITS), OTHER_E164, otherHyphen).map(
      (p: { path: string; status: number; body: string }) =>
        p.path === '/privacy' ? { ...p, body: `${p.body} ${BUSINESS_PHONE_DISPLAY}` } : p,
    )
    const result = evaluatePages(mixed, business, options)
    expect(result.verdict).toBe('fail')
    expect(result.reasons.join('\n')).toContain('/privacy')
  })

  it('fails when /llms.txt mentions the former number', () => {
    const mixed = pages(displayOf(OTHER_DIGITS), OTHER_E164, otherHyphen).map(
      (p: { path: string; status: number; body: string }) =>
        p.path === '/llms.txt' ? { ...p, body: `${p.body} ${BUSINESS_PHONE_DISPLAY}` } : p,
    )
    const result = evaluatePages(mixed, business, options)
    expect(result.verdict).toBe('fail')
    expect(result.reasons.join('\n')).toContain('/llms.txt')
  })

  it('fails when the home JSON-LD telephone is still the former number', () => {
    const stale = pages(displayOf(OTHER_DIGITS), BUSINESS_PHONE_E164, BUSINESS_PHONE_SCHEMA_HYPHEN)
    const result = evaluatePages(stale, business, options)
    expect(result.jsonldTelephone).toBe('mismatch')
    expect(result.verdict).toBe('fail')
  })

  it('reports none when the home page has no JSON-LD telephone', () => {
    const bare = pages(displayOf(OTHER_DIGITS), OTHER_E164, otherHyphen).map(
      (p: { path: string; status: number; body: string }) =>
        p.path === '/' ? { ...p, body: `<main>${displayOf(OTHER_DIGITS)}</main>` } : p,
    )
    const result = evaluatePages(bare, business, options)
    expect(result.jsonldTelephone).toBe('none')
    expect(result.verdict).toBe('fail')
  })
})

describe('runCli', () => {
  const okFetch = fakeFetch((url) => {
    const path = new URL(url).pathname
    return { body: pageBody(path, BUSINESS_PHONE_DISPLAY, BUSINESS_PHONE_E164, BUSINESS_PHONE_SCHEMA_HYPHEN) }
  })

  it('prints the output contract and exits 0 in pre-switch mode', async () => {
    const lines: string[] = []
    const code = await runCli([], { fetchImpl: okFetch, log: (l: string) => lines.push(l), repoRoot: REPO_ROOT })
    expect(code).toBe(0)
    expect(lines.filter((l) => l.startsWith('page '))).toHaveLength(10)
    expect(lines[0]).toMatch(/^page \/ status=200 business=[0-9]+ former=[0-9]+$/)
    expect(lines).toContain('jsonld_telephone=ok')
    expect(lines).toContain('mode=pre-switch')
    expect(lines).toContain('verdict=pass')
  })

  it('requests the pages on the given base url with GET', async () => {
    const seen: string[] = []
    const spy = fakeFetch((url) => {
      seen.push(url)
      return { body: pageBody(new URL(url).pathname, BUSINESS_PHONE_DISPLAY, BUSINESS_PHONE_E164, BUSINESS_PHONE_SCHEMA_HYPHEN) }
    })
    await runCli(['--base-url', 'https://example.test/'], { fetchImpl: spy, log: () => {}, repoRoot: REPO_ROOT })
    expect(seen).toEqual(PAGES.map((p: string) => `https://example.test${p}`))
  })

  it('exits 1 with verdict=fail when a page lacks the number', async () => {
    const lines: string[] = []
    const f = fakeFetch((url) => {
      const path = new URL(url).pathname
      if (path === '/contact') return { body: '<main>empty</main>' }
      return { body: pageBody(path, BUSINESS_PHONE_DISPLAY, BUSINESS_PHONE_E164, BUSINESS_PHONE_SCHEMA_HYPHEN) }
    })
    const code = await runCli([], { fetchImpl: f, log: (l: string) => lines.push(l), repoRoot: REPO_ROOT })
    expect(code).toBe(1)
    expect(lines).toContain('verdict=fail')
  })

  it('runs in post-switch mode when the repo constant differs from the former number', async () => {
    const lines: string[] = []
    const root = tempRepoWith(`const BUSINESS_PHONE_E164_VALUE = '${OTHER_E164}'`)
    const otherHyphen = displayOf(OTHER_DIGITS).replace(/ /g, '-')
    const f = fakeFetch((url) => ({
      body: pageBody(new URL(url).pathname, displayOf(OTHER_DIGITS), OTHER_E164, otherHyphen),
    }))
    const code = await runCli([], { fetchImpl: f, log: (l: string) => lines.push(l), repoRoot: root })
    expect(lines).toContain('mode=post-switch')
    expect(lines).toContain('verdict=pass')
    expect(code).toBe(0)
  })

  it('exits 2 on a network error', async () => {
    const f = fakeFetch(() => new Error('connect ECONNREFUSED'))
    const code = await runCli([], { fetchImpl: f, log: () => {}, repoRoot: REPO_ROOT })
    expect(code).toBe(2)
  })

  it('exits 2 when the constant file is unreadable', async () => {
    const code = await runCli([], { fetchImpl: okFetch, log: () => {}, repoRoot: tempRepoWith(null) })
    expect(code).toBe(2)
  })
})
