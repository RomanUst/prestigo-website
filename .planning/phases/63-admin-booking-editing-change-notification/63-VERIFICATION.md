---
phase: 63-admin-booking-editing-change-notification
verified: 2026-08-21T14:12:55Z
status: human_needed
score: 22/22 truths verified
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "Interactive TripEditPanel field editing: expand a booking row, edit pickup date/time, name, email, phone, flight number one at a time, click each 'Save …' control, and observe the Saving.../Saved/Error hint and a PATCH round trip."
    expected: "Each per-field save persists only that field, shows the three-state hint, and the row reflects the new value without a page reload."
    why_human: "No automated test drives TripEditPanel's interactive click/type/save flow end-to-end in a browser; existing coverage is at the API layer (admin-bookings.test.ts) and structural grep checks on BookingsTable.tsx, not simulated user interaction."
  - test: "Vehicle-class or route change: select a new vehicle class or edit the pickup/destination address, click 'Review Price →', confirm the price-review panel opens with a live /api/calculate-price round trip against real Google Maps, and the old->new amount renders correctly."
    expected: "The price-review panel shows a real recomputed amount (not a stale/hardcoded value), origin/destination diff wraps without truncation, and Confirm & Save persists the new price."
    why_human: "The live network round trip to Google Maps + /api/calculate-price is not exercised by any test in this phase (network-dependent); only import/call-site presence is grep-confirmed."
  - test: "Trigger a deliberate 422 price mismatch (e.g. submit an override amount before the price finishes recomputing, or manually alter the override input) and confirm computedCzk/submittedCzk render inline in #f87171, and Confirm & Save stays disabled until the 'I confirm overriding the price...' checkbox is checked."
    expected: "The mismatch UI renders correctly and the override checkbox gates the Confirm & Save button as designed."
    why_human: "Source-level wiring (PatchError propagation, mismatch state, confirmDisabled gating) is confirmed by reading the code, but no automated test drives an actual 422 response through the live TripEditPanel UI."
  - test: "Open a completed or cancelled booking's expanded row and confirm the read-only notice replaces edit controls; open a booking_source='gnet' booking and confirm the passive banner shows while edit controls remain usable."
    expected: "Terminal-status bookings show only the read-only notice (no edit form); GNet-sourced bookings show the banner but are still editable."
    why_human: "Copy presence is grep-confirmed and the isTerminal/booking_source branch was read directly in source, but BookingsTable.test.tsx's existing fixtures don't include a completed/cancelled or gnet+terminal row, so the actual conditional-render path is not exercised by an automated test."
  - test: "Send a real branded change-notification email (toggle 'Notify client of this change' on a save) and visually confirm the rendered email in an inbox matches the UI-SPEC brand chrome (logo, gold gradient, WHAT CHANGED diff table) and shows only the fields that changed."
    expected: "Email renders correctly in a real mail client, old->new diff is legible, and no unchanged trip fields leak into the email."
    why_human: "HTML-string assertions in tests/booking-changed-email.test.ts prove structure and escaping, not visual rendering in a real email client."
---

# Phase 63: Admin Booking Editing + Change Notification Verification Report

