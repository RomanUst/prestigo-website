---
phase: 82-site-crm-chatwoot-sync-foundation
verified: 2026-10-26T10:40:00Z
status: passed
score: 5/5 must-haves verified
covered_files:
  - ".planning/phases/82-site-crm-chatwoot-sync-foundation/82-01-PLAN.md"
  - ".planning/phases/82-site-crm-chatwoot-sync-foundation/82-01-SUMMARY.md"
  - ".planning/phases/82-site-crm-chatwoot-sync-foundation/82-02-PLAN.md"
  - ".planning/phases/82-site-crm-chatwoot-sync-foundation/82-02-SUMMARY.md"
  - ".planning/phases/82-site-crm-chatwoot-sync-foundation/82-03-PLAN.md"
  - ".planning/phases/82-site-crm-chatwoot-sync-foundation/82-03-SUMMARY.md"
  - ".planning/phases/82-site-crm-chatwoot-sync-foundation/82-04-PLAN.md"
  - ".planning/phases/82-site-crm-chatwoot-sync-foundation/82-04-SUMMARY.md"
  - ".planning/phases/82-site-crm-chatwoot-sync-foundation/82-05-PLAN.md"
  - ".planning/phases/82-site-crm-chatwoot-sync-foundation/82-05-SUMMARY.md"
  - ".planning/phases/82-site-crm-chatwoot-sync-foundation/82-06-PLAN.md"
  - ".planning/phases/82-site-crm-chatwoot-sync-foundation/82-06-SUMMARY.md"
  - ".planning/phases/82-site-crm-chatwoot-sync-foundation/82-07-PLAN.md"
  - ".planning/phases/82-site-crm-chatwoot-sync-foundation/82-07-SUMMARY.md"
  - ".planning/phases/82-site-crm-chatwoot-sync-foundation/82-08-PLAN.md"
  - ".planning/phases/82-site-crm-chatwoot-sync-foundation/82-08-SUMMARY.md"
  - ".planning/phases/82-site-crm-chatwoot-sync-foundation/82-09-PLAN.md"
  - ".planning/phases/82-site-crm-chatwoot-sync-foundation/82-09-SUMMARY.md"
  - ".planning/phases/82-site-crm-chatwoot-sync-foundation/82-10-PLAN.md"
  - ".planning/phases/82-site-crm-chatwoot-sync-foundation/82-10-SUMMARY.md"
  - ".planning/phases/82-site-crm-chatwoot-sync-foundation/82-11-PLAN.md"
  - ".planning/phases/82-site-crm-chatwoot-sync-foundation/82-11-SUMMARY.md"
  - ".planning/phases/82-site-crm-chatwoot-sync-foundation/82-12-PLAN.md"
  - ".planning/phases/82-site-crm-chatwoot-sync-foundation/82-12-SUMMARY.md"
  - ".planning/phases/82-site-crm-chatwoot-sync-foundation/82-13-PLAN.md"
  - ".planning/phases/82-site-crm-chatwoot-sync-foundation/82-13-SUMMARY.md"
  - ".planning/phases/82-site-crm-chatwoot-sync-foundation/82-14-PLAN.md"
  - ".planning/phases/82-site-crm-chatwoot-sync-foundation/82-14-SUMMARY.md"
  - ".planning/phases/82-site-crm-chatwoot-sync-foundation/82-15-PLAN.md"
  - ".planning/phases/82-site-crm-chatwoot-sync-foundation/82-15-SUMMARY.md"
  - ".planning/phases/82-site-crm-chatwoot-sync-foundation/82-16-PLAN.md"
  - ".planning/phases/82-site-crm-chatwoot-sync-foundation/82-16-SUMMARY.md"
  - "app/(internal)/admin/(dashboard)/erasure/page.tsx"
  - "app/(internal)/admin/(dashboard)/identities/page.tsx"
  - "app/(internal)/admin/(dashboard)/outbox/page.tsx"
  - "app/api/admin/erasure/confirm/route.ts"
  - "app/api/admin/erasure/route.ts"
  - "app/api/admin/identities/route.ts"
  - "app/api/admin/outbox/route.ts"
  - "app/api/integrations/dispatch/route.ts"
  - "content/pages/en/data-deletion.json"
  - "content/pages/en/privacy.json"
  - "infra/vps/runbooks/crm-sync.md"
  - "lib/chatwoot-client.ts"
  - "lib/chatwoot-identity.ts"
  - "lib/chatwoot-sync.ts"
  - "lib/crm-sync.ts"
  - "lib/erasure-hash.ts"
  - "lib/erasure-store.ts"
  - "lib/erasure.ts"
  - "lib/identity-admin-store.ts"
  - "lib/identity-store.ts"
  - "lib/lead-sync.ts"
  - "lib/outbox-admin-store.ts"
  - "lib/outbox-digest.ts"
  - "lib/outbox.ts"
  - "lib/sync-resolve.ts"
  - "supabase/migrations/069_identity_core_sync_triggers.sql"
  - "supabase/migrations/070_outbox_admin.sql"
  - "supabase/migrations/072_identity_phone_rules.sql"
  - "supabase/migrations/073_identity_admin.sql"
  - "supabase/migrations/074_crm_backfill.sql"
  - "supabase/migrations/075_erasure.sql"
