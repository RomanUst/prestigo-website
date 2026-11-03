---
phase: 87-status-service-driver-step-flow
source: 87-REVIEW.md
created: 2026-11-03
---

# Phase 87 — Review disposition

Owner triage 2026-11-03: fix WR-03, WR-05 and the Cancel-button conflict message (verifier finding); others stay open.

| ID | Severity | File | Finding | Disposition | Note |
|----|----------|------|---------|-------------|------|
| WR-01 | warning | app/api/admin/bookings/cancel/route.ts | Refund issued before the CAS; a lost race leaves a refund with a 409 | open | |
| WR-02 | warning | app/api/admin/bookings/route.ts, assign route | Edit/assign gates ignore terminal `no_show` | open | |
| WR-03 | warning | lib/booking-status-service.ts | Status emails (post-trip, confirmed, cancelled) have no partner (GNet) guard; driver "Complete trip" now emails GNet passengers / noreply@gnet.local | fixed | pre-existing on admin path, newly reachable from the driver flow — live in production |
| WR-04 | warning | lib/no-show.ts | Admin confirm / PATCH to no_show skip the wait threshold and open-request check | open | latent until Phase 89 charging |
| WR-05 | warning | app/api/gnet/farmin/route.ts, Stripe refund paths | Allowlisted legacy writers set `cancelled` without a status predicate; can overwrite completed/no_show (D-09) | fixed | farm-in skips completed/no_show and acks; Stripe refund cancels skip completed/no_show (owner 2026-11-03: a refund after the trip keeps the trip) and log the kept status |
| WR-06 | warning | app/api/admin/settings/route.ts | Unguarded request.json() → 500; no city/airport threshold cross-check | open | |
| IN-01..07 | info | various | no_show_requested_at not cleared on leaving on_location; fail-open availability; trip_progress replay heal; GNet null amount; operator email includes pickup address; broad airport regex; deploy/UX notes | open | see 87-REVIEW.md |
| VF-01 | warning | components/admin/BookingsTable.tsx | Cancel button showed raw `status_conflict` on a lost race (verifier) | fixed | shared conflict copy + refund note |

## Gap-closure review (87-REVIEW.md rewritten 2026-11-03, diff base 8076d71e; previous review of 01–14 stays in git history at 8076d71e)

| ID | Severity | File | Finding | Disposition | Note |
|----|----------|------|---------|-------------|------|
| WR-01 | warning | TripScreen.tsx, next.config.ts | Trip URL with the token reached the Help page as `document.referrer` | fixed | `Referrer-Policy: no-referrer` on `/driver/:path*` (after the global entry); test in next-config-headers |
| WR-02 | warning | lib/email-log.ts | `.eq('booking_id', null)` → `eq.null` never matches; dedupe for null-booking emails (accept, assign) was a no-op | fixed | `.is('booking_id', null)` for null; tests in email-log |
| WR-03 | warning | lib/driver-accept-email.ts, lib/email.ts | A failed Resend send was logged as `outcome=sent` | fixed | sender returns boolean; outcome `send_failed` logged via console.error; test added |
| WR-04 | warning | TripScreen.tsx | Swipe on the sheet head hijacked vertical scroll (no axis lock, no touchcancel) | fixed | vertical-only, ignores a downward drag while scrolled, touchcancel reset; tests added |
| WR-05 | warning | inboxes.json, driver-help-contract | CRM guard relies on Drivers inbox HMAC enforcement that nothing checks | verified live | Drivers inbox: hmac_mandatory=true, pre-chat off, email collect off, allowed domains rideprestigo.com (checked via API 2026-11-03) |
| WR-06 | warning | TripScreen.tsx | Unsent note draft lost when tapping Help (full page load) | open | owner-facing UX, low impact |
| IN-01 | info | TripScreen.tsx | Stale swipedRef could swallow a later click | fixed | flag clears after 400 ms |
| IN-02..05 | info | middleware.ts, help route, email, driver-help-contract | buildCspDriverHelp duplicates buildCsp; silent fallback when only one Drivers env is set; long name drops "(driver)"; "ext." phones; empty phone row; identity kept for the tab session | open | see 87-REVIEW.md |
