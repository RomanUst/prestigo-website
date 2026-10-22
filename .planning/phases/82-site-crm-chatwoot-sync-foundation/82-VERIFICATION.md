---
phase: 82-site-crm-chatwoot-sync-foundation
verified: 2026-10-21T01:40:00Z
status: human_needed
score: 5/5 must-haves verified
covered_files:
  - content/pages/en/privacy.json
  - lib/chatwoot-sync.ts
  - lib/crm-sync.ts
  - lib/erasure.ts
  - lib/identity-store.ts
  - lib/lead-sync.ts
  - lib/outbox.ts
  - lib/sync-resolve.ts
  - supabase/migrations/069_identity_core_sync_triggers.sql
  - supabase/migrations/070_outbox_admin.sql
  - supabase/migrations/072_identity_phone_rules.sql
  - supabase/migrations/073_identity_admin.sql
  - supabase/migrations/074_crm_backfill.sql
  - supabase/migrations/075_erasure.sql
covered_digest: "v2:sha256:50424bf28437f307ae67f1de977faa166f3fc504698f25e43f31cf7cbfb5c312"
behavior_unverified: 0
overrides_applied: 0
re_verification: false
human_verification:
  - test: "Open /admin/outbox at 375 px (logged in as admin)"
    expected: "Health KPIs, filter chips and the open-events table fit without horizontal page scroll; Retry and Retry all buttons are reachable and queue a retry"
    why_human: "Responsive layout and interaction feel cannot be verified by grep or unit tests"
  - test: "Open /admin/identities at 375 px"
    expected: "Phone-merge list, shared-number list, Split and Mark-shared forms are usable and unclipped"
    why_human: "Visual and responsive check; split/mark-shared forms were not driven in a browser"
  - test: "Open /admin/erasure at 375 px (search, preview, confirm, audit log)"
    expected: "Preview counts, confirm step and audit table render without clipping; no horizontal scroll"
    why_human: "Visual and responsive check; the live erasure was run, but the UI was not reviewed at phone width"
  - test: "Open /ar/privacy and /ar/data-deletion at 375 px"
    expected: "New Chatwoot/EspoCRM/Hostinger/Backblaze rows, retention table and changed paragraphs read right-to-left with no clipping or horizontal scroll"
    why_human: "RTL layout is a visual property; 7-locale content is covered by tests, rendering is not"
---

# Phase 82: Site to CRM and Chatwoot Sync Foundation Verification Report

**Phase Goal:** Extending the Phase 81 outbox, every booking and customer event on the site reaches EspoCRM and Chatwoot reliably, contacts stay de-duplicated across all three systems, a one-time backfill closes the historical gap, an admin page exposes outbox health, and a single erasure request reaches every system.
**Verified:** 2026-10-21
**Status:** human_needed (all code-level and recorded-live must-haves verified; only the browser UAT at 375 px is outstanding)
**Re-verification:** No, initial verification

## Goal Achievement