covered_digest: "v2:sha256:82d1e226729e025383db62cdfced85d836d29d9d323d504fe27f2f9dcd2b2d9c"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: 5/5
  gaps_closed:
    - "Human verification: /admin/outbox at 375 px (UAT test 1 pass after PR #74, G-82-1 resolved)"
    - "Human verification: /admin/identities at 375 px (UAT test 2 pass after PR #74, G-82-2 resolved)"
    - "Human verification: /admin/erasure at 375 px (UAT test 3 pass after PR #74, G-82-3 resolved)"
    - "Human verification: /ar/privacy and /ar/data-deletion at 375 px (UAT test 4 pass)"
  gaps_remaining: []
  regressions: []
---

# Phase 82: Site to CRM and Chatwoot Sync Foundation Verification Report

**Phase Goal:** Extending the Phase 81 outbox, every booking and customer event on the site reaches EspoCRM and Chatwoot reliably, contacts stay de-duplicated across all three systems, a one-time backfill closes the historical gap, an admin page exposes outbox health, and a single erasure request reaches every system.
**Verified:** 2026-10-26
**Status:** passed
**Re-verification:** Yes. This follows the 2026-10-21 report (human_needed, 5/5). The 4 human items were closed by UAT on 2026-10-25 after PR #74.

## Re-verification Scope

- The earlier report listed no `gaps:`. Its only open items were the 4 human-verification checks at 375 px. All 5 truths got a regression check here: the files exist, the wiring is intact, the phase-scoped tests were re-run, and the old source digest was recomputed.
- **Source regression:** I recomputed the digest over the original 14 covered source files. It matches the earlier report (`v2:sha256:50424bf2...c312`). `git diff 963e967e HEAD -- lib app components supabase content tests` is empty. Since the last verification, only `82-UAT.md` has changed on this branch.
- **Why it was stale:** the earlier `covered_files` left out the phase PLAN/SUMMARY files. This report adds all 32 PLAN/SUMMARY files, plus the phase's stores, admin pages, admin APIs, the dispatch route, the EN data-deletion content and the runbook.

## Goal Achievement

