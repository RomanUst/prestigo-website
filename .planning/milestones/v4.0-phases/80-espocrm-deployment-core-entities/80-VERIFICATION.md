---
phase: 80-espocrm-deployment-core-entities
verified: 2026-10-17T20:30:00Z
status: passed
score: 5/5 must-haves verified
covered_files:
  - ".planning/phases/80-espocrm-deployment-core-entities/80-01-PLAN.md"
  - ".planning/phases/80-espocrm-deployment-core-entities/80-01-SUMMARY.md"
  - ".planning/phases/80-espocrm-deployment-core-entities/80-02-PLAN.md"
  - ".planning/phases/80-espocrm-deployment-core-entities/80-02-SUMMARY.md"
  - ".planning/phases/80-espocrm-deployment-core-entities/80-03-PLAN.md"
  - ".planning/phases/80-espocrm-deployment-core-entities/80-03-SUMMARY.md"
  - ".planning/phases/80-espocrm-deployment-core-entities/80-04-PLAN.md"
  - ".planning/phases/80-espocrm-deployment-core-entities/80-04-SUMMARY.md"
  - ".planning/phases/80-espocrm-deployment-core-entities/80-05-PLAN.md"
  - ".planning/phases/80-espocrm-deployment-core-entities/80-05-SUMMARY.md"
  - ".planning/phases/80-espocrm-deployment-core-entities/80-06-PLAN.md"
  - ".planning/phases/80-espocrm-deployment-core-entities/80-06-SUMMARY.md"
  - ".planning/phases/80-espocrm-deployment-core-entities/80-07-PLAN.md"
  - ".planning/phases/80-espocrm-deployment-core-entities/80-07-SUMMARY.md"
  - ".planning/phases/80-espocrm-deployment-core-entities/80-08-PLAN.md"
  - ".planning/phases/80-espocrm-deployment-core-entities/80-08-SUMMARY.md"
  - ".planning/phases/80-espocrm-deployment-core-entities/80-09-PLAN.md"
  - ".planning/phases/80-espocrm-deployment-core-entities/80-09-SUMMARY.md"
  - ".planning/phases/80-espocrm-deployment-core-entities/80-10-PLAN.md"
  - ".planning/phases/80-espocrm-deployment-core-entities/80-10-SUMMARY.md"
  - ".planning/phases/80-espocrm-deployment-core-entities/80-11-PLAN.md"
  - ".planning/phases/80-espocrm-deployment-core-entities/80-11-SUMMARY.md"
  - ".planning/phases/80-espocrm-deployment-core-entities/80-12-PLAN.md"
  - ".planning/phases/80-espocrm-deployment-core-entities/80-12-SUMMARY.md"
  - ".planning/phases/80-espocrm-deployment-core-entities/80-13-PLAN.md"
  - ".planning/phases/80-espocrm-deployment-core-entities/80-13-SUMMARY.md"
  - "components/admin/BookingsTable.tsx"
  - "infra/espocrm/README.md"
  - "infra/espocrm/account-candidates.mjs"
  - "infra/espocrm/backfill.mjs"
  - "infra/espocrm/entities.json"
  - "infra/espocrm/enums.json"
  - "infra/espocrm/fields.json"
  - "infra/espocrm/inspect.mjs"
  - "infra/espocrm/layouts.json"
  - "infra/espocrm/lib/booking-map.mjs"
  - "infra/espocrm/lib/candidates.mjs"
  - "infra/espocrm/lib/client.mjs"
  - "infra/espocrm/lib/enum-merge.mjs"
  - "infra/espocrm/mail.json"
  - "infra/espocrm/overlay.mjs"
  - "infra/espocrm/overlay/CBooking.entityDefs.json"
  - "infra/espocrm/roles.json"
  - "infra/espocrm/seed-accounts.mjs"
  - "infra/espocrm/settings.json"
  - "infra/espocrm/sync.mjs"
  - "infra/espocrm/verify-acl.mjs"
  - "infra/vps/runbooks/crm-operators.md"
  - "tests/crm-runbook.test.ts"
  - "tests/espocrm-backfill.test.ts"
  - "tests/espocrm-booking-map.test.ts"
  - "tests/espocrm-candidates.test.ts"
  - "tests/espocrm-enums.test.ts"
  - "tests/espocrm-mail.test.ts"
  - "tests/espocrm-model.test.ts"
  - "tests/espocrm-overlay.test.ts"
  - "tests/espocrm-roles.test.ts"
  - "tests/espocrm-seed.test.ts"
  - "tests/espocrm-sync.test.ts"
