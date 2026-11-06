# Phase 89: Cancellation Policy, Cash Guarantee & No-Show - Research

**Researched:** 2026-11-06
**Domain:** Payment-engine extension (Stripe off-session fee charges, cash-guarantee mode), token-gated public self-service page, policy engine, 7-locale public wording, go-live
**Confidence:** HIGH on how the existing code behaves (every claim below was read in this session); MEDIUM on the recommended designs (they are proposals built on that code); Stripe facts are cited from docs.stripe.com.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Carried forward (decided before this discussion: do not re-ask)**
- Policy: free until 1 h before pickup for trips up to 100 km, until 12 h before for longer trips, otherwise 100%. Km, hours and percent are admin settings (ROADMAP, 2026-11-02).
- No-show is operator-charged, never automatic on the driver's tap. Wait thresholds are the live settings `noshow_wait_city_min` 30 and `noshow_wait_airport_min` 60 (counted as in `lib/no-show.ts`).
- GNet / partner bookings get no cash guarantee and no no-show charge. Card flow covers one-way `transfer` and `hourly` only; `round_trip` and `daily` stay on pay-now (88 D-19).
- Status CAS runs before any money step; a failed money step keeps the cancel, leaves `refund_failed` and alerts (88 D-20).
- Only `lib/payments/state.ts` writes `payment_state`. Stripe SDK stays 21.0.1, no new runtime dependencies.

**Client manage-booking page**
- **D-01:** The confirmation email carries a button to a manage-booking page. There the client can cancel, book a new ride, and ask for a change. A change is a request to the operator, who edits the booking in admin; no self-service editing here.
- **D-02:** Access is a secret per-booking link from the email, no password, for guests and account holders alike. Cancelling still asks for confirmation on the page. Signed-in clients get the same actions from My trips. — **Reversibility:** costly — links already sent in emails must keep working or be revoked deliberately.
- **D-03:** The client can cancel up to the pickup time, whatever the booking status, also when the driver is already on the way. The policy decides the money; the status does not. If a driver is assigned they are told at once.
- **D-04:** In time: the cancel applies at once, a hold is released or a payment refunded with no human. Late: the client sees that 100% applies and confirms; the booking is cancelled at once and the driver told; the money waits for the operator. An uncaptured hold stays in place until the operator decides.

**Late cancellation**
- **D-05:** The operator decides late cancellations: the dialog proposes 100%, and the operator charges or waives with a reason (flight cancelled, regular client). The site already promises a full refund for a cancelled flight.
- **D-06:** Hourly bookings have no km: they use the 12 h rule by default, through their own admin setting.
- **D-07:** Pay-now bookings follow the same policy: on a late cancel the money stays unless the operator waives it. This changes today's full refund in the admin cancel route.

**Cash guarantee**
- **D-08:** "Pay cash to driver" is offered to everyone offered the card flow, on the same bookings. No amount limit.
- **D-09:** A late cancel of a cash booking is handled as for a card booking: the operator charges 100% to the saved card or waives. No hold is ever placed on a cash booking.
- **D-10:** If the client rode and did not pay the driver, the operator can charge the saved card with one action and a note on the reason. Never automatic. The consent text must cover this.
- **D-11:** On a cash booking the driver gets a warning at completion that cash must be collected, with the amount in the booking currency, and confirms receipt. That confirmation settles the booking in cash. This is an exception to Phase 87's rule that the driver never sees an amount: it applies only to cash bookings. The operator can also mark it settled (CASH-04).
- **D-12:** Cash is taken in the booking currency, the same amount and currency the client saw.

**No-show**
- **D-13:** The operator's contact-attempt note is required before a no-show charge. Driver timestamps are stored automatically.
- **D-14:** The operator can charge any amount up to 100%, or waive. The server enforces the upper limit. `lib/payments/actions.ts` says no function there takes an amount: this action needs a deliberate, validated exception.
- **D-15:** With no decision on a no-show or late cancel: email reminder to the operator after 24 h and a red badge in admin. Nothing is charged without a person. The hold lapses by itself; the operator can still charge the saved card afterwards.

**Go-live**
- **D-16:** No lawyer or ČOI review: the owner decided to go without one and accepts the risk (disputes, ČOI complaints). This replaces the ROADMAP legal checkpoint and CANC-02's counsel sign-off. Record the owner's decision in place of a counsel sign-off. — **Reversibility:** costly — wording shown to clients is stored per booking; later changes need a new version.
- **D-17:** Go-live is for everyone at once after the owner's own test, no staged client list. The owner flips the flag. The flag has no `on` value yet (migration 085 allows off and canary).
- **D-18:** Public wording changes together with go-live: terms, FAQ, checkout, emails, `lib/llms-content.ts`, in all 7 locales. Each booking stores the policy version it was made under; older bookings keep their terms. — **Reversibility:** one-way — a booking's accepted terms cannot be changed afterwards.
- **D-19:** An unpaid booking is never cancelled automatically: the operator decides, with the existing 24 h alert (closes the question left open by 88 D-15).

### Claude's Discretion
- Link token design, expiry after the trip, rate limits, and how the page reads in all 7 locales.
- Layout of the operator's charge or waive dialog and of the cash step on the trip screen.
- Which client emails go out for late-cancel decisions and no-show charges, as long as they use the booking language.
- How a change request reaches the operator (email alert, admin badge, or chat).
- Behaviour when a charge to the saved card is declined: reuse the recovery flow from Phase 88.

### Deferred Ideas (OUT OF SCOPE)
- Full self-service editing of a booking (date, address, vehicle, with repricing): its own phase.
- Staged rollout to a client list: rejected for now.
- Must be settled before go-live, carried from Phase 88 (these ARE in scope as go-live items): D-23 erasure of consent IP, user agent and Stripe Customer; Radar for saved cards, pricing plan, MCC 4121 confirmation; live proofs (tick-placed hold, decline and recovery, Arabic `card_saved` email, site refund of a captured card booking); confirmation page and cancelled email are English in every locale; English "or" in the contact line; chat button over the consent text on a phone.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| HOLD-06 | Cancelling releases an uncaptured hold (no Stripe fee) or refunds a captured payment according to the policy | Sections "Cancellation orchestration", "Late-cancel money state"; Stripe: cancel is free, refund keeps the processing fee |
| CANC-01 | Free until 1 h (<=100 km) / 12 h (>100 km), later 100%; km/hours/percent in admin | "Policy engine", migration 087 settings columns, settings route |
| CANC-02 | Policy and consent shown at checkout, confirmation email and terms in 7 locales; counsel sign-off replaced by owner decision (D-16) | "Public wording inventory", consent version bump, owner-decision record |
| CASH-01 | Client can choose "pay cash to driver"; card saved as guarantee, no hold | "Cash-guarantee mode" (payment_mode CHECK already allows `cash_guarantee`) |
| CASH-02 | Driver can mark no-show only after the free wait (server-enforced) | Already enforced for the driver; WR-04 admin gap must close here |
| CASH-03 | Operator confirms a no-show and charges (D-14: any amount up to 100%) with evidence stored | "Operator fee charge", fee-case table, evidence snapshot |
| CASH-04 | Operator can mark a cash booking settled in cash (also: driver confirmation, D-11) | New `cash_settled` state, driver token action, admin action |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- Type check `npx tsc --noEmit` (baseline: 8 old errors in `tests/` only). Lint `npx eslint --quiet <files>` (baseline: `<a>`->`<Link>` in both `not-found.tsx`). Tests `npx vitest run [files]` (full suite ~90 s); `vitest related` crashes - grep `tests/` instead. Quality gate = the `verify` skill. Never run `npm run dev` in Bash.
- No hard-coded `€` prices in `app/` or `components/` (amounts come from `lib/route-prices.ts`, `lib/pricing-config.ts`, `lib/airport-promo.ts`; the pre-commit hook enforces it). Fee amounts shown to the operator/driver must be formatted from integer minor units with `formatMinor` (`lib/payments/money.ts`), never typed.
- Marketing content (blog, social): no prices, no comparisons with Uber/ride-hailing. The blog article `app/[locale]/blog/prague-vienna-transfer-vs-train/page.tsx` carries the old policy ("Free up to 1 h before") and must be corrected at go-live without adding a number.
- `middleware.ts` matcher must exclude every static/metadata extension. Any new public route must not be shadowed by that exclusion; next-intl sets `NEXT_LOCALE` on every response (its presence is not a user choice).
- New EN strings in `messages/en.json` need real translations in all other locales. Never run `scripts/i18n-translate.mjs --dry-run` on the repo tree. The i18n GitHub workflow is disabled (no API credit): translate in-session.
- Golden-HTML / JSON-LD snapshot tests must normalise `priceValidUntil`.
- Security work (auth, CSRF, validation, rate limits): run tests, commit with `security:` prefix. This phase is security-relevant (off-session charges, token links).
- No secrets / `.env*` in commits; never read `.env.local`. Vercel Preview deploys always fail (non-blocking).
- Brand spelling: Prestigo / rideprestigo.com. All user-facing communication with the owner is in Russian (memory); this file is English for the planner.

## Summary

The Phase 88 engine already contains almost everything Phase 89 needs, but it is built around one assumption: **money is only collected after a completed trip, for the full booking amount, from a `card_hold` booking**. Phase 89 breaks that assumption three ways (a fee after a cancel or no-show, a partial amount chosen by a person, and a booking mode that never holds). The code was inspected for each break point. The good news: `payment_mode` already allows `cash_guarantee` (085:56-64), the DB-level capture claim does not look at `bookings.status` (086 gate is only passed by the hold paths), partial capture and "charge the saved card when the hold is gone" already exist in `settle.ts`, and the recovery-link flow works for any `failed` row. The bad news: five places silently destroy the option to charge a fee later (the cancel route calls `releaseHold`, which moves to the terminal `released`; `abandonHoldForClosedBooking` does the same for an in-flight hold; `allowedPaymentActions` offers only `release` on closed bookings; `settleBooking` skips non-completed and non-`card_hold` rows; `isCardFlowEligible` has no `on` mode).

The recommended shape is: (1) a pure, client-safe policy module plus a per-booking **snapshot** of the thresholds and a policy version (stored on `bookings`, because pay-now bookings have no consent row); (2) one shared **cancellation orchestrator** used by the admin route, the client manage route and My trips, which computes free/late once, runs the existing status CAS first, then either releases/refunds (free) or opens a **fee case** and leaves the hold/card untouched (late); (3) a new service-only `booking_fee_cases` table (operator note, evidence snapshot, decision) with a denormalised `bookings.fee_case_status` so the admin list can show the red badge without changing the search RPC; (4) a separate admin fee route that is the single, validated place where an operator-chosen amount enters (cap = `payment_amount_minor`), executed by an extended `settleBooking` so "nothing else collects client money" stays true; (5) one new payment state, `cash_settled`, plus ledger kinds, in migration 087; (6) a token-gated localized manage page built on the driver trip-link pattern (random token in its own service-only table, `Referrer-Policy: no-referrer`, third-party scripts suppressed, rate limits keyed in `lib/rate-limit.ts`, whose unknown keys are **unlimited**); (7) a go-live checklist that includes the `on` flag value, the erasure gap (D-23) and the deferred Phase 88 items.

**Primary recommendation:** Build the policy engine and the shared cancel orchestrator first and make "late cancel never releases" the invariant; add fee collection by extending `settleBooking` (amount parameter, closed-booking allowed, `cash_guarantee` allowed) instead of writing a second charge path; keep operator-supplied amounts out of `/api/admin/bookings/[id]/payment` and put them in a new strict-schema fee route.

## Conflicts and gaps between CONTEXT.md and the code

