---
phase: 81-lead-capture-site-forms-supabase-espocrm
verified: 2026-10-18T19:05:00Z
status: passed
score: 7/7 must-haves verified
covered_files:
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
  - app/api/contact/route.ts
  - app/api/corporate-contact/route.ts
  - app/api/cron/outbox-sweep/route.ts
  - app/api/integrations/dispatch/route.ts
  - app/api/integrations/kick/route.ts
  - app/api/submit-multiday-quote/route.ts
  - components/ContactForm.tsx
  - infra/vps/runbooks/lead-capture.md
  - lib/espocrm-client.ts
  - lib/inquiries.ts
  - lib/lead-mapping.ts
  - lib/lead-sync.ts
  - lib/outbox-backoff.ts
  - lib/outbox-store.ts
  - lib/outbox.ts
  - middleware.ts
  - supabase/migrations/064_integration_outbox.sql
  - supabase/migrations/065_inquiries.sql
  - supabase/migrations/066_bookings_lead_channel.sql
  - supabase/migrations/067_bookings_lead_outbox.sql
  - supabase/migrations/068_outbox_sweep.sql
covered_digest: "v2:sha256:53dce440c752319ae23ee05f3949f729fe56094048b5779328c9fe28ff066a5a"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: passed
  previous_score: 7/7
  reason: "stale covered_digest: post-review fixes WR-01..WR-04 (b7f5315e, 4d1a0e30, 4db9aafd, 3e621daf; merged in b2cb1e18) changed covered source files after the first verification"
  gaps_closed: []
  gaps_remaining: []
  regressions: []
---

# Phase 81: Lead Capture (Site Forms to Supabase + EspoCRM) Verification Report

**Phase Goal:** Every lead signal the site currently loses is persisted in Supabase and reaches EspoCRM as a Lead, with zero regression to today's email-only behavior if storage fails. A durable outbox core carries leads as its first event type, so no lead is lost while the VPS is down.
**Verified:** 2026-10-18T19:05:00Z
**Status:** passed
**Re-verification:** Yes. The previous report (passed, 7/7) went stale when the post-review fixes WR-01 to WR-04 changed covered source files. This run re-checks every success criterion against the current `main` (HEAD `14b76b78`, code identical to merge `b2cb1e18`) and checks that the fixes did not break any earlier truth.

## What changed since the previous verification

| Commit | Fix | Files | Effect on earlier truths |
|--------|-----|-------|--------------------------|
| `b7f5315e` | WR-04: CSRF Origin check on `/api/corporate-contact` and `/api/submit-multiday-quote`, plus a `website` honeypot on `/api/contact` and `ContactForm` | `middleware.ts`, `app/api/contact/route.ts`, `components/ContactForm.tsx` | SC1/2/3/5 still hold. The middleware allows a missing Origin on these paths (they are not in `CSRF_STRICT_ORIGIN_REQUIRED`). Same-origin `fetch` from all three forms passes, because `hostOrigin` comes from the Host header and does not depend on the `NEXT_PUBLIC_SITE_URL` trailing-newline issue. An empty honeypot is a normal submission, and `website` is not passed to the email. The production UAT ran after this deploy and passed all three forms. |
| `4d1a0e30` | WR-01: unique QStash dedup id for each deferral, `deferDedupSuffix(attempts, now, delay)` | `lib/lead-sync.ts` | SC7 is stronger. A row held by a crashed worker no longer drops its second deferral. Concurrent duplicates still collapse because the claim is the mutex and the same instant gives the same id. |
| `4db9aafd` | WR-02: on a CRM 400 the Lead body is relaxed step by step (no phone, then no email with the email moved into the description, then a minimal body). Terminal failures log an `ALERT`, and the sweep reports `failed` for the last 25 h | `lib/lead-sync.ts`, `lib/outbox-store.ts`, `app/api/cron/outbox-sweep/route.ts` | SC1/2/3/6 are stronger, because fewer Leads are lost to a 400. Idempotency is unchanged: the lookup by `cSupabaseRef` comes before any POST, and the minimal body keeps `cSupabaseRef`. `recentFailedCount` filters on `integration_outbox.updated_at`, which exists (064 line 36, with a trigger). The ALERT lines carry only the key and the code, with no PII. The sweep still imports no CRM code, and the VPS isolation guard passes. |
| `3e621daf` | WR-03: `bookingLeadAmountEur` uses `amount_eur` as is, and for round trips with `amount_eur` null it uses `czkToEur(outbound + return)`. The edit-refresh limitation is documented in the runbook | `lib/lead-mapping.ts`, `lib/outbox-store.ts` (`BOOKING_COLUMNS` + `outbound_amount_czk`, `return_amount_czk`), runbook | SC6 still holds. Both columns exist on `bookings` (`types/database.types.ts:55/61`, written by `create-payment-intent`). The extra columns in the select did not break `readBooking`: the production UAT test 7 booking at 18:50Z became a Converted Lead at 18:52Z on the deploy that contains this commit. |

