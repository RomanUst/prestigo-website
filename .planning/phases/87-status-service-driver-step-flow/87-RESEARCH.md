# Phase 87: Status Service & Driver Step Flow - Research

**Researched:** 2026-11-03
**Domain:** Next.js 16 App Router + Supabase (Postgres RPC/CAS) + token-gated driver write route + GNet partner push + status-vocabulary fan-out
**Confidence:** HIGH on codebase integration (every file below was opened this session); MEDIUM on design recommendations (CAS via RPC, trigger-based log, start-gate maths); LOW on GNet `on_board` / `no_show` semantics (not publicly documented, see §GNet).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Behaviour-preserving extraction of the inline PATCH status logic in `app/api/admin/bookings/route.ts` into `advanceBookingStatus()` (`lib/booking-status-service.ts`) comes first, with parity tests; existing admin transitions behave exactly as before. Admin PATCH, cancel, assign (GNet push) and the driver route all call it. Compare-and-set `UPDATE … WHERE id=$1 AND status=$prev`; a lost race returns 409 with the current state and a clear message.
- **D-02:** Single TS source for the status vocabulary (`lib/booking-status.ts`), with SQL-vs-TS parity tests extending the `tests/customer-mapping-parity.test.ts` pattern; all hard-coded status lists in the fan-out checklist (research ARCHITECTURE.md §Status vocabulary) are updated in this phase.
- **D-03:** Migration 084: `bookings_status_check` adds `on_board` and `no_show`; new `booking_status_log` table (who/actor, from, to, at); `completed_at`.
- **D-04:** Driver steps are auto-pushed to GNet, idempotent against `gnet_bookings.last_push_status` (no duplicates on retap/retry). GNet push logic (PATCH + assign route) is folded into the status service.
- **D-05:** GNet bookings (`booking_source='gnet'`) are marked partner and skip every money path (no hold, capture, no-show charge).
- **D-06:** "Completed" fires exactly one completion event for the Phase 88 payment engine; the driver never sees or enters an amount.
- **D-07:** Security-relevant: `security:` commit prefix; the token-gated driver write route stays CSRF-protected and rate-limited; the DTRIP-04 grep-gates in `tests/driver-trip-progress.test.ts` / `tests/driver-trip.test.ts` are rewritten to the new invariant (driver route imports the status service, never updates `bookings` directly), not deleted.
- **D-08:** `on_board` is a real `bookings.status` value (shown in admin as its own status; its log timestamp is later used for waiting-time math in Phase 91). The driver's "arrived/on site" step maps to the existing `on_location` (no `arrived` status). Reversibility: one-way.
- **D-09:** `no_show` is a terminal status (added to `TERMINAL_STATUSES` in `lib/trip-token.ts`; the trip link dies at it like at completed/cancelled).
- **D-10:** CRM lead mapping: `no_show` → `converted` (a real booking existed), in both SQL `booking_lead_status()` and `lib/lead-mapping.ts`. Chatwoot/customer mappings treat it consistently (Claude to pick the exact Chatwoot value-status handling, consistent with "not revenue unless charged").
- **D-11:** Stats (`/admin/stats`, RPCs 081-083): `no_show` counts as revenue only when charged. In Phase 87 nothing is ever charged, so `no_show` is excluded from revenue now; Phase 89 adds the "charged" condition.
- **D-12:** The driver sees only the current next step. Order is strict: en route → on site → passenger on board → completed. The server enforces `step === nextStepFor(currentStatus)`; a replay of the already-applied step returns 200 and changes/logs nothing; a skipped or stale step returns 409.
- **D-13:** Every step is confirmed: after the driver slides/taps, a confirmation dialog asks "Are you sure you want to move to <next step>?"; only on confirm is the request sent. No driver-side undo.
- **D-14:** Start gate ("Too early to start"): first step "en route" unlocks at `pickup − (2 h + travel time from Prague centre to the pickup address)`; central Prague pickup = `pickup − 2 h`. Locked control with "too early to start" label; server rejects an early "en route" too. Computed from the pickup instant in Prague time (DST-safe). Reversibility: reversible.
- **D-15:** No-show request (driver side): after the free waiting threshold, the driver gets a "Request no-show" button (in addition to "passenger on board") while at `on_location`. Thresholds: 30 min city, 60 min airport, counted from `max(pickup time, on_location timestamp)`; both values are admin settings (reused by Phases 89 and 91). Server rejects an early request. The request does NOT change status and charges nothing — it raises an alert.
- **D-16:** No-show alert goes to (a) an admin banner/flag on the booking ("No-show requested") with actions "Confirm no-show" (operator sets status `no_show` through the status service) and "Client found" (clears the request), and (b) a Chatwoot/WhatsApp operator message. Only the operator ever moves a booking to `no_show`.
- **D-17:** After "completed" the driver sees a "Trip completed" screen (short summary, no passenger personal data, no amount); re-opening the link later shows "Trip completed" with details hidden (instead of a dead link). Same treatment for `no_show`/`cancelled` is Claude's call.
- **D-18:** Layout modelled on owner's reference screenshots (Blacklane driver app ride screen): header with back/help, passenger + vehicle card, map with pins and "km · min (est.)", bottom sheet with date/time, pickup → dropoff, booking number, slide-to-advance control showing next step label (or "too early to start"). Inspired-by only; Prestigo branding.
- **D-19:** Driver page always light theme (cream/navy-ink/antique-gold, same palette as admin light from Phase 86 D-05), no theme toggle. Mobile-first.
- **D-20:** Language: English only.
- **D-21:** Existing driver note field (DTRIP-06) and accept/decline flow (`/driver/response`) stay working.
- **D-22:** Research GNet API for what to send on `on_board` and `no_show`. Fallback if no equivalent exists: send nothing for `on_board`; send nothing for `no_show` (operator informs partner manually). Existing mappings (en_route → EN_ROUTE, on_location → ON_LOCATION, completed → COMPLETE, cancelled → CANCEL) unchanged.

### Claude's Discretion
- How "Prague centre" is defined (reference point + radius) and how travel time is computed (Google Distance Matrix vs `lib/geo-distance.ts` estimate), with a sensible cache/fallback if the maps call fails.
- Map implementation on the driver page (reuse `components/booking/RouteMap.tsx` / existing Google Maps key); Google attribution must stay visible (ToS).
- Slide control implementation (swipe with tap/keyboard fallback for accessibility) and confirmation dialog design.
- Conflict message wording when admin and driver race (one applies, the other gets 409 + current state).
- Exact Chatwoot delivery for the no-show alert and the admin banner placement.
- Structure of `booking_status_log` columns and the completion-event mechanism (outbox row vs log row) as long as it fires exactly once.

### Deferred Ideas (OUT OF SCOPE)
- **Full driver cabinet** (driver login/accounts, ride list Upcoming/Past, Offers tab, "You" profile, documents, help) — ROADMAP Phase 94.
- Theme toggle / dark mode for the driver page.
- Driver UI in other languages.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PAYF-02 | All status changes go through one status service with compare-and-set, so a stale or double action is rejected | §Writer inventory (every `bookings.status` writer with file:line), §Pattern 1 (RPC CAS), §Pattern 2 (trigger-enforced log), §Grep gate |
| DRV-01 | Single "next step" button, strict order en route → on site → on board → completed | §Driver step contract (`nextStepFor`), §Driver page, §Pitfall 3 |
| DRV-02 | Each driver step updates booking status in admin immediately | §Pattern 3 (driver wrapper calls service), `admin_search_bookings` uses `to_jsonb(paged.*)` so new columns flow with no RPC change |
| DRV-03 | "Completed" asks confirmation; triggers capture later; driver never enters an amount | §Completion event (log row + `completed_at` + `emitBookingCompleted` seam), zod strict schema has no amount field |
| DRV-04 | Skipped step rejected; repeated tap harmless | §Driver step contract (200 replay / 409 stale), CAS, unique partial index |
| DRV-05 | GNet driver steps pushed automatically without duplicates; no money path for GNet | §GNet (idempotent claim, mapping fallback), §Partner marker |
</phase_requirements>

## Summary

The inline PATCH status branch (`app/api/admin/bookings/route.ts:342-517`) is the only place today that combines transition validation, payment-link deactivation, emails, the QStash reminder and the GNet push. It does **not** use compare-and-set (plain `.update().eq('id')`), it has **no log**, and two other admin routes (`cancel/route.ts:105,116`, `[id]/assign/route.ts:94`) write `status` on their own with *different* side-effect sets. Six more places write `bookings.status` outside the admin routes (Stripe webhook refund-cancel and reconcile, GNet farm-in cancel, payment-link route, `lib/supabase.ts` reconcilers). The service must be introduced in two steps: (A) a pure extraction with the existing tests green, then (B) CAS + log + new statuses + driver flow.

The status vocabulary is hard-coded in **at least 17 places** (TS + SQL + CRM infra + admin UI). Two are not in the ARCHITECTURE.md checklist and will fail loudly in production if missed: `infra/espocrm/lib/booking-map.mjs` + `lib/customer-mapping.ts` (an unknown status makes `rowToBooking` throw `unknown_status`, so every driver tap on a booking would enqueue a failing `sync.booking` row) and `infra/espocrm/fields.json` (EspoCRM enum options). Four existing tests pin the **old 8-value lists to migration 053 / 080 / 081 text** and will break or silently go stale when migration 084 redefines the functions; parity tests must read the *latest* definition of each SQL object.

Recommended core design: one SECURITY DEFINER RPC `advance_booking_status` does the CAS `UPDATE … WHERE id AND status = p_from` and sets a transaction-local actor; a `AFTER UPDATE OF status` trigger writes `booking_status_log` for **every** writer (so the log cannot be bypassed by a legacy path), and a partial unique index on the log guarantees exactly one `completed` event per booking. The driver route becomes a thin wrapper (token → `driver_assignments` lookup → `advanceBookingStatus`) that never touches `bookings` directly. GNet: the public GRiDD help page types `status` as a free-form `xs:string` with no enumeration, so D-22's fallback applies (push nothing for `on_board`/`no_show`); make the push idempotent with a conditional claim on `gnet_bookings`.