covered_digest: "v2:sha256:e36984d890f9e29dc53966f6694bce831291651e174a5e15942d055a3e57c694"
behavior_unverified: 0
overrides_applied: 0
re_verification: false
advisory:
  - finding: "Admin deep link (CRM Booking -> /admin/bookings?search=REF) loses the search param when the owner is logged out: login redirect goes to /admin unconditionally"
    category: other
    reason: "app/(internal)/admin/login/actions.ts always redirects to /admin; middleware keeps ?search on the redirect to /admin/login, but nothing carries it back. Works when the session is active (the normal case for the owner)."
    evidence_status: "observed: curl on prod returns 307 to /admin/login?search=...; actions.ts:39 redirect('/admin')"
  - finding: "3 of 56 CBooking rows have no amount (source amount_eur and amount_czk both NULL; amountEur returns null by design, never 0)"
    category: other
    reason: "Source-data gap, not a sync bug; the 4 Travel Express group-link rows were already fixed at the source on 2026-10-17. Phase 82 should stamp the share of group-link amounts at creation."
    evidence_status: "inspect.mjs count CBooking amount= -> 3"
---

# Phase 80: EspoCRM Deployment + Core Entities - Verification Report

**Phase Goal:** EspoCRM is live with the Account/Contact data model, B2B Opportunity pipeline, read-only booking history and sales mailbox the B2B workflow needs.
**Verified:** 2026-10-17
**Status:** passed
**Re-verification:** No - initial verification

Method: the SUMMARY claims were not trusted. Config-as-code files were read, the live CRM was queried read-only
(`sync.mjs --dry-run`, `inspect.mjs`), the phase test set was re-run, and the deployed admin code was checked.
No CRM writes, no secrets or PII printed, `.env.local` not read, `verify-acl.mjs` not re-run (it creates probe users;
the live roles are proven equal to `roles.json` by the `roles: unchanged=3` dry-run line, and the executor run of 78/78 is recorded in 80-07/80-13).

## Goal Achievement