The production deploy of `b2cb1e18` succeeded at 18:25Z. UAT tests 3 to 8 ran between 18:37Z and 18:52Z, so the live evidence covers the post-fix code.

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Every contact-form submission is stored in `inquiries` in addition to the email, and appears as a Lead | VERIFIED | `app/api/contact/route.ts`: after the honeypot check, `storeInquiry('contact', …)` runs in parallel with `sendContactInquiry`, and then `dispatchAfterResponse(inquiryOutboxKey(id))` runs. The 065 trigger enqueues `lead.inquiry:<id>`. `lead-sync` `deliverInquiry` upserts the Lead by `cSupabaseRef`. Tests: `tests/inquiry-routes.test.ts` (including the WR-04 honeypot cases) and `tests/lead-sync.test.ts`. Live: UAT test 3 passed on production at 18:37Z (one Lead, status New, assigned to the owner, Website panel present). |
| 2 | Every corporate-form submission is stored and appears as a Lead with its company | VERIFIED | `corporate-contact/route.ts` stores kind `corporate` with `company`. `lead-mapping` puts the company into `accountName` as text only, with no Account link. The new CSRF prefix is covered by `tests/middleware-csrf-forms.test.ts`. Live: UAT test 4 passed at 18:39Z, after the CSRF change was deployed. |
| 3 | Every multi-day quote request is stored and appears as a Lead with its itinerary | VERIFIED | `submit-multiday-quote/route.ts` stores the days, the quote reference and the E.164 phone. `itineraryText()` writes one line per day in order, with "date not set" for a day without a date. Live: UAT test 5 passed at 18:41Z, after the CSRF change was deployed. |
| 4 | Abandoned/unpaid checkouts are captured as Leads with consent-appropriate retention (calculator capture struck, D-01) | VERIFIED | The unpaid row from `create-payment-intent` goes through trigger 067 to `lead.booking:<id>:new`. `068` `outbox_enqueue_expired_unpaid` marks it Dead after pickup. `outbox_enqueue_abandoned_purge` purges after 90 days, for online, unpaid bookings without a payment link only. `deliverPurge` re-checks eligibility and deletes only a Dead Lead. The cron is in `vercel.json`. Tests: `tests/lead-purge.test.ts`, `tests/outbox-sweep.test.ts` and `tests/outbox-migrations.test.ts` all pass. REQUIREMENTS LEAD-04 carries the D-01 wording. |
| 5 | If inquiry storage fails, the submission still succeeds and the email path still fires | VERIFIED | `storeInquiry` never throws: it pre-checks the env, builds the client inside a try, races a 3 s timeout and logs codes only. The routes await the email independently. The WR-04 honeypot returns early only for bot submissions, so a real visitor's path is unchanged. `tests/inquiry-routes.test.ts` covers, for all three routes, "storage returns null: still 200, email sent once, no dispatch" and "email rejects: 500/502 unchanged". Live: the 81-11 drill recorded the contact form answering `{ok:true}` with the email still sent while EspoCRM was down. |
| 6 | Every site booking appears as a Lead with source "Website booking", and its status follows the booking (paid to Converted, cancelled/abandoned to Dead) | VERIFIED | The 067 trigger is exception-safe and forward-only, and it skips return legs. Its SQL status map matches `BOOKING_LEAD_STATUS` (parity test). `deliverBooking` re-reads the current row, now including the per-leg CZK columns. The source map covers online, GNet and the manual channel (the admin zod enum and `lead_channel`, 066). Tests: `tests/lead-sync-booking.test.ts` and `tests/lead-mapping.test.ts` (including the WR-03 cases), `tests/admin-bookings.test.ts` and `tests/lead-channel-migration.test.ts`. Live: UAT test 6 (admin CHANNEL required) and test 7 (booking at 18:50Z became a Converted Lead with source WhatsApp at 18:52Z, no duplicates, one Lead per round trip) passed. The 81-11 smoke recorded unpaid to New, then cancel to Dead. |
| 7 | With the VPS offline, leads queue in the outbox and reach EspoCRM once it is back, exactly once | VERIFIED | `outbox_claim` uses an advisory lock and a lease. `outbox_enqueue` is `ON CONFLICT DO NOTHING`. The lookup by `cSupabaseRef` comes before the write, and the unique index on `Lead.cSupabaseRef` is live (81-08). Backoff, the breaker and the sweep re-publish rows. WR-01 removes a silent deferral drop, tested in `tests/lead-sync.test.ts` "two consecutive deferrals of a blocked row publish two different dedup ids". Live: the 81-11 drill queued a form Lead and a booking Lead during the outage (`crm_502`) and delivered one Lead per reference after recovery. |

