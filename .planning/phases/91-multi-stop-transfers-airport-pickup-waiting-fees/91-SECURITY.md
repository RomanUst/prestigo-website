---
phase: "91"
slug: "multi-stop-transfers-airport-pickup-waiting-fees"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-11-12"
---

# Phase 91 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Plan |
|----------|-------------|------|
| PostgREST (anon / authenticated keys) to the new tables | stop addresses and extra-charge facts are client data and money records | 91-01 |
| erasure request to the new tables | a person's stop addresses and the operator's extra description must go with the person | 91-01 |
| browser to POST /api/calculate-price | untrusted coordinates, stop list, waits and an airport flag | 91-02 |
| server to Google Routes | paid API; request shape decides the SKU and the stop order | 91-02 |
| admin browser to PUT /api/admin/pricing | sets the rate every client will be charged | 91-03 |
| public browser to GET /api/waiting-config | unauthenticated read | 91-03 |
| browser to /api/card-checkout/init, /intent, /api/create-payment-intent | untrusted booking body: coordinates, stops, waits, legacy distanceKm, isAirport, displayed amount | 91-04 |
| client consent at checkout to a later operator charge | the stored consent version decides whether an extra is allowed | 91-05 |
| operator text to client email | the "other" item line crosses from admin to a client inbox | 91-05 |
| client-supplied attemptId to the stored booking | an attempt id must never let a client rewrite a confirmed booking | 91-06 |
| checkout to booking_stops (service role) | stop addresses are client PII | 91-06 |
| browser to the checkout routes | untrusted landing date, time, offset and pickup | 91-07 |
| admin browser to /api/admin/bookings/[id]/extra | an operator-initiated money movement on a client card | 91-08 |
| server to Stripe (off-session) | charges a saved card without the client present | 91-08 |
| Stripe webhook to the ledger | events for the extra PaymentIntent | 91-08 |
| wizard state to the quote and checkout requests | everything in the browser is a display; the server decides the price | 91-09 |
| wizard to the checkout routes | landing, offset, pickup and stops are untrusted input re-validated by the server (91-04, 91-07) | 91-10 |
| operator in the admin panel to the extra route | a confirm click moves client money | 91-11 |
| admin GET routes to the browser | stop addresses are client PII | 91-12 |
| admin PATCH price edit | operator input that reprices a booking | 91-12 |
| trip token to the driver page | unauthenticated, token-scoped view of one booking | 91-13 |
| client-entered stop addresses to HTML emails and calendar text | untrusted text rendered in mail clients | 91-14 |
| admin browser to POST /api/admin/bookings/[id]/landing | moves a client's pickup, the hold date and the calendar | 91-15 |
| live proof on production | real card, real Stripe, real client-facing emails | 91-16 |
| catalog files to the rendered wizard | static copy only; no user input | 91-17 |

---

## Threat Register

Evidence for every closed row (file:line and test names) is in the security audit of 2026-11-12 (gsd-security-auditor, 30 test files / 1443 tests passed); the mitigation column is the plan-time mitigation, verified present in the code.

