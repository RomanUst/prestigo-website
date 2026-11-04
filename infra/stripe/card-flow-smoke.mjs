#!/usr/bin/env node
/**
 * infra/stripe/card-flow-smoke.mjs
 *
 * Stripe TEST-MODE smoke for the card-on-file engine (Phase 88 plan 04, PAYF-04 working test-mode
 * path, D-07). OWNER-RUN with a test key, so it works without the dead .env.local key. It runs the
 * exact Stripe call shapes lib/payments uses against Stripe test mode with the SCA / decline test
 * cards and prints one line per scenario:
 *
 *   PASS <name>
 *   FAIL <name> expected=<x> observed=<y>
 *
 *   STRIPE_TEST_SECRET_KEY=<your test key> node infra/stripe/card-flow-smoke.mjs
 *   node infra/stripe/card-flow-smoke.mjs        (prompts for the key, hidden)
 *
 * Scenarios:
 *   S1 off-session manual-capture hold on a saved card        -> requires_capture
 *   S2 capture of less than the held amount                    -> succeeded, amount_received = cap
 *   S3 release of a hold (cancel, requested_by_customer)       -> canceled
 *   S4 always-authenticate card, off-session                   -> error authentication_required
 *   S5 SCA card that declines even when set up                 -> decline insufficient_funds
 *   S6 card that attaches fine but fails the charge            -> card_declined
 *   S7 the S1 create repeated with the same idempotency key    -> the same PaymentIntent id
 *   S8 PaymentIntent search on metadata['cofBookingId']        -> finds the S1 PaymentIntent (A7)
 *
 * A scenario that Stripe test mode does not reproduce is reported as FAIL with the observed code. It
 * is never skipped. Exit 0 only when every scenario passes.
 *
 * Exit codes: 0 all passed, 1 refused (not a sk_test_ key, anything on argv) or a scenario failed,
 * 2 config error.
 *
 * SAFETY (T-88-09): the key is read from the environment or a hidden prompt, never argv. Any key that
 * is not a test secret key is refused before a client exists. Only synthetic data goes to Stripe (a
 * smoke-<timestamp> id, no name, email or phone). Output carries error CODES only, never messages, and
 * passes the scrubber.
 */

import { pathToFileURL } from 'node:url'
import { createScrubber, resolveSecret, SecretInputError } from '../lib/secret-io.mjs'

const TEST_KEY_PREFIX = 'sk_test_'
const HOLD_AMOUNT_MINOR = 5000
const CAPTURE_AMOUNT_MINOR = 3000
const CURRENCY = 'eur'
const SEARCH_ATTEMPTS = 6
const SEARCH_DELAY_MS = 5000

/** @param {unknown} key */
export function isTestKey(key) {
  return typeof key === 'string' && key.startsWith(TEST_KEY_PREFIX) && key.length > TEST_KEY_PREFIX.length
}

/** A compact, single-token description of a Stripe error: codes only, never the message. */
function observeError(error) {
  const parts = [`code=${error?.code ?? error?.type ?? 'unknown'}`]
  if (error?.decline_code) parts.push(`decline_code=${error.decline_code}`)
  return parts.join(',')
}

const holdKey = (id, n) => `hold:${id}:${n}`
const capKey = (id, n) => `cap:${id}:${n}`
const relKey = (id, n) => `rel:${id}:${n}`

/** Exact shape of the off-session hold lib/payments creates (research Pattern 6). */
function holdParams({ customer, paymentMethod, smokeId, reference, attempt }) {
  return {
    amount: HOLD_AMOUNT_MINOR,
    currency: CURRENCY,
    customer,
    payment_method: paymentMethod,
    payment_method_types: ['card'],
    capture_method: 'manual',
    off_session: true,
    confirm: true,
    metadata: { kind: 'card_hold', cofBookingId: smokeId, attempt: String(attempt), bookingReference: reference },
    expand: ['latest_charge'],
  }
}

