---
phase: "90"
slug: "dispatch-views"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-11-11"
---

# Phase 90 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| admin browser to admin booking routes | status, notes, driver price and trip edits are PATCHed to /api/admin/bookings; the server stays the authority | booking status, money effects |
| browser cookie / query string to server render | admin_bookings_view, admin_calendar_view, ?view=, ?search= are user-controlled and read by the server page | view preference, search text |
| browser to /api/admin/bookings/dispatch | untrusted query string (dates, search, tripType); rows carry client PII | client PII, prices |
| route to Postgres RPC | user input is bound as RPC parameters | search text, dates |
| operator gesture to money effect | a drag, a menu choice or a select change can lead to a capture, refund, fee or no-show charge on the server | payments |
| npm registry to repo | two new runtime dependencies (@dnd-kit/core, @dnd-kit/utilities) | third-party code |
| browser timezone to dispatch decisions | the operator plans the day from where the calendar draws each booking | pickup date / time |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-90-01 | Tampering | useBookingMoves / BookingDetailPanel extraction | high | mitigate | `expected_status` on both status PATCH sites (`useBookingMoves.tsx:103`, `CompleteTripDialog.tsx:72`); no_show only via modal, money cancel only via dialog; server 422 guards unchanged | closed |
| T-90-02 | Tampering | parseAdminBookingsView, parseAdminCalendarView, resolveBookingsView | medium | mitigate | strict-equality closed unions (`lib/admin-shell-prefs.ts:60-92`), hostile-value tables in `tests/admin-shell-prefs.test.ts` | closed |
| T-90-03 | Tampering | lib/prague-calendar.ts placement | medium | mitigate | Intl Europe/Prague + pickupInstantMs only; local-getter grep gate = 0; three-timezone DST matrix in `tests/prague-calendar.test.ts` | closed |
| T-90-04 | Information disclosure | GET /api/admin/bookings/dispatch | high | mitigate | `getAdminUser()` first (`route.ts:30-32`), 401/403 before parsing or RPC; test asserts rpc never called for non-admins | closed |
| T-90-05 | Denial of service | dispatch route page loop | medium | mitigate | 62-day span cap, page size 100, max 5 RPC calls, `truncated` flag (`route.ts:12-14,45-48,66-95`); tested | closed |
| T-90-06 | Information disclosure | dispatch route logs and caching | medium | mitigate | logs RPC error message only; `Cache-Control: no-store` on every response; tested | closed |
| T-90-07 | Tampering | search and tripType parameters | medium | mitigate | tripType whitelist, search trimmed to 100 chars, both bound as RPC parameters (`route.ts:50-76`) | closed |
| T-90-08 | Denial of service | useDispatchBookings polling | low | mitigate | 401 stops the interval, hidden/paused ticks skipped, one in-flight request via AbortController | closed |
| T-90-09 | Elevation of privilege | planMove | high | mitigate | single planner (`bookingMoves.ts:66-83`), bare PATCH only for `direct`; every entry point goes through `requestMove`; 200-combination matrix test | closed |
| T-90-10 | Repudiation | completion with a card_hold | high | mitigate | `CompleteTripDialog` states effect and amount; PATCH only from its primary button | closed |
| T-90-11 | Tampering | CompleteTripDialog double submit | medium | mitigate | in-flight ref, disabled primary while pending, compare-and-set 409 | closed |
| T-90-SC (90-04) | Tampering | npm installs of @dnd-kit/core and @dnd-kit/utilities | high | mitigate | exact pins 6.3.1 / 3.2.2, lockfile committed in 9bb2470e, registry integrity matches, no install scripts | closed |
| T-90-12 | Tampering | BookingPanelProvider dialog mounts | medium | mitigate | one provider, one `useBookingMoves` instance, dialogs rendered once; test finds exactly one radiogroup | closed |
| T-90-13 | Tampering | BookingDetailPanel unsaved input | medium | mitigate | notes flushed on unmount, inputs keyed by booking id, `pausePolling` while dirty; tested | closed |
| T-90-14 | Tampering | requestMove direct and complete PATCH | high | mitigate | `expected_status` on every PATCH; 409 shows conflict line and refetches, nothing applied locally; tested | closed |
| T-90-15 | Tampering | double submit from drag plus menu | medium | mitigate | synchronous in-flight Set + same-booking open-dialog guard (`useBookingMoves.tsx:69,98,123-134`); tested | closed |
| T-90-16 | Elevation of privilege | GNet partner bookings | high | mitigate | `completeEffect` returns null for partners; server booking-completed event skips partners; tested with gnet fixture | closed |
| T-90-17 | Tampering | DispatchBoard drop handling | medium | mitigate | disabled droppables for blocked columns, `resolveDrop`/`planMove` read `UI_TRANSITIONS`; server `VALID_TRANSITIONS` + compare-and-set is the authority | closed |
| T-90-18 | Information disclosure | BoardCard content | low | accept | see Accepted Risks Log (AR-90-01) | closed |
| T-90-19 | Tampering | calendar placement | medium | mitigate | placement only via `pragueDateOf` / `pragueMinuteOfDay`; grep gate 0; tests under America/Los_Angeles incl. both 2027 DST weeks | closed |
| T-90-20 | Tampering | page.tsx view resolution | medium | mitigate | `resolveBookingsView` / `parseAdminCalendarView` strict equality; hostile cookie tests | closed |
| T-90-21 | Tampering | ?search= deep link | medium | mitigate | deep-link regexes unchanged vs main; value only placed in search box and bound as query parameter | closed |
| T-90-22 | Elevation of privilege | moving the page to a server component | low | mitigate | page stays under `(dashboard)`; layout admin gate and sidebar unchanged (git diff clean) | closed |
| T-90-SC (90-01, 02, 03, 05, 06, 07, 08, 09) | Tampering | npm/pip/cargo installs | high | accept | see Accepted Risks Log (AR-90-02) | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-90-01 | T-90-18 | The board shows client names and prices on the admin screen. It is mounted only under the admin-gated `(dashboard)` layout and reads only the `getAdminUser`-gated dispatch route; the data is identical to the existing list view. | plan 90-07 threat model, premise verified by gsd-security-auditor | 2026-11-11 |
| AR-90-02 | T-90-SC (plans 90-01, 02, 03, 05, 06, 07, 08, 09) | These plans install no package. Verified by the manifest diff: only commit 9bb2470e (plan 90-04) touched `package.json` / `package-lock.json`. | plan threat models, premise verified by gsd-security-auditor | 2026-11-11 |

*Accepted risks do not resurface in future audit runs.*

---

## Non-blocking Observations

1. The 90-01 gate "tests/BookingsTable.test.tsx untouched" no longer holds literally: plan 90-05 changed the file on purpose (D-03 flip). The Phase 87/88/89 security assertions remain and pass.
2. The local-Date-getter grep gate (T-90-03, T-90-19) is a plan-time check, not a standing test. It returns 0 hits today.
3. `BookingsWorkspace.tsx` `getMonday` / `getSunday` use local Date getters. They are the KPI-card helpers moved unchanged from the old page, outside dispatch placement.
4. On the panel surface a no-money booking can still be cancelled by a bare PATCH (carried-forward Phase 89 behaviour); the server `use_cancel_route` 422 guard backs it up.

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-11-11 | 24 register rows (22 threat IDs + T-90-SC mitigate + T-90-SC accept ×8 plans) | 24 | 0 | gsd-security-auditor (sonnet), 13 test files / 715 tests passed |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-11-11