**Phase Goal:** Operator can correct or update any booking directly from the admin panel — schedule, vehicle, route, or passenger details — with price changes reviewed before saving and the client optionally notified (by branded email) of exactly what changed.
**Verified:** 2026-08-21T14:12:55Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `booking_edit_audit_log` table exists in the live Supabase schema (migration 055) | ✓ VERIFIED | Established fact per task brief: applied live to project `rideprestigo` (enakcryrtxlnjvjutfpv); `information_schema.columns` confirmed all 8 columns. `supabase/migrations/055_booking_edit_audit_log.sql` matches the confirmed shape exactly (id/booking_id/field/old_value/new_value/operator_id/changed_at/notified, index on booking_id+changed_at DESC, no RLS). |
| 2 | `sendBookingChangedEmail`/`buildChangeEmailHtml` render a changed-fields-only old→new diff, never a full trip snapshot, with `escapeHtml` on every label/oldValue/newValue | ✓ VERIFIED | `lib/email.ts:1140-1243` — `buildChangeEmailHtml` maps `changes[]` to rows only, each interpolation wrapped in `escapeHtml()`; no journey-snapshot table present. `npx vitest run tests/booking-changed-email.test.ts` — 11/11 pass. |
| 3 | A price change renders as an old→new amount row in the same email | ✓ VERIFIED | Same diff-table mechanism (`buildChangeEmailHtml`) handles any `BookingChangeEntry`, including `amount_czk`; covered by `tests/booking-changed-email.test.ts` price-row case. |
| 4 | PATCH accepts pickup_date/time, name/email/phone/flight_number and persists to the addressed row | ✓ VERIFIED | `app/api/admin/bookings/route.ts:87-140,469-474` schema + field-by-field `tripUpdatePayload`; `tests/admin-bookings.test.ts` PATCH trip-edit Test 1 passes. |
| 5 | Each accepted field change writes exactly one `booking_edit_audit_log` row; N-field edit shares one `changed_at` | ✓ VERIFIED | `route.ts:673-693` inserts one row per `auditRows` entry, single `changedAt` computed once. Test 2 (Plan 02) passes. |
| 6 | Change email sent only when `notify_client === true` AND `notification_flags.booking_changed !== false` | ✓ VERIFIED | `route.ts:653-671` AND-gate implemented verbatim; Tests 4/5/6 (Plan 02) pass. |
| 7 | Trip-field edit on a completed/cancelled booking rejected 422 | ✓ VERIFIED | `route.ts:461-467`; Tests 7/8 (Plan 02) pass. |
| 8 | Editing the outbound leg leaves the linked return leg row byte-identical (every write scoped by `.eq('id', ...)`) | ✓ VERIFIED | All reads/writes/audits in the trip-edit branch scoped by `parsed.data.id`/`current.id`; no `payment_intent_id`/`linked_booking_id` filter anywhere in the branch. Leg-isolation test (Plan 02 Test 10, Plan 03 Task 2 Test 1) both pass — ran directly, 3/3 green. |
| 9 | The change email is sent at most once per save — `logEmail` runs as the dedup gate BEFORE Resend | ✓ VERIFIED | `route.ts:665-698` — `logEmail` called, `shouldSend` gates the `after(() => sendBookingChangedEmail(...))` call. Idempotency test (Plan 03 Task 2 Test 2) passes. |
| 10 | GET `/api/admin/bookings/[id]/audit-log` returns audit rows newest-first, admin-guarded | ✓ VERIFIED | `app/api/admin/bookings/[id]/audit-log/route.ts` — `getAdminUser()` 401/403 guard, `.order('changed_at', { ascending: false })`, `{ rows: [] }` on empty (200, not 404). 5 GET tests pass. |
| 11 | Vehicle-class or route change triggers server-side recompute via `getPricingConfig`+`computeOutboundLegTotal`+`computeExtrasTotal` — client amount never trusted | ✓ VERIFIED | `route.ts:488-546` reuses these exact functions; client `amount_czk` only used as the tolerance-check comparator, never written directly unless it matches or is explicitly overridden. Plan 03 Test 1 passes. |
| 12 | Divergence beyond `ADMIN_PRICE_TOLERANCE_CZK` without `override_price` returns 422 with `computedCzk`+`submittedCzk` | ✓ VERIFIED | `route.ts:552-561`; single top-level `ADMIN_PRICE_TOLERANCE_CZK = 2` (line 48) reused by both POST and PATCH (`grep -c` confirms one declaration). Test 2 passes. |
| 13 | `override_price=true` accepts operator amount as authoritative, writes an override audit note | ✓ VERIFIED | `route.ts:564,579-592` — `authoritativeAmountCzk` set to submitted value, `operator_notes` appended with the override line. Test 3 passes. |
| 14 | Phase 63 only records the new amount — no payment link/auto-charge/top-up | ✓ VERIFIED | Code read: the price-affecting branch only writes `tripUpdatePayload.amount_czk`/`amount_eur`/`operator_notes`; no Stripe/GNet call anywhere in the branch. |
| 15 | A price change writes an `{field:'amount_czk', old_value, new_value}` audit row | ✓ VERIFIED | `route.ts:606-624`; Test 1 (Plan 03) asserts both a `vehicle_class` and `amount_czk` audit row. |
| 16 | A trip-detail edit on a `booking_source='gnet'` booking persists/audits locally, no GNet push | ✓ VERIFIED | No `pushGnetStatus` call anywhere in the trip-edit branch (only imported/used in the status branch). Test 5 (Plan 03) asserts `pushGnetStatus` not called. |
| 17 | `amount_czk` saved is `z.number().int()`; EUR follows existing `roundUpToFive`/`czkToEur` path — no second rounding rule | ✓ VERIFIED | Schema: `amount_czk: z.number().int().positive()` (line 124); `authoritativeAmountCzk`/`amount_eur` derived from `eurToCzk`/`czkToEur` only. Precision test (Plan 03 Task 2 Test 3) passes. |
| 18 | `BookingChangeHistory` lazily fetches the audit-log GET only when the row is expanded (not on table mount) | ✓ VERIFIED | `components/admin/BookingChangeHistory.tsx:82-102` — `hasFetchedRef` guard fetches once on the component's own mount; component is only mounted inside the expanded row in `BookingsTable.tsx` (2 mount sites, both inside `{booking.expanded && ...}`-style conditional render blocks per the plan). `tests/booking-change-history.test.tsx` 6/6 pass including a no-refetch-on-rerender assertion. |
| 19 | Audit entries render newest-first, grouped under a shared changed_at/operator header | ✓ VERIFIED | `groupRows()` (BookingChangeHistory.tsx:61-75) sorts descending by `changedAt`; grouping test passes. |
| 20 | Zero rows render "No changes recorded yet." + "Edits to this booking will appear here." | ✓ VERIFIED | `BookingChangeHistory.tsx:151-160`; empty-state test passes. |
| 21 | Loading state shows "Loading history…" (11px, `var(--warmgrey)`) | ✓ VERIFIED | `BookingChangeHistory.tsx:120-122`; loading test passes. |
| 22 | Fetch failure shows "Couldn't load change history — try again." with retry | ✓ VERIFIED | `BookingChangeHistory.tsx:124-149`; error+retry test (both reject and non-ok response) passes. |