**Score:** 7/7 truths verified (0 present but behavior-unverified)

### Plan-level truths changed on purpose by the review fixes (INFO, not gaps)

These plan details were written before the code review. The fixes deliberately widened them, and `81-REVIEW-DISPOSITION.md` documents each change. No ROADMAP success criterion depends on the old wording.

| Plan truth (as written) | Now | Why it is not a regression |
|-------------------------|-----|----------------------------|
| 81-02 "Edge LEAD-06/empty: amount_eur null -> no opportunityAmount" and "precision: … no currency conversion, no summing of legs" | Still true for one-way bookings, and for every row where `amount_eur` is set (it is used exactly as stored, tested). New behavior: a round trip with `amount_eur` null on both legs gets `czkToEur(outbound_amount_czk + return_amount_czk)`. | The "no summing" rule exists to prevent double counting when the outbound row holds the combined total, and that case is unchanged (test "outbound amount_eur is the combined checkout total and is not added to"). The plan assumed every round trip has `amount_eur`. The two production round trips saved by the RPC fallback do not, so before the fix their Leads had no value at all. |
| 81-07 "a 400 on create with a phone number is retried once without the phone" | Superset: a retry without the phone, then without the email (moved into the description), then with a minimal body, and only then `failed crm_400` with an ALERT. | Every plan outcome still holds (Other 4xx still end `failed crm_<status>`, and the first retry drops the phone). A Lead lost to an unexpected field rejection is now rarer and visible in the logs. |

If you want a formal audit trail for these two plan wordings, an override entry can be added. It is not required, because neither is a ROADMAP contract item.

### Required Artifacts