1. **No `payment_mode` migration is needed.** CONTEXT/prompt imply a CHECK change for cash mode; the 085 CHECK already lists it: `CHECK (payment_mode IN (` ... `'pay_now',` `'card_hold',` `'cash_guarantee',` `'quote',` `'partner'` `))` [VERIFIED: supabase/migrations/085_payment_state_card_on_file.sql:56-64] and `export const PAYMENT_MODES = ['pay_now', 'card_hold', 'cash_guarantee', 'quote', 'partner'] as const` [VERIFIED: lib/payments/state.ts:33]. What is missing is a **state** for "paid in cash" (the 11 states have none) and ledger kinds. The `card_flow_mode` CHECK does lack `on`: `CHECK (card_flow_mode IN ('off', 'canary')),` [VERIFIED: 085:250-252].
2. **The consent table CHECK blocks a cash consent.** `mode              text        NOT NULL CHECK (mode IN ('setup', 'hold_now')),` [VERIFIED: 085:209]. A third consent text (cash guarantee + fee mandate) needs this widened.
3. **"Release on cancel" is wrong for a late cancel and is terminal.** `captured: [], released: []` [VERIFIED: state.ts:121-122]. After `releaseHold` the saved card can never be charged through the state machine (D-15 "operator can still charge the saved card afterwards" is impossible unless the late path never reaches `released`).
4. **Operator-initiated cancels are not covered.** D-04/D-05/D-07 describe the *client* cancelling late. If the operator cancels because Prestigo cannot serve the trip, a late-cancel fee must not open. Recommendation: the admin cancel dialog gets an explicit "Cancelled by: client / Prestigo" choice; Prestigo-initiated is always free (release/refund). This needs an owner nod (Open Question 1).
5. **ROADMAP criterion 4 and REQUIREMENTS CASH-03 say "charges 100%"; D-14 says any amount up to 100%.** D-14 wins (later, explicit). REQUIREMENTS.md CASH-03 and CANC-02 ("reviewed by counsel") should be amended in the same change that records D-16, so the traceability table is not contradicted.
6. **`tests/payments-copy-i18n.test.ts` and `lib/payments/emails/render.ts` forbid fee wording** ("no email states a cancellation fee, a refund promise or a cancellation threat (Phase 89 owns the policy)" [VERIFIED: render.ts header]; the test asserts "no refund / cancellation-fee wording in any language"). Both are deliberate Phase 88 guards that Phase 89 must replace with a positive allow-list, not delete.
7. **The driver page and tests hard-forbid amounts** (`D-06: the driver never sees an amount, so the booking amount is not selected at all.`; tests/driver-trip.test.ts:294-314, tests/driver-trip-screen.test.tsx:211,409). D-11 is a scoped exception: the three tests must be changed to "no amount unless `payment_mode = cash_guarantee`", not removed.
8. **`allowedPaymentActions` comment promises** `(Phase 89 owns cancellation / no-show fees)` [VERIFIED: actions.ts:58-59] - consistent with this plan.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Free-until / late computation | API / Backend (pure module, server time) | Browser (display only, same pure module) | Time and thresholds must be server authoritative; the client sees the same function for the preview and sends back an acknowledgement the server cross-checks |
| Policy snapshot + version per booking | Database (`bookings` columns) | API (writes at row creation) | D-18: a booking's accepted terms are immutable |
| Cancel orchestration (status CAS, release/refund, fee case) | API / Backend | Database (CAS RPCs) | Status CAS first, then money (88 D-20) |
| Fee charge with operator amount | API / Backend (`settleBooking` extension) | Database (`apply_payment_transition`) | Only `lib/payments/state.ts` writes `payment_state`; Stripe keys + CAS prevent double charge |
| Cash settled (driver / operator) | API / Backend | Browser (driver trip screen) | Driver token route is unauthenticated-bearer; server decides eligibility |
| Manage link (token, page, cancel, change request) | Frontend Server (SSR localized page) | API (mutating routes), Database (token table) | Page is server-rendered per request; mutations are POST routes with CSRF + rate limit |
| Operator reminder (24 h) + red badge | API (tick step) + Database (`fee_case_status`) | Browser (admin badge) | Reuses tick and `sendPaymentOperatorAlert` |
| Public wording (terms, FAQ, checkout, emails, llms) | Static content (`content/pages`, `messages`) | Frontend Server (`lib/llms-content.ts`) | 7 locales; numbers must come from one place |
| Go-live flag `on` | Database CHECK + `lib/payments/config.ts` | Admin settings UI | `config.ts` is the only reader of `card_flow_mode` |
| Erasure of new PII (D-23) | Database (075 function replaced) | API saga (`lib/erasure.ts`) | Supabase half is SQL; Stripe half is a runbook/saga step |

## Standard Stack

No new runtime dependency (locked). Everything below is already installed. [VERIFIED: node_modules package.json read this session]

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| stripe (node SDK) | 21.0.1 (locked) | `paymentIntents.capture` with `amount_to_capture`, off-session `create`, `refunds.create` with `amount` | Already used by `settle.ts` / cancel route; the fake in `tests/helpers/fake-stripe.ts` already models partial capture and partial refunds |
| next | 16.2.3 | App Router pages, route handlers, `after()` | Project framework |
| next-intl | 4.14.2 | Localized manage page, catalog-driven emails | `localePrefix: 'as-needed'` routing, `createTranslator` for emails |
| zod | existing | Strict request schemas (two-step parse rule) | All admin routes use it |
| vitest | 4.1.5 | Test runner | `npx vitest run` |
| @supabase/supabase-js | existing | Service client + SECURITY DEFINER RPCs | Single-writer RPC pattern of 085/086 |
| resend | existing | Client emails + operator alerts via `deliverOnce` | Exactly-once, send-then-record |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Random token in a service-only table | HMAC-derived token (`HMAC(secret, bookingId+epoch)`), nothing stored | No table, trivial rotation by epoch, but needs a NEW Vercel secret and the owner must set it (project rule: secret writes need the owner). Rejected as default |
| Token in URL path + suppress third-party scripts | Exchange link -> httpOnly cookie -> redirect to a token-free URL | Cleaner against script/referrer leaks but needs cookie signing and a redirect handler; the project already accepted URL-token + `no-referrer` for `/driver`. Keep the URL token |
| New `cash_settled` payment state | Reuse `released` + ledger kind `cash_settled` + `bookings.cash_settled_at` | Avoids redefining `apply_payment_transition` a third time, but `released` then means both "card freed" and "paid in cash"; reports and badges must disambiguate. Recommended: the new state |

**Installation:** none.

## Package Legitimacy Audit

No external package is installed or upgraded in this phase (CONTEXT: "no new runtime dependencies"; Stripe SDK pinned at 21.0.1). The `package-legitimacy` gate is not applicable. **Packages removed due to [SLOP] verdict:** none. **Packages flagged [SUS]:** none.

## Architecture Patterns

### System Architecture Diagram

```
                       CLIENT                                            OPERATOR                          DRIVER
  email button --> /{locale}/manage/<token> (SSR, no-store)      admin cancel dialog / fee dialog     /driver/trip/<uuid> (existing)
        |                  |  GET: policy preview from pure fn         |                                   |  Complete trip dialog (cash: amount)
        |                  v                                           v                                   v  POST {action:'confirm_cash'}
        |        POST /api/manage/cancel {token, ack}        POST /api/admin/bookings/cancel      POST /api/driver/trip/[token]/progress
        |        (CSRF strict, rate limit, ack cross-check)  (cancelled_by: client|prestigo)               |
        |        My trips: POST /api/account/... (session)           |                                      |
        v                  v                                           v                                      v
        +------------> cancelBooking() orchestrator (lib/payments/cancel.ts) <---- reads policy snapshot on the booking
                               | 1. evaluateCancellation(snapshot, booking, now)  -> free | late | too_late
                               | 2. advanceBookingStatus(to: cancelled, profile 'cancel-route')   <-- CAS FIRST (88 D-20)
                               | 3a. FREE : release hold / release saved card / refund captured or pay-now   (existing primitives)
                               | 3b. LATE : retire recovery link, DO NOT release, open booking_fee_cases(pending), bookings.fee_case_status='pending'
                               | 4. emails (booking language) + driver notice + operator alert
                               v
        Stripe: hold stays `requires_capture` (Visa MIT 5 d / others 7 d) --lapses--> webhook payment_intent.canceled --> authorized -> expired (still chargeable)

  OPERATOR DECISION  POST /api/admin/bookings/[id]/fee {charge amount_minor,note | waive,reason | cash_settled}
        |  strict schema, cap = payment_amount_minor, note required for no_show
        v
  settleBooking(bookingId, actor, { fee: { amountMinor, caseId } })  (extended; the only collector)
        |  CAS authorized|expired|card_saved|failed -> capturing   (DB does not check bookings.status here)
        |  hold alive -> capture min(fee, capturable) (rest released)   hold gone -> off-session charge of the saved card
        |  success -> captured (captured_amount_minor = fee) | decline -> failed -> recovery link + fee email + operator alert
        v
  fee case: charged | waived(+release) ;  tick step G: pending > 24 h -> operator reminder (ledger-keyed), badge stays red
```

### Recommended Project Structure
```
lib/
  cancellation-policy.ts          # pure, client-safe: types, freeHoursFor, evaluateCancellation (like lib/payments/timing.ts)
  cancellation-settings.ts        # server: getCancellationPolicy() from pricing_globals, fail-closed defaults, snapshot builder
  manage-link.ts                  # server: ensureManageToken, resolveManageToken, buildManageUrl(locale), revoke
  payments/
    cancel.ts                     # orchestrator (admin + client + account share it)
    fee.ts                        # fee-case open/decide wrappers (the only writer of booking_fee_cases)
    settle.ts                     # extended with opts.fee (amount, closed booking, cash_guarantee)
    emails/render.ts              # new kinds/variants (cancel_*, fee_*), fee wording guard replaced
app/
  [locale]/manage/[token]/page.tsx        # SSR, force-dynamic, noindex, third-party scripts suppressed
  api/manage/cancel/route.ts              # POST {token, acknowledge}
  api/manage/change-request/route.ts      # POST {token, message}
  api/account/bookings/cancel/route.ts    # POST (session) - same orchestrator
  api/admin/bookings/[id]/fee/route.ts    # POST: charge | waive | cash_settled (the only place an amount enters)
supabase/migrations/
  087_cancellation_cash_fee.sql   # settings, snapshot columns, states/kinds, consent mode, fee cases, manage tokens, card_flow_mode 'on'
  088_erasure_payment_pii.sql     # D-23: replace erasure_anonymise_person (full body) + re-REVOKE
```

### Pattern 1: Policy engine (answers Q2)

**What:** A pure function over (policy snapshot, trip facts, `nowMs`). Trip facts live on the booking row: `trip_type`, `hours`, `distance_km`, and the generated `pickup_utc` (D-22: `bookings.pickup_utc` is live as `GENERATED ALWAYS AS prestigo_text_to_utc(pickup_date, pickup_time)` [CITED: 88-CONTEXT.md D-22]; TS reads it through `pickupInstantMs`). `distance_km` is written by `buildBookingRow` as `distance_km: meta.distanceKm ? parseFloat(meta.distanceKm) : null` [VERIFIED: lib/supabase.ts:102]. Card flow trip types: `export const CARD_FLOW_TRIP_TYPES = ['transfer', 'hourly'] as const` [VERIFIED: lib/payments/config.ts:26].

**Storage (the answer to "what stores the version per booking"):** `booking_payment_consents.text_version` holds `CARD_CONSENT_VERSION = '2026-11-draft-1'` [VERIFIED: lib/payments/consent-text.ts:21] but only exists for card/cash bookings, and it versions the *authorisation wording*, not the cancellation numbers. Pay-now bookings (D-07) have no consent row. Therefore add to `bookings`: `cancel_policy_version text`, `cancel_policy jsonb` (the thresholds *as shown to the client*). NULL = a booking made before Phase 89 -> legacy terms (free until 1 h for every distance, later "up to 100% may be charged", per the old `terms.json`). The snapshot is written where the booking row is created: pay-now capture (`create-payment-intent`), card/cash capture (`createCardCheckoutIntent`), admin manual create. The thresholds shown at checkout and the snapshot must come from ONE read in the intent route (a settings change between display and insert would otherwise make stored terms differ from displayed terms). Bump the version constant whenever any policy sentence changes (mirror of the `payments-consent.test.ts` digest pin).

