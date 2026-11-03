---
phase: 87-status-service-driver-step-flow
plan: 13
subsystem: testing
tags: [verification, release-gate, uat, vitest, tsc, eslint, espocrm, supabase]

requires:
  - phase: 87-status-service-driver-step-flow
    provides: plans 87-01..87-12 and 87-14 merged on the milestone branch at 797d3684
provides:
  - "Task 1 automated gate evidence for the whole of Phase 87 (suite, tsc, eslint, verify skill, static checks, running-app curl)"
  - "Carried-forward owner questions, UAT device list and Phase 88 notes in one place"
  - "Exact owner/orchestrator instructions for the Task 2 pre-merge checkpoint (EspoCRM fields sync, 084 re-check)"
affects: [phase 87 merge to main, /gsd-verify-work 87, phase 88 planning]

actuals:
  tokens: 0
  tasks: 1
  commits: 1
plan_head_before: 797d3684f0f7cf63b8f1e1a912c275f0090cf369
plan_head_after: 797d3684f0f7cf63b8f1e1a912c275f0090cf369

tech-stack:
  added: []
  patterns: []

key-files:
  created: [".planning/phases/87-status-service-driver-step-flow/87-13-SUMMARY.md"]
  modified: []

key-decisions:
  - "No source changes in this plan: every gate finding below is either baseline/pre-existing or outside the phase-87 diff, so there is no gap to route to /gsd-plan-phase 87 --gaps from Task 1"

requirements-completed: []  # PAYF-02, DRV-01..DRV-05 close only after Tasks 2-3 (owner/orchestrator) pass; not marked here

coverage:
  - id: D1
    description: "Full automated gate for Phase 87 passes (suite, tsc baseline, eslint, static checks, verify skill)"
    requirement: "PAYF-02"
    verification:
      - kind: unit
        ref: "npx vitest run --exclude '.claude/**' on main checkout at 797d3684: 8500 passed, 1 failed + 2 failed files, all pre-existing and outside the phase-87 diff"
        status: pass
    human_judgment: false
  - id: D2
    description: "Rebuilt driver trip page is served by the running app inside the light wrapper (malformed token)"
    requirement: "DRV-01"
    verification:
      - kind: other
        ref: "curl http://localhost:3000/driver/trip/not-a-uuid"
        status: pass
    human_judgment: false
  - id: D3
    description: "Unknown (well-formed) token renders the byte-identical ended view as a malformed token (anti-enumeration)"
    requirement: "DRV-01"
    verification:
      - kind: unit
        ref: "tests/driver-trip.test.ts#cancelled, no_show, reassigned, declined, unknown and malformed tokens render byte-identical ended HTML (D-09, T-87-33)"
        status: pass
      - kind: other
        ref: "live curl of a well-formed unknown token: NOT verifiable locally (no SUPABASE_URL / service-role key in local .env.local); moved to the Task 3 production check"
        status: unknown
    human_judgment: false
  - id: D4
    description: "Pre-merge infrastructure: EspoCRM fields sync and migration 084 live privilege matrix (Task 2)"
    verification: []
    human_judgment: true
    rationale: "PENDING: owner runs the EspoCRM sync on their machine and the orchestrator runs read-only Supabase checks; neither can be done by this executor"
  - id: D5
    description: "Production UAT on a real phone: driver flow, admin view, no-show alert path, E2 attribution, E4 in-app browsers (Task 3)"
    verification: []
    human_judgment: true
    rationale: "PENDING: needs a real phone, the owner's WhatsApp/Telegram in-app browsers and production admin sign-in"

duration: 35min
completed: 2026-11-03
status: in-progress
---

# Phase 87 Plan 13: Release Gate Summary

**Task 1 (tracer + full automated gate) passed with no phase-87 defects found; Tasks 2 (owner pre-merge infrastructure) and 3 (production UAT) are PENDING and not executed.**

## Status

