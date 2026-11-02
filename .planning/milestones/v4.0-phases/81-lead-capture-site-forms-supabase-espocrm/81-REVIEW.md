---
phase: 81-lead-capture-site-forms-supabase-espocrm
reviewed: 2026-10-18T00:00:00Z
depth: standard
files_reviewed: 44
files_reviewed_list:
  - app/[locale]/account/reset-password/page.tsx
  - app/[locale]/corporate/CorporateForm.tsx
  - app/api/admin/bookings/route.ts
  - app/api/contact/route.ts
  - app/api/corporate-contact/route.ts
  - app/api/cron/outbox-sweep/route.ts
  - app/api/integrations/dispatch/route.ts
  - app/api/integrations/kick/route.ts
  - app/api/submit-multiday-quote/route.ts
  - components/ContactForm.tsx
  - components/Nav.tsx
  - components/admin/AdminStep6Create.tsx
  - components/admin/ManualBookingForm.tsx
  - components/auth/OAuthButtons.tsx
  - components/booking/MultiDayForm.tsx
  - components/booking/steps/Step3Auth.tsx
  - components/booking/steps/Step5Passenger.tsx
  - infra/espocrm/entities.json
  - infra/espocrm/enums.json
  - infra/espocrm/fields.json
  - infra/espocrm/inspect.mjs
  - infra/espocrm/layouts.json
  - infra/espocrm/lead-smoke.mjs
  - infra/espocrm/lib/client.mjs
  - infra/espocrm/overlay.mjs
  - infra/espocrm/overlay/Lead.entityDefs.json
  - infra/espocrm/roles.json
  - infra/espocrm/sync.mjs
  - infra/espocrm/verify-acl.mjs
  - lib/espocrm-client.ts
  - lib/inquiries.ts
  - lib/lead-mapping.ts
  - lib/lead-sync.ts
  - lib/outbox-backoff.ts
  - lib/outbox-store.ts
  - lib/outbox.ts
  - lib/qstash.ts
  - lib/supabase/browser.ts
  - supabase/migrations/064_integration_outbox.sql
  - supabase/migrations/065_inquiries.sql
  - supabase/migrations/066_bookings_lead_channel.sql
  - supabase/migrations/067_bookings_lead_outbox.sql
  - supabase/migrations/068_outbox_sweep.sql
  - vercel.json
findings:
  critical: 0
  warning: 4
  info: 7
  total: 11
status: issues_found
---

# Phase 81: Code Review Report

**Reviewed:** 2026-10-18
**Depth:** standard
**Files Reviewed:** 44
**Status:** issues_found

## Summary

The outbox design is sound on its main axes. Auth on the three machine routes is fail-closed: dispatch verifies the QStash signature (I confirmed that `Receiver` with empty signing keys refuses, it does not accept a forged HS256 token), and kick and cron use timing-safe Bearer compares. The SECURITY DEFINER functions all pin `search_path = ''` and re-REVOKE from PUBLIC/anon/authenticated. Outbox rows carry ids only and `last_error` is regex-constrained. The booking trigger is wrapped so it cannot abort a booking write. The claim function serialises per aggregate and the lease (120 s) is longer than the dispatcher `maxDuration` (60 s). The `createBrowserSupabase` prerender fix is correct, and there is no behavioural regression in the browser for Nav, OAuthButtons, Step3Auth, Step5Passenger or reset-password. Every `/api/admin/bookings` POST caller now sends `channel`.

No blocker was found. The four warnings below are real defects, mostly in retry and recovery paths. The unit tests mock `publish` and the store, so they cannot see these. All four warnings live in the error and recovery paths, not the happy path.

## Warnings

### WR-01: Deferral re-publish reuses one dedup id, so the second deferral is silently dropped by QStash

**File:** `lib/lead-sync.ts:93` (dedup id built in `lib/outbox.ts:76-78`)
**Issue:** `deferOrFinish` publishes with `dedupSuffix: 'd' + current.attempts`. While a row is blocked (a sibling key of the same aggregate is `processing`, or a crashed worker holds an unexpired lease), `attempts` does not change between deferrals. The first deferral (message M2, id `<key>:d1`) arrives 30 s later and is blocked again. Its re-publish uses the same id `<key>:d1`. QStash drops a publish whose Deduplication-Id it has seen recently, and `publishJSON` still resolves, so `publishOutboxDispatch` returns `true`. The chain ends silently and the row stays `pending` or `processing` until the daily sweep, up to about 24 h later. Typical triggers:
- the dispatcher is killed at 60 s after the claim, so the 120 s lease is still held when QStash retries
- two events for one booking overlap for more than 30 s

