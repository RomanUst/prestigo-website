# Card on File: Owner Runbook (Phase 88)

Everything the owner runs by hand to take the card-on-file flow live for a canary: subscribe the Stripe
webhook, schedule the 15-minute payment tick, prove Stripe's behaviour in test mode, then walk the canary.
The `.env.local` Stripe key is a dead placeholder and live Stripe / QStash writes are owner-only, so these
scripts are the only path. None of them is run by CI, a deploy or an agent.

## Secret rules (apply to every script here)

- A key or token comes from the **environment variable** named below, or from a **hidden prompt** when you
  run the script in a terminal. It is never a command-line argument: a script given one refuses and exits 1.
- No script prints, logs or stores a key. Every output line passes a scrubber for Stripe keys, webhook
  secrets and the value in use.
- Never paste a key into a file in this repo. The pre-commit hook blocks the common shapes, but the habit is
  yours to keep.

## Prerequisites

1. Migration 085 is applied to the production database (the orchestrator does this through the Supabase MCP).
2. The Phase 88 code is merged to `main` and the production deploy is live. The webhook route and
   `/api/cron/payment-tick` must exist before you point Stripe and QStash at them.
3. Node and the repository's dependencies installed on your machine; run every command from the repository root.

## Order

### 1. Subscribe the webhook to the card events (`webhook-events.mjs`)

Adds `setup_intent.succeeded`, `setup_intent.setup_failed`, `payment_intent.amount_capturable_updated`,
`payment_intent.payment_failed`, `payment_intent.canceled` and `charge.dispute.created` to the one live
endpoint `https://rideprestigo.com/api/webhooks/stripe`. It only ever adds: `payment_intent.succeeded`,
`charge.refunded`, `checkout.session.completed` and everything else already enabled stay exactly as they
are, because the pay-now flow depends on them.

```
STRIPE_SECRET_KEY=<live secret or restricted key with webhook write> node infra/stripe/webhook-events.mjs --dry-run
STRIPE_SECRET_KEY=<same key> node infra/stripe/webhook-events.mjs ensure
```

Leave the variable out to be asked for the key with a hidden prompt. `--dry-run` prints the sorted list of
events that would be added (lines starting with `+`) and writes nothing. `ensure` prints `OK added: ...`, a
second run prints `OK unchanged`. `list` shows every endpoint with its events.

Exit 1 with a `FAIL` line means no endpoint matches `rideprestigo.com` + `/api/webhooks/stripe`, or more than
one does (ambiguous). Nothing is written in either case; fix the Dashboard and run again.

### 2. Schedule the payment tick (`../qstash/payment-tick-schedule.mjs`)

Creates the QStash schedule `prestigo-payment-tick`: `POST https://rideprestigo.com/api/cron/payment-tick`
every 15 minutes (`*/15 * * * *`), 1 retry. Running it again updates the schedule in place.

```
QSTASH_URL=https://qstash-eu-central-1.upstash.io QSTASH_TOKEN=<token> node infra/qstash/payment-tick-schedule.mjs --dry-run
QSTASH_URL=https://qstash-eu-central-1.upstash.io QSTASH_TOKEN=<token> node infra/qstash/payment-tick-schedule.mjs ensure
```

The token is in the Upstash console (QStash, EU region). The script prints `schedules: N of 10`, the Free
plan limit, and refuses to create an 11th schedule (`FAIL schedule limit`). About 96 messages a day are used
out of the 1,000 a day allowance. The daily Vercel cron stays as the backstop if QStash is ever late.

### 3. Optional: prove Stripe's behaviour in test mode (`card-flow-smoke.mjs`)

Needs a Stripe **test** secret key (`sk_test_...`, from the Dashboard in test mode). Anything else is refused
before a Stripe client exists.

```
STRIPE_TEST_SECRET_KEY=<test key> node infra/stripe/card-flow-smoke.mjs
```

It runs the exact call shapes the card engine uses against Stripe test mode and prints one `PASS` or
`FAIL ... expected=... observed=...` line per scenario: off-session manual-capture hold, partial capture,
release, an always-authenticate card failing with `authentication_required`, a card declining
`insufficient_funds` even when set up, a charge failing after a clean attach, an idempotency-key replay, and
a PaymentIntent search on `metadata['cofBookingId']`. A scenario test mode does not reproduce is a `FAIL` with
the observed code, never a silent skip. Report any `FAIL` before the canary. It uses only synthetic data and
tidies its test customer. This proves Stripe's side; the app end to end is proved by the canary below.

## Settings and Dashboard checks before the canary

In the admin: **Settings, Card on file = Owner test only**, and add your own email to the allowlist. Nobody
else sees the card checkout while it is in this mode.

In the Stripe Dashboard (live mode), confirm and note:

- **Radar:** the setting "Use Radar on payment methods saved for future use" (Radar settings). Not needed for
  your own canary card, but it must be on before any public use. See the Phase 89 blockers below.
- **Pricing plan:** blended or Interchange++. Note which one applies; it decides what a captured amount and
  any separate difference charge cost you.
- **MCC:** 4121 (taxicabs and limousines) matches how the account is set up.
- **Apple Pay domain:** already live for pay-now; nothing to do.

## Canary

Use your own real card and the cheapest route. Nothing here is charged until a hold is captured at the end.

- **Canary A: far-out booking (card saved, nothing charged).** Book a cheap route at least 5 days out. Expect:
  the booking is confirmed, the "card saved" email arrives, and nothing is charged. In the admin, use
  **Place hold now** on that booking. This exercises the off-session path on demand, so you do not wait for
  the hold date. Then complete the booking (driver link or admin) and check it is captured: the ledger shows
  the capture, the "charged" email arrives, and `payment_intent_id` is set.
- **Canary B: pickup under 72 hours (hold at checkout).** Book a pickup less than 72 hours away. Expect the
  hold to be placed at checkout, the booking confirmed, and nothing captured until completion. Complete it and
  confirm the capture the same way.
- **Canary C: cancel is release (no charge).** Make a third booking and cancel it with the release action.
  Expect the hold to be cancelled in Stripe and no charge at any point.

Also check on a phone that Apple Pay or Google Pay offers a card at the card step (the Elements setup mode is
an assumption verified here; plain card entry is the fallback).

## Rollback

Set **Settings, Card on file = Off**. New checkouts return to pay-now immediately. Bookings already made with
a saved card keep their own lifecycle (the tick still places, captures or releases them), so nothing
in flight is stranded. Webhook events and the QStash schedule can stay in place; they are harmless without
card bookings. To remove the schedule, delete `prestigo-payment-tick` in the Upstash console.

## Phase 89 go-live blockers (not needed for the canary, required before public use)

1. **Radar for saved payment methods:** turn on "Use Radar on payment methods saved for future use".
2. **Erasure (D-23):** the existing erasure function anonymises bookings in place but does not know the new
   data. Extend it to erase the stored consent IP address and user agent, and to delete the person's Stripe
   Customer (name, email, phone, saved cards), before real customers use the flow.
3. **Counsel review** of the consent text, the hold-date wording (including how exact "exact date" can be
   given while the daily backstop can run late) and the card-related emails.
4. **Abandoned-checkout parity:** the card flow creates the unpaid booking at submit, not when the page opens.
   Acceptable for the canary; decide how abandoned card checkouts are followed up before going public.