**Primary recommendation:** Plan in this order: (0) characterization tests for the current PATCH/cancel/assign/GNet behaviour → (1) pure extraction of `advanceBookingStatus()` with no behaviour change → (2) migration 084 (applied by the orchestrator) + vocabulary file + fan-out edits + parity tests → (3) CAS/log/completion seam in the service → (4) driver wrapper route + gate rewrite → (5) driver UI → (6) no-show request + admin banner → (7) GNet idempotency. Use an RPC for CAS (atomic with `completed_at`), not a two-statement conditional update.

## Project Constraints (from CLAUDE.md)

- Type check `npx tsc --noEmit` (baseline: 8 old errors in `tests/` only); lint `npx eslint --quiet <files>` (baseline: `<a>`→`<Link>` errors in both `not-found.tsx`); tests `npx vitest run [files]` (full suite ~90 s); **`vitest related` crashes — grep `tests/` instead**; full gate = the `verify` skill; never run `npm run dev` in Bash (preview_start name `prestigo`).
- No hard-coded `€` prices in `app/` or `components/` (pre-commit enforces). The driver never sees an amount (D-06), so the driver page and the log must carry no price at all.
- No secrets / `.env*` in commits; never read `.env.local`.
- `middleware.ts` matcher must exclude every static/metadata extension. Phase 87 adds **no** static asset, so no matcher change.
- New EN strings in `messages/en.json` need real translations in all locales — **not applicable**: driver page is English-only hard-coded (D-20), admin is EN only (`app/(internal)` is `lang="en"`). Do not add driver strings to `messages/*`. Note `RouteMap` uses `useTranslations('Booking.routeMap')`; it already works on the internal driver page today, keep using it as-is.
- Security work (auth, CSRF, validation, rate limits): run tests, commit with `security:` prefix (this phase is flagged security-relevant).
- Golden-HTML / JSON-LD snapshot tests normalize `priceValidUntil` — not touched.
- Vercel Preview deploys always fail (missing Supabase env) — non-blocking. Merge to `main` = production deploy, so **migration 084 must be live before the code merges** (see §Deploy ordering).
- Memory rules that bind this phase: gsd-executors have **no Supabase MCP** (orchestrator applies migrations + smoke); DROP+CREATE of a SECURITY DEFINER RPC re-grants PUBLIC EXECUTE → always re-`REVOKE … FROM PUBLIC, anon, authenticated` and `GRANT … TO service_role`; never create a Supabase client during render; `getLocale()` forces dynamic rendering (driver page is already dynamic + token-gated, fine); admin API order = size guard → auth → parse (400 vs 422 two-step).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Status vocabulary, transitions, `nextStepFor`, `isPartnerBooking` | Shared pure TS (`lib/booking-status.ts`) | SQL (parity-tested) | One source; no I/O so it is importable by routes, UI, tests |
| Compare-and-set + log + `completed_at` | Database (RPC + trigger) | API (service) | Atomicity and "cannot be bypassed" belong in Postgres; TS cannot make UPDATE+INSERT atomic through PostgREST |
| Transition validation, side effects (emails, link deactivation, QStash, GNet) | API / Backend (`lib/booking-status-service.ts`) | — | Needs secrets/Stripe/Resend; runs in `after()` |
| Driver step authorization (token → assignment → booking) | API / Backend (token-gated route) | — | Bearer UUID; never the browser |
| Start gate (`pickup − 2h − travel`) and no-show threshold | API / Backend (authoritative) | Browser (display only) | Server must reject early taps; UI only shows locked label |
| Slide-to-advance, confirm dialog, countdown label | Browser / Client | — | Pure interaction; sends request only after confirm |
| Map, km/min estimate | Browser / Client (Google Maps JS already loaded by `RouteMap`) | API (fallback `distance_km`) | Existing key + loader are client-side |
| Admin banner "No-show requested", status chip | Browser (admin) | API (`/api/admin/bookings/[id]/no-show`) | Operator-only action through the service |
| Completion event | Database fact (`completed_at` + log row) | API seam (`emitBookingCompleted`) | Phase 88 consumes; must survive a dead `after()` |
| Operator alert (no-show) | API → email (Resend) now; Chatwoot via outbox only | Async dispatcher | Isolation guard forbids Chatwoot/Espo calls on a request path (see Pitfall 8) |

## Standard Stack

### Core (all already in the repo — no new dependencies)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| next | ^16.2.3 [VERIFIED: package.json:34] | App Router, `after()` for post-response side effects | Already used by the PATCH route |
| @supabase/supabase-js | ^2.101.0 [VERIFIED: package.json:25] | Service client, `.rpc()` | `.rpc()` pattern already used (`lib/outbox.ts:206`, `lib/panel-bookings.ts:86`) |
| zod | ^4.3.6 [VERIFIED: package.json:48] | Strict request schemas | Existing route convention |
| vitest | ^4.1.1 (4.1.5 installed) [VERIFIED: `npx vitest --version`] | Tests | Existing |
| @googlemaps/js-api-loader | ^2.0.2 [VERIFIED: package.json:17] | Map on driver page via `RouteMap` | Existing, same key |

### Supporting
| Library | Purpose | When to Use |
|---------|---------|-------------|
| `lib/rate-limit.ts` (`checkRateLimit`) | Per-IP sliding window | Driver route; add LIMITS key if the route path changes |
| `lib/email-log.ts` (`logEmail`) + `lib/email.ts` | Dedup + Resend | Status emails, operator no-show alert |
| `lib/panel-bookings.ts` `pickupInstantMs` | DST-correct Prague wall-clock → instant | Start gate and no-show threshold (extract to `lib/prague-date.ts`) |
| `lib/geo-distance.ts` `haversineDistanceKm` | Fallback travel estimate | Maps call fails |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| RPC for CAS | PostgREST conditional `.update().eq('id').eq('status',prev).select('id')` | Single statement is atomic for the row (see Pattern 1), but `completed_at`, patch fields and the log row would be separate statements; a crash between them loses the "who/when" record. RPC is one transaction. |
| Trigger-written log | RPC-written log | RPC-only log misses the 6 legacy direct writers until each is migrated; trigger logs everything with actor `system` by default |
| Google Distance Matrix API | Routes API `computeRoutes` (already used server-side in `app/api/calculate-price/route.ts:260`, key `GOOGLE_MAPS_API_KEY`) | Reuse the existing integration + key; Distance Matrix is the legacy product |

**Installation:** none. **Version verification:** nothing new is installed; versions above read from `package.json`.

## Package Legitimacy Audit

No external packages are added by this phase (verified: every import in the recommended design resolves to an existing dependency in `package.json` or an in-repo module).

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| — | — | — | — | — | — | No installs |

**Packages removed due to [SLOP] verdict:** none. **Packages flagged [SUS]:** none.
Do **not** add a slider/gesture library: the slide control is ~80 lines with pointer events plus a keyboard/tap fallback; a new dependency would also trigger the npm-install-blocked-in-subagents gotcha (memory).

## Architecture Patterns

### System Architecture Diagram

```
 Driver phone (permanent link /driver/trip/<trip_token>)
   │ GET page (server component, token lookup, read-only)           │ POST /api/driver/trip/<token>/progress
   ▼                                                                ▼
 trip page ── status? ── terminal(completed) ──► "Trip completed" (no PII, no amount)   middleware: CSRF Origin check (/api/driver/trip prefix)
          └─ active ────► TripScreen (map, sheet, SlideToAdvance, ConfirmDialog)        route: size guard → rate limit → uuid → zod strict
                                                                                              │
                                                                                              ▼
                                                                         lookup driver_assignments(trip_token) + bookings(status, driver_id, pickup…)
                                                                         assignment.driver_id == booking.driver_id ? assignment.status != 'declined' ?
                                                                                              │ no → 400 invalid_token (uniform)
                                                                                              ▼
                                                              driver step wrapper (lib/driver-trip-step.ts)
                                                                step === nextStepFor(status)?  ── status already == target → 200 replay (no write, no log)
                                                                start gate (en_route only)? ── too early → 409 too_early + unlocksAt
                                                                no-show gate (request_no_show)? ─ too early → 409
                                                                         │ stale/skipped → 409 {currentStatus, nextStep}
                                                                         ▼
 admin PATCH ─┐                                         lib/booking-status-service.ts  advanceBookingStatus()
 admin cancel ─┼───────────────────────────────────►     1 read booking  2 validate (VALID_TRANSITIONS | driver steps)
 admin assign ─┤                                         3 RPC advance_booking_status(p_from)  ──► Postgres txn:
 no-show ack ─┘                                              UPDATE bookings … WHERE id AND status = p_from   (0 rows → applied=false → 409)
                                                              set_config(actor) ► AFTER UPDATE OF status trigger ► booking_status_log row
                                                              completed_at = now() on →completed ► partial UNIQUE (one completed event)
                                                          4 if applied: after(): emails (flag+logEmail), link deactivate, QStash,
                                                              GNet push (claim-by-conditional-update), emitBookingCompleted(partner flag)
                                                          5 driver only: driver_assignments.trip_progress (back-compat mirror)
                       gnet_bookings.last_push_status  ◄── GNet providerUpdateStatusByResNo (EN_ROUTE/ON_LOCATION/COMPLETE/CANCEL; none for on_board/no_show)
                       Phase 88 payment engine  ◄── reads completed_at / log row (consumer + sweeper live in Phase 88)
 Admin UI: list RPC admin_search_bookings → to_jsonb(row) → new columns (completed_at, no_show_requested_at) arrive with no RPC change
```