### Observable Truths (ROADMAP success criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Booking create/payment/status/admin edit and signup reach EspoCRM (Contact + Booking) and the Chatwoot contact within minutes via outbox + QStash, with retries and no duplicates | VERIFIED | The triggers `bookings_crm_sync` (069:685) and `customer_profiles_crm_sync` (069:698) are still in place. `lib/lead-sync.ts` dispatches `sync.booking`/`sync.signup` (l.142), `sync.espo` (l.150), `sync.chatwoot` (l.160) and `erase.person` (l.171). The sizes of `lib/crm-sync.ts` (484 lines) and `lib/chatwoot-sync.ts` (372) have not changed. `tests/lead-sync-booking`, `crm-sync`, `chatwoot-sync`, `outbox-backoff`, `integrations-dispatch` pass. Live go-live smoke and the outage drill are recorded in 82-14/82-15 (as before). |
| 2 | Contacts de-duplicated by normalized email OR E.164 phone; shared phones flagged and excluded from auto-merge; admin can split a wrong merge | VERIFIED | Migrations 069/072/073 are unchanged (digest matches). `app/api/admin/identities/{route,split,shared}` and the `/admin/identities` page (329 lines) are present. `identity`, `identity-store`, `identity-admin`, `identity-admin-migration`, `sync-resolve`, `chatwoot-identity` tests pass. UAT test 2 confirmed on prod that the Mark-shared modal is usable at 375 px. |
| 3 | One-time backfill imports every past customer and booking into EspoCRM and Chatwoot | VERIFIED | Migration 074 is unchanged. `tests/crm-backfill.test.ts` passes. The live backfill (n=90, 0 errors, duplicates=0) is recorded in 82-15. |
| 4 | Admin sees outbox health on a dedicated page and can retry a failed event | VERIFIED | Migration 070 is unchanged. `app/api/admin/outbox/{route,retry,retry-all}` are behind `getAdminUser()` (18 guard references across the outbox, identities and erasure admin routes). The page (333 lines) is linked from `AdminSidebar` (l.18-20). `vercel.json` holds the `/api/cron/outbox-sweep` cron. `outbox-admin`, `outbox-admin-page`, `outbox-digest`, `outbox-sweep` tests pass. UAT test 1 passed on prod at 375 px. |
| 5 | Single erasure request removes/anonymises the person in Supabase, Chatwoot, EspoCRM via the outbox with audit; privacy policy (all locales) names Chatwoot/EspoCRM, VPS host/region, channels, retention, chat widget | VERIFIED | Migration 075 and `lib/erasure.ts` (509 lines) are unchanged. `app/api/admin/erasure/{route,preview,confirm}` and the page (181 lines) are present. All 7 `content/pages/*/privacy.json` files mention Chatwoot. `erasure`, `erasure-migration`, `erasure-page`, `admin-erasure`, `privacy-content`, `data-deletion-content` tests pass. The live erasure smoke is recorded in 82-15. UAT tests 3 and 4 passed (erasure page at 375 px; /ar/privacy and /ar/data-deletion RTL, scrollWidth = clientWidth). |

**Score:** 5/5 truths verified (0 present-but-behavior-unverified)

### Human UAT (82-UAT.md, status complete, 2026-10-25)

| # | Item | Result | Notes |
|---|------|--------|-------|
| 1 | /admin/outbox at 375 px | pass | Before the fix, the mobile menu button covered the h1 (G-82-1, cosmetic). PR #74 fixed `layout.tsx` to use padding longhands so `pt-16` applies. Re-test on prod: h1 at 65 px, scrollWidth 375. |
| 2 | /admin/identities at 375 px | pass | The Mark-shared modal overflowed the screen (G-82-2, major). PR #74 fixed `components/admin/Modal.tsx`: `minWidth: min(480px, 100%)`, overlay padding 16px, `maxHeight` plus `overflowY: auto`. Re-test: panel at 16..359 px. |
| 3 | /admin/erasure at 375 px | pass | G-82-3 had the same root cause and is fixed by the same shared Modal change. The confirm modal was not opened on prod because a preview would write a request for a real person. |
| 4 | /ar/privacy, /ar/data-deletion at 375 px | pass | RTL, no overflow. |

I inspected PR #74 with `git diff 4647b43b~1 4647b43b`. It changes only `components/admin/Modal.tsx` (+7/-1) and `app/(internal)/admin/(dashboard)/layout.tsx` (+5/-1), and the diff matches the fixes described in the UAT. PR #74 is on `origin/main`. It is not in the local branch `docs/82-14-go-live`, so these two files are left out of `covered_files`: their local copies are the pre-fix versions, and the digest would go stale as soon as main is merged. Both files were shared admin components before Phase 82; the fix is a layout fix, not phase-82 sync logic.

### Required Artifacts (regression check)

