---
phase: 81-lead-capture-site-forms-supabase-espocrm
verified: 2026-10-18T15:45:00Z
status: passed
score: 7/7 must-haves verified
covered_files:
  - app/api/contact/route.ts
  - app/api/corporate-contact/route.ts
  - app/api/cron/outbox-sweep/route.ts
  - app/api/integrations/dispatch/route.ts
  - app/api/integrations/kick/route.ts
  - app/api/submit-multiday-quote/route.ts
  - lib/espocrm-client.ts
  - lib/inquiries.ts
  - lib/lead-mapping.ts
  - lib/lead-sync.ts
  - lib/outbox-backoff.ts
  - lib/outbox-store.ts
  - lib/outbox.ts
  - supabase/migrations/064_integration_outbox.sql
  - supabase/migrations/065_inquiries.sql
  - supabase/migrations/066_bookings_lead_channel.sql
  - supabase/migrations/067_bookings_lead_outbox.sql
  - .planning/phases/81-lead-capture-site-forms-supabase-espocrm/81-01-PLAN.md
  - .planning/phases/81-lead-capture-site-forms-supabase-espocrm/81-01-SUMMARY.md
  - .planning/phases/81-lead-capture-site-forms-supabase-espocrm/81-02-PLAN.md
  - .planning/phases/81-lead-capture-site-forms-supabase-espocrm/81-02-SUMMARY.md
  - .planning/phases/81-lead-capture-site-forms-supabase-espocrm/81-03-PLAN.md
  - .planning/phases/81-lead-capture-site-forms-supabase-espocrm/81-03-SUMMARY.md
  - .planning/phases/81-lead-capture-site-forms-supabase-espocrm/81-04-PLAN.md
  - .planning/phases/81-lead-capture-site-forms-supabase-espocrm/81-04-SUMMARY.md
  - .planning/phases/81-lead-capture-site-forms-supabase-espocrm/81-05-PLAN.md
  - .planning/phases/81-lead-capture-site-forms-supabase-espocrm/81-05-SUMMARY.md
  - .planning/phases/81-lead-capture-site-forms-supabase-espocrm/81-06-PLAN.md
  - .planning/phases/81-lead-capture-site-forms-supabase-espocrm/81-06-SUMMARY.md
  - .planning/phases/81-lead-capture-site-forms-supabase-espocrm/81-07-PLAN.md
  - .planning/phases/81-lead-capture-site-forms-supabase-espocrm/81-07-SUMMARY.md
  - .planning/phases/81-lead-capture-site-forms-supabase-espocrm/81-08-PLAN.md
  - .planning/phases/81-lead-capture-site-forms-supabase-espocrm/81-08-SUMMARY.md
  - .planning/phases/81-lead-capture-site-forms-supabase-espocrm/81-09-PLAN.md
  - .planning/phases/81-lead-capture-site-forms-supabase-espocrm/81-09-SUMMARY.md
  - .planning/phases/81-lead-capture-site-forms-supabase-espocrm/81-10-PLAN.md
  - .planning/phases/81-lead-capture-site-forms-supabase-espocrm/81-10-SUMMARY.md
  - .planning/phases/81-lead-capture-site-forms-supabase-espocrm/81-11-PLAN.md
  - .planning/phases/81-lead-capture-site-forms-supabase-espocrm/81-11-SUMMARY.md
  - supabase/migrations/068_outbox_sweep.sql
covered_digest: "v2:sha256:cf156b6aabea427772014dc0c15855b789e18e86b870885ddbe2a85252c6c5ae"
behavior_unverified: 0
overrides_applied: 0
re_verification: false
---

# Phase 81: Lead Capture (Site Forms to Supabase + EspoCRM) Verification Report