/**
 * @param {{ key?: string, client: any, argv?: string[], now?: () => number, sleep?: (ms: number) => Promise<void>,
 *           out?: (line: string) => void, err?: (line: string) => void }} deps
 * @returns {Promise<number>} exit code
 */
export async function runCardFlowSmoke({
  key,
  client,
  argv = [],
  now = () => Date.now(),
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  out = (line) => console.log(line),
  err = (line) => console.error(line),
}) {
  const { scrub } = createScrubber(typeof key === 'string' ? [key] : [])
  const say = (line) => out(scrub(line))
  const complain = (line) => err(scrub(line))

  if (argv.length > 0) {
    complain('refused: no command-line arguments are accepted (the key comes from STRIPE_TEST_SECRET_KEY or the hidden prompt)')
    return 1
  }
  if (!isTestKey(key)) {
    complain('refused: test-mode key required (this smoke only ever runs against Stripe test mode)')
    return 1
  }

  const smokeId = `smoke-${now()}`
  const reference = `SMOKE-${now()}`
  const state = {}
  const results = []

  const record = (name, ok, expected, observed) => {
    results.push(ok)
    say(ok ? `PASS ${name}` : `FAIL ${name} expected=${expected} observed=${observed}`)
  }
  /** Runs one scenario; any throw becomes a FAIL with the observed error code. */
  const scenario = async (name, expected, body) => {
    try {
      const { ok, observed } = await body()
      record(name, ok, expected, observed)
    } catch (error) {
      record(name, false, expected, observeError(error))
    }
  }
  const needs = (prerequisite) => {
    if (!prerequisite) throw Object.assign(new Error('prerequisite scenario failed'), { code: 'skipped_prerequisite_failed' })
  }

  // The off-session create, shared by the hold scenarios and the replay.
  const createHold = (attempt, paymentMethod = state.paymentMethod) =>
    client.paymentIntents.create(holdParams({ customer: state.customer, paymentMethod, smokeId, reference, attempt }), {
      idempotencyKey: holdKey(smokeId, attempt),
    })
  /** Attach a Stripe test PaymentMethod token to the smoke customer, then run an off-session hold. */
  const attachThenHold = async (token, attempt) => {
    needs(state.customer)
    const pm = await client.paymentMethods.attach(token, { customer: state.customer })
    try {
      const pi = await createHold(attempt, pm.id)
      return { error: null, pi }
    } catch (error) {
      return { error, pi: null }
    }
  }

  try {
    await scenario('S1_off_session_hold', 'requires_capture', async () => {
      const customer = await client.customers.create({ metadata: { kind: 'card_smoke', smokeId } })
      state.customer = customer.id
      const pm = await client.paymentMethods.attach('pm_card_visa', { customer: customer.id })
      state.paymentMethod = pm.id
      const setup = await client.setupIntents.create({
        customer: customer.id,
        payment_method: pm.id,
        payment_method_types: ['card'],
        usage: 'off_session',
        confirm: true,
        metadata: { kind: 'card_setup', cofBookingId: smokeId, attempt: '1', bookingReference: reference },
      })
      if (setup?.status !== 'succeeded') return { ok: false, observed: `setup_intent_${setup?.status ?? 'unknown'}` }
      const pi = await createHold(1)
      state.hold = pi
      return { ok: pi.status === 'requires_capture', observed: pi.status }
    })

    await scenario('S2_partial_capture', `succeeded,amount_received=${CAPTURE_AMOUNT_MINOR}`, async () => {
      needs(state.hold)
      const captured = await client.paymentIntents.capture(
        state.hold.id,
        { amount_to_capture: CAPTURE_AMOUNT_MINOR },
        { idempotencyKey: capKey(smokeId, 1) },
      )
      return {
        ok: captured.status === 'succeeded' && captured.amount_received === CAPTURE_AMOUNT_MINOR,
        observed: `${captured.status},amount_received=${captured.amount_received}`,
      }
    })

    await scenario('S3_cancel_release', 'canceled', async () => {
      needs(state.paymentMethod)
      const pi = await createHold(2)
      if (pi.status !== 'requires_capture') return { ok: false, observed: `hold_${pi.status}` }
      const released = await client.paymentIntents.cancel(
        pi.id,
        { cancellation_reason: 'requested_by_customer' },
        { idempotencyKey: relKey(smokeId, 2) },
      )
      return { ok: released.status === 'canceled', observed: released.status }
    })

    await scenario('S4_authentication_required', 'code=authentication_required', async () => {
      const { error, pi } = await attachThenHold('pm_card_authenticationRequired', 3)
      if (!error) return { ok: false, observed: `no_error,status=${pi?.status}` }
      return { ok: error.code === 'authentication_required', observed: observeError(error) }
    })

    await scenario('S5_insufficient_funds_after_setup', 'decline_code=insufficient_funds', async () => {
      const { error, pi } = await attachThenHold('pm_card_authenticationRequiredChargeDeclinedInsufficientFunds', 4)
      if (!error) return { ok: false, observed: `no_error,status=${pi?.status}` }
      return { ok: error.decline_code === 'insufficient_funds', observed: observeError(error) }
    })

    await scenario('S6_charge_customer_fail', 'attach_ok,code=card_declined', async () => {
      const { error, pi } = await attachThenHold('pm_card_chargeCustomerFail', 5)
      if (!error) return { ok: false, observed: `no_error,status=${pi?.status}` }
      return { ok: error.code === 'card_declined', observed: `attach_ok,${observeError(error)}` }
    })

    await scenario('S7_idempotency_replay', 'same_payment_intent_id', async () => {
      needs(state.hold)
      const replay = await createHold(1)
      return { ok: replay.id === state.hold.id, observed: replay.id === state.hold.id ? 'same_payment_intent_id' : 'different_payment_intent_id' }
    })

    await scenario('S8_metadata_search', 'found_s1_payment_intent', async () => {
      needs(state.hold)
      const query = `metadata['cofBookingId']:'${smokeId}' AND metadata['attempt']:'1'`
      // Stripe's search index is eventually consistent (up to about a minute), so poll before judging.
      let found = false
      for (let attempt = 1; attempt <= SEARCH_ATTEMPTS && !found; attempt++) {
        const page = await client.paymentIntents.search({ query })
        found = Array.isArray(page?.data) && page.data.some((p) => p.id === state.hold.id)
        if (!found && attempt < SEARCH_ATTEMPTS) await sleep(SEARCH_DELAY_MS)
      }
      return { ok: found, observed: found ? 'found_s1_payment_intent' : 'not_found_after_retries' }
    })
  } finally {
    // Best-effort tidy-up of the synthetic test customer; never affects the verdict.
    if (state.customer && typeof client.customers?.del === 'function') {
      try {
        await client.customers.del(state.customer)
      } catch {
        // leaving a synthetic test customer behind is harmless
      }
    }
  }

  const failed = results.filter((ok) => !ok).length
  say(`SUMMARY scenarios=${results.length} passed=${results.length - failed} failed=${failed}`)
  return failed === 0 ? 0 : 1
}

async function main(argv) {
  if (argv.length > 0) {
    console.error('refused: no command-line arguments are accepted (the key comes from STRIPE_TEST_SECRET_KEY or the hidden prompt)')
    process.exitCode = 1
    return
  }
  let key
  try {
    key = await resolveSecret({ envName: 'STRIPE_TEST_SECRET_KEY', label: 'Stripe TEST secret key (hidden)' })
  } catch (error) {
    console.error(`FAIL ${error instanceof SecretInputError ? error.message : 'could not read the Stripe test key'}`)
    process.exitCode = 2
    return
  }
  // No client is ever built for a key that is not a test key.
  let client
  if (isTestKey(key)) {
    const { default: Stripe } = await import('stripe')
    client = new Stripe(key)
  }
  process.exitCode = await runCardFlowSmoke({ key, client })
}

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMainModule) {
  await main(process.argv.slice(2))
}