### Recommended Project Structure
```
lib/
├── booking-status.ts            # NEW  vocabulary, TERMINAL, VALUE, ACTIVE-CALENDAR sets, driver step map, nextStepFor, isPartnerBooking
├── booking-transitions.ts       # MOD  add on_location→on_board|no_show, on_board→completed|cancelled (still the admin map)
├── booking-status-service.ts    # NEW  advanceBookingStatus(), requestNoShow(), clearNoShowRequest()
├── booking-events.ts            # NEW  emitBookingCompleted() seam (Phase 88 replaces the body)
├── driver-trip-step.ts          # NEW  token→assignment→step wrapper, start gate, no-show gate (pure helpers exported for tests)
├── start-gate.ts                # NEW  unlockAt(), prague-centre travel estimate + cache + fallback
├── gnet-push.ts                 # NEW  claim + push + audit (extracted from PATCH:454-514 and assign:~120-150)
├── trip-token.ts                # MOD  TERMINAL += no_show; split identity-valid vs write-allowed
├── prague-date.ts               # MOD  absorb pickupInstantMs (currently exported from lib/panel-bookings.ts)
app/api/
├── driver/trip/[token]/progress/route.ts   # REWRITE thin wrapper (keep path → keeps CSRF prefix + LIMITS key)
├── admin/bookings/[id]/no-show/route.ts    # NEW  confirm | dismiss (admin guard, CSRF via /api/admin)
app/(internal)/driver/trip/[token]/
├── page.tsx, TripScreen.tsx, SlideToAdvance.tsx, ConfirmStepDialog.tsx, TripCompleted.tsx   # REBUILD, light theme
supabase/migrations/084_booking_statuses_status_log.sql
tests/ …  (see §Validation Architecture)
```

### Pattern 1: CAS in one transaction via RPC
**What:** Postgres executes `UPDATE … WHERE id = $1 AND status = $2` atomically. Under READ COMMITTED, a concurrent updater waits, then "the search condition of the command (the WHERE clause) is re-evaluated … if so, the second updater proceeds" [CITED: postgresql.org/docs/current/transaction-iso.html §13.2.1]. So with `AND status = p_from`, exactly one of two racing writers updates the row; the loser's `UPDATE` matches 0 rows. This makes CAS correct either via PostgREST conditional update **or** inside an RPC; the RPC adds atomicity with `completed_at`, the actor and (via trigger) the log.
**When to use:** every status write.
**Example (skeleton; names are recommendations):**
```sql
-- 084 (excerpt). Pattern of 064 outbox_enqueue / 080 panel_bookings: SECURITY DEFINER, empty search_path.
CREATE OR REPLACE FUNCTION public.advance_booking_status(
  p_booking_id uuid, p_from text, p_to text,
  p_actor_type text, p_actor_id text, p_source text, p_patch jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_row public.bookings;
BEGIN
  PERFORM set_config('prestigo.actor_type', COALESCE(p_actor_type,'system'), true);   -- true = transaction-local
  PERFORM set_config('prestigo.actor_id',   COALESCE(p_actor_id,''),        true);
  PERFORM set_config('prestigo.source',     COALESCE(p_source,''),          true);
  UPDATE public.bookings b SET
      status          = p_to,
      completed_at    = CASE WHEN p_to = 'completed' THEN now() ELSE b.completed_at END,
      operator_notes  = CASE WHEN p_patch ? 'operator_notes'   THEN p_patch->>'operator_notes' ELSE b.operator_notes END,
      driver_price_czk= CASE WHEN p_patch ? 'driver_price_czk' THEN (p_patch->>'driver_price_czk')::integer ELSE b.driver_price_czk END,
      payment_link_url= CASE WHEN p_patch ? 'clear_payment_link' THEN NULL ELSE b.payment_link_url END,
      payment_link_id = CASE WHEN p_patch ? 'clear_payment_link' THEN NULL ELSE b.payment_link_id END
    WHERE b.id = p_booking_id AND b.status = p_from
    RETURNING b.* INTO v_row;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('applied', false,
      'current_status', (SELECT status FROM public.bookings WHERE id = p_booking_id));
  END IF;
  RETURN jsonb_build_object('applied', true, 'previous_status', p_from, 'booking', to_jsonb(v_row));
END $$;
REVOKE EXECUTE ON FUNCTION public.advance_booking_status(uuid,text,text,text,text,text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.advance_booking_status(uuid,text,text,text,text,text,jsonb) TO service_role;
```
The patch keys are an allowlist inside SQL (never `jsonb_populate_record`) so a caller cannot mass-assign `amount_*` or `payment_intent_id`.

### Pattern 2: Log written by a trigger, not by callers
**What:** `AFTER UPDATE OF status ON bookings FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status)` inserts `booking_status_log (booking_id, event='status_change', from_status, to_status, actor_type, actor_id, source)` reading `current_setting('prestigo.actor_type', true)` (NULL → `'system'`). The RPC sets those settings transaction-locally; direct legacy writers (Stripe webhook, GNet farm-in, payment-link, raw SQL by the operator) still get a row, just with `actor_type='system'`.
**Why:** PAYF-02 / success criterion 3 says "every change logged with who made it". A caller-written log is the thing that gets forgotten; a trigger cannot be skipped. Partial unique index `(booking_id) WHERE event='status_change' AND to_status='completed'` plus `INSERT … ON CONFLICT DO NOTHING` in the trigger makes "exactly one completion fact" a DB property.
**Columns (recommended):** `id bigint generated always as identity`, `booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE` (same as `booking_edit_audit_log`, migration 055), `event text NOT NULL DEFAULT 'status_change' CHECK (event IN ('status_change','no_show_requested','no_show_cleared'))`, `from_status text`, `to_status text`, `actor_type text NOT NULL CHECK (actor_type IN ('admin','driver','system'))`, `actor_id text` (admin auth uuid / driver_id / `'stripe_webhook'` / `'gnet'`), `source text`, `created_at timestamptz NOT NULL DEFAULT now()`. RLS enabled with deny-all, `REVOKE ALL … FROM anon, authenticated` (repo convention, ARCHITECTURE.md §Data Model). Index `(booking_id, created_at)`. The log also becomes the evidence trail Phase 89 needs (driver timestamps) and the `on_board` timestamp Phase 91 needs.

### Pattern 3: Driver route is a thin wrapper; the service owns `bookings`
Route does: `enforceMaxBody` → `checkRateLimit('/api/driver/trip/progress', ip)` → uuid token → zod strict → lookup → `driverTripStep(...)` (which calls `advanceBookingStatus`). The route file must contain **no** `.from('bookings')`. Notes (DTRIP-06) stay a plain `driver_assignments` update (unchanged path, no booking write). `trip_progress` mirror is written only after the CAS wins.

### Pattern 4: Pure extraction first (D-01)
Plan A moves PATCH lines 342-517 into `advanceBookingStatus()` **verbatim**: same `from()` call order (select `*` → update → `pricing_globals` → `logEmail` → `after` blocks), same error strings (`Cannot transition from '<a>' to '<b>'`, `Booking not found`, `DB update failed`), same HTTP codes (404/422/500). The existing suites `tests/admin-bookings.test.ts` (PATCH Tests 3-12 + CR-02 at lines 488-680), `tests/gnet-status-push.test.ts`, `tests/admin-assignment.test.ts` are the parity net and must pass **unmodified** after Plan A (only `vi.mock` targets may move). CAS/log arrive in Plan B, where those mocks legitimately change (the bookings mock is `update: () => ({ eq: async () => ({ error: null }) })` — a CAS chain or `.rpc` call will not satisfy it).

### Anti-Patterns to Avoid
- **Two-statement "update then insert log" from TS** — a crash between them breaks "every change logged"; use trigger/RPC.
- **Driver route importing `createSupabaseServiceClient().from('bookings')`** — the rewritten gate (below) forbids it.
- **Sending `last_push_status` only on success** — existing test `STATUS-03 failure` (`tests/gnet-status-push.test.ts:~171-179`) asserts `last_push_status` is `'CONFIRMED'` and `last_push_error` is `'GNet timeout'` on a failed push. Keep recording both; make the idempotency guard `last_push_status = X AND last_push_error IS NULL`.
- **Echoing a GNet-originated cancel back to GNet** (see Pitfall 7).
- **Calling Chatwoot from the driver route** (Pitfall 8).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Atomic CAS + audit | App-level locks / read-modify-write | Postgres `UPDATE … WHERE status=$prev` inside an RPC + trigger | Row lock + WHERE re-check is the documented READ COMMITTED behaviour |
| "Exactly one completion event" | In-memory flag / Redis lock | Partial unique index on the log + `completed_at` | Survives retries, cold starts, parallel lambdas |
| Prague wall-clock → UTC instant (DST) | `new Date(date+time)` | Existing `pickupInstantMs` (`lib/panel-bookings.ts:~160-185`: two-pass offset correction, rejects impossible dates) — move to `lib/prague-date.ts` | Handles 2026-03-29 02:30 (skipped) and 2026-10-25 02:30 (repeated); already covered by `tests/customer-mapping-parity.test.ts` fixtures |
| Rate limiting | New limiter | `checkRateLimit` | Sliding window already atomic via Lua |
| Email dedup | New table | `logEmail` | Existing 10-minute dedup |
| Status chip colours | New CSS | `components/admin/StatusBadge.tsx` (already declares `on_board`, `no_show`, `arrived`) + `--status-*` tokens in `admin-theme.css` | Phase 86 D-17 |
| Slide gesture library | npm package | ~80-line pointer-events component with `role="button"` + Enter/Space + tap-and-hold fallback | No new dependency; accessibility is a locked-in discretion area |
| Maps | New map | `RouteMap` (cream styles already match the light theme) + optional `onRouteInfo` callback exposing `result.routes[0].legs[0].distance/duration` | Same key and loader; Google logo stays (ToS) |

**Key insight:** every hard part (race, DST, idempotency, audit) already has a Postgres- or repo-level primitive; the risk in this phase is *fan-out and parity*, not algorithms.

## Writer inventory: every place that writes `bookings.status` (read this session)