| Threat ID | Plan | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|------|----------|-----------|----------|-------------|------------|--------|
| T-91-01 | 91-01 | Information disclosure | booking_stops, booking_extra_charges via the public API | high | mitigate | REVOKE ALL from anon and authenticated, RLS on with deny policies; text test plus pg_policies in the smoke | closed |
| T-91-02 | 91-01 | Information disclosure | stop addresses and extra descriptions after an erasure | high | mitigate | erasure_anonymise_person copy nulls them; a charging extra blocks the erasure; text test asserts the 088 body is kept whole | closed |
| T-91-03 | 91-01 | Elevation of privilege | re-created SECURITY DEFINER erasure functions | high | mitigate | REVOKE EXECUTE FROM PUBLIC, anon, authenticated repeated; smoke reads has_function_privilege | closed |
| T-91-04 | 91-01 | Tampering | waiting rate defaulted in the migration (clients charged for waiting the owner never priced) | medium | mitigate | no DEFAULT, no UPDATE; D-05 text test; smoke counts rows with a rate (expects 0) | closed |
| T-91-SC | 91-01 | Tampering | npm/pip/cargo installs | high | accept | Rationale: this plan installs no package and runs no package-manager command, so there is no supply-chain surface to mitigate | closed |
| T-91-05 | 91-02 | Tampering | quote airport flag from the browser | medium | mitigate | isAirportTrip from coordinates only; test with isAirport true on city coordinates | closed |
| T-91-06 | 91-02 | Denial of service | Google quota burned through many stops or calls | medium | mitigate | max 5 stops in the schema and in route-distance, existing 30 per minute rate limit, 6 KB body cap kept, 8 s timeout | closed |
| T-91-07 | 91-02 | Tampering | stop order changed or Pro SKU used | medium | mitigate | body limited to origin, destination, travelMode, intermediates; test asserts the forbidden keys are absent | closed |
| T-91-08 | 91-02 | Tampering | waits outside the policy (20, 135, negative) to bend the fee | low | mitigate | schema: integer, 0..120, multiple of 15; isValidStopWait; tests | closed |
| T-91-SC | 91-02 | Tampering | npm/pip/cargo installs | high | accept | Rationale: this plan installs no package and runs no package-manager command, so there is no supply-chain surface to mitigate | closed |
| T-91-09 | 91-03 | Elevation of privilege | PUT /api/admin/pricing | high | mitigate | existing getAdminUser first (401 / 403) unchanged; test asserts 401 before parsing | closed |
| T-91-10 | 91-03 | Tampering | waiting rate value | medium | mitigate | zod positive or null, DB CHECK > 0, key sent on every row so a save never clears a rate silently | closed |
| T-91-11 | 91-03 | Denial of service | GET /api/waiting-config | low | mitigate | one cached pricing read, CDN cache 60 s, never 5xx, no amounts in the body | closed |
| T-91-SC | 91-03 | Tampering | npm/pip/cargo installs | high | accept | Rationale: this plan installs no package and runs no package-manager command, so there is no supply-chain surface to mitigate | closed |
| T-91-12 | 91-04 | Tampering | priceCheckout price inputs (distanceKm, isAirport, amount) | high | mitigate | server route distance and isAirportTrip only; tamper tests store the server distance and answer 409 on a client amount | closed |
| T-91-13 | 91-04 | Tampering | routing outage turned into a cheap booking | high | mitigate | 503 ROUTING_UNAVAILABLE, no fallback; tests on all three routes | closed |
| T-91-14 | 91-04 | Denial of service | stop arrays to burn Google quota or memory | medium | mitigate | max 5 stops, strict stop objects, existing body caps and rate limits (init 30, intent 10, create-payment-intent 10 per minute) | closed |
| T-91-15 | 91-04 | Tampering | cancellation window steered by a client distance | high | mitigate | evaluateCancellation and freeHoursFor read priced.distanceKm; init preview test with 130 km vs '1' | closed |
| T-91-16 | 91-04 | Tampering | coordinates that do not match the address text | low | accept | residual risk documented (backstop truth); the price follows the coordinates the route uses, admin and driver see address and route | closed |
| T-91-SC | 91-04 | Tampering | npm/pip/cargo installs | high | accept | Rationale: this plan installs no package and runs no package-manager command, so there is no supply-chain surface to mitigate | closed |
| T-91-17 | 91-05 | Repudiation | extra charge disputed as unauthorised | high | mitigate | consent sentence in 7 locales, version 2026-11-3 stored per booking, consentCoversExtras allow-list with a guard test for future bumps | closed |
| T-91-18 | 91-05 | Information disclosure | operator text in a client email | medium | mitigate | only the dedicated extraItem field renders, HTML-escaped, never in the subject; reason and note still never render (T-89-13 tests) | closed |
| T-91-SC | 91-05 | Tampering | npm/pip/cargo installs | high | accept | Rationale: this plan installs no package and runs no package-manager command, so there is no supply-chain surface to mitigate | closed |
| T-91-19 | 91-06 | Tampering | stops of a confirmed booking rewritten through a reused attemptId | high | mitigate | stops written only when captureUnpaidBooking affected an unpaid row; test with a confirmed attempt | closed |
| T-91-20 | 91-06 | Repudiation | a paid booking whose stops were lost (driver never stops) | high | mitigate | pay-now fails closed with PaymentIntent cancel and 503 STOPS_NOT_SAVED; card and cash propagate the error before any Stripe object | closed |
| T-91-21 | 91-06 | Information disclosure | stop addresses in logs | medium | mitigate | errors and logs carry booking ids and codes only; test on loadStopsSafe | closed |
| T-91-SC | 91-06 | Tampering | npm/pip/cargo installs | high | accept | Rationale: this plan installs no package and runs no package-manager command, so there is no supply-chain surface to mitigate | closed |
| T-91-22 | 91-07 | Tampering | pickup not matching landing + offset (to dodge the lead rule or shift the hold) | medium | mitigate | server derives the pickup, 422 PICKUP_MISMATCH, lead check on the derived pickup; tests | closed |
| T-91-23 | 91-07 | Tampering | landing fields on a city pickup | low | mitigate | isAirportPickup on the origin, 422 LANDING_NOT_AIRPORT | closed |
| T-91-24 | 91-07 | Tampering | DST or midnight error moving the hold or cancellation window | medium | mitigate | instant arithmetic only, DST and rollover fixtures in three server time zones | closed |
| T-91-SC | 91-07 | Tampering | npm/pip/cargo installs | high | accept | Rationale: this plan installs no package and runs no package-manager command, so there is no supply-chain surface to mitigate | closed |
| T-91-25 | 91-08 | Elevation of privilege | extra route | high | mitigate | getAdminUser first on GET and POST (401 / 403 before parsing), eligibility re-checked on a fresh row and context | closed |
| T-91-26 | 91-08 | Tampering | double charge (double click, two operators, retry) | high | mitigate | partial unique index one charging row per booking, 409 payment_busy, idempotency key extra:<id>:<attempt> without the amount, resume replays the same key | closed |
| T-91-27 | 91-08 | Tampering | amount or currency in the request | high | mitigate | strict schemas (currency in body is 400), currency from the row, waiting amount computed on the server and checked against expected_amount_minor (409 amount_changed), integer minor units within Stripe's ceiling | closed |
| T-91-28 | 91-08 | Elevation of privilege | extra on a GNet booking | high | mitigate | isExtraChargeEligible returns partner; webhook partner guard; tests | closed |
| T-91-29 | 91-08 | Tampering | extra PaymentIntent handled as a hold failure or a booking refund | high | mitigate | explicit card_extra routing in dispatch and charge-events, PI id only on the extra row and ledger, charge.refunded test keeps status and payment_state | closed |
| T-91-30 | 91-08 | Repudiation | extra charged without consent covering it | high | mitigate | consentCoversExtras on the latest stored consent, 422 consent_not_covered, client receipt email | closed |
| T-91-31 | 91-08 | Information disclosure | operator description or card data in ledger and logs | medium | mitigate | ledger keeps codes and amounts only; logs carry ids and codes; test greps ledger rows and console calls for the description | closed |
| T-91-SC | 91-08 | Tampering | npm/pip/cargo installs | high | accept | Rationale: this plan installs no package and runs no package-manager command, so there is no supply-chain surface to mitigate | closed |
| T-91-32 | 91-09 | Tampering | waiting values or prices edited in the browser | low | accept | server recomputes and cross-checks (91-02, 91-04); the summary shows only server amounts | closed |
| T-91-33 | 91-09 | Tampering | hard-coded euro amount in a component (pricing drift, CLAUDE.md rule) | medium | mitigate | waiting amount only from waitingEur; pre-commit price check; no rate in /api/waiting-config | closed |
| T-91-SC | 91-09 | Tampering | npm/pip/cargo installs | high | accept | Rationale: this plan installs no package and runs no package-manager command, so there is no supply-chain surface to mitigate | closed |
| T-91-34 | 91-10 | Tampering | landing or stops sent where the server forbids them | low | mitigate | same isAirportPickup gate as the server, stops only for transfer; server 400 / 422 is the authority | closed |
| T-91-SC | 91-10 | Tampering | npm/pip/cargo installs | high | accept | Rationale: this plan installs no package and runs no package-manager command, so there is no supply-chain surface to mitigate | closed |
| T-91-35 | 91-11 | Repudiation | operator charges a different amount than the one confirmed | high | mitigate | button label states the server amount; expected_amount_minor checked by the server (409 amount_changed) | closed |
| T-91-36 | 91-11 | Tampering | double submit from the UI | medium | mitigate | in-flight ref, disabled button, no dismissal while submitting; server partial unique index as the backstop | closed |
| T-91-SC | 91-11 | Tampering | npm/pip/cargo installs | high | accept | Rationale: this plan installs no package and runs no package-manager command, so there is no supply-chain surface to mitigate | closed |
| T-91-37 | 91-12 | Information disclosure | stops in admin list and dispatch responses | medium | mitigate | both routes keep getAdminUser first (unchanged); stops attached after the guard; dispatch keeps Cache-Control no-store | closed |
| T-91-38 | 91-12 | Tampering | price edit dropping detour and waiting | medium | mitigate | 422 stops_edit_unsupported unless override_price (audited like every override); tests | closed |
| T-91-47 | 91-12 | Tampering | manual pickup edit desynchronising landing + offset from the pickup the driver and the hold use | medium | mitigate | PATCH accepts a pickup only as landing + an allowed offset (offset updated and audited in the same write), else 422 landing_pickup_mismatch before any write; tests incl. midnight roll-over | closed |
| T-91-SC | 91-12 | Tampering | npm/pip/cargo installs | high | accept | Rationale: this plan installs no package and runs no package-manager command, so there is no supply-chain surface to mitigate | closed |
| T-91-39 | 91-13 | Information disclosure | driver page showing money or another booking's stops | medium | mitigate | stops read by the validated booking id only after the view checks; no amount or fee rendered (test) | closed |
| T-91-40 | 91-13 | Tampering | stop address markup on the driver page | low | mitigate | React text rendering only (no innerHTML); canon output encoding | closed |
| T-91-SC | 91-13 | Tampering | npm/pip/cargo installs | high | accept | Rationale: this plan installs no package and runs no package-manager command, so there is no supply-chain surface to mitigate | closed |
| T-91-41 | 91-14 | Tampering | stop address markup in emails | medium | mitigate | escapeHtml on every value in tripRouteRowsHtml; escape test with an HTML tag | closed |
| T-91-42 | 91-14 | Denial of service | stops read failure blocking confirmations or calendar | low | mitigate | loadStopsSafe returns [] and logs the booking id; tests | closed |
| T-91-SC | 91-14 | Tampering | npm/pip/cargo installs | high | accept | Rationale: this plan installs no package and runs no package-manager command, so there is no supply-chain surface to mitigate | closed |
| T-91-43 | 91-15 | Tampering | pickup moved without a person (automation) | medium | mitigate | only the admin route calls applyLandingChange (import test); flight-refresh routes unchanged | closed |
| T-91-44 | 91-15 | Tampering | stale or concurrent moves | medium | mitigate | expected pickup check (409 pickup_changed), CAS on the current pickup (409 stale), payment in-flight precheck | closed |
| T-91-45 | 91-15 | Elevation of privilege | non-admin move | high | mitigate | getAdminUser first, 401 / 403 before parsing; strict schema | closed |
| T-91-SC | 91-15 | Tampering | npm/pip/cargo installs | high | accept | Rationale: this plan installs no package and runs no package-manager command, so there is no supply-chain surface to mitigate | closed |
| T-91-46 | 91-16 | Tampering | live extra charge on a real client's card during the proof | high | accept | proof only on the owner's own canary booking, 1 EUR, refunded at once; recorded in the SUMMARY | closed (owner deferral 2026-11-14, see Accepted Risks Log AR-91-46) |
| T-91-SC | 91-16 | Tampering | npm/pip/cargo installs | high | accept | Rationale: this plan installs no package and runs no package-manager command, so there is no supply-chain surface to mitigate | closed |
| T-91-48 | 91-17 | Tampering | a price typed into copy (drifts from admin rates, breaks the no-hard-coded-price rule) | low | mitigate | no amounts in any new string; test rejects digit + currency patterns | closed |
| T-91-SC | 91-17 | Tampering | npm/pip/cargo installs | high | accept | Rationale: this plan installs no package and runs no package-manager command, so there is no supply-chain surface to mitigate | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Open Threat

