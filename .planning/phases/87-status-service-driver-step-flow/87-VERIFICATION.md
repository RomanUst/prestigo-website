---
phase: 87-status-service-driver-step-flow
verified: 2026-11-03T23:10:00Z
status: passed
score: 5/5 must-haves verified
covered_files:
  - ".planning/phases/87-status-service-driver-step-flow/87-01-PLAN.md"
  - ".planning/phases/87-status-service-driver-step-flow/87-01-SUMMARY.md"
  - ".planning/phases/87-status-service-driver-step-flow/87-02-PLAN.md"
  - ".planning/phases/87-status-service-driver-step-flow/87-02-SUMMARY.md"
  - ".planning/phases/87-status-service-driver-step-flow/87-03-PLAN.md"
  - ".planning/phases/87-status-service-driver-step-flow/87-03-SUMMARY.md"
  - ".planning/phases/87-status-service-driver-step-flow/87-04-PLAN.md"
  - ".planning/phases/87-status-service-driver-step-flow/87-04-SUMMARY.md"
  - ".planning/phases/87-status-service-driver-step-flow/87-05-PLAN.md"
  - ".planning/phases/87-status-service-driver-step-flow/87-05-SUMMARY.md"
  - ".planning/phases/87-status-service-driver-step-flow/87-06-PLAN.md"
  - ".planning/phases/87-status-service-driver-step-flow/87-06-SUMMARY.md"
  - ".planning/phases/87-status-service-driver-step-flow/87-07-PLAN.md"
  - ".planning/phases/87-status-service-driver-step-flow/87-07-SUMMARY.md"
  - ".planning/phases/87-status-service-driver-step-flow/87-08-PLAN.md"
  - ".planning/phases/87-status-service-driver-step-flow/87-08-SUMMARY.md"
  - ".planning/phases/87-status-service-driver-step-flow/87-09-PLAN.md"
  - ".planning/phases/87-status-service-driver-step-flow/87-09-SUMMARY.md"
  - ".planning/phases/87-status-service-driver-step-flow/87-10-PLAN.md"
  - ".planning/phases/87-status-service-driver-step-flow/87-10-SUMMARY.md"
  - ".planning/phases/87-status-service-driver-step-flow/87-11-PLAN.md"
  - ".planning/phases/87-status-service-driver-step-flow/87-11-SUMMARY.md"
  - ".planning/phases/87-status-service-driver-step-flow/87-12-PLAN.md"
  - ".planning/phases/87-status-service-driver-step-flow/87-12-SUMMARY.md"
  - ".planning/phases/87-status-service-driver-step-flow/87-13-PLAN.md"
  - ".planning/phases/87-status-service-driver-step-flow/87-13-SUMMARY.md"
  - ".planning/phases/87-status-service-driver-step-flow/87-14-PLAN.md"
  - ".planning/phases/87-status-service-driver-step-flow/87-14-SUMMARY.md"
  - ".planning/phases/87-status-service-driver-step-flow/87-15-PLAN.md"
  - ".planning/phases/87-status-service-driver-step-flow/87-15-SUMMARY.md"
  - ".planning/phases/87-status-service-driver-step-flow/87-16-PLAN.md"
  - ".planning/phases/87-status-service-driver-step-flow/87-16-SUMMARY.md"
  - ".planning/phases/87-status-service-driver-step-flow/87-17-PLAN.md"
  - ".planning/phases/87-status-service-driver-step-flow/87-17-SUMMARY.md"
  - ".planning/phases/87-status-service-driver-step-flow/87-18-PLAN.md"
  - ".planning/phases/87-status-service-driver-step-flow/87-18-SUMMARY.md"
  - ".planning/phases/87-status-service-driver-step-flow/87-19-PLAN.md"
  - ".planning/phases/87-status-service-driver-step-flow/87-19-SUMMARY.md"
  - ".planning/phases/87-status-service-driver-step-flow/87-20-PLAN.md"
  - ".planning/phases/87-status-service-driver-step-flow/87-20-SUMMARY.md"
  - "app/(internal)/driver/trip/[token]/ConfirmStepDialog.tsx"
  - "app/(internal)/driver/trip/[token]/NavigateChooser.tsx"
  - "app/(internal)/driver/trip/[token]/TripDetails.tsx"
  - "app/(internal)/driver/trip/[token]/TripScreen.tsx"
  - "app/(internal)/driver/trip/[token]/page.tsx"
  - "app/(internal)/driver/trip/help/DriverHelpChat.tsx"
  - "app/(internal)/driver/trip/help/page.tsx"
  - "app/api/driver/respond/route.ts"
  - "app/api/driver/trip/[token]/help/route.ts"
  - "app/api/driver/trip/[token]/progress/route.ts"
  - "app/api/gnet/farmin/route.ts"
  - "app/api/webhooks/stripe/route.ts"
  - "components/admin/BookingsTable.tsx"
  - "components/chat/load-chat-widget.ts"
  - "infra/chatwoot/custom-attributes.json"
  - "infra/chatwoot/inboxes.json"
  - "infra/chatwoot/sync.mjs"
  - "lib/booking-events.ts"
  - "lib/booking-status-service.ts"
  - "lib/booking-status.ts"
  - "lib/booking-transitions.ts"
  - "lib/chat-contact.ts"
  - "lib/chat-intake.ts"
  - "lib/chatwoot-identity.ts"
  - "lib/driver-accept-email.ts"
  - "lib/driver-help-contract.ts"
  - "lib/driver-nav-url.ts"
  - "lib/driver-trip-step.ts"
  - "lib/email-log.ts"
  - "lib/email.ts"
  - "lib/gnet-push.ts"
  - "lib/no-show.ts"
  - "lib/rate-limit.ts"
  - "middleware.ts"
  - "next.config.ts"
  - "supabase/migrations/084_booking_statuses_status_log.sql"