| Artifact | Status | Details |
|----------|--------|---------|
| `supabase/migrations/064`–`068` | VERIFIED | Unchanged since the previous verification. RLS is deny-all, privileges are revoked from PUBLIC, anon and authenticated, and the functions are SECURITY DEFINER with `search_path=''`. `tests/outbox-migrations.test.ts` passes. |
| `lib/inquiries.ts`, `lib/outbox.ts`, `lib/outbox-store.ts`, `lib/outbox-backoff.ts` | VERIFIED | Real implementations. `outbox-store` gained `recentFailedCount` (wired from the sweep) and the two per-leg columns in `BOOKING_COLUMNS`. |
| `lib/lead-mapping.ts`, `lib/lead-sync.ts`, `lib/espocrm-client.ts` | VERIFIED | `bookingLeadAmountEur` is wired into `buildLeadFromBooking`. `deferDedupSuffix` is wired into `deferOrFinish`. The relaxing `createLead` is the only POST path. The CRM client is still reached only from `lead-sync` (isolation guard passes). |
| `app/api/integrations/dispatch/route.ts`, `app/api/integrations/kick/route.ts` | VERIFIED | Unchanged. Tests pass. |
| `app/api/cron/outbox-sweep/route.ts` + `vercel.json` cron | VERIFIED | Has four isolated steps (the new step is `failed_count_failed`) and imports no CRM code. |
| `middleware.ts` CSRF prefixes, `components/ContactForm.tsx` honeypot | VERIFIED | The hidden `website` input is in the form and sent as `website || undefined`. The API schema accepts `website` (max 200), and a filled value answers `{ok:true}` with no side effects. |
| D-16 notice, admin CHANNEL, `infra/espocrm/*`, runbook | VERIFIED | Unchanged code. The runbook gained the ALERT and edit-refresh sections, and `tests/lead-capture-runbook.test.ts` passes. Live UAT tests 2, 6 and 8 passed. |

### Key Link Verification

| From | To | Status |
|------|----|--------|
| form route to `storeInquiry`, then the `inquiries` INSERT trigger, then `outbox_enqueue` | WIRED (live, UAT 3/4/5) |
| browser form `fetch` to the middleware CSRF check to the route (same Origin allowed, a missing Origin allowed) | WIRED (unit test plus live UAT after the deploy) |
| route `after()` to `publishOutboxDispatch`, then QStash, then `/api/integrations/dispatch`, then `dispatchOutboxKey`, then EspoCRM | WIRED (live) |
| `bookings` trigger plus pg_net kick to `/api/integrations/kick`, then QStash (90 s), then `deliverBooking` (new columns) | WIRED (live, UAT 7, Lead about 100 s after the booking) |
| cron sweep to the expired, purge and due-key steps, plus `recentFailedCount` | WIRED (unit tests) |
| admin `ManualBookingForm` CHANNEL to the zod enum to `bookings.lead_channel` to the Lead source | WIRED (live, UAT 6/7) |

### Data-Flow Trace (Level 4)

The inquiry payload and the booking row (now including `outbound_amount_czk` and `return_amount_czk`) are read from Supabase at delivery time and mapped into the Lead body. The opportunity amount comes from the stored `amount_eur`, or from the stored per-leg CZK amounts through `czkToEur`, never from a literal. Status: FLOWING.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Phase 81 and WR-fix test files (27 files: lead-*, outbox*, inquiry-*, integrations-*, contact/corporate/multiday route and form tests, middleware-csrf-forms, middleware-i18n, admin-bookings, espocrm-lead-smoke, espocrm-site-client, espocrm-roles, infra-vps-isolation-guard, lead-capture-runbook, multi-day-page-render) | `npx vitest run --exclude '.claude/**' <27 files>` | 27 files passed, 648 tests passed, 0 failed | PASS |
| Type check | `npx tsc --noEmit` | 8 errors, all in `tests/` (i18n-translate-dnt ×2, nav-auth ×5, passenger-actions ×1), which is the known baseline. None in phase files. | PASS |
| WR-01 dedup per deferral | `tests/lead-sync.test.ts` › "two consecutive deferrals of a blocked row publish two different dedup ids (WR-01)" | included in the run above, passed | PASS |
| WR-02 relax and ALERT | `tests/lead-sync.test.ts` › "a 400 to every body variant ends failed crm_400 after four POSTs…" / "falls back to the minimal body…"; `tests/outbox-sweep.test.ts` › "reports rows that turned failed in the last 25 h…" | passed | PASS |
| WR-03 amount | `tests/lead-mapping.test.ts` › "round trip saved without amount_eur…" / "outbound amount_eur … is not added to" | passed | PASS |
| WR-04 CSRF and honeypot | `tests/middleware-csrf-forms.test.ts`; `tests/inquiry-routes.test.ts` › "honeypot filled…" / "an empty honeypot is a normal submission…" | passed | PASS |