### Observable Truths (ROADMAP success criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Booking create/payment/status/admin edit and signup reach EspoCRM (Contact + Booking) and the Chatwoot contact within minutes via outbox + QStash, with retries and no duplicates | VERIFIED | Trigger `bookings_crm_sync` (069:685) fires AFTER INSERT/UPDATE OF status, amounts, payment_intent_id, payment_link_id, client_*, pickup/address fields, flight_number, driver_id, etc. (covers create, payment, status change, admin edit); `customer_profiles_crm_sync` (069:698) covers signup. Both gated by `crm_sync_start`. `lib/lead-sync.ts` `handleClaimed` routes `sync.booking`/`sync.signup` to resolver hop, `sync.espo` to `deliverEspoSync` (lib/crm-sync.ts 484 lines), `sync.chatwoot` to `deliverChatwootSync` (lib/chatwoot-sync.ts 372 lines), each with `handleFailure` retry/backoff. Deliveries are convergent upserts rebuilt from current rows, with unique idempotency keys. Live (82-14 SUMMARY): smoke booking reached Espo Contact + CBooking and Chatwoot within ~2 min, all attempts=1; status change to cancelled converged. 82-15: outage drill, Espo down gave `crm_502`, retried on restore, CBooking count exactly 1 and change arrived; Chatwoot independent. |
| 2 | Contacts de-duplicated by normalized email OR E.164 phone; shared phones flagged and excluded from auto-merge; admin can split a wrong merge | VERIFIED | Migration 069/072: `identity_normalize_email`, `identity_normalize_phone` (E.164), `identity_resolve_core` under a global advisory lock; `phone_flags` shared numbers are never used for matching (072:166-169), a colliding phone is auto-flagged shared and not merged (072:204-205), a phone merge flags the number shared (072:283). `identity_split` (073:58) with `identity_admin_log` audit; `identity_mark_shared`, `identity_phone_merges`, `identity_shared_phones`; API `app/api/admin/identities/{route,split,shared}`; page `/admin/identities`. Chatwoot/Espo dedup via `lib/chatwoot-identity.ts` and find-or-create with cached ids. Live: 43 identities, every one has espo_contact_id and chatwoot_contact_id; backfill audit duplicates=0. Caveat: live data had 0 phone merges and 0 shared numbers, so phone-merge and split paths are exercised only by tests (identity.test.ts, identity-admin.test.ts, migration tests, rolled-back smoke SQL), not by production data. |
| 3 | One-time backfill imports every past customer and booking into EspoCRM and Chatwoot | VERIFIED | Migration 074 `crm_backfill_identity_pass`, `crm_identity_report`, `crm_backfill_enqueue(tag, stagger)`; replays live handlers via the outbox. Live (82-15): enqueue n=90 (71 bookings + 19 profiles); all delivered, 0 errors, 0 open rows afterwards. CBooking 57 to 71 (= non-abandoned bookings), Contact 30 to 45, Chatwoot 66 to 98; `backfill.mjs --audit` duplicates=0. Noted gaps are by design: 2 GNet placeholder bookings have no Contact; 17 bookings with unparseable phone are matched by email only. |
| 4 | Admin sees outbox health on a dedicated page and can retry a failed event | VERIFIED | Migration 070 `outbox_health`, `outbox_open_events`, `outbox_retry`, `outbox_retry_failed` (service_role only). API `app/api/admin/outbox` (GET) plus `retry` and `retry-all`, all behind `getAdminUser()`. Page `app/(internal)/admin/(dashboard)/outbox/page.tsx` (333 lines, KPI cards, HealthBanner, OutboxTable, retry handlers); linked in AdminSidebar (Outbox, Identities, Erasure). Owner digest wired into the daily sweep (`lib/outbox-digest.ts`). Live: `/api/admin/outbox` answers 401 unauthenticated. Tests outbox-admin, outbox-admin-page, outbox-digest pass. |
| 5 | Single erasure request removes/anonymises the person in Supabase, Chatwoot, EspoCRM via the outbox with audit; privacy policy (all locales) names Chatwoot/EspoCRM, VPS host/region, channels, retention, chat widget | VERIFIED | Migration 075: `erasure_requests` (audit table, HMAC email hash, one active request per identity/person, RLS deny-all), `erasure_scope/preview_create/confirm/load/record_step/anonymise_person/complete/log`. `lib/erasure.ts` (509 lines) saga reached from `lead-sync.ts` for `erase.person`; steps chatwoot, espocrm, verify, supabase, auth. UI: `/admin/erasure` with preview then confirm and audit table; API `app/api/admin/erasure/{route,preview,confirm}`. Live (82-15): request completed, verified=true in 29 s; Chatwoot contact_found=false, Espo Contact 0 and Lead 0, booking anonymised (reference and amounts kept), identity_emails 0. Privacy: all 7 locale files name Chatwoot and EspoCRM (5 mentions each), Hostinger Germany (EU), Backblaze US backups, website chat/email/Telegram/WhatsApp channels, retention table (10 years bookings, messages until erasure, backups up to 6 months); `tests/privacy-content.test.ts` and `tests/data-deletion-content.test.ts` pass for 7 locales; data-deletion page aligned (82-16). |

**Score:** 5/5 truths verified (0 present-but-behavior-unverified)

### Required Artifacts

