// @vitest-environment node
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { cardMetadata } from '@/lib/payments/stripe'

/**
 * Phase 88 plan 88-17 (PAYF-03, HOLD-02, HOLD-04, HOLD-05, D-02): source gates of the card-on-file engine.
 *
 * 1. Assumption-delta invariant: every engine entry point checks assertMoneyEligible (no money flow for a partner
 *    booking) and payment_mode 'card_hold' BEFORE it touches Stripe, the payment ledger or the client.
 * 2. No Stripe object built by lib/payments or lib/stripe-webhook carries the legacy booking-id metadata key
 *    (the legacy webhook chain builds bookings from payment events and must never see a card object).
 * 3. Files added by this phase hold no typed euro amount (prices come from the admin-fed price modules).
 *
 * Source-reading gates in the style of tests/status-writers-gate.test.ts. tests/payment-state-writers-gate.test.ts
 * and tests/status-writers-gate.test.ts cover the single-writer rules.
 */

const REPO_ROOT = path.resolve(__dirname, '..')
const read = (rel: string) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8')

/** Line and block comments removed (a `//` inside a URL string is kept: it must follow whitespace or line start). */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1')
}

function listFiles(dir: string, exts: string[]): string[] {
  const abs = path.join(REPO_ROOT, dir)
  if (!fs.existsSync(abs)) return []
  const out: string[] = []
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`
    if (entry.isDirectory()) out.push(...listFiles(rel, exts))
    else if (exts.includes(path.extname(entry.name))) out.push(rel)
  }
  return out
}

/** The body of `export async function <name>(` up to its closing brace at column 0. */
function functionBody(src: string, name: string): string {
  const start = src.indexOf(`export async function ${name}(`)
  if (start < 0) throw new Error(`function ${name} not found`)
  const end = src.indexOf('\n}\n', start)
  if (end < 0) throw new Error(`end of function ${name} not found`)
  return src.slice(start, end)
}

// ── 1. money-eligibility gate ─────────────────────────────────────────────────────────────────────────────────────

const ENTRY_POINTS = [
  { file: 'lib/payments/hold.ts', fn: 'placeHold' },
  { file: 'lib/payments/hold.ts', fn: 'releaseHold' },
  { file: 'lib/payments/settle.ts', fn: 'settleBooking' },
  { file: 'lib/payments/recovery.ts', fn: 'handlePaymentFailure' },
  { file: 'lib/payments/edit-hook.ts', fn: 'reevaluateAfterEdit' },
] as const

// Anything that reaches Stripe, writes the payment state or mails the client.
const MONEY_TOUCH =
  /getPaymentsStripe\(|\.paymentIntents\.|cancelHoldIntent\(|cancelPaymentIntent\(|refreshRecoveryLink\(|collectFromHold\(|chargeSavedCard\(|applyTransition\(|appendPaymentEvent\(|sendPaymentEmail\(|sendPaymentOperatorAlert\(/

describe('engine entry points gate money on eligibility and payment_mode (assumption-delta invariant)', () => {
  for (const { file, fn } of ENTRY_POINTS) {
    describe(`${fn} (${file})`, () => {
      const body = functionBody(read(file), fn)

      it('calls assertMoneyEligible', () => {
        expect(body).toContain('assertMoneyEligible(')
      })

      it("checks payment_mode against 'card_hold'", () => {
        expect(body).toMatch(/payment_mode\s*!==\s*'card_hold'/)
      })

      it('does both before anything that touches Stripe, the ledger or the client', () => {
        const touch = body.search(MONEY_TOUCH)
        expect(touch, 'the entry point must contain a money-touching call (gate would pass vacuously)').toBeGreaterThan(0)
        expect(body.indexOf('assertMoneyEligible(')).toBeGreaterThan(-1)
        expect(body.indexOf('assertMoneyEligible(')).toBeLessThan(touch)
        expect(body.search(/payment_mode\s*!==\s*'card_hold'/)).toBeLessThan(touch)
      })

      it('turns a partner booking into a no-op instead of an error', () => {
        expect(body).toContain('PartnerBookingMoneyError')
      })
    })
  }

  it('the shared helper rejects only partner (gnet) bookings', () => {
    const src = read('lib/booking-status.ts')
    expect(src).toMatch(/export function assertMoneyEligible/)
    expect(src).toMatch(/booking_source === 'gnet'/)
  })
})

// ── 2. no legacy booking-id metadata key ──────────────────────────────────────────────────────────────────────────

describe('card Stripe objects never carry the legacy booking-id metadata key', () => {
  const files = [...listFiles('lib/payments', ['.ts']), ...listFiles('lib/stripe-webhook', ['.ts'])]

  it('scans the whole engine (floor)', () => {
    expect(files.length).toBeGreaterThanOrEqual(20)
  })

  it('cardMetadata carries cofBookingId and no legacy key, for every card kind', () => {
    const kinds = ['card_setup', 'card_hold_now', 'card_hold', 'card_charge', 'card_difference', 'card_recovery'] as const
    for (const kind of kinds) {
      const meta = cardMetadata(kind, { bookingId: 'b-1', attempt: 2, bookingReference: 'PRG-20270116-ABC123', promoCode: 'WELCOME10' })
      expect(Object.keys(meta).sort()).toEqual(['attempt', 'bookingReference', 'cofBookingId', 'kind', 'promoCode'])
      expect(meta.kind).toBe(kind)
      expect(meta).not.toHaveProperty('bookingId')
    }
  })

  it('no metadata object literal in the engine has a bookingId key', () => {
    const offenders: string[] = []
    for (const file of files) {
      const src = stripComments(read(file))
      // metadata: { ... bookingId ... }  /  metadata = { ... }  (also `metadata,` shorthand objects built inline)
      for (const m of src.matchAll(/metadata\s*[:=]\s*\{/g)) {
        const open = (m.index ?? 0) + m[0].length - 1
        let depth = 0
        let end = open
        for (let i = open; i < src.length; i++) {
          if (src[i] === '{') depth++
          else if (src[i] === '}') {
            depth--
            if (depth === 0) {
              end = i
              break
            }
          }
        }
        if (/(^|[{,\s])bookingId\s*[:,}]/.test(src.slice(open, end + 1))) offenders.push(file)
      }
    }
    expect(offenders).toEqual([])
  })

  it('nothing in the engine reads the legacy key from a Stripe object', () => {
    const offenders: string[] = []
    for (const file of files) {
      const src = stripComments(read(file))
      if (/metadata\??\.bookingId\b|metadata\??\.\[\s*['"]bookingId['"]\s*\]|metaString\([^)]*['"]bookingId['"]/.test(src)) {
        offenders.push(file)
      }
    }
    expect(offenders).toEqual([])
  })
})

// ── 3. no typed euro amounts in files added by this phase ─────────────────────────────────────────────────────────

describe('files added by the phase hold no typed euro amount', () => {
  const FILES = [
    ...listFiles('app/api/card-checkout', ['.ts', '.tsx']),
    'components/booking/steps/Step6Checkout.tsx',
    'components/booking/steps/Step6CardOnFile.tsx',
    'components/booking/CardPaymentExplainer.tsx',
    'components/booking/steps/PromoCodeField.tsx',
    'components/admin/PaymentPanel.tsx',
    'components/admin/PaymentStateBadge.tsx',
    'components/admin/CardFlowSettings.tsx',
  ]
  // A euro sign next to a number, either order, or a currency code next to a number.
  const TYPED_EURO = /€\s*\d|\d\s*€|\bEUR\s*\d|\d\s*EUR\b/

  it('lists the route and the component files that exist (floor)', () => {
    expect(FILES.length).toBeGreaterThanOrEqual(9)
    for (const f of FILES) expect(fs.existsSync(path.join(REPO_ROOT, f)), f).toBe(true)
  })

  for (const file of FILES) {
    it(`${file} has no typed euro amount`, () => {
      expect(stripComments(read(file))).not.toMatch(TYPED_EURO)
    })
  }
})
