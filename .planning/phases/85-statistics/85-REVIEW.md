---
phase: 85-statistics
reviewed: 2026-10-31T00:00:00Z
depth: standard
files_reviewed: 17
files_reviewed_list:
  - app/(internal)/admin/(dashboard)/stats/page.tsx
  - app/api/admin/stats/b2b/route.ts
  - app/api/admin/stats/conversion/route.ts
  - app/api/admin/stats/customers/route.ts
  - components/admin/BookingsTable.tsx
  - components/admin/stats/B2BTab.tsx
  - components/admin/stats/ConversionTab.tsx
  - components/admin/stats/CustomersTab.tsx
  - components/admin/stats/OverviewTab.tsx
  - components/admin/stats/PeriodSelector.tsx
  - components/admin/stats/StatsTable.tsx
  - infra/chatwoot/channel-backfill.mjs
  - lib/admin-stats.ts
  - lib/chat-intake.ts
  - lib/chat-store.ts
  - supabase/migrations/081_stats_conversion.sql
  - supabase/migrations/082_stats_customers_b2b.sql
findings:
  critical: 0
  warning: 3
  info: 7
  total: 10
status: issues_found
---

# Phase 85: Code Review Report

**Reviewed:** 2026-10-31
**Depth:** standard
**Files Reviewed:** 17 (lib/chat-intake.ts, lib/chat-store.ts and BookingsTable.tsx reviewed on the phase diff only)
**Status:** issues_found

## Summary

The phase is in good shape. No security defect was found:

- All three admin routes use the `getAdminUser()` guard before any work.
- Periods are validated by `periodSchema` (real calendar dates, bounded) before the RPC call.
- Every new SECURITY DEFINER function has `SET search_path = ''` and an explicit `REVOKE ... FROM PUBLIC, anon, authenticated` on the new signature, including the 6-arg `chat_lead_reserve`.
- The old 5-arg overload is dropped, so PostgREST named-arg calls are not ambiguous. `p_channel DEFAULT NULL` keeps a not-yet-deployed intake working.
- The backfill script is GET-only, validates the UUID and channel class with strict regexes before it builds SQL, and never prints PII.
- The strict email deep link goes into the search box and then through the bound `admin_search_bookings` RPC. It is not interpolated into a PostgREST `.or()` filter.
- `npx tsc --noEmit` shows no non-test errors, and eslint is clean on the stats files and the backfill script.

The findings are accounting and consistency gaps in the funnel and person-key logic. WR-01 and WR-02 can make the numbers on the Conversion tab not add up. All three warnings sit in migrations 081/082, which are already live, so each fix needs a **new forward migration 083** (CREATE OR REPLACE of the affected function plus re-run of the REVOKE/GRANT lines). Do not edit 081 or 082.

## Warnings

### WR-01: Bookings that follow an inquiry but are not its first conversion appear in neither the funnel nor the direct table

**File:** `supabase/migrations/081_stats_conversion.sql:253-267` (matched) and `:292-318` (period_trips / is_direct)
**UI file:** `components/admin/stats/ConversionTab.tsx:104-122`
**Issue:**
- Each inquiry claims at most ONE trip: `LIMIT 1`, earliest `created_at`.
- `is_direct` is true only when the person has no inquiry in the 90 days before the trip.
- So a person with an inquiry at day 0 (chat Lead, form or abandoned checkout) who books T1 on day 10 and T2 on day 30 gets:
  - T1 claimed by the inquiry and counted in the funnel revenue.
  - T2 not claimed by any inquiry, because the inquiry already converted to T1.
  - T2 not direct, because an inquiry exists within the prior 90 days.
- T2 therefore shows up in neither "Revenue (EUR)" of the funnel nor the "Direct bookings" table.
- This is the normal pattern for repeat customers. An abandoned checkout followed by two real orders in 90 days is enough.
- The RPC does return `trips_in_period` and `attributed_bookings`, but `ConversionTab` never renders them. Funnel revenue plus direct revenue is silently lower than period revenue, and the owner cannot see why.
- This contradicts D-06: the owner expects every period booking to be either a converting booking or a direct one.