**Rules (all [ASSUMED] boundary choices, flagged in the Assumptions Log):** `free` while `nowMs <= pickupMs - freeHours*3_600_000`; `distance_km <= kmThreshold` -> short window, `> kmThreshold` -> long window ("up to 100 km" / "over 100 km"); hourly -> `freeHoursHourly` (D-06, own admin setting, default 12); unknown/invalid distance on a transfer -> the stricter long window; `nowMs >= pickupMs` -> `too_late` (the client cannot self-cancel any more; the operator can still cancel). `feePercent` only seeds the *proposal*; the hard cap in the fee route is 100% of `payment_amount_minor` (CANC-01 "percent configurable" and D-14 "up to 100%" are both satisfied).

**Settings columns on `pricing_globals` (087), with CHECK ranges like the existing ones** (`payment_hold_lead_hours` uses `CHECK (payment_hold_lead_hours BETWEEN 6 AND 96)` [VERIFIED: 085:247-249]): `cancel_free_km_threshold` (default 100), `cancel_free_hours_short` (1), `cancel_free_hours_long` (12), `cancel_free_hours_hourly` (12), `cancel_fee_percent` (100). Extend `app/api/admin/settings/route.ts` (zod object + `refine` list + GET select + PATCH `updates` copy) and add a settings component next to `components/admin/NoShowWaitSettings.tsx`. WR-06 (unguarded `request.json()` and no city/airport cross-check in that route) is still open - the PATCH already wraps `request.json()` in try/catch in the version read here, but there is still no `noshow_wait_airport_min >= noshow_wait_city_min` cross-check; fix when touching the file.

### Pattern 2: One cancellation orchestrator (answers Q3 and Q5 client cancel)

**What:** `cancelBooking({ bookingId, initiator: 'client_token' | 'client_account' | 'admin_client' | 'admin_prestigo', actor, nowMs })` in `lib/payments/cancel.ts`. The admin route, the manage route and the My-trips route all call it. It generalises what `app/api/admin/bookings/cancel/route.ts` does today (status CAS first at lines 169-188, then the money step at 231-299) and fixes the three assumptions that break.

**Status step.** Client cancel goes through `advanceBookingStatus` with `profile: 'cancel-route'` (no side effect inside: `if (profile === 'cancel-route' || profile === 'payment-engine') return result` [VERIFIED: lib/booking-status-service.ts:217]) and actor `{ type: 'system', id: 'client_token' }`. `StatusActor` is `admin | driver | system` and the log CHECK is `actor_type text NOT NULL CHECK (actor_type IN ('admin', 'driver', 'system'))` [VERIFIED: 084_booking_statuses_status_log.sql:59]; `source` must match `'^[a-z_]{1,40}$'` [VERIFIED: 084:61] -> use `client_cancel`. The transition map allows cancel from `unpaid, pending, confirmed, assigned, en_route, on_location, on_board` and nothing from `completed`/`no_show` [VERIFIED: lib/booking-transitions.ts:17-26]. D-03 says "up to the pickup time": the client rule is `status IN (confirmed, assigned, en_route, on_location, pending) AND now < pickup_utc` - `on_board` means the passenger is in the car, so the client route must refuse it even though the map allows it for admins.

**Money step (the matrix the planner must implement):**

| Booking | In time (free) | Late |
|---|---|---|
| `card_hold`, `card_saved` / `failed` / `expired` (no live hold) | `releaseHold` -> `released`, no Stripe call | open fee case; keep state; **retire the recovery link** (a `failed` row still has a payable link whose email says "pay to confirm your booking") |
| `card_hold`, `authorized` | `releaseHold` cancels the PaymentIntent -> `released` | open fee case; PaymentIntent stays `requires_capture`; webhook later moves `authorized -> expired` |
| `card_hold`, `checkout_pending` | `releaseHold` voids a hold-now PI -> `released` | no card on file: release, no fee case |
| `card_hold`, `captured` / `balance_due` (client paid a recovery link before the trip) | refund in full (existing `collectedMinor` + `refund:<id>:full`) | keep the money, fee case pending; waive = refund |
| `cash_guarantee`, `card_saved` | release (no Stripe) | open fee case (D-09) |
| `pay_now` with `payment_intent_id` | refund in full (existing path) | **keep** (D-07), fee case pending; waive = refund `price - fee` |
| `placing_hold` (lease live) / `capturing` | 409 `payment_busy`; for the client page: "try again in a minute" | same |
| no money (manual, `unpaid`), partner | status only | status only, never a case (`assertMoneyEligible`) |

What the engine does *today* to a cancelled booking with an uncaptured hold [all VERIFIED in this session]: the admin cancel route calls `releaseHold(current, { actor, reason: 'cancel' })` (cancel/route.ts:270), which for `authorized` cancels the PaymentIntent and ends `released` (hold.ts:574-578, 602-608); tick step A cannot claim it (`AND b.status IN ('confirmed', 'assigned', 'en_route', 'on_location')` 085:477; `requireStatus: HOLD_ACTIVE_STATUSES` hold.ts:153); step B skips it; step C excludes it (`.neq('status', 'cancelled')` tick.ts:214); step D's expiring-hold alert excludes it (tick.ts:358); step F excludes it (tick.ts:437). Migration 086 refuses `placing_hold -> authorized`/`failed` on a cancelled row (086:80) and the hold engine then calls `abandonHoldForClosedBooking`, which voids the PaymentIntent and moves `placing_hold -> released` (hold.ts:164-222) - **terminal, so a late-cancelled booking caught mid-hold loses its fee option**. When Stripe lapses the authorization the webhook moves `authorized -> expired` regardless of booking status (hold-events.ts handleHoldCanceled), and `expired -> capturing` is a legal transition (state.ts:120). Capture/charge on a closed booking is therefore blocked only in TypeScript, not in the database: `settleBooking` returns `skipped` for `payment_mode !== 'card_hold'` and for `!isCompleted(loaded)` (settle.ts:425-426), and `allowedPaymentActions` returns only `['release']` for cancelled/no-show (actions.ts:70).

**Required changes:** (a) `abandonHoldForClosedBooking` takes the fee-case into account: when the booking has a pending fee case it voids the authorization but moves `placing_hold -> card_saved` (legal: state.ts:115), not `released`; (b) `releaseHold` stays the "free"/"waive" primitive and is never called on a late cancel; (c) the fee case row is opened in the **same request** as the status CAS, before any early return, so a lost response cannot leave a late-cancelled booking with no case (the open is idempotent on `booking_id`); (d) admin `PATCH` already refuses `cancelled` for `card_hold` with `use_cancel_route` (route.ts:341); extend that guard to `cash_guarantee` and to pay-now bookings that carry a `payment_intent_id`, otherwise an operator can cancel a paid booking without the policy step.

**Busy lease and dead workers.** The cancel route returns 409 `payment_busy` for `capturing` or a live `placing_hold` lease *before* the CAS (cancel/route.ts:126-131). Keep that for the admin. For the client page the same check runs before the CAS and shows a retry message; do not cancel first and release later, because a worker that dies leaves nothing to release it. Add **tick step G**: cancelled/no-show cards whose state is still `authorized/card_saved/failed/expired` with an *in-time* case resolution `free` (or no case) get released, and fee cases `pending` for more than 24 h trigger the reminder alert (D-15).

### Pattern 3: Cash-guarantee mode (answers Q1)

**What changes, file by file (every place the literal `card_hold` decides behaviour - from `grep -rln card_hold app lib components`):**

| File | Today | Change for `cash_guarantee` |
|---|---|---|
| `lib/payments/checkout.ts` | `const row = { ...buildBookingRow(meta, null, 'unpaid'), payment_mode: 'card_hold' }`, `captureUnpaidBooking(row, attemptId, 'outbound', 'card_hold')`, `existing.payment_mode !== 'card_hold'` -> `attempt_closed` (checkout.ts:148,160,163) | New `createCashCheckoutIntent` (or a `payment: 'cash'` input): `payment_mode: 'cash_guarantee'`, always the SetupIntent path (never `hold_now`, even inside the hold lead), `hold_at: null`, new consent mode `cash_setup` |
| `lib/supabase.ts` `captureUnpaidBooking` / `flowConflict` | `flow?: 'pay_now' \| 'card_hold'`; `if (flow === 'pay_now') return existing.payment_mode === 'card_hold'`; card flow: `otherMode = existing.payment_mode !== 'card_hold'` | Add `'cash_guarantee'` to the union and make all three cross-flow checks symmetric, otherwise a pay-now capture can overwrite a cash row and a client who switches card <-> cash on one `attemptId` gets `ATTEMPT_CLOSED`. Rotate the attempt when the client switches the choice (as `rotateAttemptIfCardUsed` does) |
| `app/api/card-checkout/init/route.ts` / `intent/route.ts` | modes `setup \| hold_now`, eligibility via `isCardFlowEligible` | init returns `cashAvailable`; intent body gets `payment: 'card' \| 'cash'`; the MODE_CHANGED / HOLD_DATE_CHANGED cross-checks do not apply to cash; consent must be `true` |
| `booking_payment_consents` CHECK (085:209) | `mode IN ('setup','hold_now')` | widen with `'cash_setup'`; `consentMessageKey` / `buildConsentText` / the Step6 label get a `consentCash` key; **bump `CARD_CONSENT_VERSION`** and its digest pin |
| `lib/stripe-webhook/card-confirm.ts` `applySetupSucceeded` | no mode check (works for cash); but it logs `hold_scheduled:<si>` and sends the `card_saved` email whose text says the hold is placed on a date and the card is charged after the trip (card-confirm.ts:270-275) | skip `hold_scheduled` for cash; send a `card_saved:cash` email variant ("Pay your driver in cash; your card is only a guarantee") |
| `claim_due_payment_work` (085:476) | `WHERE b.payment_mode = 'card_hold'` | **leave as is**: this is what guarantees "no hold is ever placed on a cash booking" at the database level. Add a test that a cash row with `hold_at` set is never claimed |
| `lib/payments/tick.ts` step E (reconcile stuck checkout), line 128 `.eq('payment_mode', 'card_hold')` | cash `checkout_pending` rows are never reconciled if the webhook is missed | `.in('payment_mode', ['card_hold','cash_guarantee'])` |
| `lib/payments/tick.ts` steps A-D, F | `card_hold` only | unchanged for cash (no hold, no completion capture) |
| `lib/payments/settle.ts` | `payment_mode !== 'card_hold'` -> `skipped` (settle.ts:425) | trip completion keeps skipping cash; only the fee path (below) accepts cash |
| `lib/payments/hold.ts` `releaseHold` | `if (booking.payment_mode !== 'card_hold') return 'noop'` (hold.ts:565) | accept `cash_guarantee` (only `card_saved`/`checkout_pending`/`failed` can occur, no Stripe call except the hold-now void) |
| `lib/payments/actions.ts` `allowedPaymentActions` | `if (booking.payment_mode !== 'card_hold') return []` (actions.ts:63) | cash gets `release`, `mark_cash_settled`; the fee actions live in the new fee route |
| `lib/payments/edit-hook.ts` | `if (before.payment_mode !== 'card_hold') return null` | cash branch: a price edit must update `payment_amount_minor` (self-loop `card_saved -> card_saved`, legal), otherwise the driver is shown a stale amount (D-12) |
| `lib/payments/recovery.ts` `handlePaymentFailure` | `if (booking.payment_mode !== 'card_hold') return` (recovery.ts, after the partner gate) | accept cash (fee decline recovery) |
| `lib/stripe-webhook/dispatch.ts` `observeRefund` | `rows.filter((r) => r.payment_mode === 'card_hold')` | include cash |
| `app/api/admin/bookings/route.ts` PATCH | `use_cancel_route` only for `card_hold` | also cash and paid pay-now |
| `components/admin/BookingsTable.tsx`, `PaymentPanel.tsx` | several `card_hold` branches | cash badge/panel |

