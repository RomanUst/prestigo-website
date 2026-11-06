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

// ── 4. Phase 89 (plan 89-19, criterion 5): the partner gate over the new entry points ───────────────────────────────
//
// The cancellation policy, the fee engine, the cash engine, the manage link and the driver cash step all move money or
// open a way to it. A partner (gnet) booking has no Prestigo money flow and no client link: each of them must check that
// BEFORE any Stripe call, any ledger write, any client mail or any token. The runtime proof is
// tests/payments-policy-lifecycle.test.ts (LC4); these gates keep the check from being deleted unnoticed.

/** The body of a function declared with `export async function <name>(` or `export function <name>(` or `async function`. */
function anyFunctionBody(src: string, name: string): string {
  const m = new RegExp(`(?:export\\s+)?(?:async\\s+)?function\\s+${name}\\s*\\(`).exec(src)
  if (!m) throw new Error(`function ${name} not found`)
  const end = src.indexOf('\n}\n', m.index)
  if (end < 0) throw new Error(`end of function ${name} not found`)
  return src.slice(m.index, end)
}

// Reaches Stripe, writes the ledger or a note, takes the amount lock, sends mail or creates a token.
const PHASE89_TOUCH =
  /getPaymentsStripe\(|\.paymentIntents\.|\.refunds\.|appendPaymentEvent\(|applyTransition\(|addPaymentNote\(|lockFeeAmount\(|settleBooking\(|await settleCash\(|sendPaymentEmail\(|sendPaymentOperatorAlert\(|openFeeCase\(|advanceBookingStatus\(|\.insert\(|\.upsert\(/

describe('Phase 89 entry points check for a partner booking before they touch anything', () => {
  const GUARDED = [
    { file: 'lib/payments/fee.ts', fn: 'runFeeCharge', check: /isPartner\(booking\)/ },
    { file: 'lib/payments/fee.ts', fn: 'runCashCardCharge', check: /isPartner\(booking\)/ },
    { file: 'lib/payments/fee.ts', fn: 'chargeFromCollected', check: /isPartner\(/ },
    { file: 'lib/payments/fee.ts', fn: 'waiveFee', check: /isPartner\(/ },
    { file: 'lib/payments/cash.ts', fn: 'settleCash', check: /isPartner\(booking\)/ },
    { file: 'lib/payments/cash.ts', fn: 'reopenCash', check: /isPartner\(booking\)/ },
    { file: 'lib/manage-link.ts', fn: 'ensureManageToken', check: /isEligibleBooking\(/ },
    { file: 'lib/driver-trip-step.ts', fn: 'driverConfirmCash', check: /assertMoneyEligible\([\s\S]*PartnerBookingMoneyError\)\s*return notAllowed/ },
  ] as const

  for (const { file, fn, check } of GUARDED) {
    it(`${fn} (${file}) checks the partner gate first`, () => {
      const body = anyFunctionBody(read(file), fn)
      const gate = body.search(check)
      expect(gate, 'the partner check is missing').toBeGreaterThan(-1)
      const touch = body.search(PHASE89_TOUCH)
      expect(touch, 'the function must contain a money-touching call (gate would pass vacuously)').toBeGreaterThan(-1)
      expect(gate).toBeLessThan(touch)
    })
  }

  it('manage-link.ts decides eligibility from the booking source (a partner never gets a token or a hit)', () => {
    const src = read('lib/manage-link.ts')
    expect(anyFunctionBody(src, 'isEligibleBooking')).toMatch(/isPartnerBooking\(/)
    // resolveManageToken must also refuse a partner row that already has a token (a token created before the rule).
    expect(anyFunctionBody(src, 'resolveManageToken')).toMatch(/isPartnerBooking\(/)
  })

  it('cancel.ts computes the partner flag before the first status write and gives a client no way through', () => {
    const body = anyFunctionBody(read('lib/payments/cancel.ts'), 'runCancel')
    const partner = body.indexOf('isPartner(booking)')
    const clientRefusal = body.search(/if \(partner\) return \{ kind: 'not_cancellable'/)
    const statusWrite = body.indexOf('advanceBookingStatus(')
    expect(partner).toBeGreaterThan(-1)
    expect(clientRefusal).toBeGreaterThan(partner)
    expect(statusWrite).toBeGreaterThan(clientRefusal)
    // Every money step after the status change is behind the partner early return.
    const afterPartner = body.indexOf('if (partner) {')
    expect(afterPartner).toBeGreaterThan(statusWrite)
    expect(body.indexOf('getPaymentsStripe(')).toBeGreaterThan(afterPartner)
    expect(body.indexOf('openFeeCase(')).toBeGreaterThan(afterPartner)
  })

  it('the fee route re-checks the action matrix (which refuses partners) before any engine call', () => {
    const src = read('app/api/admin/bookings/[id]/fee/route.ts')
    for (const handler of ['handleCharge', 'handleWaive', 'handleChargeSavedCard', 'handleMarkCashSettled', 'handleReopenCash']) {
      const body = anyFunctionBody(src, handler)
      const gate = body.indexOf('allowedPaymentActions(booking).includes(')
      expect(gate, `${handler} must check the matrix`).toBeGreaterThan(-1)
      const touch = body.search(/loadFeeCase\(|addPaymentNote\(|runFeeCharge\(|runCashCardCharge\(|chargeFromCollected\(|waiveFee\(|settleCash\(|reopenCash\(|recordClick\(/)
      expect(touch, `${handler} must call the engine`).toBeGreaterThan(-1)
      expect(gate).toBeLessThan(touch)
    }
    expect(read('lib/payments/actions.ts')).toMatch(/isPartnerBooking\(\{ booking_source/)
  })

  it('the client routes resolve the token before any engine call and map an unknown token to one answer', () => {
    const cancel = read('app/api/manage/cancel/route.ts')
    expect(cancel.indexOf('resolveManageToken(')).toBeGreaterThan(-1)
    expect(cancel.indexOf('resolveManageToken(')).toBeLessThan(cancel.indexOf('cancelBooking('))
    const change = read('app/api/manage/change-request/route.ts')
    expect(change.indexOf('resolveManageToken(')).toBeGreaterThan(-1)
  })
})

// ── 5. no typed euro amount in any file Phase 89 added under app/ or components/ ──────────────────────────────────

describe('files added by Phase 89 under app/ and components/ hold no typed euro amount', () => {
  const ADDED = [
    'app/[locale]/manage/[token]/InvalidManageLinkView.tsx',
    'app/[locale]/manage/[token]/ManageActions.tsx',
    'app/[locale]/manage/[token]/ManageHeader.tsx',
    'app/[locale]/manage/[token]/loading.tsx',
    'app/[locale]/manage/[token]/page.tsx',
    'app/api/admin/bookings/[id]/fee/route.ts',
    'app/api/manage/cancel/route.ts',
    'app/api/manage/change-request/route.ts',
    'components/admin/CancelBookingDialog.tsx',
    'components/admin/CancellationPolicySettings.tsx',
    'components/admin/CashCardChargeModal.tsx',
    'components/admin/FeeCaseBadge.tsx',
    'components/admin/FeeChargeModal.tsx',
    'components/admin/FeeDecisionBanner.tsx',
    'components/admin/FeeWaiveModal.tsx',
    'components/admin/MarkCashModal.tsx',
    'components/admin/ReopenCashModal.tsx',
    'components/admin/paymentParts.tsx',
    'components/admin/paymentShared.ts',
    'components/booking/CancellationPolicyNote.tsx',
  ]
  const TYPED_EURO = /€\s*\d|\d\s*€|\bEUR\s*\d|\d\s*EUR\b/

  it('lists the files that exist (floor)', () => {
    expect(ADDED.length).toBeGreaterThanOrEqual(20)
    for (const f of ADDED) expect(fs.existsSync(path.join(REPO_ROOT, f)), f).toBe(true)
  })

  for (const file of ADDED) {
    it(`${file} has no typed euro amount`, () => {
      expect(stripComments(read(file))).not.toMatch(TYPED_EURO)
    })
  }

  it('no other file under app/api/manage or app/[locale]/manage has appeared without being listed here', () => {
    const found = [...listFiles('app/api/manage', ['.ts', '.tsx']), ...listFiles('app/[locale]/manage', ['.ts', '.tsx'])]
    for (const f of found) expect(ADDED, `${f} must be added to the list above`).toContain(f)
  })
})