**Fix:** Define "direct" as "not claimed by any matched inquiry" and add an explicit remainder bucket. Add migration 083 that replaces `stats_conversion`:
- Compute the claimed booking set over all inquiries, not only those created in the period.
- `is_direct` = `person_key` has no inquiry within 90 days before the trip.
- Add a third bucket `after_inquiry`: the trip has an earlier inquiry in the window, but the trip is not any inquiry's chosen conversion.
- Return the bucket as `other_after_inquiry` (bookings plus revenue) so the three groups add up to `trips_in_period`.
- Render it in `ConversionTab` as a row, or at minimum a reconciliation note.
- Extend `conversionStatsSchema` to match.
- Until then, at least show `trips_in_period - converting_bookings - direct_total.bookings` as "Repeat bookings after an inquiry".

### WR-02: Inquiries and trips derive "the same person" from two different tables, so they can fail to match

**File:** `supabase/migrations/081_stats_conversion.sql:158-161` (stats_trips) vs `:216`, `:219`, `:239-242` (inq_all)
**Issue:**
- A trip's `person_key` comes from `booking_identity.identity_id`, falling back to `'e:' || normalized booking email`.
- Form and abandoned inquiries come from `identity_emails.identity_id` of the inquiry email, with the same `'e:'` fallback.
- If the email has an identity but the paid booking has no `booking_identity` row, the two keys differ:
  - the trip is `'e:foo@x.com'`;
  - the inquiry is `'<identity uuid>'`.
- A missing row is possible because `booking_identity` is written by a trigger/sync path. The identity may be erasing, the sync may not have run yet, or the booking may predate 069.
- The conversion silently fails and the booking is counted as "Online · direct" or a manual row.
- The reverse mismatch also exists: a booking linked via a phone merge with an email that was never added to `identity_emails`, versus an inquiry with only that email.
- The migration header says the funnel is meant to use exactly the CRM sync identity definition, but the two halves of the join use different lookups.

**Fix:** In migration 083, redefine `stats_trips.person_key` as:
```sql
CASE WHEN b.anonymised_at IS NOT NULL THEN NULL
     ELSE COALESCE(bi.identity_id::text, ie.identity_id::text,
                   'e:' || public.identity_normalize_email(b.client_email)) END
```
with `LEFT JOIN public.identity_emails ie ON ie.email = public.identity_normalize_email(b.client_email)` added. Both sides then resolve an email to the identity whenever one exists.

### WR-03: stats_trips adds a hard-coded CZK-to-EUR estimate that 080 deliberately does not have, so amounts disagree with the Chatwoot panel and are not labelled as estimates

**File:** `supabase/migrations/081_stats_conversion.sql:167-175`
**Issue:**
- `stats_trips` falls back to `round(b.amount_czk * 0.04)` for every row without `amount_eur`.
- The migration claims to share "the 080 round-trip fallback", but `panel_bookings` (080:160-175) has no `ELSE` branch. For a non-round-trip row without `amount_eur` it contributes NULL (nothing).
- The same customer therefore shows a different `spent_eur` in the Chatwoot panel than the revenue and top-customer figures on /admin/stats.
- The 0.04 rate (25 CZK = 1 EUR) is a magic number duplicated across two migrations. The tabs print the result as "EUR" with no hint that some of it is converted from CZK.
- The CLAUDE.md price rules are about site pricing, but the same "single source" reasoning applies. A rate change would have to be edited in several SQL bodies.

**Fix:**
- Decide one rule and apply it in both places. Either drop the `ELSE` branch to match 080, or add the same `ELSE` to 080's replacement in 083 so both agree.
- Put the rate in one SQL function, e.g. `public.stats_czk_to_eur(numeric)`.
- Optionally count rows that used the estimate and show "n amounts estimated from CZK" in a `StatsNote`, as is already done for `without_amount`.

## Info

### IN-01: One non-conforming `pickup_date` makes a whole tab return 500

**File:** `lib/admin-stats.ts:206-207`, `:230` and `supabase/migrations/082_stats_customers_b2b.sql:25-29`
**Issue:**
- The 082 header says pickup_date is never cast "so one malformed value cannot raise and break a tab".
- But `first_trip`, `last_trip` and the B2B `last_trip` are `ymd` regex-checked in zod.
- `min`/`max` of a text column with one malformed or empty value (or NULL for a person whose rows are all NULL) fails `safeParse` and the route returns `DB read failed` for the whole tab.
- The entry points that write `pickup_date` all validate `YYYY-MM-DD`, so this is defensive only.

**Fix:** Either relax these three fields to `z.string()`, or filter `pickup_date ~ '^\d{4}-\d{2}-\d{2}$'` in the SQL (in 083).