**State machine additions (migration 087 + `lib/payments/state.ts`):** new state `cash_settled` (terminal; `card_saved -> cash_settled`; optional admin-only `cash_settled -> card_saved` to undo a mistaken driver tap - see Pitfall 9); ledger kinds `cash_settled`, `fee_opened`. `apply_payment_transition` validates the target against a hard-coded array (`v_states constant text[] := ARRAY['none', 'checkout_pending', ... 'released']` [VERIFIED: 086:39-42]), so adding a state means a `CREATE OR REPLACE FUNCTION` of the full function again; **keep the 086 `p_require_status` gate text verbatim** because `tests/payments-migration-086.test.ts` reads the latest definition via `latestFunctionBody`. Also widen `bookings_payment_state_check` and `booking_payment_events_kind_check`, update `PAYMENT_STATES`/`TRANSITIONS`/`LEDGER_KINDS` in `state.ts`, `FAKE_PAYMENT_VOCABULARY` in `tests/helpers/fake-payments-db.ts`, and the admin badge. `payment_intent_id` stays "set only at capture" (085 `IF v_patch ? 'payment_intent_id' AND p_to NOT IN ('captured', 'balance_due')`), so a cash-settled row keeps it NULL.

### Pattern 4: Operator charge with an amount (answers Q4; D-14, CASH-03, D-10)

**Where the amount may enter.** `lib/payments/actions.ts` states "no function here takes an amount: every amount is derived from the booking row by the engine" [VERIFIED: actions.ts:7-9], and `POST /api/admin/bookings/[id]/payment` uses `z.strictObject({ action: ... })` so "an extra field (an amount in particular) is a 400" [VERIFIED: payment/route.ts schema comment]. Keep both true. The deliberate exception is a **new route** `POST /api/admin/bookings/[id]/fee` with its own strict discriminated union:

- `{ action: 'charge', amount_minor: int, reason?: string<=500, contact_note?: string<=1000 }`
- `{ action: 'waive', reason: string 1..500 }`
- `{ action: 'cash_settled' }` (operator marks cash, CASH-04) and, if adopted, `{ action: 'reopen_cash' }`

Guard order = the payment route's: `enforceMaxBody` -> `getAdminUser` (401/403) -> `await params` -> uuid (400) -> JSON parse (400) -> strict schema (400) -> booking (404) -> business rules (422: case not pending, `amount_minor` not in `1..payment_amount_minor`, note missing for a no-show/cash-unpaid case, booking not in a chargeable state, partner) -> engine (409 busy). Cap and currency come only from the row (`payment_amount_minor`, `payment_currency`); the request never carries a currency.

**Collector.** Extend `settleBooking(bookingId, actor, opts)` (the file header says "Nothing else collects client money" [VERIFIED: settle.ts:5]) with `opts.fee = { amountMinor, caseId }`:
- bypass `isCompleted` and the `card_hold` mode check only when `opts.fee` is present (keep `assertMoneyEligible`); require the booking to be `cancelled | no_show | completed` and `payment_mode IN (card_hold, cash_guarantee)`;
- `ctx.dueMinor = fee.amountMinor` (today it is `payment_amount_minor`, settle.ts ctx build); the claim still goes `CLAIMABLE -> capturing` where `const CLAIMABLE: PaymentState[] = ['authorized', 'expired', 'card_saved', 'failed', 'capturing', 'placing_hold']` [VERIFIED: settle.ts:73];
- hold alive: `collectFromHold` already does `const toCapture = Math.min(ctx.dueMinor, pi.amount_capturable)` -> partial capture (the rest is released by Stripe); hold gone/never placed: `chargeSavedCard(ctx, 'card_charge', ...)` off-session; the D-16 "difference" branch (`wanted = dueMinor - mainMinor`) must be skipped for a fee (a fee below the hold is not a shortfall);
- success: `capturing -> captured` with `captured_amount_minor = fee`, `payment_intent_id` of the collecting PaymentIntent (the RPC only accepts it for `captured`/`balance_due`);
- decline: `capturing -> failed`, `recordFailure` runs `handlePaymentFailure` (recovery link for `amountMinor = fee`, client email, operator alert). Pass a `fee` flag so the email uses a fee wording variant ("we could not charge your card the cancellation/no-show fee"), not "pay to confirm your trip". The recovery payment closes the row through `handleRecoveryPaid` (`failed -> captured`, `captured_amount_minor += paid`) without change [VERIFIED: recovery-events.ts]; it warns when `paid !== due - capturedBefore`, so the fee must be the amount used for the link (it is: `amountMinor` argument).

**Idempotency (critical).** Today the keys are attempt-numbered only: `cap:<id>:<n>`, `chg:<id>:<n>`, `diff:<id>:<n>` [VERIFIED: stripe.ts stripeKeys]. A fee amount chosen by a person can change between two clicks with the same attempt number (a transient Stripe error leaves `charge_attempts` unchanged), and Stripe answers a reused key with different parameters with `StripeIdempotencyError` -> classified `idempotency` -> treated as transient -> an endless silent loop (the carried 88 item "same-key different-parameter settle error loops without an alert"). Worse, simply adding the amount to the key opens a double charge: a lost-response success at amount A followed by a retry at amount B creates a second PaymentIntent. **Prescribed design:** the amount is written ONCE into `booking_fee_cases.decided_minor` (together with `charge_requested_at`) by an RPC that only succeeds while the case is `pending` or after a definitive `failed`; a later request with a different amount while an attempt is in flight is 409 `amount_locked`; all Stripe keys for a fee are derived from `caseId` + attempt (`fee:<caseId>:<n>`, `feecap:<caseId>:<n>`) and the amount is read from the case row, never from the later request. `capture_started:<attempt>:<ts>` ledger rows already make each claim visible.

**Ledger/evidence.** Reuse kinds `capture_started`, `captured`, `charge_failed`, `waived` (exists), plus new `fee_opened`, `cash_settled`. The `admin_action` row is appended first (`runPaymentAction` pattern: "the audit row comes first, so an operator action is on record even if the engine call fails" [VERIFIED: actions.ts:147-152]) with `errorCode` carrying a short code (`fee_charge`, `fee_waive`); the free text (reason, contact note) lives in the case row, never in the ledger (the ledger is visible to every operator and "never a name, email, phone or IP" [VERIFIED: 085 comment]).

**Waive.** `releaseHold(booking, { actor, reason: 'operator' })` already releases `authorized`/`card_saved`/`failed`/`expired` (hold.ts:574-597); append a `waived` ledger row (kind exists) and set the case `waived`. For `pay_now`/`captured` money the waive is a refund (key `refund:<id>:fee:<caseId>`); partial refund = `price - fee` when the operator chooses less than 100%.

### Pattern 5: Secret manage link (answers Q5)

**Reuse of the driver pattern.** The driver token is `trip_token uuid NOT NULL DEFAULT gen_random_uuid()` with a unique index (migration 060), stored in plain text, looked up by equality, never hashed, never expiring, self-invalidating by identity/status rules (`lib/trip-token.ts`), under a `Referrer-Policy: no-referrer` header for `/driver/:path*` [VERIFIED: next.config.ts:173-179 comment "Listed after the global entry, so this Referrer-Policy wins for /driver/*"]. The manage link keeps the same model with two differences: more entropy and a separate service-only table, because (a) the same link must be re-embedded in later emails (reminder, resend) so a hash-only store cannot work, and (b) `bookings_select_own` lets a signed-in client `select *` their own booking row [VERIFIED: 049_bookings_customer_rls.sql], so anything secret or operator-only must not be a `bookings` column.

- Table `booking_manage_tokens(booking_id uuid PRIMARY KEY REFERENCES bookings(id) ON DELETE CASCADE, token text NOT NULL UNIQUE CHECK (token ~ '^[A-Za-z0-9_-]{43}$'), created_at, revoked_at, last_used_at)`; RLS deny-all + `REVOKE ALL ... FROM anon, authenticated` exactly like `booking_payment_events` (085:186-198). Token = `randomBytes(32).toString('base64url')` (43 chars). `ensureManageToken(bookingId)` inserts `ON CONFLICT (booking_id) DO NOTHING` then reads, so concurrent emails get one token.
- Resolve: zod regex first (malformed -> uniform "link not valid" view, no DB call); then lookup; unknown, revoked, anonymised (`bookings.anonymised_at`), or a partner booking -> the **same** view and HTTP 200/404 as unknown tokens (anti-enumeration, as `InvalidTripLinkView`). View lifetime: until pickup + 30 days [ASSUMED]; actions only while the policy and status allow.
- Where the URL is built: one helper `buildManageUrl(booking)` = `${NEXT_PUBLIC_SITE_URL}${getPathname({ locale: booking.locale, href: '/manage/<token>' })}` (default locale unprefixed). Every client-email builder calls it: `lib/payments/emails/send.ts` (`emailVarsFromRow` -> new `manageUrl` var + a `cta: 'manage'` button in `buildShell`), `lib/email.ts` (`sendClientConfirmation`, `sendRoundTripClientConfirmation`, `sendGroupClientConfirmation`, `sendStatusConfirmedEmail`, `sendStatusCancelledEmail` for "Book another ride"), and the QStash/24 h reminder emails.
- Page: `app/[locale]/manage/[token]/page.tsx`, `export const dynamic = 'force-dynamic'`, `metadata.robots = { index: false, follow: false }` (same as `book/confirmation/layout.tsx`), `setRequestLocale(params.locale)`. It must be a **localized** route, not a `/manage` sibling of `/driver`, because the `(internal)` layout hard-codes `<html lang="en">` and `getLocale()` = 'en', so Arabic/Hindi/Chinese would lose their Noto fonts and `dir` (Phase 73 FONT-01). No middleware routing change is needed (next-intl rewrites `/manage/x` to `/en/manage/x`); do NOT add it to `NON_LOCALIZED_PREFIXES` [VERIFIED: middleware.ts:289]. The matcher extension exclusion already protects only api/admin/driver/auth/embed/account; `/manage/<token>` has no dot, so it is unaffected.
- **Headers:** add to `next.config.ts` after the global entry: `{ source: '/manage/:path*', headers: [{ key: 'Referrer-Policy', value: 'no-referrer' }] }` and the same for `/:locale(ru|es|fr|ar|hi|zh)/manage/:path*`.
- **Third-party scripts (the part Phase 87 missed):** `components/SiteChrome.tsx` mounts GoogleAnalytics, AnalyticsPageView, Clarity, MetaPixel, CookieBanner and EngagementTracker on every page, and `app/[locale]/layout.tsx:46` mounts `ChatLauncher`. `GoogleAnalytics` skips only `/admin` (`if (!window.location.pathname.startsWith('/admin'))`), `AnalyticsPageView` skips only `/admin` and sends `page_location` built from the full pathname, `EngagementTracker` sends `page_path`. A token in the path would reach GA4/Meta/Clarity and the chat SDK (which "reports the page address to the widget", middleware.ts comment 87-UAT gap 3). Add one shared client-safe predicate (`isPrivateLinkPath(pathname)`: `/admin`, `/driver`, `/manage` with optional locale prefix) and use it in all six components and ChatLauncher. The same code reading shows `/driver/trip/<uuid>` is probably already reported to GA4 today [ASSUMED: runtime effect not tested]; fix both in the same change.
- **Mutations:** `POST /api/manage/cancel` `{ token, acknowledge: 'free' | 'late' }` and `POST /api/manage/change-request` `{ token, message }`. Add `'/api/manage'` to BOTH `CSRF_PROTECTED_PREFIXES` and `CSRF_STRICT_ORIGIN_REQUIRED` (browser-only caller; middleware.ts:8-47). Add `LIMITS['/api/manage/cancel']` and `LIMITS['/api/manage/change-request']` in `lib/rate-limit.ts` - **an unknown key is unlimited**: `const limit = LIMITS[pathname]` / `if (!limit) return { allowed: true, remaining: Infinity, limit: Infinity }` [VERIFIED: rate-limit.ts:187-188]. A per-token counter for failed/duplicate attempts is a cheap extra.
- **Server cross-check:** the server recomputes the outcome at request time; if it differs from `acknowledge` (the boundary passed while the page was open) answer 409 `POLICY_CHANGED` with the new outcome and cancel nothing (same idea as `PRICE_CHANGED` / `MODE_CHANGED` in the intent route). A repeat of a successful cancel returns 200 with the current state (the CAS conflict is not an error to the client).
- **Prefetch safety:** mail scanners GET links. The page is read-only; cancel needs a POST with an explicit button.
- **Driver told at once (D-03):** nothing exists today (only assignment/accepted/decline/reminder emails; the trip link just turns into the "ended" view). Add `sendDriverCancelledEmail` to the assigned driver (`driver_assignments` -> `drivers.email`) from the orchestrator, `after()`-scheduled, plus an operator alert. Also fix WR-02's assign path so a closed booking cannot be assigned (see Pattern 6).
- **Signed-in clients (D-02):** on `app/[locale]/account/trips/page.tsx` (server component, currently read-only, user client + `eq('user_id', user.id)`) mint/read the token with the service client after the ownership check and render a "Manage" link to the same page; no second UI, no token ever selected through the user client.
- **Change request:** email to `MANAGER_EMAIL` through Resend with `escapeHtml` on the message, deduped with `logEmail` (10-minute window), message <= 1000 chars, plus the same rate limit. An admin badge is optional.