| # | Location | What it does | Disposition in Phase 87 |
|---|----------|--------------|--------------------------|
| W1 | `app/api/admin/bookings/route.ts:342-387` (PATCH) | select `*` → `VALID_TRANSITIONS` check (422) → plain update (+ `operator_notes`, `driver_price_czk`, stale payment-link clear) → emails (flags `confirmed`/`cancelled`/`completed`, `logEmail`) → QStash 2 h reminder on `confirmed` → GNet push `after()` (lines 454-514) | **Extract (Plan A)**, then CAS (Plan B) |
| W2 | `app/api/admin/bookings/cancel/route.ts:105,116` | Stripe refund first (full or per-leg), then `.update({status:'cancelled'})`. **No email, no link deactivation, no GNet push** (UI text at `components/admin/BookingsTable.tsx:2788` claims a GNet CANCEL push that this route does not perform) | **Route through service** with a `sideEffects: 'cancel-route'` profile that preserves today's behaviour; the missing GNet CANCEL is an Open Question |
| W3 | `app/api/admin/bookings/[id]/assign/route.ts:94` (+ push 108-150) | `confirmed→assigned` with `driver_id`; reassign writes `driver_id` only; first-assign GNet `ASSIGNED` push | **Route through service** (`driver_id` as patch field); fold the push |
| W4 | `app/api/driver/trip/[token]/progress/route.ts` | Today writes only `driver_assignments.trip_progress` | **Rewrite** (Pattern 3) |
| W5 | `app/api/webhooks/stripe/route.ts:479-481` | `unpaid→confirmed` conditional on `status='unpaid'` (already CAS-style) | Keep; trigger logs it as `system`. Optional migrate |
| W6 | `app/api/webhooks/stripe/route.ts:928,941,955,1004,1016,1031` (`handleChargeRefunded`) | Unconditional `→ cancelled` (even from `completed`; bulk `.eq('payment_intent_id', pi)` for round trips) | **Do not route through strict service** (would change behaviour); trigger logs it. Add to the grep-gate allowlist with reason |
| W7 | `app/api/gnet/farmin/route.ts:239` | GNet-originated cancel `→ cancelled` | Keep as allowlisted system writer (must not echo CANCEL to GNet) |
| W8 | `app/api/admin/bookings/[id]/payment-link/route.ts:118,220` | Sets `status:'unpaid'` directly with the link (bypasses `VALID_TRANSITIONS`, documented at lines 13, 201) | Keep; allowlist with reason |
| W9 | `lib/supabase.ts:162,186,307` (+ `.eq('status','unpaid')` at 165,188,258,283,309) | reconcilers `unpaid→confirmed`; `buildBookingRow` inserts `unpaid`/`confirmed` | Keep; allowlist |
| — | `app/api/cron/reminder-24h/route.ts:58` | reads `.in('status',['confirmed'])` only | no change |

`app/api/admin/flight-refresh/route.ts:62` updates `bookings` but only flight fields (not status).

**Grep gate (replaces DTRIP-04):** a new `tests/status-writers-gate.test.ts` scans `app/` and `lib/` for `.update(` payloads that contain a `status:` key on a `bookings` query and fails unless the file is in an allowlist with a ≥20-char reason (same shape as `VPS_ASYNC_ALLOWLIST` in `tests/infra-vps-isolation-guard.test.ts`). Allowlist = W5-W9 + the service itself. Plus a driver-specific gate: `app/api/driver/trip/**/route.ts` must import `@/lib/booking-status-service` (or `@/lib/driver-trip-step`) and must not contain `.from('bookings')`. The three `ISOLATION` tests in `tests/driver-trip-progress.test.ts` (lines 170, 184, 243: `expect(stubSupabaseFrom).not.toHaveBeenCalledWith('bookings')`) are **replaced**, not deleted.

## Status vocabulary fan-out (all verified by opening the file)

Current CHECK list, quoted verbatim [VERIFIED: supabase/migrations/053_unpaid_booking_status.sql:21-30]:
```
CHECK (status IN (
    'unpaid',
    'pending',
    'confirmed',
    'completed',
    'cancelled',
    'assigned',
    'en_route',
    'on_location'
  ));
```
New values per D-03/D-08/D-09: `on_board`, `no_show`. Constraint name is `bookings_status_check` [VERIFIED: 053:17,20].

| # | Location | Current (verbatim) | Change |
|---|----------|--------------------|--------|
| F1 | `supabase/migrations/084` (new) | — | DROP+RECREATE `bookings_status_check` with 10 values |
| F2 | `lib/booking-transitions.ts:11` `VALID_TRANSITIONS` | `unpaid: ['confirmed','cancelled']`, `pending: ['confirmed','cancelled']`, `confirmed: ['assigned','completed','cancelled']`, `assigned: ['en_route','cancelled','completed']`, `en_route: ['on_location','cancelled','completed']`, `on_location: ['completed','cancelled']`, `completed: []`, `cancelled: []` | `on_location: ['completed','cancelled','on_board','no_show']`, `on_board: ['completed','cancelled']`, `no_show: []` (keep all existing admin shortcuts → "behave exactly as before") |
| F3 | `lib/trip-token.ts:16` | `new Set(['completed', 'cancelled'])` | add `'no_show'` (D-09) |
| F4 | SQL `booking_lead_status()` `067:~37-52` | `WHEN 'unpaid' THEN 'new' … WHEN 'cancelled' THEN 'dead' ELSE NULL` | add `on_board`, `no_show` → `'converted'` via `CREATE OR REPLACE`; re-run REVOKE/GRANT (067:155,159) |
| F5 | `lib/lead-mapping.ts:52` `BOOKING_LEAD_STATUS` | 8 keys, `cancelled: 'dead'` | add both → `'converted'`; test `tests/lead-mapping.test.ts:163-165` ("has exactly the 8 statuses of migration 053") must change to 10 |
| F6 | SQL gcal trigger `063:60` | `ARRAY['confirmed','assigned','en_route','on_location','completed']` | add `on_board`, `no_show` (so the event is kept/updated, not deleted; `no_show` stays on the calendar like `completed`); `CREATE OR REPLACE FUNCTION public.notify_booking_gcal_sync()` + re-REVOKE (063:~95) |
| F7 | `lib/google-calendar.ts:19` `CALENDAR_ACTIVE_STATUSES` | same 5 | same additions; line 169 `colorId: b.status === 'completed' ? '8'` → also grey for `no_show` |
| F8 | SQL `panel_bookings()` `080:174` | `AND b.status IN ('confirmed', 'assigned', 'en_route', 'on_location', 'completed')` (inside a ~200-line plpgsql fn, lines 39-245) | `CREATE OR REPLACE` the **whole** function in 084 with `on_board` added to the value list; `no_show` NOT in value list (D-11); keep `b.status <> 'cancelled'` (line 160) so `no_show` still counts as a trip |
| F9 | `lib/panel-bookings.ts:23` `PANEL_VALUE_STATUSES` | same 5 | add `on_board` only; `paymentState()` (line ~106) needs no change (`no_show` falls to `'paid'` — decide: should a no-show show a "paid" badge? it was never charged → recommend returning `'awaiting_payment'`-neutral; see Open Q5); `buildPanelResponse` `isUpcoming` (line ~228) treats `no_show` as past (add `!== 'no_show'`) |
| F10 | SQL `stats_trips()` `081:182` | `AND b.status IN ('confirmed', 'assigned', 'en_route', 'on_location', 'completed');` | `CREATE OR REPLACE` in 084 (function is lines 137-183, SECURITY DEFINER STABLE; header comment at 081:17-19 says "The status list lives in stats_trips() only"); add `on_board`; exclude `no_show` (D-11). 082/083 do not repeat the list (081 comment, `tests/stats-customers-b2b-migration.test.ts:137` asserts `m082` has no `'on_location'`) |
| F11 | `lib/chatwoot-mapping.ts:28` `VALUE_STATUSES` | `new Set(['confirmed','assigned','en_route','on_location','completed'])` | add `on_board`; `no_show` excluded (consistent with D-11) but still a trip (`tripsOf`, line ~41, filters only `cancelled`); `tests/chatwoot-mapping.test.ts:124` extend |
| F12 | `lib/customer-mapping.ts:60` `BOOKING_STATUS_VALUES` | 8 values | add both (**else `booking_unmapped` → CBooking skipped**, line 203) |
| F13 | `infra/espocrm/lib/booking-map.mjs:16` `BOOKING_STATUS_VALUES` (+ throw at line ~289) | 8 values | add both; `tests/espocrm-booking-map.test.ts:331-336` currently asserts `map.BOOKING_STATUS_VALUES` **equals the list in migration 053** → rewrite to read the latest migration containing `bookings_status_check` |
| F14 | `infra/espocrm/fields.json:61-70` | `"options": [8 values]` + `translatedOptions` | add `on_board: "On Board"`, `no_show: "No-Show"`; `tests/espocrm-model.test.ts:532,610` compare to `BOOKING_STATUS_VALUES`. **Live EspoCRM metadata then needs `node infra/espocrm/sync.mjs --only fields` run by the owner (VPS step)**; until then Espo may reject the new enum value on CBooking sync |
| F15 | `app/api/admin/bookings/route.ts:30` `KNOWN_STATUSES` and `:97` zod `status` enum | 8 values each | add both |
| F16 | `components/admin/BookingsTable.tsx:~91` `STATUS_LABELS`, variant casts at 1494/1891/2414, `isTerminal` at 256 (`completed`\|\|`cancelled`), transitions UI at 1813 (`UI_TRANSITIONS`) | 8 labels | add labels `On Board`, `No-Show`; treat `no_show` as terminal at 256; casts become the shared type |
| F17 | `app/(internal)/admin/(dashboard)/accounts/[id]/page.tsx:38,163`; `lib/panel-dto.ts:55-80`; `app/embed/chatwoot-dashboard/BookingCard.tsx:57` `STATUS_HUES` | label/hue maps | add both (BookingCard currently maps progress `on_board→'assigned'`, `no_show→'cancelled'` hues; with real statuses use own hues) |
| F18 | `components/admin/DriverAssignmentSection.tsx:113` | hides for `completed`\|\|`cancelled` | also hide for `no_show` |
| F19 | `statusToFlagKey` (route.ts:409) | `confirmed`, `cancelled`, `completed` only | no new keys; `on_board`/`no_show` send no client email (verify intent: matches ARCHITECTURE "notification flags" row) |
| F20 | `lib/gnet-client.ts:118` `PRESTIGO_TO_GNET_STATUS` | `confirmed/assigned/en_route/on_location/completed/cancelled` | **unchanged** (D-22 fallback → `prestigoToGnetStatus('on_board')` and `('no_show')` return `null`); add explicit tests pinning `null` |
| F21 | SQL `admin_search_bookings` p_status | equality `b.status = p_status` (071) | no change; `KNOWN_STATUSES` whitelist is the gate |