| Artifact | Status | Details |
|----------|--------|---------|
| supabase/migrations/069, 070, 072-075 | VERIFIED | Present. The digest over the original covered set is unchanged. |
| lib/sync-resolve, identity-store, identity-admin-store, outbox-admin-store, erasure-store, erasure-hash, crm-sync, chatwoot-sync, chatwoot-client, chatwoot-identity, erasure, outbox-digest, lead-sync | VERIFIED | Present and substantive (34-509 lines); wired from the dispatcher and admin routes. |
| app/api/admin/{outbox,identities,erasure}/** | VERIFIED | Present; admin-auth guarded. |
| app/(internal)/admin/(dashboard)/{outbox,identities,erasure}/page.tsx | VERIFIED | Present; linked from the sidebar. |
| content/pages/{7 locales}/privacy.json, data-deletion.json | VERIFIED | Content tests pass for 7 locales. |
| infra/vps/runbooks/crm-sync.md | VERIFIED | 139 lines; `crm-sync-runbook.test.ts` passes. |

### Key Link Verification

| From | To | Status | Details |
|------|----|--------|---------|
| bookings / customer_profiles triggers | integration_outbox | WIRED | 069:685, 069:698 |
| `app/api/integrations/dispatch/route.ts` | `lib/lead-sync.ts` handlers | WIRED | Event routing at l.142-171; `integrations-dispatch.test.ts` passes |
| Admin pages | admin APIs | WIRED | Unchanged since the earlier report; page tests pass |
| Erasure confirm | `erase.person` outbox row | WIRED | `lead-sync.ts` l.171; live run recorded |
| Cron `/api/cron/outbox-sweep` | sweep + digest | WIRED | `vercel.json` l.18 |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Phase-82 test scope (29 files) | `npx vitest run tests/{admin-erasure,chatwoot-*,crm-*,data-deletion-content,erasure*,identity*,integrations-dispatch,lead-sync*,outbox*,privacy-content,sync-resolve}...` | 29 files passed, 942 tests passed (15 s) | PASS |
| Source regression | `verification.fingerprint` over the earlier 14-file set | `v2:sha256:50424bf2...c312`, same as the earlier report | PASS |

### Probe Execution

The phase declares no `probe-*.sh` scripts. SKIPPED.

### Requirements Coverage

| Requirement | Source Plans | Status | Evidence |
|-------------|--------------|--------|----------|
| SYNC-01 | 82-01, 82-03, 82-07, 82-10, 82-14, 82-15 | SATISFIED | Truth 1 |
| SYNC-02 | 82-01, 82-07, 82-10, 82-14 | SATISFIED | Profile trigger plus signup resolver (Truth 1) |
| SYNC-03 | 82-01, 82-05, 82-07, 82-08, 82-09, 82-10, 82-11, 82-14, 82-15 | SATISFIED | Truth 2 |
| SYNC-04 | 82-09, 82-15 | SATISFIED | Truth 3 |
| SYNC-05 | 82-02, 82-06, 82-15 | SATISFIED | Truth 4 |
| GDPR-01 | 82-12, 82-13, 82-15 | SATISFIED | Truth 5 |
| GDPR-02 | 82-04, 82-14, 82-16 | SATISFIED | Truth 5 |

No orphaned requirements. The REQUIREMENTS.md checkboxes and traceability table should be set to Complete at phase transition.

### Anti-Patterns Found

No TBD/FIXME/XXX markers in the phase-82 lib, migration or admin page files. No stubs. No blockers.

### Advisories (non-blocking)

- Deferred follow-up from the UAT: the MarkSharedForm modal does not return focus to its trigger on close, because the mount-effect autofocus runs before Modal records `document.activeElement`. Fix: defer the autofocus with `setTimeout(..., 0)`, as ErasureConfirmForm does.
- PR #74 is not yet merged into `docs/82-14-go-live`. Merge `origin/main` before shipping this branch so the local Modal/layout match prod.
- Advisories carried from the earlier report still apply. Phone-merge and split paths have been exercised only by tests, because prod has 0 merges. Confirm that the 82-14 shell-history token was rotated. The anonymised smoke CBooking was kept in EspoCRM on purpose.

### Human Verification Required

None. All 4 items from the earlier report passed UAT on 2026-10-25.

### Gaps Summary

No gaps. All 5 ROADMAP success criteria and all 7 requirement IDs still check out against the code: the phase-82 sources are unchanged and 942 phase-scoped tests pass. The live evidence recorded in 82-14/82-15 still applies. The human UAT is complete (4/4 pass), and its 3 layout issues were fixed in PR #74 and re-tested on prod.

---

_Verified: 2026-10-26_
_Verifier: Claude (gsd-verifier)_