### Pattern 6: No-show (answers Q6) - WR-04 and WR-02

- Today `confirmNoShow` is just `advanceBookingStatus({ to: 'no_show', source: 'admin_no_show', profile: 'full' })` with no checks [VERIFIED: lib/no-show.ts:357-370], and the admin PATCH accepts `status: 'no_show'` through `z.enum(BOOKING_STATUSES)` and the same service [VERIFIED: app/api/admin/bookings/route.ts:87,352-361]. The only guard is the map: `on_location: ['completed', 'cancelled', 'on_board', 'no_show']` is the sole way in [VERIFIED: booking-transitions.ts:22]. WR-04 therefore means an operator (or a stale tab) can mark a no-show with no waiting time elapsed and no driver request, and once money follows, charge it.
- **Close it in one function** `assertNoShowConfirmable(booking, nowMs)` called by `confirmNoShow` (and the PATCH branch answers 422 `use_no_show_route`, the exact pattern of `use_cancel_route`, route.ts:341): status `on_location`; `no_show_requested_at` is non-null (the driver asked after the server-checked wait); and, belt and braces, `nowMs >= noShowAvailableAtMs(...)` recomputed with the live thresholds (`noShowAvailableAtMs = max(pickupMs, onLocationMs) + thresholdMin*60_000` [VERIFIED: no-show.ts:81-89]). An operator override without a driver request is not offered (the driver app is the evidence source).
- **Evidence (D-13).** Driver timestamps already exist automatically in `booking_status_log` (`on_location` transition, `no_show_requested`, `no_show_cleared`, ids only, no PII [VERIFIED: 084 table comment and CHECK `event IN ('status_change', 'no_show_requested', 'no_show_cleared')`]). At confirm time snapshot them into `booking_fee_cases.evidence` (`pickup_utc`, `on_location_at`, `requested_at`, `threshold_min`, `airport` flag, `confirmed_at`, driver id) so a later settings change cannot rewrite history. The operator's contact-attempt note is required by the fee route before any charge and stored on the case (PII free text -> erased by 088).
- **Money after no-show.** `confirmNoShow` success opens the case (`kind: 'no_show'`, `pending`, proposed = full `payment_amount_minor`). The hold is NOT released (today a no-show leaves the hold until it lapses - the carried 88 item - and `allowedPaymentActions` offers only `release`); the fee route charges or waives. `GNet`: the status may still become `no_show`, but `assertMoneyEligible` stops any case (partner rows have `payment_mode = 'partner'` since 085:105-108).
- **WR-02.** The trip-edit gate is `if (current.status === 'completed' || current.status === 'cancelled')` [VERIFIED: admin/bookings/route.ts:392] - add `no_show`. The assign route writes the `driver_assignments` row (the insert that ends in `select('id, driver_id, status, token, trip_token')`, answering 'Failed to create assignment' on error) before its status logic, which only decides whether to advance the status; I found no terminal-status check before that insert, so a closed booking can still get an assignment and a driver email [ASSUMED: read via grep and the first ~130 lines only; confirm when fixing WR-02]; gate on `TERMINAL_BOOKING_STATUSES` before the insert. Needed here because D-03 cancels bookings that may already be assigned.

### Pattern 7: Driver cash step (answers Q7; D-11, CASH-04)

- The trip page deliberately selects no amount: `// D-06: the driver never sees an amount, so the booking amount is not selected at all.` `TRIP_SELECT = 'id, driver_id, status, trip_note, bookings!inner(...)'` (app/(internal)/driver/trip/[token]/page.tsx) and renders `TripCompleted variant="reopened"` for a completed booking with no data. Add `payment_mode, payment_state, payment_amount_minor, payment_currency` to the select but build the client prop only when `payment_mode === 'cash_guarantee' && payment_state === 'card_saved'`, already formatted server-side with `formatMinor` (a label string; the client never receives numbers), so non-cash trips render exactly as before.
- Completion flow: `ConfirmStepDialog` (`isFinal` step "Complete trip") gets a `cash` prop that shows the warning and the amount before the driver completes; after completion the `in-session` and the `reopened` `TripCompleted` views show "I received the cash" / "The passenger did not pay" while the booking is still cash-unsettled. Completion must never be blocked by cash (the passenger may not have paid, D-10).
- API: extend `driverTripRequestSchema` (a `z.union` of `.strict()` objects today, driver-trip-step.ts) with `{ action: 'confirm_cash' }` and `{ action: 'cash_not_received' }`; no amount field is accepted (the existing test `{ step: 'en_route', amount: 10 }` stays a 400). The handler checks `hasTripIdentity`, `assertMoneyEligible`, `status === 'completed'` and `payment_mode === 'cash_guarantee'`, then `applyTransition({ from: ['card_saved'], to: 'cash_settled', event: { key: 'cash_settled:<bookingId>', kind: 'cash_settled', actor: { type: 'system', id: 'driver_trip' } } })`. `LedgerActor.type` is `'system' | 'webhook' | 'admin'` (CHECK in 085:126) - a driver is a `system` actor with an id. `cash_not_received` opens a `cash_unpaid` fee case (badge + 24 h reminder), it charges nothing. A replay returns 200 `replay` like every other step. The progress route already rate-limits at 20/min (`'/api/driver/trip/progress': 20`).
- The amount shown must follow admin price edits (D-12): extend `reevaluateAfterEdit` for cash (Pattern 3 table).

### Pattern 8: Public wording inventory (answers Q8; CANC-02, D-18)

All of these currently state the old rule or contradict each other; every one needs the 7-locale update in the same release as the `on` flip.

| Surface | EN source | Today | Pinned by test |
|---|---|---|---|
| Terms | `content/pages/en/terms.json` section4 (5 items) | "Up to 1 hour ... full refund, no questions asked"; late "up to 100% may be charged"; no-show "full booking amount is charged"; refunds "5-10 business days" | `tests/legal.test.ts` (items[0] and items[4].desc verbatim) |
| FAQ | `content/pages/en/faq.json` (cancellation block, flight-cancelled Q) | "Free cancellation up to 1 hour ... Later cancellations may be subject to a fee." | JSON-LD FAQPage is built from this file in `app/[locale]/faq/page.tsx` (no separate cancellation JSON-LD in `lib/jsonld.ts` - grep) |
| Book page | `content/pages/en/book.json` lines 16 (trust bullet), 58 (cancel/change FAQ), 61 (flight) | "free up to one hour ... refund within one business day ... changes free at any time" | - |
| Routes hub | `content/pages/en/routes.json:155` | "free up to **two** hours" (already inconsistent) | - |
| Contact | `content/pages/en/contact.json:53-54,64` | "at least 1 hour before departure" | - |
| Services | `content/pages/en/services/prague-airport-taxi.json:76` ("cancel free of charge up to 1 hour before pickup"); `faq/flight-delays.json` (22, 43, 73: cancelled flight = reschedule or full refund - keep, D-05); `services.json:156` is flight tracking, check only | 1 h | - |
| Booking UI trust bullet | `messages/en.json:561` "Free cancellation up to 1 hour" (+ `book.json:16`) | 1 h | `tests/shared-sections-i18n.test.tsx:142,159` |
| Checkout | `Booking.step6.cardOnFile.*` (consent) + pay-now `Step6Payment` (no policy text today) | consent has no fee/cancel text | `tests/payments-consent.test.ts` digest pin, `tests/payments-copy-i18n.test.ts` |
| Emails | `PaymentEmails` namespace + `lib/payments/emails/render.ts` (localized); `lib/email.ts` confirmation family (English only) | no policy line, no manage button | `tests/payments-copy-i18n.test.ts` (forbids fee wording), `tests/payments-emails.test.ts` |
| llms | `lib/llms-content.ts:241-246` (EN only, served by `app/llms.txt/route.ts`, `app/llms-full.txt/route.ts`) | "Time changes - unlimited before the journey; ... use the booking portal" conflicts with D-01 | `tests/llms-content.test.ts` |
| Blog | `app/[locale]/blog/prague-vienna-transfer-vs-train/page.tsx:132` "Free up to 1 h before" | wrong for a 330 km trip | - |
| Admin | `components/admin/BookingsTable.tsx` cancel modal (≈2967-3015) | "Cancelling releases the hold ... Nothing is charged" | `tests/admin-bookings-cancel.test.ts` |

Numbers: the policy numbers are admin settings, but terms/FAQ are static JSON. Recommended: ICU-style placeholders `{km}`, `{freeHoursShort}`, `{freeHoursLong}` in the 7 locale files, substituted server-side from `getCancellationPolicy()` at render (ISR with a short revalidate), and the checkout/email strings take the same variables. If the planner prefers typed numbers, an admin change then requires a wording edit AND a version bump - say so in the admin settings help text. Version string: replace `2026-11-draft-1` by a non-draft constant (e.g. `2026-11-v1`) in the same change that rewrites `consentSetup`/`consentHoldNow` and adds `consentCash`; the consent text must now also cover D-10 (charging the saved card after an unpaid ride), late cancel and no-show. `CARD_CONSENT_VERSION` and the policy version may share one constant.

### Pattern 9: Erasure gap D-23 (answers Q9)

`erasure_anonymise_person` (075:306-) anonymises booking PII columns, scrubs edit-audit values, `email_log.recipient`, GNet payloads and `driver_assignments.trip_note`, deletes inquiries, quote leads and the identity. It names no payment table [VERIFIED: `grep -c booking_payment supabase/migrations/075_erasure.sql` = 0; no later migration redefines the function]. Left behind: `booking_payment_consents.ip` and `.user_agent` (new personal data, 085:218-219) and `text_rendered`; `bookings.stripe_customer_id`, `stripe_payment_method_id`, `setup_intent_id`, `hold_payment_intent_id`, `recovery_link_url`; the Stripe Customer object itself (`ensureStripeCustomer` stores email, name and phone there [VERIFIED: customer.ts]); and, new in this phase, manage tokens, fee-case notes/evidence. `lib/erasure.ts` makes no Stripe call (its header leaves Stripe to the runbook).

