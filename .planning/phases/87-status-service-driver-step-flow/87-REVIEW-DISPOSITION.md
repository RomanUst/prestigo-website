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
| WR-05 | warning | app/api/gnet/farmin/route.ts, Stripe refund paths | Allowlisted legacy writers set `cancelled` without a status predicate; can overwrite completed/no_show (D-09) | fixed | farm-in skips completed/no_show and acks; Stripe refunds skip no_show (refund of a completed trip still cancels, as documented in the writers gate) |
| WR-06 | warning | app/api/admin/settings/route.ts | Unguarded request.json() → 500; no city/airport threshold cross-check | open | |
| IN-01..07 | info | various | no_show_requested_at not cleared on leaving on_location; fail-open availability; trip_progress replay heal; GNet null amount; operator email includes pickup address; broad airport regex; deploy/UX notes | open | see 87-REVIEW.md |
| VF-01 | warning | components/admin/BookingsTable.tsx | Cancel button showed raw `status_conflict` on a lost race (verifier) | fixed | shared conflict copy + refund note |