| Artifact | Status | Details |
|----------|--------|---------|
| supabase/migrations/069-075 | VERIFIED | All present; live application recorded as SMOKE_OK in SUMMARY files; REVOKE PUBLIC/anon/authenticated + GRANT service_role on every SECURITY DEFINER function |
| lib/sync-resolve.ts, identity-store.ts, identity-admin-store.ts, outbox-admin-store.ts, erasure-store.ts, erasure-hash.ts | VERIFIED | Substantive, wired from dispatcher and admin routes |
| lib/crm-sync.ts, chatwoot-sync.ts, chatwoot-client.ts, erasure.ts | VERIFIED | Substantive and dispatched in `lib/lead-sync.ts` |
| app/api/admin/{outbox,identities,erasure}/** | VERIFIED | Admin-auth guarded |
| app/(internal)/admin/(dashboard)/{outbox,identities,erasure}/page.tsx + sidebar links | VERIFIED | Present, wired to the APIs |
| content/pages/{7 locales}/privacy.json, data-deletion.json | VERIFIED | Content tests green |
| infra/vps/runbooks/crm-sync.md + tests/crm-sync-runbook.test.ts | VERIFIED | Guard test passes |

### Key Link Verification

| From | To | Status | Details |
|------|----|--------|---------|
| bookings / customer_profiles triggers | integration_outbox + outbox_kick | WIRED | `enqueue_booking_sync`, `enqueue_profile_sync`; kick route allow-set includes sync.* |
| Dispatch route (QStash-signed) | `dispatchOutboxKey` to resolver / Espo / Chatwoot / erasure handlers | WIRED | `app/api/integrations/dispatch/route.ts`, `lib/lead-sync.ts` |
| Resolver hop | fan-out `sync.espo` / `sync.chatwoot` rows | WIRED | Live smoke shows fan-out plus refresh rows |
| Admin pages | admin APIs | WIRED | fetch handlers in page components |
| Erasure confirm | `erase.person` outbox row | WIRED | Live: row sent attempts=1 |
| Daily cron `/api/cron/outbox-sweep` | sweep + digest | WIRED | vercel.json |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Phase-82 test scope (29 files: identity, sync, chatwoot, erasure, outbox admin, backfill, dispatcher, migrations, privacy, runbook) | `npx vitest run <29 phase-82 files>` | 29 files, 937 tests passed | PASS |
| Full suite (orchestrator report) | `npx vitest run` | 6295 passed | PASS (reported, not re-run) |

### Probe Execution

No phase-declared `probe-*.sh` scripts. SKIPPED.

### Requirements Coverage

| Requirement | Source Plans | Status | Evidence |
|-------------|--------------|--------|----------|
| SYNC-01 | 82-01, 82-03, 82-07, 82-10, 82-14, 82-15 | SATISFIED | Truth 1 |
| SYNC-02 | 82-01, 82-07, 82-10, 82-14 | SATISFIED | Profile trigger and signup resolver `identity_resolve_user`; 19 profiles linked live; `sync.signup` rows sent in backfill |
| SYNC-03 | 82-01, 82-05, 82-07, 82-08, 82-09, 82-10, 82-11, 82-14, 82-15 | SATISFIED | Truth 2 |
| SYNC-04 | 82-09, 82-15 | SATISFIED | Truth 3 |
| SYNC-05 | 82-02, 82-06, 82-15 | SATISFIED | Truth 4 |
| GDPR-01 | 82-12, 82-13, 82-15 | SATISFIED | Truth 5 |
| GDPR-02 | 82-04, 82-14, 82-16 | SATISFIED | Truth 5 (privacy and data-deletion in 7 locales) |

All 7 phase requirement IDs appear in plan frontmatter and map to REQUIREMENTS.md. No orphaned requirements. Note: the REQUIREMENTS.md checkboxes and traceability table still read "Pending" for these 7 IDs; update to Complete during phase transition.

### Anti-Patterns Found

No TBD/FIXME/XXX markers in phase-82 library, API, component or migration files. No stubs found (all artifacts substantive and wired). No blockers.

### Advisories (non-blocking)

- Live phone-merge, shared-number and split paths had no production data (0/0/0); covered by unit tests, migration tests and rolled-back smoke SQL only. Consider a one-off admin exercise of Split and Mark-shared in the browser UAT.
- 82-14 SUMMARY security note: a string resembling a token was typed at a shell prompt during the env script run; owner advised to rotate if it was a real secret and clear shell history. Confirm done.
- The anonymised CBooking for the smoke booking remains in EspoCRM by design (accounting); owner may delete by hand.
- Privacy policy states backups are stored with Backblaze in the US (owner choice, Phase 76); covered under EU-US DPF wording.

### Human Verification Required

1. **/admin/outbox at 375 px** - Expected: no horizontal scroll, KPI/chips/table usable, Retry and Retry all reachable. Why human: responsive layout.
2. **/admin/identities at 375 px** - Expected: merge/shared lists and Split / Mark-shared forms usable. Why human: responsive layout and unexercised forms.
3. **/admin/erasure at 375 px** - Expected: preview, confirm and audit table fit. Why human: responsive layout.
4. **/ar/privacy and /ar/data-deletion at 375 px** - Expected: RTL rendering without clipping. Why human: visual RTL check.

### Gaps Summary

No gaps. All five ROADMAP success criteria and all seven requirement IDs are supported by code in the repository (migrations 069-075, dispatcher wiring, admin APIs and pages, 7-locale content), by 937 passing phase-scoped tests, and by recorded live evidence (go-live smoke, backfill counts, outage drill, erasure smoke). Status is human_needed solely because the browser UAT at 375 px has not been run.

---

_Verified: 2026-10-21_
_Verifier: Claude (gsd-verifier)_