Required (go-live blocker): **migration 088** = `CREATE OR REPLACE FUNCTION public.erasure_anonymise_person` as a full copy plus: null `ip`/`user_agent` on the person's consents; delete their `booking_manage_tokens`; scrub `booking_fee_cases` free text and evidence; null the Stripe ids ONLY for bookings whose `payment_state` is terminal (`captured`, `released`, `cash_settled`) - wiping `stripe_customer_id` on a booking with a live hold or an open fee case would make the hold unreleasable; keep the REVOKE/GRANT block (a re-created SECURITY DEFINER function otherwise regains PUBLIC EXECUTE - project memory). `erasure_confirm`/preview should report and refuse while a person has an open hold, a pending fee case or a future pickup. TS: add a saga step that calls `stripe.customers.del(customerId)` per distinct customer [CITED: docs.stripe.com/api/customers/delete: "Permanently deletes a customer. It cannot be undone." ... "removes all credit card details and prevents any further operations"]; charges stay in Stripe for the accounting retention. If the planner wants the smaller scope, the SQL part plus the blocking guard plus a runbook line is the minimum.

### Pattern 10: Stripe facts the plan depends on (answers Q10)

- **Uncaptured authorization lifetime.** "If the authorization expires before you capture the funds, the funds are released and the payment status changes to `canceled`." Card-not-present windows: Visa merchant-initiated 5 days ("the exact authorization window is 4 days and 18 hours"), Mastercard/Amex/Discover 7 days, customer-initiated 7 days; Stripe classifies MIT vs CIT "based on signals of cardholder participation, not solely on ... `off_session`" [CITED: docs.stripe.com/payments/place-a-hold-on-a-payment-method]. The scheduled hold is placed 72 h before pickup off-session, so on a Visa it lapses about 114 h after placement = roughly 42 h after pickup; the operator's window to *capture* a late-cancel/no-show fee from the hold is that long, after which the charge falls back to an off-session charge of the saved card. Show `capture_before` (stored on the row) in the fee dialog and send the reminder before it, not only at +24 h.
- **Capturing after cancel.** Stripe knows nothing about booking status; capture works while the PaymentIntent is `requires_capture`. "A partial capture automatically releases the remaining amount" and "you can only perform one capture on an authorized payment for most payments" [CITED: same page] -> the amount typed by the operator is final for that hold.
- **Cancel vs refund cost.** "You can cancel a payment before it's completed at no cost. Or you can refund ... which might incur a fee. Stripe's processing fees from the original transaction aren't returned." Cancelling an uncaptured PaymentIntent is the only path for `requires_capture`; docs even recommend manual capture "to reduce your refund costs" [CITED: docs.stripe.com/refunds]. So an in-time cancel of a held card costs nothing, while an in-time cancel of a pay-now or recovery-link payment costs the original fee (owner awareness, Open Question 8). Refund timing: "approximately 5-10 business days" (matches the terms wording; the book.json "within one business day" claim is wrong for the card side).
- **Off-session after the trip/no-show.** "Set off_session to true ... If ... a partner (such as a card issuer or bank) requests authentication, Stripe requests exemptions using customer information from a previous on-session transaction. If the conditions for exemption aren't met, the PaymentIntent might throw an error"; on `authentication_required` bring the customer back on-session [CITED: docs.stripe.com/payments/save-and-reuse]. The setup already forces 3DS (`payment_method_options: { card: { request_three_d_secure: 'any' } }` [VERIFIED: checkout.ts:211]) which maximises the exemption odds, but a charge days after a no-show can still be declined or need authentication; the existing recovery link is the path (`classifyStripeError` maps it to `auth_required`). Expect disputes on fee charges: `charge.dispute.created` already alerts the operator (`handleDispute`); the consent row (text_rendered, sha256, locale, ip, user_agent, accepted_at), the status log and the case evidence are the evidence pack.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Moving `payment_state` / ledger rows | A direct `bookings.update` or a second RPC | `applyTransition` / `appendPaymentEvent` in `lib/payments/state.ts` | `tests/payment-state-writers-gate.test.ts` fails when any other file names the RPCs or writes a `payment_state` key |
| Collecting client money | A new "charge fee" Stripe path | `settleBooking` with `opts.fee` | One CAS claim, attempt-numbered keys, lease, recovery, ledger - all already tested |
| Exactly-once client email / operator alert | Fire-and-forget `resend.emails.send` | `sendPaymentEmail`, `sendPaymentOperatorAlert` (both `deliverOnce`: send, then record the ledger key) | Webhook redeliveries and tick re-drives cannot double-send |
| Status writes on cancel / no-show | `.update({ status })` | `advanceBookingStatus` (CAS RPC, actor log) | One writer; the log feeds the no-show evidence |
| Token generation / signing | Custom HMAC, JWT, hash-and-compare code | `crypto.randomBytes(32).toString('base64url')` + unique-index equality lookup | Same trust model as the shipped driver link; nothing to get subtly wrong |
| Time-window math | Wall-clock hours, "date minus hours" strings | Instants: `pickupInstantMs`, `Date.now()`, integer ms (`lib/payments/timing.ts` style) | DST safety is already solved there |
| Money display | Template strings with "€" | `formatMinor(amountMinor, currency)` | CLAUDE.md price rule + one rounding rule |
| Rate limit | Ad-hoc counters | `checkRateLimit` with a key added to `LIMITS` | Unknown keys are unlimited |
| Localized email text | Inline English strings | `PaymentEmails` catalog + `createTranslator` in `render.ts` | 7 locales, bdi/RTL handling, escape rules |

**Key insight:** every dangerous operation in this phase already has a hardened primitive from Phase 88. The risk is not missing machinery; it is the three assumptions in the primitives (completed trips only, full amount only, `card_hold` only) and the terminal states that quietly end the fee option.

## Common Pitfalls

### Pitfall 1: Late cancel calls `releaseHold` and the fee is gone
**What goes wrong:** the existing cancel route releases every card booking; `released` is terminal (state.ts:122), so "operator charges the saved card afterwards" (D-15) is impossible.
**How to avoid:** the orchestrator never calls `releaseHold` on a late cancel; a test asserts `payment_state` is unchanged and the PaymentIntent still `requires_capture` after a late client cancel.
**Warning signs:** a late-cancelled booking with `payment_state = released` and no `hold_released` for the operator.

### Pitfall 2: A mid-flight hold on a cancelled booking is abandoned to `released`
**What goes wrong:** `abandonHoldForClosedBooking` (hold.ts:164-222), also called by the webhook `amount_capturable_updated`/`payment_failed` handlers, always moves `placing_hold -> released`.
**How to avoid:** if the booking has a pending fee case, void the authorization and move to `card_saved` (legal per state.ts:115).

### Pitfall 3: New rate-limit keys silently unlimited
**What goes wrong:** forgetting `LIMITS['/api/manage/...']` leaves the public cancel and the operator-mail change-request endpoints unthrottled (rate-limit.ts:187-188).
**How to avoid:** a test that every new public route's key exists in `LIMITS`.

### Pitfall 4: Token reaches third parties
**What goes wrong:** GA4 `page_location`, Meta/Clarity page views, the Chatwoot widget and `Referer` carry the manage URL.
**How to avoid:** shared `isPrivateLinkPath` in the six analytics/chat components, `Referrer-Policy: no-referrer`, a test that renders the chrome on a manage path and asserts no tracking script/launcher; also fix `/driver`.

### Pitfall 5: `flowConflict` is hard-wired to two modes
**What goes wrong:** (lib/supabase.ts ~225-235) a pay-now capture does not treat an existing `cash_guarantee` row as a conflict and overwrites it, dropping the SetupIntent; a card<->cash switch on one attempt id is `ATTEMPT_CLOSED`.
**How to avoid:** make the matrix symmetric and rotate the attempt id on a choice switch.

### Pitfall 6: Operator amount + idempotency = double charge or silent loop
See Pattern 4: lock the amount on the case at the first charge click; derive Stripe keys from case id + attempt.

### Pitfall 7: Hold lapses before the operator decides
Visa merchant-initiated holds last 4 d 18 h. After lapse the same click still works (off-session charge) but with SCA/decline risk. Show `capture_before`, remind earlier than +24 h when `capture_before` is closer, and never auto-release a pending-case hold (tick step G skips cases).

### Pitfall 8: Tests that encode the old rules
These pass today and must be changed on purpose: `tests/legal.test.ts` (terms items 0 and 4), `tests/shared-sections-i18n.test.tsx:142,159`, `tests/payments-consent.test.ts` (version `'2026-11-draft-1'` and digest), `tests/payments-copy-i18n.test.ts` (no fee wording), `tests/driver-trip.test.ts:294-314`, `tests/driver-trip-screen.test.tsx:211,409`, `tests/admin-bookings-cancel.test.ts`, `tests/payments-state.test.ts` / `payments-migration-085.test.ts` / `-086.test.ts` (states, kinds, function text), `tests/helpers/fake-payments-db.ts` (`FAKE_PAYMENT_VOCABULARY`), `tests/llms-content.test.ts`, the card-flow eligibility tests (a third mode), `tests/infra-stripe-webhook-events.test.ts` if event routing changes.

### Pitfall 9: A driver's mistaken "cash received" is terminal
`cash_settled` has no outgoing transition in the minimal design, so a wrong tap forgives the debt. Add an admin-only `reopen_cash` (`cash_settled -> card_saved`, ledger row, reason) or accept the risk knowingly.

### Pitfall 10: Operator-initiated cancels charged to the client
See "Conflicts" item 4. Default the admin dialog to "Prestigo" (free) and require an explicit "client" choice to open a case.

### Pitfall 11: Secrets and operator notes as `bookings` columns
`bookings_select_own` exposes the whole row to the signed-in owner (049). Tokens, contact notes, reasons and evidence live in deny-all tables; only the non-sensitive `fee_case_status` badge value and the policy snapshot go on `bookings`.

### Pitfall 12: Re-creating `apply_payment_transition` drops the 086 gate
087 must be a full copy of the 086 text with the new state added; `latestFunctionBody('apply_payment_transition')` tests read the LAST definition. Also: migrations are applied by the orchestrator (executors have no Supabase MCP) BEFORE the code that needs them merges; 085 and 086 are additive for old code, 087 must be too (new columns defaulted, CHECK only widened).

### Pitfall 13: Policy numbers and stored terms drift
A legacy booking (NULL `cancel_policy`) must evaluate with the legacy rule; a new booking with its own snapshot; never "current settings" for an old booking (D-18).

### Pitfall 14: Revenue stats
`REVENUE_STATUSES` says `no_show` is excluded "until Phase 89 introduces a 'charged' fact (D-11)" [VERIFIED: lib/booking-status.ts]. Decide explicitly whether charged fees count; the minimal choice is to record the fact (`captured_amount_minor` on cancelled/no_show) and leave the stats SQL unchanged this phase.

### Pitfall 15: GNet
Every new entry point (orchestrator, fee route, cash actions, manage token creation, driver cash) calls `assertMoneyEligible`; `payment_mode = 'partner'` rows never get a manage link, a case or a cash option. Add a table-driven test over all entry points (the 88 lifecycle test already has "a partner (gnet) or pay-now booking never gets a Stripe call through any entry point").

## Code Examples

These are design sketches built on symbols that exist today (`pickupInstantMs`, `applyTransition`, `advanceBookingStatus`, `assertMoneyEligible`, `formatMinor`); the names that are new (`evaluateCancellation`, `openFeeCase`, `ensureManageToken`, `stripeKeys.fee`) are proposals.