**Score:** 22/22 truths verified (0 present-but-behavior-unverified)

### UI-Layer Truths (Plan 05 — grep/code-confirmed, human verification recommended for the interactive flow)

| Truth | Status | Evidence |
|---|---|---|
| All trip/passenger fields editable inline in one expanded-row edit mode, no separate page/modal | ✓ VERIFIED (structural) | `TripEditPanel` (BookingsTable.tsx:246-756) renders inline inside the existing expandable row; no route navigation or modal/dialog component used. |
| Per-field save controls: "Save Date & Time" / "Save Name" / "Save Email" / "Save Phone" / "Save Flight Number" | ✓ VERIFIED | grep confirms all 5 labels present (lines 483, 516, 535, 555, 576). |
| Price-affecting fields (`vehicle_class`, route) never commit directly — open "Review Price →" instead | ✓ VERIFIED (structural) | No PATCH call inside the vehicle-class `<select>`'s `onChange` or `AddressInput`'s `onSelect`; both route only to `openPriceReview()`. |
| Route/vehicle edit triggers `/api/calculate-price` round trip for fresh distanceKm/preview via `AddressInput` (not `AddressInputNew`) | ✓ VERIFIED | `openPriceReview` (line 335-380) calls `fetch('/api/calculate-price', ...)`; `AddressInputNew`/`USE_NEW_PLACES_API` — 0 hits in file; `AddressInput` imported (line 18). |
| Price-review shows old→new amount (new in `var(--copper)`), override input, notify toggle, "Confirm & Save" | ✓ VERIFIED | Lines 663-745 render exactly this. |
| 422 surfaces `computedCzk`/`submittedCzk` inline (`#f87171`) and requires explicit override before saving | ✓ VERIFIED | Lines 417-423 (catch block) + 671-686 (mismatch UI + `overrideAcknowledged` checkbox) + line 430-432 (`confirmDisabled` gates on `overrideAcknowledged` when `mismatch` is set). |
| "Notify client of this change" toggle submitted as `notify_client`, helper copy verbatim | ✓ VERIFIED | Lines 700-712; `patch.notify_client` set from `priceReview.notifyClient` at line 391. |
| completed/cancelled → read-only notice; gnet → passive banner, remains editable | ✓ VERIFIED | Lines 436-450 — `isTerminal` branch replaces edit controls entirely; gnet banner renders inside the non-terminal branch (editable). |
| `BookingChangeHistory` mounted in expanded row (mobile card + desktop table) | ✓ VERIFIED | 2 mount sites confirmed (lines 1654, 2060), both inside the expanded-row render blocks. |
| Null values render blank (no dash); route/destination hidden for hourly; long values wrap | ✓ VERIFIED | `flight_number ?? ''` (line 257) and other fields seeded directly from `booking.*` (blank strings pass through untouched); destination editor gated by `booking.trip_type === 'transfer'` (line 622). |
| Three-state save hint "Saving..."/"Saved"/"Error saving"; price-review "Calculating…" disabled state | ✓ VERIFIED | `SaveHint` component + `fieldSaving` state machine (lines 259-330); `priceReview.status === 'saving' ? 'Calculating…' : 'Confirm & Save'` (line 743). |

