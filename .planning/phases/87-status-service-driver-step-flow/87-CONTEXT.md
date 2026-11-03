# Phase 87: Status Service & Driver Step Flow - Context

**Gathered:** 2026-11-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Every booking status change (admin edit, cancel, driver step, later the payment engine) goes through one trusted status service with compare-and-set and a status log. The existing per-assignment driver trip page (`/driver/trip/[token]`) is rebuilt as a light-theme, mobile-first trip screen (map + bottom sheet + a single slide-to-advance control) where the driver moves the trip one strict step at a time (en route → on site → passenger on board → completed); admin sees each step immediately; GNet bookings get each step pushed exactly once and never touch money; "completed" fires exactly one completion event for Phase 88.

Out of this phase: a full driver cabinet (login, ride list Upcoming/Past, Offers, profile/rating) — deferred to a new phase after Phase 93. Any money movement (capture is Phase 88; no-show charge is Phase 89).

Requirements: PAYF-02, DRV-01, DRV-02, DRV-03, DRV-04, DRV-05.

</domain>

<decisions>
## Implementation Decisions

### Carried forward (roadmap / research / 2026-11-02 owner decisions — not re-asked)
- **D-01:** Behaviour-preserving extraction of the inline PATCH status logic in `app/api/admin/bookings/route.ts` into `advanceBookingStatus()` (`lib/booking-status-service.ts`) comes first, with parity tests; existing admin transitions behave exactly as before. Admin PATCH, cancel, assign (GNet push) and the driver route all call it. Compare-and-set `UPDATE … WHERE id=$1 AND status=$prev`; a lost race returns 409 with the current state and a clear message.
- **D-02:** Single TS source for the status vocabulary (`lib/booking-status.ts`), with SQL-vs-TS parity tests extending the `tests/customer-mapping-parity.test.ts` pattern; all hard-coded status lists in the fan-out checklist (research ARCHITECTURE.md §Status vocabulary) are updated in this phase.
- **D-03:** Migration 084: `bookings_status_check` adds `on_board` and `no_show`; new `booking_status_log` table (who/actor, from, to, at); `completed_at`.
- **D-04:** Driver steps are auto-pushed to GNet, idempotent against `gnet_bookings.last_push_status` (no duplicates on retap/retry). GNet push logic (PATCH + assign route) is folded into the status service.
- **D-05:** GNet bookings (`booking_source='gnet'`) are marked partner and skip every money path (no hold, capture, no-show charge).
- **D-06:** "Completed" fires exactly one completion event for the Phase 88 payment engine; the driver never sees or enters an amount.
- **D-07:** Security-relevant: `security:` commit prefix; the token-gated driver write route stays CSRF-protected and rate-limited; the DTRIP-04 grep-gates in `tests/driver-trip-progress.test.ts` / `tests/driver-trip.test.ts` are rewritten to the new invariant (driver route imports the status service, never updates `bookings` directly), not deleted.

### Status vocabulary
- **D-08:** `on_board` is a real `bookings.status` value (shown in admin as its own status; its log timestamp is later used for waiting-time math in Phase 91). The driver's "arrived/on site" step maps to the existing `on_location` (no `arrived` status). — **Reversibility:** one-way — DB CHECK constraint, SQL functions (067 lead status, 063 gcal trigger, 080 panel, 081-083 stats) and GNet/CRM mappings all depend on it.
- **D-09:** `no_show` is a terminal status (added to `TERMINAL_STATUSES` in `lib/trip-token.ts`; the trip link dies at it like at completed/cancelled).
- **D-10:** CRM lead mapping: `no_show` → `converted` (a real booking existed), in both SQL `booking_lead_status()` and `lib/lead-mapping.ts`. Chatwoot/customer mappings treat it consistently (Claude to pick the exact Chatwoot value-status handling, consistent with "not revenue unless charged").
- **D-11:** Stats (`/admin/stats`, RPCs 081-083): `no_show` counts as revenue only when charged. In Phase 87 nothing is ever charged, so `no_show` is excluded from revenue now; Phase 89 adds the "charged" condition.

