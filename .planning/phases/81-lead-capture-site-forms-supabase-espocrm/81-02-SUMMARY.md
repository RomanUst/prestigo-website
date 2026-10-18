---
phase: 81-lead-capture-site-forms-supabase-espocrm
plan: 02
subsystem: crm-lead-capture
tags: [espocrm, lead, mapping, tdd, pure-functions]
requires: []
provides:
  - "lib/lead-mapping.ts: pure booking/inquiry -> EspoCRM Lead draft mapping"
  - "Fixed CRM attribute names (LEAD_ATTR) and source values (LEAD_SOURCE)"
affects: [81-03, 81-06, 81-07, 81-09, 81-10, 81-11]
tech-stack:
  added: []
  patterns: ["I/O-free mapper taking `now` as a parameter", "source-qualified idempotency key cSupabaseRef", "create-only vs sync-owned attribute split"]
key-files:
  created:
    - lib/lead-mapping.ts
    - tests/lead-mapping.test.ts
  modified: []
key-decisions:
  - "Lead key is `inquiry:<uuid>` | `booking:<outbound booking uuid>`; return-leg rows never produce a Lead (D-19)"
  - "Sync-owned attributes are exactly status, opportunityAmount, opportunityAmountCurrency, cBookingReference, cReturnBookingReference, cAdminLink; everything else is create-only"
  - "itineraryText prepends a non-day 'Start date:' line when startDate is given; day lines always start with 'Day N' and an undated day says 'date not set'"
  - "Multi-day Lead names come from the payload firstName/lastName, falling back to the row name"
requirements-completed: [LEAD-01, LEAD-02, LEAD-03, LEAD-04, LEAD-06]
status: complete
commits: 4
plan_head_before: e402616a5fe02ad76897effbe173c320ad8aad3e
plan_head_after: bfac9cb7582f032f3a5afe40a0444ff4abd5ede3
actuals:
  tokens: 9000
  tasks: 2
  commits: 4
coverage:
  - deliverable: "Booking status -> Lead status table incl. D-03 dead rule"
    human_judgment: false
    verification:
      - {kind: test, ref: "tests/lead-mapping.test.ts#bookingLeadStatus (D-06, D-03)", status: pass}
  - deliverable: "Lead source rules (D-08) and form sources"
    human_judgment: false
    verification:
      - {kind: test, ref: "tests/lead-mapping.test.ts#lead sources (D-08)", status: pass}
  - deliverable: "Contact / corporate / multi-day inquiry drafts (D-12, LEAD-03)"
    human_judgment: false
    verification:
      - {kind: test, ref: "tests/lead-mapping.test.ts#corporate inquiry (D-12)", status: pass}
      - {kind: test, ref: "tests/lead-mapping.test.ts#multi-day inquiry (LEAD-03)", status: pass}
  - deliverable: "Booking draft incl. round trip, placeholders, amount, field ownership"
    human_judgment: false
    verification:
      - {kind: test, ref: "tests/lead-mapping.test.ts#round trip (D-19)", status: pass}
      - {kind: test, ref: "tests/lead-mapping.test.ts#field ownership and ordering", status: pass}
  - deliverable: "isPurgeEligible and diffSyncOwned"
    human_judgment: false
    verification:
      - {kind: test, ref: "tests/lead-mapping.test.ts#isPurgeEligible (D-15 / D-20)", status: pass}
      - {kind: test, ref: "tests/lead-mapping.test.ts#diffSyncOwned", status: pass}
---

# Phase 81 Plan 02: Lead Mapping Summary

Pure, fully tested mapping from Supabase inquiry/booking rows to EspoCRM Lead drafts: status (D-06/D-03), source (D-08), contact and name normalisation, multi-day itinerary text, round-trip handling keyed on the outbound leg (D-19), abandoned-booking purge eligibility (D-15/D-20) and the create-only vs sync-owned field split.

## Accomplishments

- Tracer: contact inquiry and one-way website booking map to complete, correctly keyed Lead drafts; `cSupabaseRef` parses back through `parseLeadRef` for both variants.
- Full rule set: 8-status table with D-03 dead rule, 5-channel source table, corporate `accountName` as text only (no Account link), multi-day itinerary (one `Day N` line per day, in order, `date not set` for undated days), round trip via `ReturnLegInfo`, GNet placeholder email/phone filtering, name fallbacks, exact amount from `amount_eur`.
- `isPurgeEligible` requires all five conditions with a strict 90-day boundary; `diffSyncOwned` compares number vs numeric string numerically.
- 71 tests pass (tests/lead-mapping.test.ts), eslint clean, no tsc errors in the new files.

## Task Commits

1. Task 1 RED: ac906616 `test(81-02): RED tracer tests for lead mapping`
2. Task 1 GREEN: 3f66ec51 `feat(81-02): lead mapping tracer (inquiry + booking -> Lead draft)`
3. Task 2 RED: e944ec64 `test(81-02): RED tests for remaining lead mapping rules`
4. Task 2 GREEN: bfac9cb7 `feat(81-02): complete lead mapping rules (D-03/D-06/D-08/D-19/D-20)`

## Deviations from Plan

None - plan executed exactly as written. (TDD RED commits were made separately from the GREEN `feat` commits; the plan's commit messages were used for the GREEN commits.)

## Verification

- `npx vitest run tests/lead-mapping.test.ts`: 71/71 pass.
- `npx eslint --quiet lib/lead-mapping.ts tests/lead-mapping.test.ts`: clean.
- `npx tsc --noEmit`: no errors mentioning lead-mapping.
- Acceptance greps: one `buildLeadFromInquiry`, one `buildLeadFromBooking`, one `isPurgeEligible`, one `itineraryText`, `gnet.local` present, 0 euro signs, 0 matches for supabase/fetch/process.env/Date.now, 4 `it.each` tables.
- Tracer gate: tracer `<verify>` re-run end-to-end before expansion, passed.

## Known Stubs

None.

## Threat Flags

None. T-81-05 (adminLink allowlist) and T-81-06 (five-condition purge predicate with boundary tests) are mitigated and tested.

## Self-Check: PASSED

- lib/lead-mapping.ts and tests/lead-mapping.test.ts exist.
- Commits ac906616, 3f66ec51, e944ec64, bfac9cb7 exist on the branch.