**Phase Goal:** Every lead signal the site currently loses is persisted in Supabase and reaches EspoCRM as a Lead, with zero regression to today's email-only behavior if storage fails. Durable outbox core with leads as its first event type, so no lead is lost while the VPS is down.
**Verified:** 2026-10-18
**Status:** passed
**Re-verification:** No, initial verification

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Contact form submission stored in `inquiries` plus email, and appears as a Lead | VERIFIED | `app/api/contact/route.ts` calls `storeInquiry('contact', ...)` in parallel with `sendContactInquiry`, then `dispatchAfterResponse(inquiryOutboxKey(id))`. `065_inquiries.sql` has the table and an AFTER INSERT trigger that enqueues `lead.inquiry:<id>`. `lead-sync.ts` `deliverInquiry` reads the row, maps it (source "Contact form") and upserts the Lead by `cSupabaseRef`. SUMMARY 81-11 records the live production smoke (outbox `sent` after 4 s, Lead count=1, status New). |
| 2 | Corporate form submission stored and appears as a Lead with its company | VERIFIED | `corporate-contact/route.ts` stores kind `corporate` with `company` after the honeypot check. The mapper sets source "Corporate form" and `lead-mapping.ts` handles the company. Live smoke recorded: `count=1`, `has_account_name=true`. |
| 3 | Multi-day quote stored and appears as a Lead with itinerary details | VERIFIED | `submit-multiday-quote/route.ts` stores `days`, `startDate`, `quoteReference` and `specialRequests` in the payload. `lead-mapping.ts` `itineraryText()` and `multidayDescription()` write one line per day (date, time, from to to, stops, or hourly city and hours) into the Lead description. Live smoke recorded (quote `MQ-20261018-EA25F2`). |
| 4 | Abandoned/unpaid checkouts captured as Leads, with consent-appropriate retention (calculator strike accepted, D-01) | VERIFIED | `create-payment-intent/route.ts` writes `unpaid` booking rows. Trigger 067 enqueues `lead.booking:<id>:new`. `068_outbox_sweep.sql` `outbox_enqueue_expired_unpaid()` marks unpaid bookings past pickup Dead. `outbox_enqueue_abandoned_purge()` queues a `lead.purge` 90 days past pickup, for online, unpaid, no-payment-link bookings only. `deliverPurge` re-checks eligibility on the live row and deletes the Lead only while it is Dead. Daily cron is in `vercel.json` (`0 4 * * *`). REQUIREMENTS.md and ROADMAP already carry the scoped calculator note. |
| 5 | Storage failure does not break the submission; the email path still fires | VERIFIED | `storeInquiry` never throws: env pre-check, client built inside try, 3 s race, code-only logging. Routes await the email independently of the store result. `tests/inquiry-routes.test.ts` covers "storage returning null: still 200, email once, no dispatch" for all three routes, "email rejecting: 500 / 502 unchanged", and store unit cases (insert error, factory throw, never-settling insert, missing env). |
| 6 | Every site booking becomes a Lead with source "Website booking", and its status follows the booking (paid to Converted, cancelled/abandoned to Dead) | VERIFIED | `067_bookings_lead_outbox.sql` puts one exception-safe AFTER INSERT OR UPDATE OF status trigger on `bookings`. It is forward-only (`lead_capture_start`), skips return legs, and its status map matches `BOOKING_LEAD_STATUS` in `lead-mapping.ts`. `deliverBooking` builds the Lead from the current booking row and uses the round-trip return leg for `cReturnBookingReference`. Source is "Website booking" for `booking_source='online'`. Admin Channel is required by the zod enum in `app/api/admin/bookings/route.ts` and stored in `lead_channel` (066). Live smoke recorded: `:new` sent after 95 s, then after cancel `:dead` and Lead status Dead. 0 pre-go-live bookings produced outbox rows (D-21). |
| 7 | With the VPS offline, leads queue in the outbox and arrive exactly once | VERIFIED | `outbox_claim` uses a per-aggregate advisory lock and a lease. `outbox_enqueue` is `ON CONFLICT DO NOTHING` on the idempotency key. The dispatcher looks the Lead up by `cSupabaseRef` before any write (409 race converges), and `lib/outbox-backoff.ts` provides retry, auth breaker and terminal state. The sweep re-publishes due and stuck rows. A unique index on `Lead.cSupabaseRef` is applied live (81-08). Drill recorded in 81-11: a form lead and a booking lead were queued during the outage (`crm_502`), delivered after recovery, 1 Lead per ref. |

**Score:** 7/7 truths verified (0 present-but-behavior-unverified)

### Required Artifacts

| Artifact | Status | Details |
|----------|--------|---------|
| `supabase/migrations/064` to `068` | VERIFIED | Present and substantive (RLS deny-all, REVOKE PUBLIC/anon/authenticated, SECURITY DEFINER with `search_path=''`). Structural tests in `tests/outbox-migrations.test.ts` pass. Live apply recorded in SUMMARY 81-01/04/09/10 with rolled-back smokes. |
| `lib/inquiries.ts`, `lib/outbox.ts`, `lib/outbox-store.ts`, `lib/outbox-backoff.ts` | VERIFIED | Real implementations, wired from the routes, dispatcher and sweep. |
| `lib/lead-mapping.ts`, `lib/lead-sync.ts`, `lib/espocrm-client.ts` | VERIFIED | Pure mapping plus the dispatcher (inquiry, booking, purge branches). The client is used from `lead-sync` only. |
| `app/api/integrations/dispatch/route.ts` | VERIFIED | QStash `Receiver.verify` over the raw body and the trimmed URL, strict zod, 401 without a signature. |
| `app/api/integrations/kick/route.ts` | VERIFIED | Timing-safe, fail-closed Bearer check, accepts `lead.booking` keys only. |
| `app/api/cron/outbox-sweep/route.ts` + `vercel.json` cron | VERIFIED | CRON_SECRET guard, three isolated steps. |
| `infra/espocrm/*` (fields, roles, overlay, lead-smoke) | VERIFIED | Lead fields, ACL and `cSupabaseRef` index overlay are in the repo. Live results are in SUMMARY 81-03/06/08 (`verify-acl` pass, unique-index probe). |
| D-16 notice (`InquiryNotice.stored`) | VERIFIED | Present in all 7 locales. Used in `ContactForm`, `CorporateForm` and `MultiDayForm`. |
| `infra/vps/runbooks/lead-capture.md` + test | VERIFIED | Present, guard test passes. |