These UI-layer items are **grep/source-confirmed** (the code paths exist and are wired as specified) but — per Plan 05's own SUMMARY — **no automated test drives the interactive click/type/save/price-review flow end-to-end in a rendered browser**. This is why the overall status routes to `human_needed` rather than `passed`: the backend spine (Plans 01-04) has full automated test coverage (95 passing tests across 4 test files, minus the 2 pre-existing unrelated failures), but the operator-facing UI's interactive behavior is verified by source-reading and grep, not by a driven UI test or manual click-through. This is consistent with Plan 05's own explicit `human_judgment: true` markers in its coverage table.

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `supabase/migrations/055_booking_edit_audit_log.sql` | New table + index, no RLS | ✓ VERIFIED | Matches confirmed live schema exactly. |
| `lib/email.ts :: sendBookingChangedEmail` / `buildChangeEmailHtml` | Branded diff email | ✓ VERIFIED | Present, exported, tested. |
| `app/api/admin/bookings/route.ts` (PATCH trip-edit branch) | Cheap + price-affecting edit branch | ✓ VERIFIED | Present, wired, tested. |
| `app/api/admin/bookings/[id]/audit-log/route.ts` | Admin-guarded GET | ✓ VERIFIED | Present, wired, tested. |
| `components/admin/BookingChangeHistory.tsx` | Lazy-fetch history component | ✓ VERIFIED | Present, wired, tested. |
| `components/admin/BookingsTable.tsx :: TripEditPanel` | Inline edit UI + price-review | ✓ VERIFIED | Present, wired (grep + source read); interactive flow not automated-tested. |

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `BookingChangeHistory` | `GET /api/admin/bookings/[id]/audit-log` | `fetch()` in `useEffect` | ✓ WIRED | Confirmed by grep + test. |
| PATCH trip-edit branch | `booking_edit_audit_log` | `.insert()` | ✓ WIRED | Confirmed. |
| PATCH trip-edit branch | `sendBookingChangedEmail` | `after()` gated by `shouldSend` | ✓ WIRED | Confirmed, and uses the merged `updatedBooking` post-fix (commit `1b35c33`), not the stale `current` row. |
| `TripEditPanel` | `PATCH /api/admin/bookings` | `patchBooking()` | ✓ WIRED | Confirmed via source read; all per-field and price-review save paths route through it. |
| `TripEditPanel` (price-review) | `POST /api/calculate-price` | `fetch()` in `openPriceReview` | ✓ WIRED | Confirmed. |
| PATCH price sub-branch | `getPricingConfig`/`computeOutboundLegTotal`/`computeExtrasTotal` | direct call | ✓ WIRED | Confirmed — reuse, not reimplementation. |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| Backend trip-edit + audit + notify + GET suite | `npx vitest run tests/admin-bookings.test.ts` | 63 passed / 2 pre-existing failed (POST Test 5/6) | ✓ PASS (matches documented, confirmed-pre-existing baseline) |
| Change-email builder suite | `npx vitest run tests/booking-changed-email.test.ts` | 11/11 passed | ✓ PASS |
| BookingChangeHistory component suite | `npx vitest run tests/booking-change-history.test.tsx` | 6/6 passed | ✓ PASS |
| BookingsTable structural/regression suite | `npx vitest run tests/BookingsTable.test.tsx` | 15/15 passed | ✓ PASS |
| Leg-isolation (AEDIT-06) named tests | `npx vitest run tests/admin-bookings.test.ts -t "leg isolation"` | 3/3 passed | ✓ PASS |
| Full project suite (regression check) | `npx vitest run` | 80 files passed / 13 failed, 936 passed / 68 failed (byte-identical to the phase's own documented, pre-existing baseline) | ✓ PASS (no regressions introduced) |
| Typecheck | `npx tsc --noEmit` | No errors referencing any phase-63 file | ✓ PASS |
| Lint | `npx eslint` on the 5 changed source files | 0 errors (1 unrelated pre-existing warning in `lib/email.ts` re: `SITE_URL`) | ✓ PASS |

### Probe Execution

No `scripts/*/tests/probe-*.sh` conventions or phase-declared probes found for this phase. SKIPPED (no probes declared/discovered).

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|---|---|---|---|---|
| AEDIT-01 | 63-02, 63-05 | Edit pickup date/time | ✓ SATISFIED | PATCH branch + `Save Date & Time` control. |
| AEDIT-02 | 63-03, 63-05 | Change vehicle class | ✓ SATISFIED | Price-affecting sub-branch + "Review Price →" trigger. |
| AEDIT-03 | 63-03, 63-05 | Edit route (origin/destination) | ✓ SATISFIED | Price-affecting sub-branch + `AddressInput`/`/api/calculate-price` round trip. |
| AEDIT-04 | 63-02, 63-05 | Edit passenger/contact + flight number | ✓ SATISFIED | Cheap-field branch + `Save Name`/`Save Email`/`Save Phone`/`Save Flight Number`. |
| AEDIT-05 | 63-01, 63-02, 63-03, 63-05 | Notify-client toggle sends branded old→new email | ✓ SATISFIED | AND-gate (`notify_client` && `notification_flags.booking_changed`) + idempotency test + UI toggle. |
| AEDIT-06 | 63-02, 63-03, 63-05 | Editing one leg leaves the linked leg unaffected | ✓ SATISFIED | `.eq('id', ...)`-scoped writes throughout; dedicated leg-isolation tests pass. |
| AEDIT-07 | 63-03, 63-05 | Price changes reviewed/adjustable before saving | ✓ SATISFIED | Server tolerance-check + 422 + override; UI price-review step. |
| FOLLOW-02 | 63-01, 63-02, 63-04, 63-05 | Audit log of all admin edits (who/what/when) | ✓ SATISFIED | `booking_edit_audit_log` table + GET route + `BookingChangeHistory` UI, all live and tested. |

No orphaned requirements — REQUIREMENTS.md's traceability table lists exactly these 8 IDs mapped to Phase 63, and all 8 are declared across the 5 plans' frontmatter.

### Anti-Patterns Found

None. Scanned all 6 phase-touched files (`app/api/admin/bookings/route.ts`, `app/api/admin/bookings/[id]/audit-log/route.ts`, `components/admin/BookingsTable.tsx`, `components/admin/BookingChangeHistory.tsx`, `lib/email.ts`, `supabase/migrations/055_booking_edit_audit_log.sql`) for `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER`/stub patterns — zero hits (the `placeholder="..."` matches in `BookingsTable.tsx` are legitimate HTML input placeholder attributes, not stub markers).

### Non-Blocking Follow-Ups (from 63-REVIEW.md, not goal-breaking)

63-REVIEW.md's one Critical finding (CR-01 — change email sent to stale `client_email` when that field was the one being edited) is **fixed** in commit `1b35c33` (verified in source: `route.ts:647` builds `updatedBooking = { ...current, ...tripUpdatePayload }` and both the `logEmail` recipient and `sendBookingChangedEmail` call now use it).

The review's 5 Warnings and 2 Info items remain open and do not break any must-have verified above:
- WR-01 (`operator_notes`/`driver_price_czk` silently dropped when combined with a trip field in one PATCH) — not reachable from the current UI (each save issues its own single-purpose PATCH); real gap for a future raw-API caller.
- WR-02 (`distance_km` has no server-side lower bound for non-transfer bookings) — cosmetic data-integrity gap.
- WR-03 (`destination_address` accepts empty string even for transfer trips) — cosmetic data-integrity gap.
- WR-04 (`operator_notes` grows unbounded on repeated overrides) — cosmetic.
- WR-05 (reverting a vehicle-class selection before Confirm & Save produces a confusing generic 400) — UX polish.
- IN-01 (audit history shows raw operator UUID, not a name) — cosmetic.
- IN-02 (`BookingChangeHistory` doesn't dash-substitute an empty-string cleared value, only `null`) — cosmetic.

None of these were declared as a `must_haves.prohibitions` or `must_haves.truths` item in any of the 5 plans, and none break AEDIT-01..07 or FOLLOW-02 as written. Recorded here for visibility; recommended as a lightweight follow-up phase/task rather than a phase-63 blocker.

### Human Verification Required

See frontmatter `human_verification` for the structured list. In summary: the backend spine (migration, PATCH API, audit writes, notification AND-gate, price recompute/override, GET route) has full automated test coverage and is verified. The **operator-facing UI's interactive flow** (clicking through per-field saves, the live price-review round trip against Google Maps, the 422/override checkbox path, and the terminal/GNet conditional rendering) is grep/source-confirmed as correctly wired but has no automated end-to-end/interaction test — Plan 05's own SUMMARY explicitly flags these as needing manual UAT before shipping. This routes the phase to `human_needed` rather than `passed`.

### Gaps Summary

No gaps. All must-haves from all 5 plans' frontmatter, plus the roadmap-level phase goal, are satisfied in the codebase (not just claimed in SUMMARY.md). The phase is functionally complete; the only outstanding item is the standard manual UAT pass on the newly-built admin UI surface, which was never claimed to be automated-tested by Plan 05 itself.

---

_Verified: 2026-08-21T14:12:55Z_
_Verifier: Claude (gsd-verifier)_
