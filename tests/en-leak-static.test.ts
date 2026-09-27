import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { scanSource, isEnglishLeak, stripAllowlistedTokens } from '../scripts/qa/en_leak_static.mjs'

const FIXTURES_DIR = path.join(process.cwd(), 'tests/fixtures/en-leak')

describe('en_leak_static.mjs scanSource', () => {
  const leakyPath = 'tests/fixtures/en-leak/leaky.tsx'
  const cleanPath = 'tests/fixtures/en-leak/clean.tsx'
  const leakyCode = readFileSync(path.join(FIXTURES_DIR, 'leaky.tsx'), 'utf8')
  const cleanCode = readFileSync(path.join(FIXTURES_DIR, 'clean.tsx'), 'utf8')
  const leakyLines = leakyCode.split('\n')

  const leakyFindings = scanSource(leakyCode, leakyPath)
  const cleanFindings = scanSource(cleanCode, cleanPath)

  it('flags R1: hardcoded JSX text', () => {
    const r1 = leakyFindings.filter((f) => f.rule === 'R1')
    const finding = r1.find((f) => f.text.includes('Book your ride now'))
    expect(finding).toBeDefined()
    expect(leakyLines[finding.line - 1]).toContain('Book your ride now')
  })

  it('flags R2: hardcoded placeholder/aria-label/alt/title/label string attrs', () => {
    const r2 = leakyFindings.filter((f) => f.rule === 'R2')
    const attrNames = r2.map((f) => f.text.split('=')[0])
    expect(attrNames).toEqual(expect.arrayContaining(['placeholder', 'aria-label', 'alt', 'title', 'label']))
    for (const f of r2) {
      expect(leakyLines[f.line - 1]).toBeTruthy()
    }
  })

  it('flags R3a: a raw string-literal <a href="/...">', () => {
    const r3 = leakyFindings.filter((f) => f.rule === 'R3')
    const finding = r3.find((f) => f.text === 'href="/about"')
    expect(finding).toBeDefined()
    expect(leakyLines[finding.line - 1]).toContain('href="/about"')
  })

  it('flags R3a: a template-literal <a href={`/...`}>', () => {
    const r3 = leakyFindings.filter((f) => f.rule === 'R3')
    const finding = r3.find((f) => f.text.startsWith('href="/routes/'))
    expect(finding).toBeDefined()
    expect(leakyLines[finding.line - 1]).toContain('/routes/${slug}')
  })

  it('flags R3b: a default import from next/link', () => {
    const r3 = leakyFindings.filter((f) => f.rule === 'R3')
    const finding = r3.find((f) => f.text.includes('next/link'))
    expect(finding).toBeDefined()
    expect(leakyLines[finding.line - 1]).toContain("from 'next/link'")
  })

  it('flags R3c: a useRouter import from next/navigation', () => {
    const r3 = leakyFindings.filter((f) => f.rule === 'R3')
    const finding = r3.find((f) => f.text.includes('useRouter'))
    expect(finding).toBeDefined()
    expect(leakyLines[finding.line - 1]).toContain("useRouter } from 'next/navigation'")
  })

  it('flags R3d: a redirect() call with a root-relative string-literal argument', () => {
    const r3 = leakyFindings.filter((f) => f.rule === 'R3')
    const finding = r3.find((f) => f.text.includes("redirect('/dashboard')"))
    expect(finding).toBeDefined()
    expect(leakyLines[finding.line - 1]).toContain("redirect('/dashboard')")
  })

  it('reports every finding with a correct 1-indexed line number pointing at real source text', () => {
    expect(leakyFindings.length).toBeGreaterThan(0)
    for (const f of leakyFindings) {
      expect(f.line).toBeGreaterThan(0)
      expect(f.line).toBeLessThanOrEqual(leakyLines.length)
    }
  })

  it('yields zero findings on clean.tsx (useTranslations output, DNT-only text, i18n Link/getPathname hrefs, external/mailto hrefs)', () => {
    expect(cleanFindings).toEqual([])
  })
})

describe('en_leak_static.mjs allowlist strip (Plan 75-26 parity with en_leak_rendered.py)', () => {
  it('strips tokens boundary-aware: tier token "Service" is not cut out of "Services"', () => {
    expect(stripAllowlistedTokens('Our Services')).toContain('Services')
    expect(stripAllowlistedTokens('Service client')).not.toContain('Service')
  })

  it('honors properNouns and inlineTerms, and strips structural email/path tokens', () => {
    expect(isEnglishLeak('Roman Ustyugov')).toBe(false)
    expect(isEnglishLeak('Visa, Mastercard, American Express, Apple Pay')).toBe(false)
    expect(isEnglishLeak('ivan@email.com')).toBe(false)
    expect(isEnglishLeak('/book/multi-day')).toBe(false)
  })

  it('still flags genuine English next to allowlisted terms (no over-masking)', () => {
    expect(isEnglishLeak('Free Wi-Fi and USB-C charging on board')).toBe(true)
    expect(isEnglishLeak('Page not found')).toBe(true)
    expect(isEnglishLeak('pickup and/or dropoff')).toBe(true)
  })
})