**T-91-46** (Tampering, high, plan 91-16): the live extra-charge proof must run only on the owner's own canary booking, 1 EUR, refunded at once, and be recorded in the SUMMARY. This is an operator procedure inside 91-16 Task 3, which runs after the production deploy. It is not a code gap and no exposure exists before the deploy (no extra charge can be made). It closes when `91-16-SUMMARY.md` records the canary booking reference, the 1.00 EUR extra with `status=charged`, the ledger rows `admin_action` then `extra_charged`, and the refund — or when the owner records an explicit risk acceptance. Re-run `/gsd-secure-phase 91` after that.

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-91-01 | T-91-16 | Coordinates may not match the typed address text. The price follows the coordinates the route uses; the address is the backstop truth, and admin and driver see both the address and the route. | plan 91-04 threat model, premise verified by gsd-security-auditor | 2026-11-12 |
| AR-91-02 | T-91-32 | A user can edit waiting values or prices in the browser. The server recomputes and cross-checks (T-91-05..08, T-91-12, T-91-27 closed); the browser values are display only. | plan threat model, premise verified by gsd-security-auditor | 2026-11-12 |
| AR-91-03 | T-91-SC (plans 91-01..91-17) | No plan installs a package or runs a package-manager command. Verified: no dependency manifest or lockfile changed between ca860cd5 and HEAD; every third-party import added in the phase already existed in package.json. | plan threat models, premise verified by gsd-security-auditor | 2026-11-12 |
| AR-91-04 | owner decision D-13 | No business cap on the manual "other" extra amount. Safeguards: confirm step that states the amount, stated-amount check on the server, one charging row per booking, Stripe's own ceiling. | owner (91-CONTEXT.md D-13) | 2026-11-11 |