### Driver step flow
- **D-12:** The driver sees only the current next step — steps appear one at a time, never the full list. Order is strict: en route → on site → passenger on board → completed. The server enforces `step === nextStepFor(currentStatus)`; a replay of the already-applied step returns 200 and changes/logs nothing; a skipped or stale step returns 409.
- **D-13:** Every step (not only "completed") is confirmed: after the driver slides/taps, a confirmation dialog asks "Are you sure you want to move to <next step>?"; only on confirm is the request sent. There is no driver-side undo — if a step is wrong, the dispatcher fixes it in admin.
- **D-14:** Start gate ("Too early to start"): the first step "en route" unlocks at `pickup − (2 h + travel time from Prague centre to the pickup address)`; for a pickup in central Prague it is simply `pickup − 2 h`. Before that the control is shown locked with a "too early to start" label; the server rejects an early "en route" too. Computed from the pickup instant in Prague time (DST-safe). — **Reversibility:** reversible
- **D-15:** No-show request (driver side): after the free waiting threshold has passed, the driver gets a "Request no-show" button (in addition to "passenger on board") while at `on_location`. Thresholds: 30 min in the city, 60 min at the airport, counted from `max(pickup time, on_location timestamp)`; both values are admin settings (reused by Phases 89 and 91). The server rejects an early request. The request does NOT change status and charges nothing — it raises an alert so the operator can try to reach the client.
- **D-16:** No-show alert goes to (a) an admin banner/flag on the booking ("No-show requested") with actions "Confirm no-show" (operator sets status `no_show` through the status service) and "Client found" (clears the request), and (b) a Chatwoot/WhatsApp operator message. Only the operator ever moves a booking to `no_show`.
- **D-17:** After "completed" the driver sees a "Trip completed" screen (short summary, no passenger personal data, no amount); re-opening the link later shows "Trip completed" with details hidden (instead of a dead link). Same treatment for `no_show`/`cancelled` is Claude's call.

### Driver page look
- **D-18:** Layout modelled on the owner's reference screenshots (Blacklane driver app, ride screen): header with back/help, passenger + vehicle card, map with pickup/dropoff pins and "km · min (est.)", bottom sheet with date/time, pickup → dropoff addresses and booking number, and a slide-to-advance control at the bottom showing the next step label (or "too early to start"). Inspired-by only — Prestigo branding, no copying of Blacklane name, assets or look-alike branding.
- **D-19:** The driver page is always light theme (cream/navy-ink/antique-gold, same palette as admin light from Phase 86 D-05), no theme toggle. Mobile-first.
- **D-20:** Language: English only (as today).
- **D-21:** The existing driver note field (DTRIP-06) and the accept/decline flow (`/driver/response`) stay working.

### GNet status mapping
- **D-22:** Research the GNet API before planning for what to send on `on_board` and `no_show`. Fallback if no equivalent exists: send nothing for `on_board`; send nothing for `no_show` (operator informs the partner manually). Existing mappings (en_route → EN_ROUTE, on_location → ON_LOCATION, completed → COMPLETE, cancelled → CANCEL) unchanged.

### Claude's Discretion
- How "Prague centre" is defined (reference point + radius) and how travel time is computed (Google Distance Matrix vs `lib/geo-distance.ts` estimate), with a sensible cache/fallback if the maps call fails.
- Map implementation on the driver page (reuse `components/booking/RouteMap.tsx` / existing Google Maps key); Google attribution must stay visible (ToS).
- Slide control implementation (swipe with tap/keyboard fallback for accessibility) and confirmation dialog design.
- Conflict message wording when admin and driver race (one applies, the other gets 409 + current state).
- Exact Chatwoot delivery for the no-show alert and the admin banner placement.
- Structure of `booking_status_log` columns and the completion-event mechanism (outbox row vs log row) as long as it fires exactly once.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope and requirements
- `.planning/ROADMAP.md` §Phase 87 — goal, success criteria, owner decisions, planning notes
- `.planning/REQUIREMENTS.md` — PAYF-02, DRV-01..05 (and note: DRV-03 capture verified in Phase 88 under HOLD-04)