| Task | Name | State |
| ---- | ---- | ----- |
| 1 | Tracer: running app serves the rebuilt driver page; full automated gate | DONE (this document) |
| 2 | [BLOCKING, before merge] owner syncs EspoCRM fields; orchestrator re-checks 084; optional Chatwoot ops conversation | PENDING (owner / orchestrator checkpoint) |
| 3 | Merge, then owner production UAT on a real phone | PENDING (owner checkpoint, after Task 2) |

`status: in-progress` in the frontmatter is deliberate: the plan is not complete until Tasks 2 and 3 are recorded. STATE.md and ROADMAP.md were not touched, as instructed.

## Method notes

- **Phase-87 diff range.** The milestone branch (`feat/86-admin-shell`) also carries unmerged phase-86 work, so `main...HEAD` would pull phase 86 into every static check. All static checks below use the phase-87 range `git diff 06cde60d...797d3684` (06cde60d = last commit before phase 87 execution; 797d3684 = merged HEAD of all 13 plans). That range holds 100 non-planning files (60 added, 56 modified, 1 deleted: `app/(internal)/driver/trip/[token]/TripProgressClient.tsx`, replaced by the new `TripScreen`), of which 95 are `.ts`/`.tsx`.
- **Where commands ran.** The worktree has no `node_modules`; vitest and tsc ran on the main checkout (HEAD == 797d3684, read-only, nothing committed there). eslint and the static checks ran in the worktree through a symlinked `node_modules` (not committed).
- **Orchestrator facts** (recorded as given, not re-derived): the orchestrator merged all 13 plans and ran the full suite on main at 797d3684 with the same result I reproduced below.

## Task 1 results

### 1. Running app (tracer)

Dev server answered at http://localhost:3000 (started by the orchestrator).

| Command | Outcome |
| ------- | ------- |
| `curl -s http://localhost:3000/driver/trip/not-a-uuid` | HTTP 200, 65,189 bytes |
| `... \| grep -c 'data-admin-theme="light"'` | 1 (light wrapper present) |
| `... \| grep -c 'driver-shell'` | 1 |
| `... \| grep -c 'This trip link is no longer active.'` | 1 |
| passenger field scan (`passenger_name`, `pickup_address`, `client_name`, `dropoff`) | 1 line hit, both occurrences are generic i18n bundle labels from the booking widget messages payload (`"pickUp":"Pick up"`, `"estDropoff":"Est. drop-off"`, `"dropoffPlaceholder":"Drop-off address"`); no passenger data |

**Unknown-token anti-enumeration (curl of `/driver/trip/00000000-0000-4000-8000-000000000000`): NOT verifiable locally.** The orchestrator observed a 500-style page "supabaseUrl is required": the local `.env.local` only has `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`, not `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`, so every service-client page fails locally (pre-existing; the pre-phase page used the same `createSupabaseServiceClient`). The acceptance criterion "identical ended-view bodies for the malformed and the unknown token" is therefore **split**:

- Covered by unit test: `tests/driver-trip.test.ts` line 336, "cancelled, no_show, reassigned, declined, unknown and malformed tokens render byte-identical ended HTML (D-09, T-87-33)" passes in the full suite.
- **Moved to the Task 3 production check:** run `curl -s https://rideprestigo.com/driver/trip/not-a-uuid` and `curl -s https://rideprestigo.com/driver/trip/00000000-0000-4000-8000-000000000000` after the deploy and compare the two bodies (modulo per-request nonce/build ids).

### 2. Full suite

`cd /Users/romanustyugov/Desktop/Prestigo && npx vitest run --exclude '.claude/**'` (main checkout, HEAD 797d3684, 172 s):

- Test files: 319 passed, 3 failed, 2 skipped (324)
- Tests: **8500 passed**, 1 failed, 10 skipped, 138 todo (8649)

The 1 failed test and 2 failed files are all pre-existing and unrelated to phase 87:

| Failure | Cause | Phase-87 relation |
| ------- | ----- | ----------------- |
| `tests/route-metadata-seo.test.ts` (en: `munich-prague` description lacks the expected search phrase) | route SEO copy rule; fails on the base too | phase 87 touches no routes and no `messages/` (verified: `git diff --quiet 06cde60d...797d3684 -- messages/ middleware.ts` exits 0, and no route-metadata files are in the diff) |
| `tests/stats-migration.test.ts` (0 tests, ENOENT at line 284) | reads `.planning/phases/85-statistics/*-smoke.sql`; that directory was moved by the v4.0 milestone archive commit 2cdf8b35 | none |
| `tests/stats-customers-b2b-migration.test.ts` (0 tests, ENOENT at line 255) | same moved-directory cause | none |

Not fixed here (out of scope: pre-existing, not caused by phase 87). Suggested follow-ups outside this phase: update the two stats migration tests to the archived path; fix the munich-prague description. These are not phase-87 gaps.

Task 2's automated verify (`npx vitest run tests/espocrm-booking-map.test.ts tests/espocrm-model.test.ts tests/booking-status-parity.test.ts`) also ran green now: 6 files (name patterns matched more files), 398 tests passed.

### 3. Type check

`cd /Users/romanustyugov/Desktop/Prestigo && npx tsc --noEmit --pretty false`: **exactly 8 errors, the documented baseline, all under `tests/`**:

- `tests/i18n-translate-dnt.test.ts` (46,17) and (47,17) TS2339
- `tests/nav-auth.test.tsx` (168, 190, 211, 228, 250) TS2502
- `tests/passenger-actions.test.ts` (302,52) TS2493

Zero errors in any file touched by phase 87.

### 4. Lint