*Accepted risks do not resurface in future audit runs.*

---

## Review Fixes Checked Against the Register

The code review fixes (CR-01, WR-01..WR-06, IN-01, IN-03, IN-05, IN-08) weakened no mitigation: T-91-25 and T-91-29/31 are stronger (the guard re-reads the booking, erased bookings are ineligible, an extra writes only `extra_charged` / `extra_failed`), T-91-26 is intact (unique index, key without an amount, Stripe reconciliation before any create), T-91-47 gained a compare-and-set.

## Non-blocking Observations

1. New operator alert kind `ops_attention` goes to the manager address with the reference, client name, pickup, a fixed code and an admin link — no address or description.
2. New Stripe calls from CR-01 / WR-02 (`paymentIntents.cancel`, `.retrieve`, `.list(customer)`) are admin-only and guarded by the row lock.
3. A `payment_intent.canceled` event with `kind=card_extra` reaches `handleHoldCanceled`, which returns without a write; covered by a test added on 2026-11-12 (`tests/extra-webhook.test.ts`).
4. Left open on purpose (code review Info): IN-06 (Google Routes cost control is per-IP and the limiter fails open when Upstash is down), IN-02 (no client copy for the new server codes in pay-now), IN-09 (a stops read failure answers 500 on the admin list and dispatch).

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-11-12 | 65 register rows (48 threat IDs + T-91-SC per plan) | 64 | 1 (T-91-46, procedural) | gsd-security-auditor (sonnet), 30 test files / 1443 tests passed |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [ ] `status: verified` set in frontmatter

**Approval:** pending — T-91-46 closes with the owner's live proof after deploy

---

## Owner decision 2026-11-14 (T-91-46)

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-91-46 | T-91-46 | No live extra-charge proof was run: the owner's canary booking was cancelled before completion, so no card was charged for a proof and the exposure the threat describes did not occur. The owner closed the phase and will check the extra charge on the first real card booking. The rule stays for that check: only with the client's agreement or on the owner's own booking, a small amount, refunded at once, recorded in 91-UAT.md Deferred Follow-Ups (test 11). The code-side guards of the extra charge (eligibility, consent version gate, single charging row, idempotency, operator confirm step) are closed threats in this register. | owner ("фаза 91 оставим и проверим потом на реальной брони если что") | 2026-11-14 |

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-11-14 | 65 register rows | 65 | 0 | orchestrator, on the owner's recorded decision; no code change |