### IN-02: NULL `booking_source` is treated differently by the two migrations

**File:** `supabase/migrations/082_stats_customers_b2b.sql:167` vs `081_stats_conversion.sql:295-299`
**Issue:**
- `t.booking_source <> 'gnet'` drops NULL rows from the repeat-customer population (NULL comparison).
- The conversion funnel's CASE sends NULL to the `ELSE 'online'` bucket.
- The original CHECK constraint allows NULL, so the behaviour depends on the column also being NOT NULL, which could not be confirmed in migrations.

**Fix:** Use `t.booking_source IS DISTINCT FROM 'gnet'` in 083.

### IN-03: The strict email deep link silently rejects valid emails containing an apostrophe

**File:** `components/admin/BookingsTable.tsx:1065`
**Issue:**
- `DEEP_LINK_EMAIL` excludes `'` from the local part, but `o'brien@example.com` is a legal address.
- For such a customer, the Customers-tab link (and the panel link) lands on an unfiltered bookings table with no indication that the filter was dropped.
- Separately, the API caps `search` at 100 characters (`app/api/admin/bookings/route.ts:296`) while the deep link accepts up to 254, so a long address is truncated server-side.

**Fix:** Allow `'` in the local part (the value is only used as React state and a bound RPC parameter, never as markup), or show a small notice when a `search` parameter is ignored. Align the maximum length with the API cap.

### IN-04: `emptyText` of both Conversion tables is unreachable

**File:** `components/admin/stats/ConversionTab.tsx:80-121` and `:130`, `:151`
**Issue:**
- Both tables are built from fixed source lists (`FUNNEL_SOURCES`, `DIRECT_SOURCES`) and always have at least eight rows.
- So `rows.length === 0` is never true, and "No inquiries in this period." and "No direct bookings in this period." never show.
- A period with zero inquiries shows a grid of zeros and a "Total / n/a" row.
- The `OverviewTab` "No booking data for this period." branch (`OverviewTab.tsx:64`) is also unreachable, since `statsData` is never null after a successful load. That branch is carried over from the old page.

**Fix:** Drop the dead props, or render the empty text when `funnel_total.inquiries === 0`.

### IN-05: Unknown channel and "other" channel are merged into one funnel row

**File:** `supabase/migrations/081_stats_conversion.sql:221`
**Issue:**
- `COALESCE(l.channel, 'other')` puts leads whose channel is still NULL (created between applying 081 and deploying the intake, or backfill skipped: 404, missing meta) under "Chat · Other".
- That hides a data-quality problem. `chat_channel_bucket` documents NULL as "unknown", but the funnel cannot show it.

**Fix:** Add an "Unknown" bucket, or note on the tab how many chat Leads have no channel.

### IN-06: Backfill script aborts the whole run on any non-HTTP failure and prints no cause

**File:** `infra/chatwoot/channel-backfill.mjs:98-103`, `:129-131`
**Issue:**
- Only `ChatwootApiError` is skipped per conversation.
- A request timeout (`REQUEST_TIMEOUT_MS`) or network error rethrows, the process prints only `Backfill failed` and exits 2, and the SQL already written to stdout is a partial file with no summary line.
- Applying the partial output is safe (idempotent `channel IS NULL`), but the operator gets no diagnosis and no resume position.

**Fix:** Catch any error per conversation, write `conversation <id>: failed (<error.name>)` to stderr, count it as skipped, and continue.

### IN-07: The B2B tab and the account detail page attribute guest bookings differently

**File:** `supabase/migrations/082_stats_customers_b2b.sql:15-21`
**Issue:**
- The migration deliberately follows `/admin/accounts` list precedence (`user_id` first, email only when `user_id` is NULL).
- The CONTEXT D-19 says "user_id OR email", and `/admin/accounts/[id]` uses exactly that OR (`app/api/admin/accounts/[id]/route.ts:50`).
- A booking with another user's `user_id` and the account's email appears on the detail page but not in the B2B tab. The header documents this, but the tab note (`B2BTab.tsx:108-111`) does not.
- Also, the "no amount (group payment)" message assumes every 0/NULL amount is a group payment, which is not guaranteed.

**Fix:** Keep the behaviour, but say in the B2B note that the account detail page can show slightly more bookings, and word the zero-amount note as "no amount recorded (e.g. group payment)".

---

_Reviewed: 2026-10-31_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