covered_digest: "v2:sha256:3f2e9183aebcaea1ee6d1dce67f2ca039e8c9bf8f7ce7dcd34d416ef9a4486bd"
behavior_unverified: 0
overrides_applied: 1
overrides:
  - must_have: "For a GNet booking each driver step is pushed to GNet exactly once"
    reason: "The 'passenger on board' step is not pushed: GNet has no on_board status (GnetStatus = CONFIRMED|ASSIGNED|EN_ROUTE|ON_LOCATION|COMPLETE|CANCEL). Locked decision D-22 fallback: send nothing for on_board. En route, on site and completed are pushed exactly once. Owner re-confirmed in 87-UAT test 6."
    accepted_by: "owner"
    accepted_at: "2026-11-03"
re_verification:
  previous_status: human_needed
  previous_score: 5/5
  gaps_closed:
    - "87-UAT gap 1: driver accept email (87-15)"
    - "87-UAT gap 2: Google Maps / Waze chooser (87-16)"
    - "87-UAT gap 3: Help opens a Chatwoot chat identified as the driver (87-17..87-20)"
    - "Previous human items 1-5: all resolved by 87-UAT tests 1-6 (owner, real phone, production)"
    - "Previous warnings WR-03, WR-05 and the Cancel-button raw status_conflict text (VF-01): fixed"
  gaps_remaining: []
  regressions: []
gaps: []
deferred: []
human_verification: []
---

# Phase 87: Status Service and Driver Step Flow Verification Report

**Phase Goal:** Every booking status change goes through one trusted service, and the driver moves a trip forward one strict step at a time from the trip link while the admin sees each step immediately.
**Verified:** 2026-11-03
**Status:** passed
**Re-verification:** Yes. The earlier report (human_needed) predates gap-closure plans 87-15..87-20, UI-SPEC amendment C (sheet layout) and the review-fix commit 17b847f3 on branch `fix/87-review-gap-closure`. Phase 87 code was re-read at HEAD `17b847f3`.

## Goal Achievement