**Existing tests pinned to old lists (will break or go stale):** `tests/lead-mapping.test.ts:163-165`, `tests/espocrm-booking-map.test.ts:331`, `tests/customer-mapping-parity.test.ts` (fixture list at ~line 72-74 `['unpaid',…,'on_location']`), `tests/stats-migration.test.ts:40` (`const PAID = …` and it only loads 081), `tests/panel-bookings-migration.test.ts:164` (regex over 080), `tests/chatwoot-mapping.test.ts:124`, `tests/espocrm-model.test.ts:532,610`, `tests/StatusBadge.test.tsx`. Because 084 redefines functions by `CREATE OR REPLACE`, text-level tests on 080/081 keep passing while verifying a **dead** definition. Add a helper `latestFunctionBody(name)` that scans `supabase/migrations/*.sql` in filename order and returns the last definition; the new parity test uses it for `booking_lead_status`, `notify_booking_gcal_sync`, `panel_bookings`, `stats_trips` and for the `bookings_status_check` list, then compares to `lib/booking-status.ts`.

## Driver step contract (D-12, D-13, D-14, D-15)

```
status        nextStep(UI label)        target status
assigned      en_route  "On my way"     en_route
en_route      on_site   "I have arrived" on_location
on_location   on_board  "Passenger on board"  on_board        (+ request_no_show action once threshold passed)
on_board      completed "Complete trip" completed
others        none (confirmed/pending/unpaid: "not ready"; terminal: completed/cancelled/no_show)
```
Server algorithm (`driverTripStep`): 1) resolve assignment+booking, require `assignment.driver_id === booking.driver_id` and `assignment.status !== 'declined'` (today a driver who declined keeps a working link — see Pitfall 6); 2) `if (booking.status === TARGET[step]) return 200 {ok, replay:true}` (no write, no log, no side effect) — this must happen **before** the terminal-status rejection, otherwise a retried `completed` returns 400; 3) `if (step !== nextStepFor(booking.status)) return 409 {error:'step_conflict', currentStatus, nextStep}`; 4) start gate for `en_route`: `now < unlockAt` → 409 `{error:'too_early', unlocksAt}`; 5) `advanceBookingStatus({to, expectedFrom, actor:{type:'driver', id: driver_id}, source:'driver_trip'})`; `applied:false` → 409 with the fresh status (this is the "admin cancelled at the same moment" case: the loser gets a clear message, the winner's change stands); 6) mirror `trip_progress` (`on_site → 'arrived'`, others identity) on `driver_assignments`.
Request schema (zod strict): `{ step: 'en_route'|'on_site'|'on_board'|'completed' } | { action: 'request_no_show' } | { note: string }` — **no amount, no status field** (DRV-03/D-06). Keep the existing `.max(2000)` note cap and `enforceMaxBody(request, 10000)`.
Response contract the UI relies on: always return `{ ok, status, nextStep, unlocksAt? }` so the client re-renders from server truth; on 409 the client refetches state and shows "The trip was updated by the office — showing the latest step."

**Terminal handling vs D-09/D-17 (apparent conflict):** D-09 says the link "dies" at `no_show`/completed/cancelled; D-17 says re-opening after completion shows "Trip completed" with details hidden. Resolve as: `isTripLinkValid` keeps meaning *may write* (non-terminal + driver match); introduce `tripLinkViewState(assignment, booking)` → `'active' | 'completed' | 'ended'` where `completed` renders the summary-less screen, and `cancelled` / `no_show` / reassigned / unknown token render the existing uniform "This trip link is no longer active." (anti-enumeration D-11 of v2.2 preserved: the unknown-token and terminal-ended views must stay indistinguishable; the `completed` view reveals only that a trip with this token was completed — acceptable and requested). Recommend `no_show` and `cancelled` → "ended" (not "completed").

### Start gate (D-14) — recommended definition (Claude's discretion)
`unlockAt = pickupInstant − 120 min − travelMin`, `pickupInstant = pickupInstantMs(row)` (UTC ms; no timezone arithmetic on strings). `travelMin = 0` if the pickup is within 5 km of Prague centre (reference point Old Town Square ≈ 50.0875, 14.4208, radius 5 km — both **[ASSUMED]**, put in `lib/start-gate.ts` constants), else Routes API `computeRoutes` from the centre to `origin_lat/lng` (same call shape as `app/api/calculate-price/route.ts:260-291`, field mask `routes.duration`, parse the `"…s"` protobuf string), cached per `(bookingId, origin_lat, origin_lng)` in module memory for the lambda lifetime, fallback `ceil(haversine * 1.4 / 45 km/h * 60)` on any error/timeout (use `lib/geo-distance.ts`). Missing coordinates → `travelMin = 0`. Cap `travelMin` at 240. Never block the driver because Maps is down: the fallback always returns a number. Test with fixed instants around 2026-03-29 and 2026-10-25 (DST) using the existing fixtures' dates.
Airport vs city for D-15: `isNearAirport` is a private function in `app/api/calculate-price/route.ts:53` (PRG 50.1008/14.26, ±0.027°). Extract to `lib/airport.ts` and reuse; bookings have no stored airport flag (`isAirport` is only a request field in `create-payment-intent`), so decide airport from `origin_lat/lng` (fallback: `origin_address` matches `/airport|letiště|PRG/i`).

### No-show request (D-15, D-16)
- Settings: add to `pricing_globals` (migration 058 pattern: `ADD COLUMN … NOT NULL DEFAULT … CHECK`) `noshow_wait_city_min integer NOT NULL DEFAULT 30 CHECK (> 0)` and `noshow_wait_airport_min integer NOT NULL DEFAULT 60 CHECK (> 0)` (names are recommendations). Surface in `/api/admin/settings` (zod at `app/api/admin/settings/route.ts:11-17`, select at :29) and the Settings page (`app/(internal)/admin/(dashboard)/settings/page.tsx`). Phase 88 notes say the ARCHITECTURE migration 085 will add other `pricing_globals` columns — keep the two names distinct.
- Request: `action:'request_no_show'` → server requires `status==='on_location'`, `now ≥ max(pickupInstant, on_location log timestamp) + threshold`, `no_show_requested_at IS NULL`; sets `bookings.no_show_requested_at = now()` **inside `lib/booking-status-service.ts`** (so the driver route still has no `bookings` write) and inserts a `no_show_requested` log row; **no status change, no money**.
- Alert: (a) admin banner from `no_show_requested_at` (arrives through `to_jsonb` with no RPC change) with buttons → `POST /api/admin/bookings/[id]/no-show {action:'confirm'|'dismiss'}` (confirm = `advanceBookingStatus(to:'no_show', actor admin)` from `on_location`; dismiss = clear flag + `no_show_cleared` log row); (b) operator email via Resend (`logEmail` dedup key `no_show_request:<bookingId>`) — works on a request path. A Chatwoot/WhatsApp message is only possible through the outbox (Pitfall 8) and is a separate optional task; WhatsApp channels are parked (STATE: Phases 78/79 → backlog 999.9/999.12).

## GNet (D-04, D-05, D-22) — research result

- Endpoint documented on the public GRiDD help page: `POST …/Platform.svc/providerUpdateStatusByResNo/{griddid}/{resno}/{version}`, "Providers that received reservations from Affiliate Partners or Distribution channels use this service to send real-time status updates" [CITED: https://api.grdd.net/Platform.svc/help]. The operation page lists the request object `statusUpdateObj` (fields `status`, `totalAmount`, `resNo`, `griddID`, `note`, `lat`, `lon`, `UTCtimestamp`, `LocalTimestamp`, `transactionId`, `requesterResNo`, plus `chauffeur`, `vehicle`, `fees[]`) and types `status` as a plain `xs:string` with **no enumeration or per-value description** [CITED: https://api.grdd.net/Platform.svc/help/operations/providerUpdateStatusByResNo]. Searches of Limo Anywhere's KB (which maps operator statuses to GNet) returned no GNet status-code list. **Conclusion: GNet semantics for `on_board` and `no_show` cannot be confirmed from public sources → confidence LOW → apply the D-22 fallback** (push nothing for either). The existing client posts `{ status, totalAmount, resNo, griddID }` (`lib/gnet-client.ts:42-51`), consistent with the documented body. `fees[]` and `note` exist on the wire but are out of scope and unverified.
- Make this a one-line future change: keep `PRESTIGO_TO_GNET_STATUS` as the only mapping and test `prestigoToGnetStatus('on_board') === null` and `('no_show') === null`; raise "ask GRiDD support whether `ON_BOARD`/`NO_SHOW` (or `POB`) are accepted" as an owner action (Open Question 2).
- **Idempotency design (D-04):** the CAS winner is the only caller that pushes, so two concurrent taps cannot both push. Retap/retry safety needs a second guard because the push runs in `after()` and can fail: before pushing, claim with a conditional update on `gnet_bookings`:
  `UPDATE gnet_bookings SET last_push_status=$X, last_push_error=NULL, last_pushed_at=now() WHERE id=$id AND (last_push_status IS DISTINCT FROM $X OR last_push_error IS NOT NULL)` → proceed only if a row was claimed; on failure write `last_push_error` (keeping `last_push_status = X` as today's tests require). A replayed driver step (200, no status write) may call the same push helper, which then retries only a failed push (error set) and skips a successful one. `gnet_bookings` columns verified [VERIFIED: supabase/migrations/039_gnet_bookings.sql:20-33]: `id, booking_id, gnet_res_no, transaction_id, raw_payload, last_push_status, last_push_error, last_pushed_at, created_at`.
- **Fold-in:** one helper `pushGnetForTransition(booking, newStatus, {origin})` replaces the copies at `route.ts:454-514` and `assign/route.ts:~108-150`; `origin:'gnet'` (farm-in cancel) skips the push (Pitfall 7).
- **Partner marker (D-05) in Phase 87:** no money path exists yet, so "marked as partner" = (a) single predicate `isPartnerBooking(b) = b.booking_source === 'gnet'` in `lib/booking-status.ts` (the `bookings_booking_source_check` allows `'online','manual','gnet'`, 039:15-17); (b) `emitBookingCompleted({ bookingId, partner: boolean, … })` always carries it and a test asserts `partner:true` for gnet; (c) export `assertMoneyEligible(booking)` that throws for partner bookings, to be called by every Phase 88/89 money entry point. Do **not** add `payment_mode` here (ARCHITECTURE puts it in migration 085, Phase 88; its backfill `booking_source='gnet' → 'partner'` already planned there).

## Completion event (D-06)
Durable fact = `bookings.completed_at` (set by the RPC only on the CAS that moves to `completed`) + the unique `status_change/completed` log row. In-process signal = `emitBookingCompleted()` called from `after()` exactly when `applied === true && to === 'completed'`, from **any** actor (admin `PATCH` to completed also counts — otherwise capture would silently skip admin-completed trips). Phase 88 consumes it and must also run a sweeper over `completed_at IS NOT NULL` rows (a dead `after()` must not lose a capture); say so in the Phase 87 summary for Phase 88's planner. `completed` also triggers the existing client post-trip email (`sendPostTripEmail`, route.ts:438-441) — **new behaviour**: previously only an admin could complete; now a driver tap sends the client email (no undo window, D-13).

## Deploy ordering and runtime state
No rename. State that matters at deploy: (1) **Migration 084 must be applied live before the code merges** (merge to `main` = prod deploy; executors have no Supabase MCP, orchestrator applies and smokes it). 084 is purely additive for old code (wider CHECK, new table/columns/functions), so applying it first is safe; the reverse order makes every `on_board`/RPC write fail. (2) In-flight bookings at deploy: assignments may carry `trip_progress` (e.g. `en_route`) while `bookings.status` is still `assigned`; strict order makes the driver tap the first step again — acceptable, document it (PITFALLS C7). (3) `completed_at` is NULL for historic completed rows; consumers must treat NULL as "unknown", not "not completed". (4) EspoCRM CBooking enum needs the owner `sync.mjs` run (F14). (5) Re-run REVOKE/GRANT for every re-created SECURITY DEFINER function in 084: `booking_lead_status` (067:155,159), `notify_booking_gcal_sync` (063), `panel_bookings(text,text,bigint)` (080:246-247), `stats_trips()` (081:396,401), plus the new RPC.

## Common Pitfalls

### Pitfall 1: Replay of `completed` returns 400 because the link is terminal
**What goes wrong:** `isTripLinkValid` returns false once `completed` (lib/trip-token.ts:16), so a retried "complete" after a flaky network gets `invalid_token`. **Why:** the validity predicate conflates "token identifies this driver" with "writes still allowed". **Avoid:** do the replay check (status == target) before the terminal gate; add `tripLinkViewState`. **Warning sign:** driver sees "link no longer active" right after finishing.

### Pitfall 2: Rate-limit key typo silently disables the limiter
`checkRateLimit` returns `{allowed:true}` for any pathname not in `LIMITS` (`lib/rate-limit.ts:35-36`). The key is `'/api/driver/trip/progress'` (line 33, value 20). Renaming the route without adding a key = no rate limit, and `tests/driver-trip-progress.test.ts:194-200` asserts the literal key. **Avoid:** keep the path and key, or add a new `LIMITS` entry and keep the assertion.

### Pitfall 3: CSRF prefix is path-based
`'/api/driver/trip'` is in `CSRF_PROTECTED_PREFIXES` (middleware.ts:18) but not in `CSRF_STRICT_ORIGIN_REQUIRED` (middleware.ts:31-34 lists only `/api/admin` and `/api/create-payment-intent`), so a request with no `Origin` passes. That is acceptable: the credential is a URL token, not an ambient cookie, so classic CSRF has nothing to ride. Keep the route under `/api/driver/trip/**`; a new top-level path (e.g. `/api/driver-step`) would be **unprotected**. Add the new admin route under `/api/admin/…` (already strict).

### Pitfall 4: Parity tests that read old migration files
See "Existing tests pinned to old lists". Use `latestFunctionBody()`; otherwise green tests verify an obsolete definition while production runs 084.

### Pitfall 5: Existing mocks assume `update().eq()` and a fixed `from()` order
`tests/admin-bookings.test.ts:488-507` mocks `from` as select-then-update with `update → eq` resolving `{error:null}`; `tests/gnet-status-push.test.ts` `buildSupabaseMock` keys by table with `update: () => ({ eq: async … })`; `tests/admin-assignment.test.ts` Test C counts calls ("callCount=7+"). Plan A must keep the call sequence identical; Plan B updates the mocks deliberately (rpc stub already exists: `supabaseServiceStub.rpc`).

### Pitfall 6: A driver who declined still holds a working trip link
`/driver/respond` only sets `driver_assignments.status` (`respond/route.ts:51-57`); `bookings.driver_id` is untouched, so `isTripLinkValid` stays true. With status writes now possible, require `assignment.status !== 'declined'` in the step wrapper (uniform `invalid_token`). Also: multiple assignment rows for one booking (reassign to the same driver) both validate — the CAS makes this harmless.

### Pitfall 7: Echo loop and refund-after-complete
GNet farm-in cancel (`farmin/route.ts:239`) must never trigger a CANCEL push back; refund webhook can turn `completed → cancelled` (W6), which `VALID_TRANSITIONS` forbids — do not route W6 through the strict path.

### Pitfall 8: Chatwoot/Espo from a request path breaks an enforced guard
`tests/infra-vps-isolation-guard.test.ts` fails if any file under `app/`, `components/`, `lib/` reaches `chat./crm.rideprestigo.com`, `CHATWOOT_*`/`ESPOCRM_*` env names, or a chatwoot/espocrm import outside an allowlist of QStash-invoked or operator-token files. The driver route is a public token-gated request path. A Chatwoot message must be an outbox event delivered by the dispatcher (new event type in `lib/outbox.ts` regexes + dispatcher handler in `lib/lead-sync.ts`/`lib/chatwoot-sync.ts`, which are allowlisted). `lib/chatwoot-client.ts` has no "private note / message" helper today (only generic `post`). → email + admin banner first; Chatwoot as an isolated follow-on task.

### Pitfall 9: Side-effect storms
Each status UPDATE fires the gcal `pg_net` trigger (063), the identity/CBooking sync triggers (069) and — only on lead-group change — the lead outbox trigger (067: `on_board`/`no_show` map to the same `converted` group as their neighbours, so **no extra lead rows**). Four driver steps ≈ four calendar syncs; acceptable. Do not add per-tap emails.

### Pitfall 10: `Booking` UI types and `variant` casts
`BookingsTable.tsx` casts `status as 'unpaid'|…|'on_location'` in three places (1494, 1891, 2414); an `on_board` row with an unlisted variant renders an undefined badge family. Replace the casts with the shared type.

### Pitfall 11: Driver page theming
`admin-theme.css` is scoped to `.admin-shell` and imported only by `app/(internal)/admin/layout.tsx:1`; `tests/admin-no-hardcoded-colors.test.ts` scans only `components/admin` and `app/(internal)/admin`. The driver page needs the stylesheet imported in a driver layout and a wrapper `className="admin-shell" data-admin-theme="light"`; keep colours as `var(--admin-*)`/`var(--status-*)` and extend `SCAN_ROOTS` to `app/(internal)/driver`. The current page uses `#f87171`/`#4ade80` literals and dark `--anthracite` tokens — remove.

## Code Examples

### TS service skeleton (shape, not final)
```typescript
// lib/booking-status-service.ts
// Source: derived from app/api/admin/bookings/route.ts:342-517 (current behaviour) + Pattern 1
export type StatusActor =
  | { type: 'admin'; id: string | null }
  | { type: 'driver'; id: string }
  | { type: 'system'; id: string }

export type AdvanceResult =
  | { ok: true; applied: boolean; previous: string; current: string }
  | { ok: false; code: 'not_found' | 'invalid_transition' | 'conflict' | 'db_error'; current?: string; message: string }

// message strings MUST stay byte-identical to today's: `Cannot transition from '${a}' to '${b}'`,
// 'Booking not found', 'DB update failed' (tests/admin-bookings.test.ts:506-520 assert the 422 text).
```
Route mapping: `not_found→404`, `invalid_transition→422`, `conflict→409 {error:'status_conflict', currentStatus, message}`, `db_error→500`.

### Conflict wording (discretion)
Admin loser: "This booking was just changed to <status> by the driver. Reload to see the latest state." Driver loser: "The office has already updated this trip (<status>). Showing the latest step."

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| v2.2: driver progress isolated in `driver_assignments.trip_progress`, route imports no status/GNet (DTRIP-04) | Driver writes `bookings.status` via one service; `trip_progress` mirrored for back-compat | This phase | Gates rewritten, not deleted |
| Inline PATCH logic, no log, no CAS | `advanceBookingStatus` + RPC CAS + trigger log | This phase | Race → 409 |
| `admin_search_bookings` etc. with enumerated status lists | New values flow through `to_jsonb` | — | No RPC change for banner fields |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Prague centre reference = Old Town Square (≈50.0875, 14.4208), radius 5 km | Start gate | Pickups slightly outside/inside get a different unlock time; trivially tunable constants |
| A2 | Fallback travel estimate = haversine × 1.4 at 45 km/h | Start gate | Unlock time off by tens of minutes when Maps is down |
| A3 | Routes API `computeRoutes` (not Distance Matrix) is acceptable for the travel-time call and the existing `GOOGLE_MAPS_API_KEY` server key is authorised for it | Start gate | Already used in `calculate-price`, so low risk; billing/SKU unverified |
| A4 | GNet will not accept `ON_BOARD`/`NO_SHOW` status strings safely (so send nothing) | GNet | If GNet does support them, partner sees fewer updates than possible (safe direction) |
| A5 | `no_show` should keep its Google Calendar event (grey), not delete it | Fan-out F6/F7 | Operator sees/doesn't see no-show trips on the calendar |
| A6 | `no_show` is displayed with a non-"paid" payment badge in the Chatwoot panel | F9 | Cosmetic; owner preference |
| A7 | Thresholds stored as `noshow_wait_city_min` / `noshow_wait_airport_min` in `pricing_globals` | No-show | Naming collision with Phase 89/91 columns if they pick other names |
| A8 | Operator email alert is acceptable as the delivery of D-16(b) for Phase 87 with Chatwoot deferred | No-show | D-16 says Chatwoot/WhatsApp; owner may want it in this phase |
| A9 | In-app WhatsApp/Telegram browsers send `Origin` on same-origin POST (relevant only if strict-Origin were added; recommendation is NOT to add it) | Pitfall 3 | None if left non-strict |
| A10 | `bookings.pickup_utc` can be NULL for some rows (column is not defined in any migration file in the repo), so `pickupInstantMs` fallback is required | Start gate | If always populated the fallback is dead code |

## Open Questions (RESOLVED)

1. **GNet CANCEL on admin cancel route.** `cancel/route.ts` never pushes CANCEL (and sends no email, no link deactivation) although `BookingsTable.tsx:2788` tells the operator it does. Routing it through the service could add a push. What we know: PATCH→cancelled does push. Recommendation: preserve parity in Plan A (profile `cancel-route` = today's effects); raise as an owner-visible behaviour change and fix in Plan B only if approved. **RESOLVED (87-01, 87-03, 87-13):** parity kept. 87-01 Task 2 routes the cancel route through `advanceBookingStatus` with profile `cancel-route` (no GNet CANCEL, no email, no link deactivation, exactly as today); 87-03 Task 2 only adds compare-and-set and the lost-race 409. The behaviour change was not approved for this phase, so it is carried to the owner as an open question in the 87-13 SUMMARY.
2. **Ask GRiDD whether any `ON_BOARD`/`NO_SHOW`-equivalent status is accepted.** Unknowable from public docs. Recommendation: ship the D-22 fallback; owner contacts GRiDD support; one-line map change later. **RESOLVED — accepted risk (87-07, 87-13):** D-22 fallback adopted. 87-07 Task 2 pins `prestigoToGnetStatus('on_board')` and `('no_show')` to null (nothing pushed; operator informs the partner manually for a no-show); the GRiDD support question is carried in the 87-13 SUMMARY. Risk accepted: the partner sees fewer updates than possible (safe direction, A4).
3. **Who sends the Chatwoot no-show message and into which conversation?** No helper exists; needs an outbox event + dispatcher handler. Recommendation: email + banner now; separate plan for Chatwoot, flagged optional. **RESOLVED (87-06, 87-09, 87-12) — recommendation superseded by locked D-16(b):** Chatwoot is in scope, not optional. 87-06 builds the `alert.no_show` outbox event and the dispatcher handler that posts a Chatwoot private note (passenger conversation, operations-conversation fallback), 87-09 enqueues it together with the operator email, 87-12 adds the admin banner. A8 no longer applies.
4. **Dedupe of repeated "Request no-show" taps.** Recommendation: one open request at a time (`no_show_requested_at IS NULL` required); "Client found" clears it and the driver may request again; the operator email is deduped by `logEmail`. **RESOLVED (87-09, 87-12):** adopted as recommended. 87-09 allows one open request at a time (`set_no_show_request` requires no open request; a repeat is a replay with no new alert), the operator email is `logEmail`-deduped per request and the outbox key is per request; "Client found" (`{ action: 'dismiss' }`, 87-09 route, 87-12 UI) clears it so the driver may request again.
5. **Chatwoot panel payment badge for `no_show`** (F9/A6). **RESOLVED (87-04, 87-05):** per A6. 87-04 Task 2 makes `paymentState('no_show', null)` return `awaiting_payment` (`paid` only when `paid_at` is set) and lists `no_show` as past, not upcoming; 87-05 Task 2 gives `no_show` its own danger-family badge hue in the Chatwoot panel.
6. **Sanity gate on `completed`:** PITFALLS C7 suggests rejecting `completed` earlier than N minutes after `on_board`. Not in the locked decisions; D-13 (confirm dialog, no undo) is the stated mitigation. Recommendation: do not add; mention to the owner since capture is irreversible in Phase 88. **RESOLVED — accepted risk (87-13):** no sanity gate is added (not in the locked decisions; D-13 confirm dialog with no undo is the mitigation). The owner note "no minimum on_board-to-completed time; capture becomes irreversible in Phase 88" is carried in the 87-13 SUMMARY.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node | build/tests | ✓ | v24.14.1 | — |
| vitest | all tests | ✓ | 4.1.5 | — |
| Supabase MCP (orchestrator only) | apply migration 084, rolled-back smoke | ✓ for orchestrator, ✗ for executors | — | Orchestrator applies; executors only write the SQL file + text-level tests |
| Postgres concurrency test | real CAS race | ✗ locally | — | Deterministic smoke: call the RPC twice with the same `p_from` in a rolled-back txn; second returns `applied:false` (equivalent outcome) |
| GNet credentials / `api.grdd.net` calls | live push | ✗ (not exercised in tests) | — | Mocked `pushGnetStatus`; manual owner verification on a real GNet booking |
| Google Maps keys | map + Routes | present in env (not read) | — | `distance_km` + haversine fallback |
| EspoCRM / VPS | `sync.mjs --only fields` | owner-run | — | Not blocking merge; blocks CBooking sync of new enum values until run |
| Stripe | none in this phase | n/a | — | `.env.local` Stripe key is a dead placeholder (memory); nothing here calls Stripe except the unchanged cancel refund |

**Missing with no fallback:** none blocking planning.

## Validation Architecture

(Included: `.planning/config.json` has no `workflow.nyquist_validation` key → enabled.)

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.5 (jsdom default; add `// @vitest-environment node` for file-reading tests) |
| Config file | `vitest.config.ts` (globals, alias `@`, setup `tests/setup.ts`) |
| Quick run command | `npx vitest run tests/<file>.test.ts` |
| Full suite command | `npx vitest run` (~90 s) |
| Related-test discovery | grep `tests/` for the module basename (`vitest related` crashes) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PAYF-02 | PATCH/cancel/assign parity before/after extraction | unit (characterization) | `npx vitest run tests/admin-bookings.test.ts tests/gnet-status-push.test.ts tests/admin-assignment.test.ts` | ✅ (run unmodified after Plan A) |
| PAYF-02 | CAS: second writer with same `expectedFrom` gets `applied:false` → 409; message names current status | unit | `npx vitest run tests/booking-status-service.test.ts` | ❌ Wave 0 |
| PAYF-02 | Log row for every change incl. legacy writers; actor stored; one `completed` row | migration text contract + live smoke | `npx vitest run tests/booking-status-migration.test.ts` (+ orchestrator smoke `87-01-smoke.sql`, rolled back) | ❌ Wave 0 |
| PAYF-02 | No direct `bookings` status writers outside allowlist | grep gate | `npx vitest run tests/status-writers-gate.test.ts` | ❌ Wave 0 |
| D-02 | SQL vs TS vocabulary parity (CHECK list, lead, gcal, panel, stats, CRM infra) using latest definitions | parity | `npx vitest run tests/booking-status-parity.test.ts tests/customer-mapping-parity.test.ts tests/espocrm-booking-map.test.ts tests/lead-mapping.test.ts tests/chatwoot-mapping.test.ts tests/panel-bookings.test.ts tests/panel-bookings-migration.test.ts tests/stats-migration.test.ts` | partly ✅ (update old pins), parity file ❌ Wave 0 |
| DRV-01 | `nextStepFor` table; strict order; only next step offered | unit | `npx vitest run tests/booking-status.test.ts` | ❌ Wave 0 |
| DRV-01 | UI shows single next-step control, locked label before unlock, confirm dialog before request | component | `npx vitest run tests/driver-trip.test.tsx tests/slide-to-advance.test.tsx` | ❌ (rewrite `tests/driver-trip.test.ts`) |
| DRV-02 | Driver step → service → status updated, log actor=driver, `trip_progress` mirrored only after CAS win | unit | `npx vitest run tests/driver-trip-step.test.ts` | ❌ Wave 0 (replaces `tests/driver-trip-progress.test.ts`) |
| DRV-03 | `completed`: no amount in schema (strict zod rejects extra keys), `emitBookingCompleted` once, partner flag | unit | `npx vitest run tests/driver-trip-step.test.ts tests/booking-status-service.test.ts` | ❌ Wave 0 |
| DRV-04 | Skip → 409 (+ nextStep); replay of applied step (incl. `completed`) → 200, zero writes, zero log, zero push; admin-cancel-vs-driver race → exactly one applies | unit | `npx vitest run tests/driver-trip-step.test.ts` | ❌ Wave 0 |
| DRV-04 | Start gate across DST (2026-03-29, 2026-10-25), central-Prague = pickup−2h, maps failure fallback | unit | `npx vitest run tests/start-gate.test.ts` | ❌ Wave 0 |
| DRV-05 | GNet: each step pushed once; retap no second push; failed push retried only when `last_push_error` set; `on_board`/`no_show` → `null` map; farm-in cancel not echoed | unit | `npx vitest run tests/gnet-client.test.ts tests/gnet-status-push.test.ts tests/gnet-push.test.ts` | partly ✅ |
| DRV-05 | Partner booking: completion event `partner:true`, `assertMoneyEligible` throws | unit | `npx vitest run tests/booking-status-service.test.ts` | ❌ Wave 0 |
| D-07 | Rewritten isolation gate: driver route imports service, no `.from('bookings')`; CSRF prefix `/api/driver/trip` retained; LIMITS key present | grep + unit | `npx vitest run tests/status-writers-gate.test.ts tests/middleware-csrf-forms.test.ts tests/driver-trip-step.test.ts` | ❌/✅ |
| D-15/16 | No-show request rejected early, accepted after `max(pickup, on_location)+threshold`; no status change; admin confirm → `no_show`; dismiss clears | unit | `npx vitest run tests/driver-no-show.test.ts tests/admin-no-show.test.ts` | ❌ Wave 0 |
| Guards | Isolation guard still green (no Chatwoot in driver path) | existing | `npx vitest run tests/infra-vps-isolation-guard.test.ts` | ✅ |
| Guards | Admin colour guard extended to driver root | existing | `npx vitest run tests/admin-no-hardcoded-colors.test.ts` | ✅ (extend `SCAN_ROOTS`) |

### Sampling Rate
- **Per task commit:** the single test file the task touches (`npx vitest run tests/<file>`), then `npx tsc --noEmit` and `npx eslint --quiet <changed>`.
- **Per wave merge:** all files in the map above for the completed waves.
- **Phase gate:** full `npx vitest run` green + `verify` skill in `pre-pr` mode + orchestrator live smoke of 084 (RPC twice → `applied:true` then `applied:false`; log has exactly one row per applied change; second `completed` insert conflicts) before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `tests/booking-status.test.ts` — vocabulary, `nextStepFor`, `isPartnerBooking`, TERMINAL
- [ ] `tests/booking-status-service.test.ts` — CAS/409, log contract, completion seam once, side-effect profiles
- [ ] `tests/booking-status-migration.test.ts` + `tests/helpers/latest-migration.ts` — 084 text contract (`SET search_path = ''`, REVOKE/GRANT lines for every function, deny-all RLS, partial unique index)
- [ ] `tests/booking-status-parity.test.ts` — SQL-vs-TS parity on latest definitions
- [ ] `tests/status-writers-gate.test.ts` — writer allowlist + driver-route gate
- [ ] `tests/driver-trip-step.test.ts` (replaces progress test), `tests/start-gate.test.ts`, `tests/driver-no-show.test.ts`, `tests/admin-no-show.test.ts`, `tests/gnet-push.test.ts`
- [ ] `tests/slide-to-advance.test.tsx`, rewritten `tests/driver-trip.test.ts(x)` for the new page states (active / completed / ended / too-early)
- [ ] Characterization additions to `tests/admin-bookings.test.ts` for the cancel route (no existing cancel-route suite found by grep: only `app/api/admin/bookings/cancel/route.ts` itself) before refactoring it
- Framework install: none.

## Security Domain

`security_enforcement` not set in config → enabled.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no (admin via `getAdminUser`, unchanged) | existing |
| V3 Session Management | no | — |
| V4 Access Control | **yes** | Bearer `trip_token` (UUID, unique index 060) + live `assignment.driver_id === booking.driver_id` + `assignment.status !== 'declined'` + per-step server authorization; admin routes keep `getAdminUser` guard order |
| V5 Input Validation | **yes** | zod strict schemas; unknown keys rejected (no amount/status injection); SQL patch allowlist in RPC; NO_CRLF where text reaches email |
| V6 Cryptography | no new | token stays `gen_random_uuid()`; do not log tokens |
| V7 Error handling / logging | **yes** | `booking_status_log` (actor, source); uniform `invalid_token` for all bad-token reasons |
| V8 Data protection | yes | completed/ended screens hide passenger name/phone/addresses (D-17); log holds ids only, no PII |
| V13 API / CSRF / rate limit | **yes** | middleware Origin check on `/api/driver/trip` + `/api/admin`; `checkRateLimit('/api/driver/trip/progress')` 20/min/IP |

### Known Threat Patterns
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Leaked/forwarded trip link drives status (and later money) | Spoofing / Elevation | Strict next-step order, start gate, confirm dialog, CAS, no amount input, declined/reassigned/terminal invalidate, operator-only `no_show`, Phase 88 capture is server-side and sweeper-driven |
| Replay / double tap / two tabs | Tampering | Replay returns 200 no-op; CAS; unique completed log row |
| Admin-vs-driver race | Tampering | RPC CAS `WHERE status = p_from`; loser gets 409 + current state |
| Mass assignment via patch | Tampering | SQL allowlist of patchable columns |
| Token enumeration | Information disclosure | Uniform response for unknown/terminal/reassigned; UUID shape check before DB; rate limit |
| Pickup/passenger PII on stale link | Information disclosure | Completed view without PII; 404-equivalent neutral view for ended |
| Rate limiter silently off (typo) | DoS / Tampering | Keep literal key + test |
| Privilege escalation of RPC | Elevation | SECURITY DEFINER + `SET search_path = ''` + REVOKE FROM PUBLIC, anon, authenticated + GRANT service_role (re-run after any DROP+CREATE) |
| Driver triggering alerts spam (no-show request) | DoS | Server threshold, one open request, rate limit, email dedup via `logEmail` |
| CBooking sync failure storm on unknown status | Availability | Fan-out F12-F14 before any driver can reach `on_board` |

## Suggested plan decomposition (for the planner; each plan commits with `security:` where it touches the route)
0. **Characterize** current PATCH/cancel/assign/GNet behaviour (add the missing cancel-route tests; no code change).
1. **Pure extraction** `advanceBookingStatus()` + `lib/gnet-push.ts`, no behaviour change; admin PATCH/assign/cancel call it; existing suites pass unmodified.
2. **Vocabulary + migration 084 SQL file** (`lib/booking-status.ts`, transitions, TERMINAL, all TS fan-out F2-F20 minus live DB, parity tests with `latestFunctionBody`, update the pinned old tests). Orchestrator `[BLOCKING]` task: apply 084 + smoke.
3. **CAS + log + completion seam** in the service (RPC call, 409 mapping, `emitBookingCompleted`, side-effect profiles), update mocks; writers gate test.
4. **Driver step wrapper + route rewrite**, start gate, gate/test rewrite (replaces DTRIP-04), CSRF/rate-limit tests.
5. **Driver UI** (light theme, map, sheet, slide control, confirm dialog, Trip completed / ended views, note field preserved).
6. **No-show request** (settings columns, driver action, admin banner + admin route, email alert).
7. **GNet idempotent claim + tests**, then EspoCRM `fields.json` owner step documented in the summary.
Optional last: Chatwoot no-show message via outbox (Pitfall 8).

## Sources

### Primary (HIGH confidence — opened this session)
- Repo: `app/api/admin/bookings/route.ts` (1-150, 320-540, 835-870), `app/api/admin/bookings/cancel/route.ts`, `app/api/admin/bookings/[id]/assign/route.ts`, `app/api/driver/trip/[token]/progress/route.ts`, `app/(internal)/driver/trip/[token]/{page,TripProgressClient}.tsx`, `lib/{booking-transitions,trip-token,gnet-client,rate-limit,prague-date,geo-distance,google-calendar,panel-bookings,customer-mapping,lead-mapping,chatwoot-mapping,outbox,chatwoot-client}.ts`, `middleware.ts`, `components/admin/{StatusBadge,DriverAssignmentSection}.tsx`, `components/booking/RouteMap.tsx`, `app/(internal)/admin/admin-theme.css`, migrations 039, 040, 053, 055, 058, 060, 061, 063, 064, 067, 069, 071, 080, 081, `infra/espocrm/{lib/booking-map.mjs,fields.json}`, tests listed in the fan-out table, `.planning/research/{ARCHITECTURE,PITFALLS}.md`, `.planning/phases/87-…/87-CONTEXT.md`.
- PostgreSQL docs, Read Committed: https://www.postgresql.org/docs/current/transaction-iso.html (UPDATE waits for a concurrent updater, then re-evaluates the WHERE clause).

### Secondary (MEDIUM)
- GRiDD GNet public help: https://api.grdd.net/Platform.svc/help and https://api.grdd.net/Platform.svc/help/operations/providerUpdateStatusByResNo (operation exists; `status` is a free-form string; no enumeration published).

### Tertiary (LOW)
- Web searches for GNet status-code lists (Limo Anywhere KB mapping): no status list found; treated as absent evidence, not as proof that `ON_BOARD`/`NO_SHOW` are unsupported (A4 is an assumption, the fallback is the locked D-22).

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages; all versions read from `package.json`.
- Architecture (RPC CAS + trigger log): MEDIUM-HIGH — Postgres semantics cited; exact SQL not yet executed (orchestrator smoke required).
- Fan-out inventory: HIGH — each location opened; the list may still miss a consumer reached only via `grep` of `'completed'` strings in components not opened (do a final `grep -rn "en_route"` gate in the parity test).
- GNet: LOW — public docs list no status enumeration.
- Pitfalls: HIGH for repo-derived items (1-7, 10, 11); MEDIUM for 9.

**Research date:** 2026-11-03
**Valid until:** 2026-12-03 (repo-specific; re-check if Phase 88 planning changes `pricing_globals` or the migration number — next free migration verified as 084 in `supabase/migrations`, highest file is `083_stats_conversion_period_totals.sql`)