### Policy evaluation (pure, client-safe, mirrors `lib/payments/timing.ts` style)
```ts
// lib/cancellation-policy.ts - proposal
const HOUR_MS = 3_600_000
export interface CancellationPolicy {
  version: string          // bumps with the wording
  kmThreshold: number      // admin: cancel_free_km_threshold
  freeHoursShort: number   // admin: cancel_free_hours_short
  freeHoursLong: number    // admin: cancel_free_hours_long
  freeHoursHourly: number  // admin: cancel_free_hours_hourly (D-06)
  feePercent: number       // admin: proposal only; hard cap is 100% in the fee route
}
export type CancelOutcome =
  | { kind: 'free'; freeUntilMs: number }
  | { kind: 'late'; freeUntilMs: number }
  | { kind: 'too_late'; freeUntilMs: number }   // pickup instant reached: client cannot self-cancel

export function freeHoursFor(p: CancellationPolicy, b: { tripType: string; distanceKm: number | null }): number {
  if (b.tripType === 'hourly') return p.freeHoursHourly
  if (b.distanceKm !== null && Number.isFinite(b.distanceKm) && b.distanceKm <= p.kmThreshold) return p.freeHoursShort
  return p.freeHoursLong // over the threshold, or unknown: the stricter window
}

export function evaluateCancellation(
  p: CancellationPolicy,
  b: { tripType: string; distanceKm: number | null; pickupMs: number },
  nowMs: number,
): CancelOutcome {
  const freeUntilMs = b.pickupMs - Math.round(freeHoursFor(p, b) * HOUR_MS)
  if (nowMs >= b.pickupMs) return { kind: 'too_late', freeUntilMs }
  return nowMs <= freeUntilMs ? { kind: 'free', freeUntilMs } : { kind: 'late', freeUntilMs }
}
```

### Client cancel through the status service (profile and actor are verified shapes)
```ts
// lib/payments/cancel.ts - proposal; the real call shape is AdvanceBookingStatusInput (lib/booking-status-service.ts:44-67)
const cancelled = await advanceBookingStatus({
  bookingId,
  to: 'cancelled',
  actor: { type: 'system', id: 'client_token' },
  source: 'client_cancel',        // must match ^[a-z_]{1,40}$ (084:61)
  profile: 'cancel-route',        // no side effect inside; the orchestrator sends emails after the money step
  current: bookingRow,
  expectedFrom: bookingRow.status as string,
})
if (!cancelled.ok) return cancelled.code === 'conflict' ? alreadyChanged(cancelled.currentStatus) : failed()
// then: outcome.kind === 'free' ? releaseOrRefund(...) : await openFeeCase({ bookingId, kind: 'late_cancel', ... })
```

### Fee route schema (the one place an amount enters)
```ts
// app/api/admin/bookings/[id]/fee/route.ts - proposal; same guard order as payment/route.ts
const feeSchema = z.discriminatedUnion('action', [
  z.strictObject({
    action: z.literal('charge'),
    amount_minor: z.number().int().positive().max(100_000_000),
    reason: z.string().trim().max(500).optional(),
    contact_note: z.string().trim().max(1000).optional(),
  }),
  z.strictObject({ action: z.literal('waive'), reason: z.string().trim().min(1).max(500) }),
  z.strictObject({ action: z.literal('cash_settled') }),
])
// After the booking and case are loaded (422, not 400, for business rules):
//   amount_minor > booking.payment_amount_minor        -> 422 amount_above_cap
//   case.kind in ('no_show','cash_unpaid') && !note     -> 422 note_required
//   case.status !== 'pending' (and not definitive-failed) -> 422 action_not_allowed
```

### Driver cash action (strict, no amount)
```ts
// lib/driver-trip-step.ts driverTripRequestSchema - add two members to the existing z.union of .strict() objects
z.object({ action: z.literal('confirm_cash') }).strict(),
z.object({ action: z.literal('cash_not_received') }).strict(),
```

### Manage token (random, stored, equality lookup)
```ts
// lib/manage-link.ts - proposal
import { randomBytes } from 'node:crypto'
export const MANAGE_TOKEN_RE = /^[A-Za-z0-9_-]{43}$/            // 32 random bytes, base64url, no padding
export const newManageToken = () => randomBytes(32).toString('base64url')
```

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| Phase 88: cancel = release or full refund, always | Phase 89: policy decides; late = keep and open a decision | Cancel route, `releaseHold` callers, admin dialog and 6 tests change |
| Driver never sees an amount (87 D-06) | Only cash bookings show the amount (D-11) | Page select, props, 3 tests |
| `card_flow_mode` off / canary | adds `on` | CHECK, zod enum, `config.ts`, `CardFlowSettings`, eligibility tests |
| Counsel-reviewed wording (ROADMAP) | Owner decision recorded (D-16) | REQUIREMENTS CANC-02 text, `draft` consent version |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | "Free" is inclusive at the boundary (`now <= pickup - hours`), "up to 100 km" means `<= 100` | Pattern 1 | Off-by-one disputes at exactly the boundary; owner/term wording should say "at least N hours before" |
| A2 | Unknown/invalid distance on a transfer uses the stricter 12 h window | Pattern 1 | A client with a missing distance gets less free time than expected |
| A3 | Pre-Phase-89 bookings (NULL snapshot) keep the old rule: free until 1 h for every distance | Pattern 1 | Legacy bookings are almost all pay-now/test; wrong rule could over- or under-charge a few |
| A4 | `cash_settled` as a new state is preferred over re-using `released` | Pattern 3 | If the owner wants the smallest migration, `released` + a ledger kind works at the cost of ambiguity |
| A5 | Plain-text random token in a deny-all table is acceptable (vs HMAC-derived needing a new Vercel secret) | Pattern 5 | A DB read leak exposes manage links; mitigated by revocation, `no-store`, short post-trip lifetime |
| A6 | Manage view lifetime = pickup + 30 days | Pattern 5 | Too short: client cannot see the receipt; too long: stale capability |
| A7 | GA4/Meta/Clarity probably already receive `/driver/trip/<uuid>` page views | Pattern 5 | If untrue, the shared predicate is merely defensive; if true, an existing leak is closed |
| A8 | The assign route lets a closed booking be assigned (WR-02) | Pattern 6 | If it already refuses, drop that task |
| A9 | Stripe Visa merchant-initiated 4 d 18 h applies to the owner's account as documented | Pattern 10 | Decision window for held fees could differ; the stored `capture_before` is the real value |
| A10 | Deleting the Stripe Customer at erasure is compatible with accounting retention (charges stay) | Pattern 9 | If the accountant needs the customer object, use PII scrub instead of delete |
| A11 | Change requests reach the operator by email only (discretion) | Pattern 5 | No admin badge; a missed email loses a request |
| A12 | New nullable columns on `bookings` fire no existing trigger (085 states every trigger is `UPDATE OF <named columns>`) | Migration 087 | A trigger firing on the badge column would sync CRM/GCal needlessly; re-check `\df`/trigger list before applying |

## Open Questions

1. **Operator-initiated late cancels.**
   - Known: D-04/D-05/D-07 are written for client cancels; the admin cancel route today cancels for any reason.
   - Unclear: should an operator cancel ever open a fee case?
   - Recommendation: dialog choice "Cancelled by client / by Prestigo"; Prestigo-initiated is always free. Needs the owner's yes before planning the dialog.
2. **Cash booking where the driver never answers.** Booking sits `completed` + `card_saved` forever. Recommendation: tick step G opens a `cash_unpaid` case 24 h after `completed_at` so the existing reminder and badge apply (extends D-15 slightly).
3. **Policy numbers in static wording.** Placeholders substituted from settings (recommended) vs typed numbers plus a mandatory version bump on every admin change.
4. **Pay-now round-trip legs.** `round_trip` stays pay-now (88 D-19) and its two legs are separate booking rows with per-leg refunds (`refund:<id>:<leg>`, cancel route lines 136-158). Recommendation: the policy applies per leg row; "keep" = no refund of that leg; waive = existing per-leg refund. Confirm.
5. **Stats.** Should charged fees count as revenue (`REVENUE_STATUSES`, stats migrations 081-083)? Recommendation: record the fact now, change stats later.
6. **`reopen_cash`.** Allow an admin to reverse a driver's cash confirmation (Pitfall 9)?
7. **Where D-16 is recorded.** Recommendation: amend REQUIREMENTS.md CANC-02/CASH-03 and the ROADMAP legal-checkpoint line in the first plan, and keep the sentence in the go-live checklist.
8. **Cost of free cancellation on pay-now/recovery-link payments.** Stripe keeps its processing fee on every refund [CITED]; an in-time cancel of a held card costs nothing. Owner awareness, not a code question.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node | build, tests | yes | v24.14.1 | - |
| vitest / tsc | validation | yes | 4.1.5 / local | - |
| stripe SDK | fee capture/charge | yes | 21.0.1 (locked) | - |
| Supabase (apply 087/088) | migrations | orchestrator only (executors have no Supabase MCP - project memory) | - | orchestrator applies and smokes; schema files are written by executors |
| QStash schedule `prestigo-payment-tick` (`*/15 * * * *`) + daily Vercel cron | tick step G reminders | yes, live since 2026-11-06 [CITED: 88-17-SUMMARY] | - | daily cron backstop |
| Stripe webhook `charge.refunded` on the live endpoint | refund observation | added 2026-11-06 [CITED: 88-17-SUMMARY] | - | - |
| Resend (client emails, operator alerts) | all notices | yes (`RESEND_API_KEY` in Vercel) | - | - |
| Stripe Dashboard: Radar for saved cards, pricing plan, MCC 4121 | go-live | NOT confirmed [CITED: 88-17-SUMMARY "Open for Phase 89"] | - | owner action before the flip |
| Real card test of a fee charge / dispute | go-live proof | `.env.local` Stripe key is a dead placeholder; use an owner-run script | - | owner canary with the live key |