All five roadmap criteria hold in the code at HEAD. The five human items from the first report were all carried out by the owner on a real phone in production (87-UAT: 8 of 9 tests pass, test 1's issue was split into three gaps that were fixed and re-tested as tests 7-9). No criterion is FAILED, no item is left for a person to decide, so the status is `passed`. Open review warnings are listed below; none touches a roadmap criterion.

Evidence gathered in this pass:
- 20 test files that cover the status service, driver step, GNet push, writer gate, accept email, nav chooser, help chat, CRM guard, CSP/headers, Chatwoot sync, farm-in and Stripe-adjacent suites: 717 tests passed (re-run here). Orchestrator full run: 326 files, 8789 tests passed; `tsc` shows only the 8 baseline errors in `tests/`.
- No `TBD`/`FIXME`/`XXX` in any of the 28 app/lib/components/infra files changed since 8076d71e. No `€` literal in changed `app/` or `components/` files. `package.json` and `messages/` are unchanged (D-20).
- Production smoke from the orchestrator (not re-run): help page CSP carries the chat origin, the token page does not; help API 403 on foreign origin, 400 on invalid token; Chatwoot conversation 218 in the Drivers inbox with `chat_role` / `driver_trip_ref`, no trip token anywhere; `chat_conversations.outcome = filtered`, no EspoCRM lead.

### Observable Truths (ROADMAP success criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Trip link shows one "next step" control; strict order en route, on site, on board, completed | VERIFIED | Unchanged from first report: `NEXT_STEP` map in `lib/booking-status.ts`, single `SlideToAdvance` in `TripScreen.tsx`, server order check in `driverTripStep`. Device feel confirmed by owner (UAT test 1 "статусы работают", test 5). |
| 2 | Each step changes the status in admin at once (incl. on board); skipped step rejected; repeat tap harmless | VERIFIED | Route -> `driverTripStep` -> `advanceBookingStatus` -> RPC `advance_booking_status`; replay returns 200 with no write; skipped step 409. UAT tests 1-2 pass (double tap impossible by design: slider plus confirm dialog; airplane-mode retry confirmed). |
| 3 | One status service with compare-and-set; concurrent cancel + driver tap -> exactly one applies, loser sees a clear message; every change logged with actor; admin transitions unchanged | VERIFIED | `tests/status-writers-gate.test.ts` still green (writer allowlist, RPC single caller). Allowlisted legacy writers now respect terminal states: GNet farm-in cancel uses `.not('status','in','(completed,no_show)')` and acks (`app/api/gnet/farmin/route.ts:237-262`), Stripe `charge.refunded` cancels skip completed/no_show (5 call sites). Cancel button shows the shared conflict copy plus a refund note on 409 `status_conflict` (`components/admin/BookingsTable.tsx:1335-1339`). Real race on an active trip passed in UAT test 4 (owner). Caveat WR-01 below (refund-before-CAS) stays open. |
| 4 | GNet booking: each driver step pushed once; partner marker so no hold/capture/no-show charge can apply | VERIFIED (override) | `gnet-push` claim-then-push unchanged and green. `on_board` is not pushed (D-22); owner accepted (UAT test 6, override above). Partner guard added since the first report: status emails (confirmed/cancelled/post-trip) skip partner bookings (`lib/booking-status-service.ts:244-246`, fixes WR-03). Money exclusion still rests on `assertMoneyEligible` plus the Phase 88/89 hand-off (no charge path exists yet). |
| 5 | "Completed" asks confirmation, fires exactly one completion event, driver never sees or enters an amount | VERIFIED | Unchanged: `.strict()` request schema, `ConfirmStepDialog` isFinal, `emitBookingCompleted` after applied `completed`. `page.tsx` sets `amount_eur: null` and selects no price; no `amount`/`price` token in any trip-screen file. The gap-closure accept email selects `driver_price_czk` only (D-06 respected). |

**Score:** 5/5 truths verified (0 behavior-unverified; 1 override).

### Gap-closure plan truths (87-15..87-20)

| Plan | Truth | Status | Evidence |
|------|-------|--------|----------|
| 87-15 | Accept sends one email with order details and an "Open trip" link; respond response unchanged | VERIFIED | `lib/driver-accept-email.ts` (read, `isTripLinkValid` gate, `notification_flags.driver_assigned === false` gate, `logEmail` dedupe `driver_accepted:<id>`, price columns not selected); wired in `app/api/driver/respond/route.ts:93-96` inside `after()` with `.catch`. Owner confirmed the email on a real phone (UAT test 7). |
| 87-15 | Dedupe actually works for a null booking id | VERIFIED | `lib/email-log.ts` uses `.is('booking_id', null)` (review WR-02, fixed in 17b847f3, tests in `email-log.test.ts`). Note: `logEmail` dedupes inside a 10-minute window; once-per-assignment in practice also rests on the single-use respond token. |
| 87-15 | Failed Resend send is not recorded as sent | VERIFIED | `sendDriverAcceptedEmail` returns a boolean; `send_failed` logged via `console.error` (review WR-03, fixed). |
| 87-16 | Nav button opens Google Maps / Waze chooser; only the destination in the URL; plain anchors with `noopener noreferrer`; dialog conventions | VERIFIED | `lib/driver-nav-url.ts` (`googleMapsDirectionsUrl`, `wazeNavigationUrl`, coords or address only), `NavigateChooser.tsx` (role=dialog, aria-modal, focus trap, Escape/scrim close, focus return, 48px targets, plain `<a target=_blank rel="noopener noreferrer">`), opened from both `AddressRow` buttons in `TripScreen.tsx`. UAT test 8 pass incl. in-app browsers. |
| 87-17 | Driver chats never become a CRM Lead / Contact | VERIFIED | `isDriverChatIdentifier` guard in `lib/chat-intake.ts:272` (`filtered_driver`) and `lib/chat-contact.ts:105` (`driver_contact`); resolve goes through intake. Existing visitor suites unchanged and green. Live: outcome `filtered`, no Espo lead (conversation 218). Drivers inbox `hmac_mandatory=true` confirmed via API. |
| 87-18 | Token-gated help identity endpoint, uniform 400, rate limit, CSRF prefix, fail closed, no VPS call, attributes defined | VERIFIED | `app/api/driver/trip/[token]/help/route.ts` (size cap, rate limit 10/min, UUID before DB, `isTripLinkValid`, uniform `invalid_token`, `no-store`); `buildDriverWidgetConfig` returns `{ enabled:false }` without base URL / token / secret / safe origin, identifier `driver:<uuid>` + HMAC, email/phone null, name `"<name> (driver)"`; isolation-guard allowlist entry added; `chat_role` and `driver_trip_ref` defined in `infra/chatwoot/custom-attributes.json`. Driver inbox pair selected by env only. |
| 87-19 | Help -> "Chat with the office" (call fallback); widget loads on tokenless `/driver/trip/help` only; no token / URL / referrer to Chatwoot; path-scoped CSP; error states | VERIFIED | `TripScreen.openHelpChat` fetches the config, stores it (`saveDriverHelpConfig`), leaves by full load (`openDriverHelpPage`); `help/page.tsx` noindex; `openDriverHelpChat` sends only user + `{chat_role, driver_trip_ref}` with `contact: null` (no page href / referrer path); `middleware.ts` `DRIVER_HELP_PATH` exact-match uses `buildCspDriverHelp`, all other `/driver` and `/admin` keep `buildCsp`; `ConfirmStepDialog` has the chat error copy and call link; bfcache `pageshow` reset. UAT test 9 pass on a real phone; production smoke above. |
| 87-19 / review WR-01 | No Referer from any driver page (trip URL is a bearer token) | VERIFIED in code, NOT YET IN PRODUCTION | `next.config.ts:173-179` sets `Referrer-Policy: no-referrer` on `/driver/:path*` after the global entry; tested in `next-config-headers.test.ts`. Commit `17b847f3` is on `fix/87-review-gap-closure` and not on `origin/main` yet, so this hardening ships with that merge. |
| 87-20 | Gates, owner inbox decision, production smoke | VERIFIED | Drivers inbox configured as code (`infra/chatwoot/inboxes.json`, sync fallback), PR #85/#86 merged, smoke recorded in 87-20-SUMMARY and UAT note. |
| UI-SPEC amendment C | Name-only passenger card on top; swipe-up sheet shows passenger name/phone + SMS/call, booking, driver, vehicle class, vehicle, flight, notes | VERIFIED | `PassengerCard` (caption "Passenger", name only), `PassengerRow` with `sms:` / `tel:` links (digits and + only, hidden without phone), `TripDetails` rows in the specified order, `SWIPE_MIN_PX = 24`, swipe handlers on the handle and time row only, click-after-swipe swallowed with a 400 ms reset, vertical-axis lock and touchcancel (review WR-04, fixed). Component tests green (`driver-trip-screen.test.tsx`). Owner reviewed the layout. |

### Required Artifacts (gap-closure)

| Artifact | Status | Details |
|----------|--------|---------|
| `lib/driver-accept-email.ts`, `lib/email.ts` (accept email + shared rows) | VERIFIED | Wired from respond route; golden fixture for the Phase 40 assignment email updated and green. |
| `lib/driver-nav-url.ts`, `NavigateChooser.tsx` | VERIFIED | Wired from `TripScreen`. |
| `lib/driver-help-contract.ts`, `lib/chatwoot-identity.ts`, `help/route.ts`, `lib/rate-limit.ts` entry | VERIFIED | Imported by TripScreen, DriverHelpChat, chat-intake, chat-contact. |
| `app/(internal)/driver/trip/help/{page,DriverHelpChat}.tsx`, `components/chat/load-chat-widget.ts` (`openDriverHelpChat`) | VERIFIED | Dynamic import after tap; public launcher suite unmodified and green. |
| `middleware.ts` `buildCspDriverHelp`, `next.config.ts` driver Referrer-Policy | VERIFIED | Exact-path CSP; tests pin equality with `buildCsp` plus chat origin only. |
| `infra/chatwoot/{custom-attributes,inboxes}.json`, `sync.mjs` | VERIFIED | `chatwoot-sync` tests green (17 attributes). |

### Key Link Verification (gap-closure)

| From | To | Status |
|------|----|--------|
| respond route -> `sendDriverAcceptedTripEmail` in `after()` on `accepted` only | WIRED |
| `driver-accept-email` -> `isTripLinkValid`, `logEmail` | WIRED |
| `TripScreen` AddressRow -> `NavigateChooser` -> `googleMapsDirectionsUrl` / `wazeNavigationUrl` | WIRED |
| `TripScreen` -> help route (`driverHelpConfigPath`) -> `saveDriverHelpConfig` -> `openDriverHelpPage` | WIRED |
| `DriverHelpChat` -> `openDriverHelpChat` (dynamic import) | WIRED |
| `middleware.ts` `/driver/trip/help` -> `buildCspDriverHelp` | WIRED |
| `chat-intake` / `chat-contact` -> `isDriverChatIdentifier` | WIRED |

### Data-Flow Trace (Level 4)

| Artifact | Data | Source | Status |
|----------|------|--------|--------|
| Accept email body | booking + driver rows | live `driver_assignments` join, no static fallback | FLOWING |
| Help widget identity | `user`, `conversation` | HMAC computed server-side from live assignment + env | FLOWING |
| Trip sheet rows (passenger, driver, vehicle) | `trip.*` | `page.tsx` `TRIP_SELECT` join incl. `drivers(name, vehicle_info)` | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Phase 87 and gap-closure suites | `npx vitest run` on 20 files (accept email, help route/contract/chat, nav url, trip screen, email-log, chat-intake/contact/resolve, next-config-headers, middleware-i18n, isolation guard, writers gate, farm-in, status service, driver step, gnet push, chatwoot sync, BookingsTable) | 20 files, 717 tests passed | PASS |
| Whole suite and tsc | given by orchestrator | 326 files / 8789 tests; tsc baseline only | PASS (not re-run) |
| Live production checks | given by orchestrator and owner (UAT 1-9) | as listed above | PASS (not re-run) |

### Probe Execution

SKIPPED: no `scripts/*/tests/probe-*.sh` declared by this phase.

### Requirements Coverage

| Requirement | Status | Evidence |
|-------------|--------|----------|
| PAYF-02 | SATISFIED | Truth 3. Legacy allowlisted writers are logged by the trigger and no longer overwrite terminal states. |
| DRV-01 | SATISFIED | Truth 1, owner-confirmed on a phone. |
| DRV-02 | SATISFIED | Truth 2, owner confirmed admin statuses. |
| DRV-03 | SATISFIED for Phase 87 scope | Truth 5. Capture itself is Phase 88 (HOLD-04). |
| DRV-04 | SATISFIED | Truth 2. |
| DRV-05 | SATISFIED (override) | Truth 4. |

No orphaned requirements. `.planning/REQUIREMENTS.md` still marks these six as `Pending` (lines 127, 146-150) and `ROADMAP.md` line 22 still shows Phase 87 unchecked: the orchestrator should tick them.

### Anti-Patterns Found

None blocking. No debt markers in changed files. `app/(internal)/driver/trip/[token]/page.tsx:135` `amount_eur: null` is the deliberate D-06 null-out, not a stub.

### Open items (non-blocking, recorded in 87-REVIEW-DISPOSITION.md)

| ID | Item | Why it is not a gap |
|----|------|---------------------|
| WR-01 (first review) | Admin cancel issues the refund before the compare-and-set; when the driver wins the race the booking stays live with a refund already made | Status is applied exactly once and the message is clear (criterion 3 holds); the refund side effect is not rolled back. Owner triaged as open. Worth fixing before real money flows through Phase 88/89. |
| WR-02, WR-04, WR-06 (first review) | Edit/assign ignore terminal `no_show`; operator confirm skips the wait threshold; settings PATCH unguarded `request.json()` | Outside the five criteria; WR-04 is latent until Phase 89 charges no-shows. |
| WR-06 (gap-closure review) | Unsent office-note draft is lost when Help does a full page load | Low-impact UX. |
| IN-01..IN-05 | `buildCspDriverHelp` duplicates `buildCsp`; silent fallback if only one Drivers env var is set; long name drops "(driver)"; "ext." phone numbers; identity kept for the tab session | Informational. |
| Cosmetic | The chat widget shows the "Prestigo Admin" agent photo; Drivers inbox has no avatar | Follow-up named in 87-UAT. |
| Release | `17b847f3` (no-Referer for driver pages, null-booking email dedupe, send_failed outcome, swipe axis lock) is on `fix/87-review-gap-closure` only; `origin/main` lacks it | Production runs the PR #85/#86 code. Merge to main to ship the hardening. Phase goal does not depend on it. |

### Human Verification Required

None. All earlier items were closed by the owner in 87-UAT.

### Gaps Summary

No gaps. Phase goal achieved at HEAD `17b847f3`.

---

_Verified: 2026-11-03_
_Verifier: Claude (gsd-verifier)_