The unit tests inject a fake `publish`, so they cannot see this.
**Fix:** Make the dedup id unique per deferral, for example include the delivery time or a counter:
```ts
await d.publish(key, {
  delaySeconds: delay,
  dedupSuffix: `d${current.attempts}_${Math.floor(d.now().getTime() / 1000)}`,
})
```
Also, for `processing` rows, defer until the lease expires (`lease_until - now`) rather than a fixed 30 s.

### WR-02: A CRM 400 permanently fails the delivery and drops the Lead with no alert; only the phone number has a fallback

**File:** `lib/lead-sync.ts:306-317` and `lib/lead-sync.ts:244-247`
**Issue:** `createLead` retries a 400 only without `phoneNumber`. Any other 400 (an `emailAddress` that passes zod `.email()` but fails EspoCRM's own validation, an invalid `assignedUserId`, a field-length limit) falls through `handleFailure` to `complete(key, 'failed', 'crm_400')`. `failed` is terminal: the sweep never re-publishes it. The inquiry or booking stays in Supabase but never reaches the CRM, and nothing alerts anyone (the only signal is one log line and a row status). The visitor was told the submission succeeded.
**Fix:**
- In `createLead`, on a 400 retry progressively: without phone, then without email (put the address into `description`), then with a minimal body of lastName, source, supabaseRef and description.
- Add a count of `status='failed'` rows to the sweep response, or alert on it, so terminal losses are visible.

### WR-03: Booking Lead value is understated for round trips and never refreshed after a price edit

**File:** `lib/lead-mapping.ts:373-377` (trigger scope: `supabase/migrations/067_bookings_lead_outbox.sql:164`)
**Issue:** The Lead is built from the outbound row only. `opportunityAmount` is `amount_eur` of that single leg, while the return leg is fetched only for its reference (`ReturnLegInfo` has no amount). For a round trip, the CRM pipeline value is therefore about half the real value. Separately, the trigger fires only on `INSERT OR UPDATE OF status`, and a Lead is re-synced only when the status group changes. A PATCH price edit (`app/api/admin/bookings/route.ts`, price-affecting branch) or a client-name or phone edit never reaches the Lead, so `opportunityAmount`, `cBookingReference` and the contact fields stay at their first-write values. Phase 85 conversion and value reporting will be off.
**Fix:**
- Extend `ReturnLegInfo` and `readReturnLeg` to select `amount_eur`, and set `opportunityAmount = outbound + return`.
- Widen the trigger to `UPDATE OF status, amount_eur, client_email, client_phone`, enqueueing a key that includes a version (for example `lead.booking:<id>:upd:<updated_at epoch>`), so the one-shot key does not swallow later edits.

### WR-04: Public form endpoints now feed a permanent store and the CRM with no spam control and no retention

**File:** `app/api/contact/route.ts:22-66`, `app/api/corporate-contact/route.ts:18-61`, `app/api/submit-multiday-quote/route.ts:116-189`, `middleware.ts` (`CSRF_PROTECTED_PREFIXES`)
**Issue:** Each accepted request now writes a permanent `inquiries` row, creates an outbox row, and creates an EspoCRM Lead assigned to the owner. D-14 states there is no purge. The only protection is a per-IP rate limit, which rotating IPs bypass.
- `/api/contact` has no honeypot at all. The corporate route has one.
- `/api/corporate-contact` and `/api/submit-multiday-quote` are not in `CSRF_PROTECTED_PREFIXES`, so a cross-site page can submit through victims' browsers, each from a different IP.

Previously these were only emails. Now spam pollutes the sales pipeline and the database without bound.
**Fix:** Add a honeypot (or Turnstile) to the contact and multi-day forms. Add `/api/corporate-contact` and `/api/submit-multiday-quote` to `CSRF_PROTECTED_PREFIXES` (a missing Origin is still allowed for non-browser callers). Decide on a retention job for `inquiries`, or document the open-ended retention in the privacy notice.

## Info

### IN-01: Failed email leaves an orphan inquiry with no dispatch, and a retry creates a duplicate Lead

**File:** `app/api/contact/route.ts:55-66`, `app/api/corporate-contact/route.ts:45-61`
**Issue:** `storeInquiry` starts before the email send. If the email throws, the route returns 500 or 502 without awaiting `stored` or calling `dispatchAfterResponse`. The inquiry and outbox row exist anyway, so a Lead appears at the next daily sweep (up to 24 h later). The visitor, told it failed, resubmits, and a second Lead follows (D-10 deliberately does not dedupe).
**Fix:** In the failure path also `await stored` and `dispatchAfterResponse(...)`, so a captured inquiry is delivered promptly. Alternatively skip storing when the email fails.

### IN-02: `retryLater` and `breaker` ignore the result of `reschedule` and `publish`

**File:** `lib/lead-sync.ts:214-233`
**Issue:** `publishOutboxDispatch` returns `false` on failure, and the result is discarded. A single QStash outage turns the 60 s retry into a wait for the daily sweep, still reported as outcome `rescheduled`. `reschedule()` returning `false` (the row is no longer `processing`, so another worker owns it) is also ignored, and a duplicate message is published anyway.
**Fix:** Return an error outcome (or throw, so the route answers 500 and QStash retries) when `publish` fails, and skip the publish when `reschedule` returns `false`.

### IN-03: A skipped purge is never re-evaluated

**File:** `lib/lead-sync.ts:197`, `supabase/migrations/068_outbox_sweep.sql:82`
**Issue:** The purge key `lead.purge:<id>` is one-shot (ON CONFLICT DO NOTHING). If the delivery is `skipped` with `purge_lead_not_dead`, the Lead is not Dead because the earlier `:dead` event is still pending or has `failed` (see WR-02). The purge is then never retried, so an abandoned checkout's personal data stays in the CRM past the 90-day promise.
**Fix:** Treat `purge_lead_not_dead` as a reschedule (for example +7 days) instead of a terminal skip. Alternatively, include a date bucket in the key.

### IN-04: Dead code and duplicated QStash client

**File:** `lib/outbox.ts:108-133`, `lib/outbox.ts:43-49` vs `lib/qstash.ts:4-13`
**Issue:** `enqueueOutboxEvent` has no callers (the DB triggers and sweep functions do all enqueueing), although its doc comment calls it "the only TypeScript write path". The lazy QStash `Client` singleton is duplicated in two modules.
**Fix:** Delete `enqueueOutboxEvent` (or add a caller), and share one `getQStash()`.

### IN-05: CRM role scope is wider than needed, and `cSupabaseRef` is editable in the UI

**File:** `infra/espocrm/roles.json:29-45`, `infra/espocrm/fields.json:241-246`
**Issue:**
- The Sales manager role has `Lead.delete: all`, while Account and Contact are `no`.
- The Sync writer gains `assignmentPermission: all` and `User.read: all`, so the API key can read every user and assign to anyone. That is needed only to set one assignee.
- `cSupabaseRef` is the sync identity, but only a tooltip says "Do not edit". A manager who edits it makes the next booking event create a duplicate Lead, and a wrong value hides the Lead from purge.

**Fix:** Make the field `readOnly` in the layout and field definition, restrict Sales manager Lead delete to `own`, and note the Sync writer scope as an accepted risk.

### IN-06: A missing or invalid CRM config or assignee fails silently

**File:** `lib/espocrm-client.ts:34-38`, `lib/lead-sync.ts:99`
**Issue:** An invalid `ESPOCRM_LEAD_ASSIGNEE_ID` is silently ignored, so Leads are created unassigned with no log line. `loadSiteEspoConfig` collapses every misconfiguration (http URL, bad key characters) to `null`, giving only `crm_unconfigured` plus a 6 h breaker, with no indication of which variable is wrong.
**Fix:** Log a payload-free code per reason (`bad_url`, `bad_key`, `bad_assignee`) once per invocation.

### IN-07: `outbox_complete` and `outbox_reschedule` do not check the lease holder

**File:** `supabase/migrations/064_integration_outbox.sql:191-198, 219-226`
**Issue:** Both update `WHERE status = 'processing'` without comparing a lease token or attempt count. A slow worker whose lease expired and whose row was re-claimed can still complete or reschedule the new claimant's row. This is safe today only because Vercel kills the function at 60 s, before the 120 s lease expires. That coupling is undocumented, and raising `maxDuration` would break it silently.
**Fix:** Pass the claimed `attempts` into `outbox_complete` and `outbox_reschedule` and add `AND attempts = p_attempts`. At minimum, add a comment tying `LEASE_SECONDS` to `maxDuration`.

---

_Reviewed: 2026-10-18_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