**Missing with no fallback:** the owner's Dashboard confirmations (go-live blockers, not code).
No new Stripe event types are needed: fee PaymentIntents ride `payment_intent.succeeded/payment_failed`; add a metadata kind `card_fee` to `CardKind`, to `classifyPaymentEvent`'s `charge_succeeded` list and to `handlePaymentFailed`, otherwise the observation rows are lost (dispatch.ts routes by the `card_` prefix and an explicit kind list).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.5 (jsdom default; node tests carry `// @vitest-environment node`) |
| Config file | `vitest.config.ts` (setup `tests/setup.ts`, alias `@` = repo root) |
| Quick run command | `npx vitest run tests/cancellation-policy.test.ts tests/payments-cancel.test.ts tests/payments-fee.test.ts` |
| Full suite command | `npx vitest run` (~90 s) + `npx tsc --noEmit` + `npx eslint --quiet <changed files>` (the `verify` skill, `pre-pr` mode before a PR) |
| Test doubles | `tests/helpers/fake-payments-db.ts` (mirrors 085/086 SQL), `fake-stripe.ts` (partial capture and partial refund exist), `latest-migration.ts` (reads the last CHECK/function definition) |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CANC-01 | free/late/too_late at 100 km, 1 h, 12 h, hourly, null distance, DST pickup, legacy NULL snapshot | unit | `npx vitest run tests/cancellation-policy.test.ts` | ❌ Wave 0 |
| CANC-01 | admin settings route accepts/rejects the 5 new fields with the CHECK bounds | unit | `npx vitest run tests/admin-settings.test.ts` | ✅ (extend) |
| CANC-01 | migration 087 text: columns, CHECK ranges, `card_flow_mode` includes `'on'`, state/kind lists equal `state.ts` | unit | `npx vitest run tests/payments-migration-087.test.ts tests/payments-state.test.ts` | ❌ / ✅ (update) |
| HOLD-06 | in-time cancel: hold released / saved card released / captured refunded / pay-now refunded / cash released; late: nothing released, case pending, PaymentIntent untouched; busy lease 409 | integration (fakes) | `npx vitest run tests/payments-cancel.test.ts tests/admin-bookings-cancel.test.ts` | ❌ / ✅ (update) |
| HOLD-06 | hold lapse after late cancel: webhook `authorized -> expired`, fee still chargeable; `abandonHoldForClosedBooking` -> `card_saved` when a case is pending | integration | `npx vitest run tests/payments-hold.test.ts tests/payments-review-engine.test.ts` | ✅ (extend) |
| CANC-01/D-03 | manage route: token validity, CSRF/rate-limit key present, ack mismatch 409, double submit idempotent, status/time window, GNet refused, uniform invalid-link answer | integration | `npx vitest run tests/manage-booking.test.ts` | ❌ Wave 0 |
| D-02 | no tracking script / chat launcher / Referer on a manage path (chrome render + `next.config` header) | component + config | `npx vitest run tests/private-link-paths.test.tsx` | ❌ Wave 0 |
| CASH-01 | cash intent: `payment_mode = 'cash_guarantee'`, SetupIntent only (even inside the hold lead), `hold_at` null, consent mode `cash_setup`, flow-conflict symmetry; tick never claims a cash row | integration | `npx vitest run tests/card-checkout-cash.test.ts tests/payments-tick.test.ts` | ❌ / ✅ (extend) |
| CASH-02 | no-show gate: confirm without an open request -> 422; PATCH `no_show` -> `use_no_show_route`; before the wait -> 409; driver request path unchanged | unit/integration | `npx vitest run tests/admin-no-show.test.ts tests/driver-no-show.test.ts` | ✅ (extend) |
| CASH-03 | fee charge: cap, note required, partial capture, expired hold -> off-session charge, decline -> failed + fee-variant recovery email + alert, amount lock (409), Stripe keys carry case id, partner refused, evidence snapshot stored, ledger rows | integration | `npx vitest run tests/payments-fee.test.ts tests/payments-settle.test.ts` | ❌ / ✅ (extend) |
| CASH-04 | `cash_settled`: driver `confirm_cash` (completed only, strict schema, no amount), admin mark, terminal, charge refused afterwards, amount visible on the driver page only for cash | integration + component | `npx vitest run tests/driver-trip-cash.test.ts tests/driver-trip.test.ts tests/driver-trip-screen.test.tsx` | ❌ / ✅ (update) |
| CANC-02 | 7-locale parity for every new catalog key/ICU parameter; consent version pin; terms/FAQ/book/contact JSON key parity; no typed numbers where placeholders are used; emails render in all 7 locales | unit | `npx vitest run tests/payments-copy-i18n.test.ts tests/payments-consent.test.ts tests/legal.test.ts tests/llms-content.test.ts tests/shared-sections-i18n.test.tsx` | ✅ (update) |
| Gate | single writer of `payment_state`; engine modules never read `card_flow_mode`/`getPaymentSettings`; new fee module only calls `applyTransition` | source gate | `npx vitest run tests/payment-state-writers-gate.test.ts` | ✅ (extend allow-list only if needed) |
| D-23 | 088 text: consents ip/ua nulled, tokens deleted, Stripe ids kept for live states | unit (SQL text) | `npx vitest run tests/erasure-payment-pii.test.ts` | ❌ Wave 0 |
| Go-live | `card_flow_mode = 'on'` makes every transfer/hourly email eligible, other trip types not; init still opaque; settings UI offers `on` | unit | `npx vitest run tests/payments-timing.test.ts tests/card-checkout-init.test.ts tests/card-checkout-intent.test.ts tests/CardFlowSettings.test.tsx tests/admin-settings.test.ts` | ✅ (update) |

### Sampling Rate
- **Per task commit:** the quick command for the touched area plus `npx tsc --noEmit`.
- **Per wave merge:** `npx vitest run` (full) + `verify` skill.
- **Phase gate:** full suite green, then the live proofs listed under Go-live (owner-run): late-cancel hold survives, fee capture from a real hold, fee charge after lapse, decline -> recovery link, Arabic `card_saved`/`cash` email, cash driver step on a phone.

### Wave 0 Gaps
- [ ] `tests/cancellation-policy.test.ts`, `tests/payments-cancel.test.ts`, `tests/payments-fee.test.ts`, `tests/manage-booking.test.ts`, `tests/card-checkout-cash.test.ts`, `tests/driver-trip-cash.test.ts`, `tests/payments-migration-087.test.ts`, `tests/erasure-payment-pii.test.ts`, `tests/private-link-paths.test.tsx`
- [ ] Extend `tests/helpers/fake-payments-db.ts`: state `cash_settled`, kinds `cash_settled`/`fee_opened`, tables `booking_fee_cases`, `booking_manage_tokens`, the consent mode `cash_setup`, new `pricing_globals` columns, and the symmetric flow-conflict logic of `captureUnpaidBooking`
- [ ] Extend `tests/helpers/fake-stripe.ts` only if the fee flow needs `paymentIntents.search` for `kind: card_fee` (it already supports capture amount, partial refunds)
- [ ] Framework install: none

## Security Domain

`security_enforcement` is not set to false in `.planning/config.json` (the key is absent), so this section applies. Commit with the `security:` prefix.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | partly | Admin routes: `getAdminUser`; client capability links are bearer tokens (not accounts); My trips: Supabase session + `user_id` match |
| V3 Session Management | no new sessions | Token is a capability, never stored in a cookie; no session fixation surface |
| V4 Access Control | yes | Token -> exactly one booking; fee route admin-only; cap enforced server-side; GNet/partner refused by `assertMoneyEligible`; operator notes off `bookings` (RLS select-own) |
| V5 Input Validation | yes | zod strict schemas, two-step parse (400 shape / 422 business), token regex before any DB call, HTML-escaped operator mail |
| V6 Cryptography | yes | `crypto.randomBytes(32)`; no custom crypto; SHA-256 consent digest unchanged |
| V7 Errors / logging | yes | Log ids and codes only; the token never goes in a log line or a ledger row (Vercel request logs do contain the URL path - accept, revocable) |
| V8 Data protection | yes | New PII (contact notes, tokens, consent ip/ua) covered by migration 088 and the Stripe Customer step |
| V13 API / CSRF | yes | `/api/manage` in both CSRF lists, `no-referrer`, rate limits keyed in `LIMITS`, `enforceMaxBody` |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Guessing a manage token | Spoofing | 256-bit token, uniform invalid answer, rate limit |
| Token leaked to GA4/Meta/Clarity/Chatwoot/Referer | Information disclosure | `isPrivateLinkPath`, `no-referrer`, `noindex`, `Cache-Control: no-store` |
| Mail scanner prefetch cancels a booking | Tampering | GET is read-only; cancel is a POST with explicit acknowledgement |
| Cross-site cancel of a booking | Tampering | Strict Origin check (`CSRF_STRICT_ORIGIN_REQUIRED`) |
| Operator (or stale tab) over-charges | Tampering / Repudiation | Server cap = `payment_amount_minor`, amount locked on the case, `admin_action` row first, reason/note stored |
| Double charge on retry | Tampering | CAS claim `-> capturing`, case-id Stripe keys, ledger event keys, 409 `amount_locked` |
| Client-supplied amount / currency | Tampering | No amount in any client or driver schema; currency from the row |
| Driver forges "cash received" | Repudiation | Token-bound, `completed` only, ledger actor `driver_trip`, admin `reopen_cash` |
| Unauthorised no-show charge | Elevation | `assertNoShowConfirmable` (WR-04), driver can only request, operator note required |
| XSS / header injection through the change-request message | Tampering | `escapeHtml`, length cap, plain Resend fields |
| Enumeration via error differences | Information disclosure | Same view/status for unknown, revoked, anonymised, partner tokens |
| Dispute of a fee charge | Repudiation | Evidence: consent text + hash + ip + ua + time, status log, case evidence; `handleDispute` alert |

## Suggested plan slicing (for the planner; not a decision)

1. **Wave 0 (foundation, blocks all):** migration 087 (settings, snapshot columns, `cash_settled` + kinds, consent mode, `booking_fee_cases`, `booking_manage_tokens`, `fee_case_status`, `card_flow_mode` `'on'`) written by an executor and **applied by the orchestrator before code merges**; `state.ts` vocabulary + fake DB + parity tests; pure policy module + settings reader + admin settings UI/route; REQUIREMENTS/ROADMAP amendment for D-16 and CASH-03.
2. **Wave 1 (engine):** shared cancel orchestrator and the admin cancel route rewrite (+ `abandonHoldForClosedBooking` fix, PATCH guards); fee route + `settleBooking` fee path + fee case RPCs + recovery fee variant; `cash_settled` transitions; tick step G (reminder + in-time release sweep); webhook kind `card_fee`; no-show gate (WR-04) and WR-02 gates.
3. **Wave 2 (surfaces):** cash checkout (init/intent/UI/consent) and cash emails; manage page + routes + tokens + email buttons + analytics suppression + headers + CSRF/rate-limit keys; My trips link; driver cash step; admin dialogs (cancel with initiator, fee dialog, badge).
4. **Wave 3 (wording + go-live):** 7-locale catalogs, terms/FAQ/book/contact/routes/services/llms/blog corrections, consent version bump, email templates; migration 088 + erasure saga step; the `on` option in the admin settings; go-live checklist (owner: Dashboard items, live proofs, the flip) - a `[BLOCKING]` owner checkpoint as in 88-17.

## Sources

### Primary (HIGH confidence)
- Repository code read this session: `lib/payments/{state,checkout,config,actions,hold,settle,tick,recovery,stripe,customer,consent,consent-text,emails/render,emails/send,alerts,notify,edit-hook}.ts`, `lib/stripe-webhook/{card-confirm,hold-events,charge-events,recovery-events,dispatch}.ts`, `lib/{booking-status,booking-transitions,booking-status-service,no-show,trip-token,driver-trip-step,rate-limit,supabase}.ts`, `app/api/admin/bookings/{route,cancel/route,[id]/payment/route,[id]/no-show/route}.ts`, `app/api/admin/settings/route.ts`, `app/api/card-checkout/{init,intent}/route.ts`, `app/api/driver/trip/[token]/progress/route.ts`, `app/(internal)/driver/trip/[token]/{page,TripCompleted,ConfirmStepDialog}.tsx`, `middleware.ts`, `next.config.ts`, `components/{SiteChrome,GoogleAnalytics,AnalyticsPageView}.tsx`, migrations `049`, `075`, `084`, `085`, `086`, tests/helpers.
- Planning: `89-CONTEXT.md`, `ROADMAP.md` Phase 89, `REQUIREMENTS.md`, `88-17-SUMMARY.md`, `87-REVIEW-DISPOSITION.md`, `88-CONTEXT.md` (D-22, D-23).
- [CITED: https://docs.stripe.com/payments/place-a-hold-on-a-payment-method] authorization windows, partial capture, one capture.
- [CITED: https://docs.stripe.com/refunds] cancel at no cost, processing fees not returned, 5-10 business days, cancel `requires_capture`.
- [CITED: https://docs.stripe.com/payments/save-and-reuse?payment-ui=elements] off-session exemptions, `authentication_required` recovery.
- [CITED: https://docs.stripe.com/api/customers/delete] customer deletion semantics.

### Secondary (MEDIUM confidence)
- Project memory notes (migration workflow, executors without Supabase MCP, `bookings_select_own` exposure inferred from migration 049).

### Tertiary (LOW confidence)
- Runtime effect of analytics on `/driver` (code reading only, A7); assign-route behaviour on closed bookings (A8).

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - no new packages; versions read from `node_modules`.
- Architecture: MEDIUM-HIGH - the break points are read from code; the target design is a proposal consistent with the single-writer and CAS-first rules.
- Pitfalls: HIGH for those quoted with file:line; MEDIUM for A7/A8/A12.
- Stripe facts: HIGH for the cited sentences; account-specific behaviour (A9) is unverified.

**Research date:** 2026-11-06
**Valid until:** 2026-12-06 (the code base moves with Phases 90-91; re-check `state.ts`, `settle.ts` and the cancel route diff before planning if they changed)