### Observable Truths (ROADMAP success criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Owner manages Accounts (hotel/agency/corporate) and Contacts, each Contact linked to its Account | VERIFIED | `enums.json` Account.type = Hotel / Agency / Corporate / Embassy / Other (stock Customer/Investor/Partner/Reseller retired). `fields.json` adds 10 commercial Account fields (commission, payment terms, due days, VAT ID, reverse charge, contract date/validity/file, expected volume, other-type note). Live CRM: 6 Accounts (5 seeded partners + untouched Restore Drill Canary), 29 Contacts, 5 Contacts linked to an Account (24 unlinked are individual B2C customers; D-10 links only when an Account exists). `sync.mjs --dry-run`: every resource `create=0 update=0`. Owner walk-through approved (80-13). |
| 2 | Owner moves B2B Opportunities through a Kanban pipeline with Prestigo stages and sets follow-up tasks/reminders | VERIFIED | `enums.json` Opportunity.stage = New, First contact, Meeting/call, Rate sent, Trial ride, Partner (Won), Lost (+ probability map, default New, 4 stock stages retired); live `enums: unchanged=2`. Kanban is the native EspoCRM view (owner confirmed, 80-10 UAT step 5 and 80-13). Task reminders: `mail.json` defaults Popup at due + Email 1 h before; scheduler jobs `CheckEmailAccounts=Active`, `SendEmailReminders=Active` (live); system SMTP account present, active, useSmtp (live `inspect.mjs system-mail --expect-active`), reminder delivery proven in UAT after the fix. Opportunity and Task counts are 0 live: the pipeline is configured, no real deals entered yet (expected for this phase). |
| 3 | Each Contact/Account shows full booking history via read-only Booking entity synced from Supabase (date, route, vehicle, status, amount, link to admin booking) | VERIFIED | `CBooking` entity with pickupAt, pickup, dropoff, vehicleClass, status, amount (EUR), adminLink (url), supabaseBookingId (+ passenger, flight, driver, source, paymentMethod). Links `CBooking->Contact` and `CBooking->Account` with `bookings` panels appended to Contact and Account detail (`layouts.json`). Read-only: Dispatcher/Sales manager have `CBooking create no, edit no, delete no`; only Sync writer can write. Unique index overlay `supabaseBookingId+deleteId` in `infra/espocrm/overlay/`. Live: 56 CBookings, `adminLink` / `contactId` / `pickup` / `vehicleClass` / `status` / `pickupAt` all non-empty on every record (empty counts 0), 13 linked to an Account (relink idempotent), `amount` present on 53/56 (see advisory). Admin link = `https://rideprestigo.com/admin/bookings?search=<ref>`; `components/admin/BookingsTable.tsx` reads `?search`, starts on horizon `all` (D-18), merged to main via PR #61. Owner walk-through confirmed the Account and Contact panels. |
| 4 | Sales mail (roman@) connected to EspoCRM only; sent and received emails attach to matching Account/Contact/Opportunity | VERIFIED | Live `inspect.mjs mailbox --expect-active`: `email_account=active imap=on smtp=on store_sent=on chatwoot_inboxes_with_roman=0` (connected in EspoCRM, zero Chatwoot inboxes use it). 80-10 UAT 6/6: known-contact mail attached to Account, unknown sender left unattached with no auto Contact/Lead, mail composed from an Opportunity sent from roman@ and reply attached (email-parent Account=1 Opportunity=3 none=0), reminders folder rule, SPF/DKIM/DMARC pass. Native attach (D-24); auto-attach formula deliberately out of scope. |
| 5 | Roles/ACL for 2-3 future operators exist in Chatwoot and EspoCRM, documented in a runbook | VERIFIED | EspoCRM: `roles.json` Dispatcher, Sales manager (+ Sync writer service role), field-level ACL hides the 9 commercial Account fields from Dispatcher, export/mass-update off; live `roles: unchanged=3`; `verify-acl` 78/78 recorded by the executor. Chatwoot: teams `Bookings` and `B2B` declared and live (`chatwoot sync --dry-run teams: unchanged=2`); CE has only agent/administrator, so the mirror is team plus inbox membership (D-23). Runbook `infra/vps/runbooks/crm-operators.md` (343 lines): roles table pinned to `roles.json` by `tests/crm-runbook.test.ts`, "Chatwoot role mirror", add/remove operator, mailbox, backfill, recovery. No agents/users created (no hires, per D-23). |

**Score:** 5/5 truths verified (0 behavior-unverified, 0 overrides)

### Required Artifacts

| Artifact | Status | Details |
|----------|--------|---------|
| `infra/espocrm/sync.mjs`, `lib/client.mjs` | VERIFIED | read-then-diff engine, two identities, live idempotent (create=0 update=0) |
| `entities.json`, `fields.json`, `layouts.json`, `enums.json`, `roles.json`, `mail.json`, `settings.json` | VERIFIED | substantive, applied live (all `unchanged`) |
| `overlay/CBooking.entityDefs.json` + `overlay.mjs` | VERIFIED | unique index on supabaseBookingId (D-19) |
| `backfill.mjs`, `lib/booking-map.mjs` | VERIFIED | 56 CBookings live, re-run no-op |
| `seed-accounts.mjs`, `account-candidates.mjs` | VERIFIED | 5 partner Accounts, canary untouched |
| `inspect.mjs`, `verify-acl.mjs` | VERIFIED | live read-only checks exit 0 |
| `infra/vps/runbooks/crm-operators.md` | VERIFIED | test-pinned to roles.json |
| `components/admin/BookingsTable.tsx` (D-18 deep link) | VERIFIED | `readBookingDeepLink`, horizon `all` |

### Key Link Verification

| From | To | Status | Details |
|------|----|--------|---------|
| CBooking | Contact / Account | WIRED | links in `entities.json`, panels in `layouts.json`, 56/56 contacts, 13 accounts live |
| CPartnerRate | Account | WIRED | link + `partnerRates` panel; entity exists (0 records, owner-entered data) |
| CBooking.adminLink | site admin bookings table | WIRED | `buildAdminLink` -> `?search=`; BookingsTable consumes it; API route supports `search` |
| roman@ mailbox | EspoCRM Personal Email Account | WIRED | live active, Chatwoot inbox count 0 |
| Task reminders | system SMTP (Resend) | WIRED | InboundEmail group account active, jobs Active |
| roles.json | crm-operators.md | WIRED | `tests/crm-runbook.test.ts` pins the table |