`npx eslint --quiet` over every `.ts`/`.tsx` file in the phase-87 diff (non-test sources listed explicitly; tests by glob `tests/*.test.ts(x)` which is a superset of the phase's test files). Result: 8 errors, **none from phase-87 changes**:

| File | Lines | Rule | Why not phase 87 |
| ---- | ----- | ---- | ---------------- |
| `tests/cron-purge.test.ts` | 34, 48, 60, 73 | no-explicit-any | not in the phase-87 diff at all (picked up by my broader glob) |
| `tests/gnet-client.test.ts` | 237 | ban-ts-comment | `git blame` -> commit 04b4bc16, older than 06cde60d; phase hunks are at 204-213 only |
| `tests/gnet-farmin.test.ts` | 368, 425, 435 | no-explicit-any | `git blame` -> commit ed0a2659, older than 06cde60d; phase hunks are at 3-9, 16-23 and 466-500 |

All 59 phase-87 non-test source files (app/, components/, lib/) lint clean. The two baseline `not-found.tsx` errors are not in this file list.

### 5. Static checks on the phase-87 range

| Check | Command | Result |
| ----- | ------- | ------ |
| No hard-coded EUR price under app/ or components/ (D-06, CLAUDE.md, pre-commit rule) | added lines of `git diff -U0 06cde60d...797d3684 -- app components` matched against `€[0-9]{2,}` | 0 matches |
| No currency literal at all in added app/components lines | same diff against `€\|EUR\|CZK\|Kč\|USD\|\$[0-9]` | 0 matches |
| Nothing added to `messages/*` (D-20) and `middleware.ts` matcher/CSRF unchanged | `git diff --quiet 06cde60d...797d3684 -- messages/ middleware.ts` | exit 0 (no changes); no csrf/next.config/vercel/.env file in the diff either |
| No secrets in the diff | added lines (excluding `.planning`) grep for `sk_live/test`, `re_...`, `AKIA`, `-----BEGIN`, JWT header | 0 matches |
| Admin capital-label scan | `node scripts/qa/admin-caps-scan.mjs` over the 8 admin files changed in this phase (`components/admin/{BookingsTable,ConfirmNoShowModal,DriverAssignmentSection,NoShowBanner,NoShowWaitSettings,StatusBadge}.tsx`, `app/(internal)/admin/(dashboard)/{accounts/[id],settings}/page.tsx`) | exit 0 |

### 6. Project verify skill (pre-PR mode, scoped to the phase-87 range)

Skill: `/Users/romanustyugov/Desktop/Prestigo/.claude/skills/verify/SKILL.md`, steps 1-7, with CHANGED = the 95 `.ts`/`.tsx` files of `06cde60d...797d3684` (the skill's default `merge-base origin/main` base would include phase 86).

```
VERIFY: PASS-with-notes   (pre-pr, 95 changed .ts/.tsx files, range 06cde60d...797d3684)
Types:      OK   (8 baseline errors only, all in tests/, none in changed files)
Lint:       OK   (0 new errors; 4 pre-existing errors in 2 changed test files, 4 in an untouched file; see section 4)
Tests:      full suite 8500 passed / 1 failed + 2 failed files, all pre-existing and unrelated (see section 2)
Invariants: OK   (no EUR literal, messages/ and middleware.ts untouched, no secrets, no CSRF-list change)
i18n:       OK   (messages/ unchanged, nothing to translate)
Browser:    PARTIAL (curl of the light-wrapper ended view only; map, sheet, slide control and layout at 360x640 / 390x844 need a real device, see Task 3)
Build:      OK   (`npm run build` in the worktree: exit 0, Turbopack compiled, TypeScript pass, `/driver/trip/[token]`, `/api/driver/trip/[token]/progress`, `/embed/chatwoot-dashboard` listed as dynamic routes; only the usual lockfile-root, middleware->proxy and NFT-trace warnings)
```

The verdict cannot be a plain PASS because three suite failures exist; they are on the base too and unrelated to this phase, so the phase-87 verdict is PASS for the diff it owns. If the project demands a literally green suite before merge, the two stats-migration path fixes and the munich-prague copy are the only blockers and live outside phase 87.

### 7. Defects found

None attributable to phase 87. No source was changed. Nothing is recorded for `/gsd-plan-phase 87 --gaps` from Task 1.

## Carried-forward notes

### Owner questions (from the plan and the SUMMARYs)

1. **Cancel route runs no side effects today** (no GNet CANCEL, no email, no link deactivation) - RESEARCH Open Question 1; characterised, not changed (87-03/87-07).
2. **Do GRiDD / GNet statuses ON_BOARD and NO_SHOW exist?** Ask GRiDD support (D-22); until answered no GNet push is made for those two.
3. **No minimum time between on_board and completed** - RESEARCH Open Question 6; a driver can complete immediately after boarding.
4. **GNet push is at-most-once across a crash** between claim and call (87-07 Known limitations): a status whose claim committed but whose call never returned stays `last_push_status = X` with `last_push_error` null and is never retried; the next status still goes out. The claim is per booking and status value, not per transition event.

### Owner setup (not yet done - Task 2 / Task 3)

- **EspoCRM:** `node infra/espocrm/sync.mjs --only fields` with the owner's admin identity (87-04). Source: `infra/espocrm/fields.json`.
- **Operator email:** `MANAGER_EMAIL` must be set in Vercel (Production) or the no-show request still succeeds but the operator email is skipped (87-09).
- **Chatwoot (optional):** `CHATWOOT_OPS_CONVERSATION_ID` (87-06). Without it, no-show alerts for passengers without a Chatwoot conversation are skipped with `no_conversation`; admin banner and operator email still alert.
- **GNet:** no live partner booking exists for a test. On the next real GNet booking, the orchestrator checks `gnet_bookings.last_push_status` / `last_push_error` after each driver step (one push per status).

### UAT device checks for /gsd-verify-work (no browser or phone available to the executor)

- **E2 attribution:** Google logo and attribution on the driver map fully visible with the top-left distance chip at 360x640 and 390x844. Watch the wrapper's `overflow: hidden` + `--admin-radius-md`, which could clip the very corner of the bottom-left logo. If anything overlaps, shrink the chip, never the attribution (87-11).
- **E4 in-app browsers** (WhatsApp, Telegram, Instagram): slide gesture works or the Enter/hold fallbacks do, and the iOS edge swipe does not trigger instead (87-10/87-14).
- **Layout:** 360x640, 390x844 and 200% text zoom (E3/E7 overflow, sticky control, completed/ended screens) (87-10/87-11).
- **Admin banner at 360px and 640px** with a very long driver name: buttons stack at 360, side by side at 640, no horizontal scroll (87-12, UI-SPEC backstop).
- **VoiceOver / TalkBack double tap** on the slide knob: exactly one dialog opening (87-14).
- **Airplane mode** toggled with the screen open (87-14).

### Phase 88 notes

- Consume `emitBookingCompleted` (`lib/booking-events.ts`, `BookingCompletedEvent = { bookingId, completedAt, partner, actorType, source }`); extend the function with the capture consumer, do not add a second completion hook.
- Also sweep `bookings.completed_at IS NOT NULL` rows never captured: the in-process `after()` event can be lost; the durable facts are `completed_at` and the unique `completed` row in `booking_status_log`.
- Every money entry point must call `assertMoneyEligible`.
- `completed_at IS NULL` on historic completed rows means unknown, not not-completed.
- Cancel keeps refund-before-status; a lost race after a refund returns 409 with `refund_id` and logs `[cancel] refund issued but status changed`; money consequences are Phase 88/89.
- Phase 88 hold entry point (pre-trip authorisation) and capture entry point are specified in the `lib/booking-events.ts` header comment.

## Task 2 (PENDING - owner / orchestrator checkpoint, BLOCKING before merge)

Not executed. Instructions as handed to the owner and orchestrator:

1. **Owner** (own terminal, EspoCRM admin identity in `~/.config/prestigo`, against crm.rideprestigo.com): `node infra/espocrm/sync.mjs --only fields --dry-run`; check that the diff adds only `on_board` / `no_show` to `CBooking.status`; then run it again without `--dry-run`. Paste both outputs.
2. **Orchestrator** (Supabase MCP, read-only): `SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'bookings_status_check'` must contain `on_board` and `no_show`; repeat the `has_function_privilege` checks of 87-02 step 5 for `advance_booking_status` and `set_no_show_request` (anon false, authenticated false, service_role true).
3. **Optional (owner):** create an internal "Operations" conversation in Chatwoot, set `CHATWOOT_OPS_CONVERSATION_ID` in Vercel project `prestigo-site` (Production). Also confirm `MANAGER_EMAIL` is set there.

Outputs to record here once available: sync.mjs dry-run diff: PENDING; real-run output: PENDING; CHECK definition: PENDING; privilege results: PENDING; Chatwoot variable set: PENDING. Resume signal: "ready to merge".

## Task 3 (PENDING - owner checkpoint, after Task 2 and the merge)

Not executed. The full 8-step production checklist is in `87-13-PLAN.md` (Task 3 `how-to-verify`). Additional item from this gate: after the deploy, run the two production curls for anti-enumeration (see section 1) and compare the bodies. Verdicts to record: steps 3-8: PENDING; E4 in-app browsers: PENDING; E2 attribution: PENDING. Owner reply: "approved", an issue list ("step / device / what is wrong"), or "defer" (items become human_needed UAT in /gsd-verify-work).

## Deviations from Plan

None - Task 1 executed as written, except where noted: (a) static checks used the phase-87 range instead of `main...HEAD`, (b) unknown-token live curl moved to Task 3 because the local environment lacks service-role Supabase env, (c) vitest/tsc ran on the main checkout as instructed. Not Rule 1-3 deviations; no source changed.

## Known Stubs

None. This plan creates no source files.

## Threat Flags

None. No files touched outside this SUMMARY.

## Self-Check: PASSED (Task 1 scope)

- 87-13-SUMMARY.md exists at the path above.
- Branch check passed (agent namespace, base 797d3684) before any work.
- No STATE.md / ROADMAP.md edits, no `git stash`, no `--no-verify`.