### Key Link Verification

| From | To | Status |
|------|----|--------|
| form routes to `storeInquiry` to `inquiries` INSERT trigger to `outbox_enqueue` | WIRED |
| route `after()` to `publishOutboxDispatch` to QStash to `/api/integrations/dispatch` to `dispatchOutboxKey` to EspoCRM | WIRED (live-proven) |
| `bookings` trigger to `outbox_enqueue` plus pg_net kick to `/api/integrations/kick` to QStash (90 s delay) | WIRED (live-proven, `:new` sent after 95 s) |
| cron sweep to `outbox_enqueue_expired_unpaid`, `outbox_enqueue_abandoned_purge`, `outbox_due_keys` to republish | WIRED |
| admin `ManualBookingForm` channel to API zod enum to `bookings.lead_channel` to Lead source | WIRED |

### Data-Flow Trace (Level 4)

Inquiry payload and booking row are read from Supabase at delivery time (`store.readInquiry` and `readBooking`) and mapped to the Lead body. There is no hardcoded or static data on the path. Status: FLOWING.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Phase 81 test files (14 files) | `npx vitest run tests/lead-*.test.ts tests/integrations-*.test.ts tests/outbox*.test.ts tests/inquiry-routes.test.ts tests/espocrm-lead-smoke.test.ts tests/infra-vps-isolation-guard.test.ts` | 14 files, 338 tests passed | PASS |
| Full suite, run once | `npx vitest run` | 221 files passed, 2 skipped; 5438 tests passed, 0 failed | PASS |
| Type check | `npx tsc --noEmit` | Only errors in `tests/` (the known baseline); none in phase files | PASS |

### Probe Execution

Step 7c: SKIPPED. No `probe-*.sh` is declared by the phase plans.

### Requirements Coverage

| Requirement | Source Plans | Status | Evidence |
|-------------|--------------|--------|----------|
| LEAD-01 contact form stored, Lead in CRM | 81-01, 02, 03, 05, 06, 07, 11 | SATISFIED | Truth 1 |
| LEAD-02 corporate form stored, Lead with company | 81-01, 02, 03, 05, 06, 07, 11 | SATISFIED | Truth 2 |
| LEAD-03 multi-day quote stored, Lead with itinerary | 81-01, 02, 03, 05, 06, 07, 11 | SATISFIED | Truth 3 |
| LEAD-04 abandoned/unpaid checkouts: Dead after pickup, purge at 90 days | 81-02, 03, 09, 10, 11 | SATISFIED | Truth 4 |
| LEAD-05 storage failure causes no regression | 81-01, 07, 10, 11 | SATISFIED | Truth 5 |
| LEAD-06 every booking becomes a Lead, status follows the booking | 81-02, 03, 04, 06, 08, 09, 10, 11 | SATISFIED | Truth 6 |

All six IDs from the PLAN frontmatter exist in REQUIREMENTS.md. No orphaned requirements: every Phase 81 ID in REQUIREMENTS.md is claimed by a plan.

### Anti-Patterns Found

None. No TBD/FIXME/XXX/TODO markers in the phase files. No stubs, empty handlers or static returns on the delivery path.

### Human Verification Required

None blocking. The live-environment claims (migrations applied, EspoCRM metadata, production smokes, VPS-down drill) are recorded in SUMMARY 81-01/03/04/06/08/09/10/11, which the orchestrator ran via MCP and live scripts. They were accepted as evidence and not re-executed here. The code and tests behind each of them were checked against the files.

### Notes (non-blocking, not gaps)

1. **Bookkeeping.** REQUIREMENTS.md still shows LEAD-01..06 as `[ ]` and "Pending". The ROADMAP top-level Phase 81 checkbox and the progress table row still say "In Progress". These need updating at phase close.
2. **Known latency edge (recorded in the runbook and SUMMARY 81-11, deviation 5).** A cold first submission after a deploy can hit the 3 s storage timeout although the row is written. `storeInquiry` then returns null and no immediate dispatch is scheduled. The row is still queued by the trigger and delivered by the daily sweep, so it is delayed by up to about 24 h, not lost.
3. **RESEARCH A6** (bell notifications for followed Leads) stayed unverified at go-live (`count=-2` from EspoCRM). It is not part of any requirement or success criterion.
4. **Dead-after-pickup latency.** The sweep runs daily, so the Dead status can lag the pickup by up to about 25 h. This is documented in migration 068 and accepted.
5. **Process deviations** noted in the SUMMARYs (TDD order not strictly RED-first, a Vault `length(decrypted_secret)` check at go-live) do not affect goal achievement.

### Gaps Summary

No gaps. All seven success criteria are backed by code, migrations and passing tests, and the live acceptance results are recorded.

---

_Verified: 2026-10-18_
_Verifier: Claude (gsd-verifier)_