### Probe Execution

Step 7c: SKIPPED. The phase plans declare no `probe-*.sh`.

### Live Evidence (accepted, not re-executed; production was not touched)

`81-UAT.md` (status complete, 8/8 passed, 18:34Z to 18:54Z, after the 18:25Z deploy of `b2cb1e18`) covers: forms open and the storage notice is localized; contact, corporate and multi-day each produce one Lead; the admin CHANNEL is required; a booking produces a Converted Lead with no duplicates; the CRM owner sees all Leads with the Website panel. The two reported issues (G-81-6 and G-81-8) were resolved as stale browser tabs, not code defects. The Dispatcher half of test 8 cannot be exercised because no user has that role. The 81-03 live `verify-acl` already proved that Dispatcher gets 403 on `GET /Lead`.

### Requirements Coverage

| Requirement | Source Plans | Status | Evidence |
|-------------|--------------|--------|----------|
| LEAD-01 | 81-01, 02, 03, 05, 06, 07, 11 | SATISFIED | Truth 1 |
| LEAD-02 | 81-01, 02, 03, 05, 06, 07, 11 | SATISFIED | Truth 2 |
| LEAD-03 | 81-01, 02, 03, 05, 06, 07, 11 | SATISFIED | Truth 3 |
| LEAD-04 | 81-02, 03, 09, 10, 11 | SATISFIED | Truth 4 |
| LEAD-05 | 81-01, 07, 10, 11 | SATISFIED | Truth 5 |
| LEAD-06 | 81-02, 03, 04, 06, 08, 09, 10, 11 | SATISFIED | Truth 6 |

All six IDs are marked `[x]` and Complete in REQUIREMENTS.md, and the ROADMAP shows Phase 81 as `[x]` with 11/11 plans. The bookkeeping note in the previous report is resolved. There are no orphaned requirements.

### Anti-Patterns Found

None in the covered files: no TBD, FIXME, XXX, TODO, HACK or PLACEHOLDER markers, and no stubs or static returns on the delivery path. The working tree is clean for `app/`, `lib/`, `components/`, `middleware.ts`, `supabase/`, `infra/` and `tests/`.

### Human Verification Required

None. The human UAT for this phase is complete (8/8 on production, after the fixes were deployed).

### Notes (non-blocking)

1. **Stale worktree breaks a bare test run.** `.claude/worktrees/beautiful-mayer-240991/` (untracked, a leftover from the merged review branch) is collected by vitest because `vitest.config` has no exclude for it. A bare or name-filtered `npx vitest run` therefore reports 54 failures in that copy (for example its `tests/outbox.test.ts` › `dispatchAfterResponse`). With `--exclude '.claude/**'` all root tests pass. Remove the worktree (`git worktree remove`) or add the exclude so the full suite and the `verify` skill give a true result.
2. **Open review items, owner decisions, outside the success criteria:** WR-04 retention of `inquiries` (D-14 keeps them indefinitely in this phase), a honeypot or Turnstile on the multi-day form, WR-03 edit refresh (documented in the runbook), and IN-01 to IN-07.
3. **Known latency edges, unchanged and documented:** a cold first submission can hit the 3 s storage timeout, and that Lead is delivered by the daily sweep. Dead after pickup can lag by up to about 25 h. RESEARCH A6 (bell notifications) is unverified and is not a requirement.

### Gaps Summary

No gaps. All seven ROADMAP success criteria hold on the current code. The four review fixes are wired, tested and live-proven by the production UAT, and they do not regress any earlier truth. The two plan-level wordings they widen are documented above as intentional.

---

_Verified: 2026-10-18T19:05:00Z_
_Verifier: Claude (gsd-verifier)_