### Research
- `.planning/research/ARCHITECTURE.md` — status service design, status vocabulary table, fan-out checklist, migration 084 contents, GNet idempotency, anti-patterns 4 and 5
- `.planning/research/SUMMARY.md` — milestone guardrails, open owner questions (now answered here)
- `.planning/research/PITFALLS.md` — milestone pitfalls (DST, races, driver link moving money)

### Prior phase decisions
- `.planning/phases/86-admin-shell/86-CONTEXT.md` — admin light palette and theme tokens (D-05, D-17 status chips) reused by the driver page and new status badges
- `.planning/milestones/v2.2-REQUIREMENTS.md` — DTRIP-01..08 (permanent per-assignment link, trip sheet, token rules) being reversed/extended

### Project rules
- `CLAUDE.md` — security commit prefix, no hard-coded prices, middleware matcher, tests/lint baseline

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `app/api/admin/bookings/route.ts` (1194 lines): inline PATCH status logic to extract (transition check, payment-link deactivation, emails, QStash reminder, GNet push).
- `lib/booking-transitions.ts`: `VALID_TRANSITIONS` UI source — add `on_location → on_board | no_show | cancelled`, `on_board → completed | cancelled`.
- `lib/trip-token.ts`: `isTripLinkValid` + `TERMINAL_STATUSES` (add `no_show`).
- `lib/gnet-client.ts`: `pushGnetStatus`, `PRESTIGO_TO_GNET_STATUS` map.
- `app/(internal)/driver/trip/[token]/page.tsx` + `TripProgressClient.tsx` (5 free buttons, permissive D-02 of v2.2) and `app/api/driver/trip/[token]/progress/route.ts` (writes `driver_assignments.trip_progress`) — to be rebuilt.
- `components/admin/StatusBadge.tsx` already declares `arrived | on_board | no_show` variants.
- `components/booking/RouteMap.tsx`, `lib/geo-distance.ts`, `lib/google-maps-url.ts`: map/distance helpers.
- `lib/prague-date.ts`: Prague-time day/instant helpers for the start gate.
- `lib/chatwoot-client.ts` / `lib/chatwoot-operator.ts`: operator messaging for the no-show alert.

### Established Patterns
- Parity tests SQL vs TS (`tests/customer-mapping-parity.test.ts`).
- Status lists are TEXT + CHECK (not enums), changed via DROP+RECREATE (migrations 040/053 pattern).
- Side effects after response via `after()`; emails deduped via `logEmail`; notification flags in `pricing_globals.notification_flags`.
- Admin auth guard order, 400 vs 422, CSRF via middleware prefixes (memory: API route patterns).

### Integration Points
- Admin PATCH, `app/api/admin/bookings/cancel/route.ts`, `app/api/admin/bookings/[id]/assign/route.ts`, driver progress route → status service.
- SQL fan-out: `booking_lead_status()` (067), gcal trigger (063), panel (080), stats RPCs (081-083), `admin_search_bookings p_status`.
- TS fan-out: `lib/lead-mapping.ts`, `lib/customer-mapping.ts`, `lib/chatwoot-mapping.ts`, `lib/panel-bookings.ts`, `lib/google-calendar.ts`, admin `KNOWN_STATUSES`, `statusToFlagKey`.
- `driver_assignments.trip_progress` stays written for back-compat but is no longer the source of truth.

</code_context>

<specifics>
## Specific Ideas

- Owner shared 5 screenshots of the Blacklane driver app (2026-11-03): ride screen with map + bottom sheet + slide control "Too early to start"; booking detail sheet with booking number and addresses; ride list Upcoming/Past; Offers tab; "You" profile with rating. Only the ride screen is in scope for Phase 87.
- "Steps appear one by one" — the driver never sees the full list of statuses.
- Every step is confirmed by a dialog; no undo for the driver.

</specifics>

<deferred>
## Deferred Ideas

- **Full driver cabinet** (driver login/accounts, ride list Upcoming/Past by day, Offers tab replacing accept/decline links, "You" profile with rating/streak, documents, help) — new phase after Phase 93 (owner: "after everything already planned").
- Theme toggle / dark mode for the driver page — not now (always light).
- Driver UI in other languages — not now (English only).

</deferred>

---

*Phase: 87-status-service-driver-step-flow*
*Context gathered: 2026-11-03*