### Data-Flow Trace (Level 4)

| Artifact | Data | Source | Real data | Status |
|----------|------|--------|-----------|--------|
| CBooking records | bookings | Supabase export -> backfill -> REST | Yes (56 rows, fields populated) | FLOWING |
| Account/Contact panels | cBookings relation | contactId/accountId on CBooking | Yes (13 account-linked) | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| CRM matches code | `node infra/espocrm/sync.mjs --dry-run` | all resources create=0 update=0 | PASS |
| Mailbox active, CRM-only | `inspect.mjs mailbox --expect-active` | active, imap/smtp/store_sent on, chatwoot inboxes 0 | PASS |
| System mail sender | `inspect.mjs system-mail --expect-active` | present, active, useSmtp | PASS |
| Scheduler jobs | `inspect.mjs jobs` | both Active | PASS |
| Record counts | `inspect.mjs count ...` | CBooking 56, Account 6, Contact 29 | PASS |
| Phase tests | `npx vitest run tests/espocrm tests/crm-runbook.test.ts tests/infra-vps-isolation-guard.test.ts` | 12 files, 468 tests passed | PASS |
| Chatwoot teams | `infra/chatwoot/sync.mjs --dry-run` | `teams: unchanged=2` (unrelated WhatsApp label/inbox drift is parked Phase 78) | PASS |

### Probe Execution

SKIPPED: no `probe-*.sh` declared or present for this phase.

### Requirements Coverage

| Requirement | Source Plans | Status | Evidence |
|-------------|--------------|--------|----------|
| CRM-01 | 80-03, 80-05, 80-06, 80-12, 80-13 | SATISFIED | Accounts/Contacts model, types, commercial fields, 5 seeded Accounts with linked Contacts |
| CRM-02 | 80-01, 80-05, 80-10 | SATISFIED | 7-stage Opportunity pipeline, Kanban, Task reminders live |
| CRM-03 | 80-01..04, 80-07, 80-08, 80-09, 80-12, 80-13 | SATISFIED | CBooking read-only mirror, 56 rows, panels, admin link |
| CRM-04 | 80-10, 80-11 | SATISFIED | roman@ in EspoCRM only, attach proven by UAT |
| CRM-05 | 80-07, 80-11 | SATISFIED | roles.json + runbook + Chatwoot team mirror |

All five IDs appear in PLAN frontmatter and in the ROADMAP phase block. No orphaned requirements: REQUIREMENTS.md maps only CRM-01..05 to Phase 80 and every one is claimed by at least one plan.

### Anti-Patterns Found

None blocking. Debt-marker grep (TBD/FIXME/XXX) on phase files: none unreferenced. No stubs (all config applied live, scripts exercised). Known harmless: one Contact without a valid phone is skipped by EspoCRM validation (backfill repeat reports contacts update=1 with nothing written).

### Human Verification Required

None outstanding. Owner walk-through approved 2026-10-17 (80-13) and mail UAT 6/6 (80-10) already cover the visual/UX and mail-flow items.

### Gaps Summary

No gaps. Two advisories (not blocking, not counted against the score):

1. Admin deep link and login: when the owner is logged out the post-login redirect drops `?search=`, so the booking is not auto-opened (owner lands on /admin). With an active session, the CRM "link to admin booking" opens the booking directly. Does not defeat CRM-03 (the link exists, resolves to the right booking, and works in the normal logged-in flow). Optional follow-up: carry `next`/search through the login action.
2. 3 of 56 bookings have no amount at the source; Phase 82 should write group-link shares at booking creation.

Bookkeeping to do outside this report: `.planning/REQUIREMENTS.md` still shows CRM-01..05 unchecked / "Pending", and the ROADMAP top-level phase list line 20 is still `[ ]` for Phase 80, although the phase block says 13/13 plans executed. Update both on phase completion.

---

_Verified: 2026-10-17_
_Verifier: Claude (gsd-verifier)_
