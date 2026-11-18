// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest'
import {
  QUOTE_TOKEN_RE,
  buildQuoteUrl,
  generateQuoteReference,
  hashQuoteToken,
  newQuoteToken,
} from '@/lib/quotes/token'
import { QUOTE_REFERENCE_RE } from '@/lib/quotes/vocabulary'

/**
 * Phase 92 plan 92-02 (QUOTE-02, T-92-05): a quote token is 256 random bits; only its sha-256 is stored.
 */

beforeEach(() => {
  delete process.env.NEXT_PUBLIC_SITE_URL
})

describe('newQuoteToken / hashQuoteToken', () => {
  it('matches QUOTE_TOKEN_RE (43 base64url chars) and two calls differ', () => {
    const a = newQuoteToken()
    const b = newQuoteToken()
    expect(a).toMatch(QUOTE_TOKEN_RE)
    expect(a).toHaveLength(43)
    expect(a).not.toBe(b)
  })

  it('hashes to 64 lowercase hex chars and is stable', () => {
    const token = newQuoteToken()
    const hash = hashQuoteToken(token)
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect(hashQuoteToken(token)).toBe(hash)
    expect(hashQuoteToken(newQuoteToken())).not.toBe(hash)
  })

  it('hashes the utf8 string with sha-256 (known vector)', () => {
    expect(hashQuoteToken('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })

  it('the regex rejects wrong length and characters', () => {
    expect(QUOTE_TOKEN_RE.test('a'.repeat(42))).toBe(false)
    expect(QUOTE_TOKEN_RE.test('a'.repeat(44))).toBe(false)
    expect(QUOTE_TOKEN_RE.test('a'.repeat(42) + '+')).toBe(false)
    expect(QUOTE_TOKEN_RE.test('a'.repeat(42) + '/')).toBe(false)
  })
})

describe('buildQuoteUrl', () => {
  const token = 'A'.repeat(43)

  it('has no locale prefix for en', () => {
    expect(buildQuoteUrl(token, 'en')).toBe(`https://rideprestigo.com/quote/${token}`)
  })

  it('prefixes other locales', () => {
    expect(buildQuoteUrl(token, 'ar').startsWith('https://rideprestigo.com/ar/quote/')).toBe(true)
  })

  it('trims a trailing newline and slashes of the site url', () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://example.test/\n'
    expect(buildQuoteUrl(token, 'en')).toBe(`https://example.test/quote/${token}`)
  })

  it('throws on a malformed token', () => {
    expect(() => buildQuoteUrl('short', 'en')).toThrow()
    expect(() => buildQuoteUrl(`${'A'.repeat(42)}!`, 'en')).toThrow()
  })
})

describe('generateQuoteReference', () => {
  it('matches QUOTE_REFERENCE_RE', () => {
    expect(generateQuoteReference()).toMatch(QUOTE_REFERENCE_RE)
  })

  it('carries the Prague date (2027-03-28 00:30 UTC is 01:30 in Prague)', () => {
    const ref = generateQuoteReference(new Date('2027-03-28T00:30:00Z'))
    expect(ref.startsWith('Q-20270328-')).toBe(true)
  })

  it('uses the Prague date, not the UTC date, late in the evening (2027-03-27 23:30 UTC is 2027-03-28 in Prague)', () => {
    const ref = generateQuoteReference(new Date('2027-03-27T23:30:00Z'))
    expect(ref.startsWith('Q-20270328-')).toBe(true)
  })

  it('two references differ', () => {
    expect(generateQuoteReference()).not.toBe(generateQuoteReference())
  })
})
