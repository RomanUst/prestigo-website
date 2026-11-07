// Guard for the public cancellation wording (Phase 89, plan 89-21; CANC-02, D-18, T-89-66).
//
// Every public page other than terms/FAQ (plan 89-20) must state the new rule and none may still
// state the old one. The pages name no hour, km or percent: they send the client to the deadline
// shown at checkout and in the confirmation email, so an admin change needs no wording edit.
//
// The English lines are checked against the old phrases. The six other locales are checked key by
// key against the English change list (differs from English, carries none of the old rule's digits),
// rather than by matching foreign phrases.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(__dirname, '..')

type Surface = { name: string; file: string; keyPath: (string | number)[] }

// The change list: every line that stated the old rule on a page covered by this plan.
const SURFACES: Surface[] = [
  { name: 'book trust bullet', file: 'content/pages/%L/book.json', keyPath: ['guarantees', 1] },
  { name: 'book cancel/change FAQ', file: 'content/pages/%L/book.json', keyPath: ['faq', 'items', 0, 'a'] },
  { name: 'routes hub FAQ', file: 'content/pages/%L/routes.json', keyPath: ['faq', 'items', 1, 'a'] },
  { name: 'contact FAQ', file: 'content/pages/%L/contact.json', keyPath: ['commonEnquiries', 'faqs', 3, 'a'] },
  { name: 'airport taxi FAQ', file: 'content/pages/%L/services/prague-airport-taxi.json', keyPath: ['faqs', 6, 'a'] },
  { name: 'booking section trust bullet', file: 'messages/%L.json', keyPath: ['BookingSection', 'trust', 2] },
]

// Whole files the guard reads for old phrases in English.
const EN_FILES = [
  'content/pages/en/book.json',
  'content/pages/en/routes.json',
  'content/pages/en/contact.json',
  'content/pages/en/services/prague-airport-taxi.json',
  'messages/en.json',
]

const OLD_PHRASES: { phrase: string; re: RegExp }[] = [
  { phrase: 'up to 1 hour', re: /up to 1 hour/i },
  { phrase: 'up to one hour', re: /up to one hour/i },
  { phrase: 'one hour before', re: /one hour before/i },
  { phrase: 'at least 1 hour', re: /at least 1 hour/i },
  { phrase: 'cancel ... two hours', re: /cancel\w*[^.]{0,80}two[- ]hours?/i },
  { phrase: 'two hours ... free', re: /two[- ]hours?[^.]{0,40}(free|cancel)/i },
  { phrase: 'within one business day', re: /within one business day/i },
  { phrase: 'changes free at any time', re: /free at any time/i },
  { phrase: '50 % of the fare', re: /50 ?% (of the fare|minimum)/i },
]

function readJson(rel: string): unknown {
  return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'))
}

function pick(node: unknown, keyPath: (string | number)[]): string {
  let cur: unknown = node
  for (const k of keyPath) cur = (cur as Record<string | number, unknown> | undefined)?.[k]
  if (typeof cur !== 'string') throw new Error(`no string at ${keyPath.join('.')}`)
  return cur
}

function strings(node: unknown, out: string[] = []): string[] {
  if (typeof node === 'string') out.push(node)
  else if (Array.isArray(node)) node.forEach((n) => strings(n, out))
  else if (node && typeof node === 'object') Object.values(node).forEach((n) => strings(n, out))
  return out
}

function valueFor(s: Surface, locale: string): string {
  return pick(readJson(s.file.replace('%L', locale)), s.keyPath)
}

describe('public cancellation wording: English', () => {
  for (const rel of EN_FILES) {
    it(`${rel} holds none of the old phrases`, () => {
      const all = strings(readJson(rel))
      for (const { phrase, re } of OLD_PHRASES) {
        const hit = all.find((s) => re.test(s))
        expect(hit, `${rel} still says "${phrase}"`).toBeUndefined()
      }
    })
  }

  it('the trust bullet reads "Free cancellation" on the book page and in the booking section', () => {
    expect(valueFor(SURFACES[0], 'en')).toBe('Free cancellation')
    expect(valueFor(SURFACES[5], 'en')).toBe('Free cancellation')
  })

  for (const s of SURFACES) {
    it(`${s.name} names no hour, km or percent`, () => {
      const text = valueFor(s, 'en').replace(/\+420 725 986 855/g, '')
      expect(text).not.toMatch(/\b\d+\s*(hours?|h|km|%)/i)
      expect(text).not.toMatch(/\b(one|two|three|twelve) hours?\b/i)
    })
  }

  it('the book FAQ calls a change a request, says refunds take 5 to 10 business days and keeps the flight waiver', () => {
    const faq = valueFor(SURFACES[1], 'en')
    expect(faq).toMatch(/request/)
    expect(faq).toMatch(/confirm it by email/)
    expect(faq).toMatch(/5 to 10 business days/)
    expect(faq).toMatch(/cancelled flight/)
    expect(faq).toMatch(/deadline shown at checkout and in your confirmation email/)
  })
})
