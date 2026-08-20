# Phase 52: extended-booking-statuses - Context

**Gathered:** 2026-05-04 (retroactive — phase already complete)
**Status:** Ready for reference / Phase 53 context

<domain>
## Phase Boundary

Extend the booking status lifecycle with three new driver-side states (`assigned`, `en_route`, `on_location`) across four layers: DB CHECK constraint, GNet status-push mapping, admin API route, and admin UI components. No new booking creation flows or email notifications introduced.

</domain>

<decisions>
## Implementation Decisions

### Database Migration
- **D-01:** Migration named `040_extended_booking_statuses.sql`, placed in outer-repo `/supabase/migrations/` (NOT `prestigo/supabase/`)
- **D-02:** DROP+RECREATE pattern for CHECK constraint — mirrors `039_gnet_bookings.sql` exactly (`DROP CONSTRAINT IF EXISTS bookings_status_check`, then `ADD CONSTRAINT`)
- **D-03:** Full 7-value enum in constraint: `pending | confirmed | completed | cancelled | assigned | en_route | on_location`
- **D-04:** Constraint name: `bookings_status_check` (PostgreSQL auto-naming: `{table}_{column}_check`)

### Status Lifecycle & Transition Graph
- **D-05:** Linear lifecycle: `pending → confirmed → assigned → en_route → on_location → completed`
- **D-06:** `confirmed` retains legacy paths `[completed, cancelled]` AND gains `assigned` — backwards compat preserved
- **D-07:** Each new status allows `cancelled` as abort path (defensive — driver no-show): `assigned: [en_route, cancelled]`, `en_route: [on_location, cancelled]`, `on_location: [completed, cancelled]`
- **D-08:** VALID_TRANSITIONS double-gated: identical maps in both `app/api/admin/bookings/route.ts` (server, Zod + explicit guard) and `components/admin/BookingsTable.tsx` (client, UI dropdown filter)

### GNet Integration
- **D-09:** Status mapping — `assigned → ASSIGNED`, `en_route → EN_ROUTE`, `on_location → ON_LOCATION`
- **D-10:** GNet push triggered via `after()` branch in API route — uses `prestigoToGnetStatus()` returning non-null for all three new statuses
- **D-11:** No new client emails for `assigned/en_route/on_location` — `flagKey` lookup returns `undefined`, email branch short-circuits silently

### Admin UI
- **D-12:** `StatusBadge` variant union extended with all three new values; hex colors from UI-SPEC: `assigned: #1a3a35` (dark green), `en_route: #2a1f3a` (dark purple), `on_location: #3a2a0a` (dark amber)
- **D-13:** `STATUS_LABELS`: `assigned → 'Assigned'`, `en_route → 'En Route'`, `on_location → 'On Location'`
- **D-14:** Three `variant` cast sites in `BookingsTable.tsx` widened to include new statuses (lines 431, 740, 1217)

### Testing
- **D-15:** TDD Wave 0 — tests written before production code; D-01 guard updated, 3 new end-to-end PATCH→GNet push tests added
- **D-16:** Final test suite: 32/32 passing (gnet-client.test.ts: 17, gnet-status-push.test.ts: 15)

### Claude's Discretion
- Constraint drop uses `IF EXISTS` for safety (no-op if name varies)
- Migration numbering follows sequential pattern (039 exists → 040)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

No external specs — requirements fully captured in decisions above.

### Related migrations (for DROP+RECREATE pattern reference)
- `supabase/migrations/039_gnet_bookings.sql` — Pattern source for CHECK constraint DROP+RECREATE

### Implemented artifacts
- `supabase/migrations/040_extended_booking_statuses.sql` — DB CHECK constraint (7 values)
- `prestigo/lib/gnet-client.ts` — `PRESTIGO_TO_GNET_STATUS` map + `prestigoToGnetStatus()`
- `prestigo/app/api/admin/bookings/route.ts` — Zod enum + `VALID_TRANSITIONS` (server-authoritative)
- `prestigo/components/admin/StatusBadge.tsx` — Variant union + hex color styles
- `prestigo/components/admin/BookingsTable.tsx` — Client `VALID_TRANSITIONS` + `STATUS_LABELS` + 3 cast sites
- `prestigo/tests/gnet-status-push.test.ts` — End-to-end PATCH→GNet push tests
- `prestigo/tests/gnet-client.test.ts` — Unit mapping assertions

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `prestigoToGnetStatus(status)` in `lib/gnet-client.ts`: Maps Prestigo status to GNet code — extended in this phase; Phase 53 can call it directly for any new push logic
- `VALID_TRANSITIONS` in `app/api/admin/bookings/route.ts`: Server-authoritative transition graph — Phase 53 must mirror any additions here into `BookingsTable.tsx`
- `StatusBadge` component: Now supports all 7 status variants — Phase 53 can render them without changes

### Established Patterns
- **Double-gate pattern**: Status transitions enforced at both API (`VALID_TRANSITIONS` + Zod) and UI (`VALID_TRANSITIONS` in BookingsTable) — both must stay in sync when adding new transitions
- **GNet push via `after()`**: Asynchronous, non-blocking — failures don't affect API response
- **Wave 0 TDD**: Tests written first (RED), then production code (GREEN) — established pattern for this codebase

### Integration Points
- `after()` block in `app/api/admin/bookings/route.ts` — entry point for any additional post-status-change side effects (Phase 53 driver assignment logic could hook here)
- `BookingsTable.tsx` status select dropdown — driven by `VALID_TRANSITIONS[booking.status]`, so any new states automatically appear if added to the map

</code_context>

<specifics>
## Specific Ideas

- Migration 039 (`gnet_bookings`) was deleted from filesystem by a worktree merge but exists in git history — migration 040 follows the numeric sequence regardless
- `bookings_status_check` constraint name verified via `pg_constraint` query before migration was written (not guessed)
- Live DB applied via `supabase db push` — migration version `20260427130819` confirmed in Supabase MCP

</specifics>

<deferred>
## Deferred Ideas

- WR-02 (from code review): Cancel button missing from admin UI for bookings in `assigned/en_route/on_location` states — transitions table allows cancellation but UI provides no button. Captured for Phase 53 or backlog.
- WR-03 (from code review): Test fixture missing `amount_eur` field — `pushGnetStatus` receives `"NaN"` as `totalAmount` in tests. Technical debt; tests pass but GNet call is technically wrong.

</deferred>

---

*Phase: 52-extended-booking-statuses*
*Context gathered: 2026-05-04 (retroactive)*
