# Phase 67: Driver Trip Portal — Status Marking, Notes & Admin Visibility - Research

**Researched:** 2026-09-02
**Domain:** Next.js App Router client-island mutation on a token-gated page + additive Supabase schema + admin read-surface extension (no new packages)
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

No CONTEXT.md exists for this phase — the user chose to plan without `/gsd-discuss-phase`. Design
decisions below are inferred from the phase goal, REQUIREMENTS.md, STATE.md, and the actual Phase 66
codebase (read this session), and are flagged `[ASSUMED]` in the Assumptions Log for confirmation
during planning/discussion if desired.

### Locked Decisions
None (no CONTEXT.md).

### Claude's Discretion
Entire phase — see Assumptions Log for the specific naming/schema/route-shape choices this research
recommends.

### Deferred Ideas (OUT OF SCOPE)
Per REQUIREMENTS.md "Future Requirements" / "Out of Scope" (carried over, still binding for this phase):
- Driver GPS / real-time location (DTRIP-FUT-01)
- Push / SMS notifications to the driver (DTRIP-FUT-02)
- Auto-push of driver trip-progress into GNet status (DTRIP-FUT-03) — explicitly excluded, matches
  DTRIP-04's isolation requirement
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DTRIP-03 | Driver can mark trip-progress statuses from the link: en route → arrived → on board → completed, plus no-show. | New `TripProgressClient.tsx` client island (Pattern 1) POSTing to a new unauthenticated token-gated route, modeled on `app/driver/response/DriverResponseClient.tsx` (verified this session) |
| DTRIP-04 | Trip-progress is stored in a separate field and does NOT modify `booking.status` (and is not pushed to GNet by default). | New columns on `driver_assignments` (migration 061), isolated from `bookings.status`; the new write route never imports `lib/gnet-client.ts` or `lib/booking-transitions.ts` — see Isolation Constraint section and Common Pitfall 1 |
| DTRIP-05 | Admin sees the driver's live trip-progress in the bookings admin. | Extend `GET /api/admin/bookings/[id]/assignment` select list (one-line change, exact precedent from Phase 66 Plan 02) + `DriverAssignmentSection.tsx` render — "live" achieved via the existing re-fetch-on-row-expand behavior, no polling infra needed (verified: no `setInterval`/SWR/polling exists anywhere in this codebase) |
| DTRIP-06 | Driver can leave an optional trip note/feedback from the link. | Same client island + same write route, `trip_note` column, rendered in admin detail alongside `trip_progress` |

</phase_requirements>

## Summary

Phase 66 already built everything this phase writes *through*: a permanent, unguessable
`trip_token` on `driver_assignments`, a pure validity predicate (`isTripLinkValid` in
`lib/trip-token.ts`), and a server-component trip sheet at `/driver/trip/[token]/page.tsx`
that Phase 66's own plan summary explicitly built as an "app-shell page... structured so
Phase 67 can add status-marking + note UI in place" (D-09). This phase's job is almost
entirely: (1) two new nullable columns on `driver_assignments` (`trip_progress`, `trip_note`,
plus a shared `trip_updated_at` timestamp), (2) one new unauthenticated, token-gated,
rate-limited POST route that re-checks `isTripLinkValid` before writing (never trusting a
stale page render), (3) a `'use client'` island mounted inside the existing trip-sheet page
(direct sibling of `app/driver/response/DriverResponseClient.tsx`'s established pattern), and
(4) a one-line select-list extension on the existing admin `GET .../assignment` route plus a
render addition in `DriverAssignmentSection.tsx` (the same component Phase 66 Plan 02 already
extended twice).

The single highest-risk area is DTRIP-04's isolation guarantee. `bookings.status` is written
in exactly one place — `PATCH /api/admin/bookings` (`app/api/admin/bookings/route.ts:342-387`)
— which is `getAdminUser()`-gated, validated against `VALID_TRANSITIONS`
(`lib/booking-transitions.ts`), and fires `pushGnetStatus()` via `after()` whenever
`booking_source === 'gnet'` and the status actually changed (`app/api/admin/bookings/route.ts:454-510`).
The new driver-facing write route is a **completely separate file** that must never import
`@/lib/gnet-client` or `@/lib/booking-transitions`'s `VALID_TRANSITIONS`, and must never call
`.update()` on the `bookings` table at all — only on `driver_assignments`. A second, subtler
risk: `bookings.status` already contains the literal values `'en_route'` and `'completed'`
(`lib/booking-transitions.ts:11-19`), and this phase's `trip_progress` vocabulary
(`en_route`/`arrived`/`on_board`/`completed`/`no_show`) intentionally reuses two of those exact
strings for driver-facing familiarity — this is a deliberate but real foot-gun that the plan
must guard against with column-name separation (never a shared `status` column) and an explicit
test asserting the write route never touches `bookings`.

**Primary recommendation:** Add `trip_progress text NULL CHECK (...)`, `trip_note text NULL`,
`trip_updated_at timestamptz NULL` to `driver_assignments` in migration `061` (plain `ADD COLUMN`,
no RPC touched, no REVOKE/GRANT needed). Build `POST /api/driver/trip/[token]/progress` modeled
directly on `app/api/driver/respond/route.ts` (rate-limited via `lib/rate-limit.ts`, zod
`.refine()`-gated so at least one of `progress`/`note` is present, re-validates via
`isTripLinkValid` before every write, uniform `invalid_token` response). Add this new route's
prefix to `CSRF_PROTECTED_PREFIXES` in `middleware.ts` (currently only lists the exact
`/api/driver/respond` path, not `/api/driver` broadly — a new route is NOT auto-covered).
Mount a new `TripProgressClient.tsx` island inside `/driver/trip/[token]/page.tsx`, modeled on
`DriverResponseClient.tsx`. Extend `GET /api/admin/bookings/[id]/assignment`'s select list with
`trip_progress, trip_note, trip_updated_at` and render them inside
`DriverAssignmentSection.tsx`'s existing `mode === 'assigned'` branch — this already re-fetches
on every row expand (`{isExpanded && (...)}` at `BookingsTable.tsx:1915`), which satisfies
"live" without introducing polling (none exists anywhere in this codebase).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Trip-progress mutation (write) | API / Backend | Database / Storage | New unauthenticated, token-gated POST route validates + writes; DB is the field-isolation boundary (separate column, no shared `status`) |
| Trip-note mutation (write) | API / Backend | Database / Storage | Same route/column family as trip-progress, decoupled presence check |
| Isolation guarantee (no `booking.status` write, no GNet push) | API / Backend | — | Enforced entirely by omission in the new route file — it must never import `lib/gnet-client.ts` or update the `bookings` table |
| Driver-facing status controls (tap targets) | Browser / Client | Frontend Server (SSR) | `'use client'` island (`TripProgressClient.tsx`) mounted inside the existing server-rendered trip sheet, mirrors `DriverResponseClient.tsx` |
| Trip-link revalidation on write | API / Backend | Database / Storage | The write route re-runs `isTripLinkValid` (pure predicate) against a fresh join query — never trusts the page's earlier render, closing the reassignment/terminal-status TOCTOU window |
| Admin trip-progress visibility | Browser / Client | API / Backend | `DriverAssignmentSection.tsx` ('use client') re-fetches `GET .../assignment` on every row expand — no new tier, extends the existing Phase 66 pattern |

## Standard Stack

This phase introduces **no new dependencies**. All work uses packages already in `package.json`
(same conclusion as Phase 66's RESEARCH.md, re-verified this session).

### Core (already installed — no version change)
| Library | Version (installed) | Purpose | Why Standard (for this phase) |
|---------|---------|---------|--------------|
| `next` | ^16.2.3 | New API route + client island | `[VERIFIED: package.json]` |
| `zod` | ^4.3.6 | New route body validation | `[VERIFIED: package.json]`; registry latest is `4.5.4` per `npm view zod version` — not a blocker, no install needed |
| `resend` | ^6.9.4 | Not needed by this phase (no new email) — listed for completeness | `[VERIFIED: package.json]` |
| `lucide-react` | (installed, used by `DriverAssignmentSection.tsx`) | Optional icons for progress buttons (e.g. a checkmark on "Completed") | `[VERIFIED: components/admin/DriverAssignmentSection.tsx:4]` |

### Supporting
None — no supporting libraries needed beyond the above.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Re-fetch-on-row-expand for "live" admin visibility | `setInterval` polling or Supabase Realtime subscription | No polling/realtime infrastructure exists anywhere in this codebase today (`[VERIFIED: grep -rn "setInterval\|useSWR\|Realtime" app/admin components/admin lib` returns nothing]`); introducing one for a single field is disproportionate. Re-fetch-on-expand (already the existing behavior) satisfies "live" for an admin workflow where a dispatcher opens a booking to check on it. |
| `driver_assignments.trip_progress` (additive column) | A new `trip_progress_log` sibling table (append-only history) | The phase only requires "current" trip-progress visibility (DTRIP-05 says "current trip-progress"), not a history/audit trail — a single mutable column is simpler and matches the D-01 precedent from Phase 66 (additive column beat sibling-table at that phase's checkpoint). A history table is a reasonable v2 enhancement, not required here. |

**Installation:** None required — no `npm install` step for this phase.

**Version verification:** `npm view zod version` → `4.5.4` (installed: `^4.3.6`, compatible range,
no action needed) `[VERIFIED: npm registry]`. `npm view next version` → `16.3.4` (installed:
`^16.2.3`, compatible range) `[VERIFIED: npm registry]`. Neither requires a version bump for this
phase's work.

## Package Legitimacy Audit

**Not applicable — this phase installs no new external packages.** All functionality is built
from libraries already present in the repo (see Standard Stack above).

**Packages removed due to [SLOP] verdict:** none — no packages evaluated (no installs).
**Packages flagged as suspicious [SUS]:** none.

## Architecture Patterns

### System Architecture Diagram

```
Driver's phone (mobile browser, /driver/trip/[trip_token])
        │
        ▼
┌─────────────────────────────────────────────────┐
│ /driver/trip/[token]/page.tsx  (server component) │  ← EXISTS (Phase 66)
│  1. validate token shape (zod uuid)                │
│  2. SELECT driver_assignments JOIN bookings/drivers│
│  3. isTripLinkValid() check (D-03 predicate)       │
│  4. renders trip sheet fields (read-only)          │
│  5. NEW: mounts <TripProgressClient token={...}    │
│           initialProgress={...} initialNote={...}/>│
└───────────────────────┬───────────────────────────┘
                         │ (client island, 'use client')
                         ▼
┌─────────────────────────────────────────────────┐
│ TripProgressClient.tsx (NEW)                       │
│  - 5 tap-target buttons: En Route / Arrived /      │
│    On Board / Completed / No-Show                  │
│  - optional free-text note field + Submit           │
│  - POST fetch on tap/submit                         │
└───────────────────────┬───────────────────────────┘
                         │ POST /api/driver/trip/[token]/progress (NEW)
                         ▼
┌─────────────────────────────────────────────────┐
│ POST /api/driver/trip/[token]/progress (NEW)       │
│  1. checkRateLimit (lib/rate-limit.ts)             │
│  2. zod parse: { progress?: enum, note?: string }  │
│     .refine(at-least-one-present)                   │
│  3. SELECT driver_assignments JOIN bookings         │
│     WHERE trip_token = :token                       │
│  4. isTripLinkValid() RE-CHECK (fresh, not cached)  │
│     → invalid: uniform invalid_token response        │
│  5. UPDATE driver_assignments                        │
│       SET trip_progress = ?, trip_note = ?,           │
│           trip_updated_at = now()                     │
│       WHERE id = assignment.id                         │
│     (only present keys — non-clobber, D-13-style)      │
│                                                          │
│  ✗ NEVER: .from('bookings').update(...)                 │
│  ✗ NEVER: import '@/lib/gnet-client'                     │
│  ✗ NEVER: import VALID_TRANSITIONS                        │
└───────────────────────┬───────────────────────────┘
                         │ 200 { ok: true, trip_progress, trip_note }
                         ▼
                 (driver sees confirmation)

──────────────────────────────────────────────────────────

Admin bookings screen (existing, unchanged data flow otherwise)
        │
        ▼
┌─────────────────────────────────────────────────┐
│ BookingsTable.tsx — row expand ({isExpanded && ...}│  ← EXISTS
└───────────────────────┬───────────────────────────┘
                         ▼
┌─────────────────────────────────────────────────┐
│ DriverAssignmentSection.tsx  (EXTEND)              │
│  useEffect fetch on mount (= every row expand)     │
│  GET /api/admin/bookings/[id]/assignment           │
│    → EXTEND select: trip_progress, trip_note,        │
│      trip_updated_at                                  │
│  NEW: render trip-progress badge + note text +        │
│       "last updated" timestamp, next to the             │
│       existing driver name / Copy Trip Link row          │
└─────────────────────────────────────────────────┘
```

### Recommended Project Structure
```
supabase/migrations/
└── 061_driver_assignments_trip_progress.sql   # NEW — trip_progress/trip_note/trip_updated_at
app/driver/trip/[token]/
├── page.tsx                          # EXTEND — mount TripProgressClient in the valid branch
└── TripProgressClient.tsx            # NEW — 'use client' status buttons + note field
app/api/driver/trip/[token]/
└── progress/route.ts                 # NEW — unauthenticated, rate-limited, token-revalidated write
app/api/admin/bookings/[id]/
└── assignment/route.ts               # EXTEND — select trip_progress/trip_note/trip_updated_at
components/admin/
└── DriverAssignmentSection.tsx       # EXTEND — render trip-progress badge + note + timestamp
components/admin/
└── StatusBadge.tsx                   # EXTEND (optional) — variant union gains 'arrived'|'on_board'|'no_show' if reused for trip-progress badges
lib/
├── trip-token.ts                     # READ ONLY — isTripLinkValid() reused as-is for the write gate
├── rate-limit.ts                     # EXTEND — add a LIMITS entry for the new route path
└── gnet-client.ts, booking-transitions.ts   # DO NOT IMPORT from any new Phase 67 file
middleware.ts                         # EXTEND — add new route prefix to CSRF_PROTECTED_PREFIXES
```

### Pattern 1: Client-island mutation from a server-rendered token-gated page

**What:** The existing `/driver/response` page pairs a server component (`page.tsx`, does the
token lookup + validity check) with a `'use client'` component that receives the raw token as a
prop and independently POSTs to a mutation endpoint, carrying its own submitting/done/error
state. Phase 66's trip sheet page is currently pure-server (no client island yet); this phase
adds the first one, following the exact established shape.

**When to use:** Any interactive control on a driver-facing token-gated page in this codebase.

**Example (adapted from the existing file, read this session):**
```typescript
// Source: app/driver/response/DriverResponseClient.tsx:1-34 (existing pattern, read this session)
'use client'
import { useState } from 'react'

interface TripProgressClientProps {
  token: string
  initialProgress: string | null
  initialNote: string | null
}

type SubmitState = 'idle' | 'submitting' | 'done' | 'error'

export default function TripProgressClient({ token, initialProgress, initialNote }: TripProgressClientProps) {
  const [progress, setProgress] = useState(initialProgress)
  const [note, setNote] = useState(initialNote ?? '')
  const [state, setState] = useState<SubmitState>('idle')

  async function handleMark(next: string) {
    setState('submitting')
    try {
      const res = await fetch(`/api/driver/trip/${token}/progress`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ progress: next }),
      })
      const json = await res.json()
      if (json.ok) {
        setProgress(next)
        setState('done')
      } else {
        setState('error')
      }
    } catch {
      setState('error')
    }
  }
  // ...note submission handler follows the same fetch shape...
}
```

**Server page must pass the initial values through** (extend the existing join query in
`page.tsx` to also select `trip_progress, trip_note` from `driver_assignments`, then pass them
as props — no second round-trip fetch needed on page load).

### Pattern 2: Unauthenticated, token-gated, rate-limited mutation route

**What:** `POST /api/driver/respond` is the exact template: rate limit check first, then a
try/catch JSON parse, then zod `safeParse`, then a service-role Supabase lookup by token, then
an explicit validity re-check (never trusting anything computed before this request), then a
scoped `.update()`, then a uniform `invalid_token` response for every failure mode.

**When to use:** The new `POST /api/driver/trip/[token]/progress` route.

```typescript
// Source: app/api/driver/respond/route.ts:1-46 (existing pattern, read this session) — adapted
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'
import { isTripLinkValid } from '@/lib/trip-token'

const TRIP_PROGRESS_VALUES = ['en_route', 'arrived', 'on_board', 'completed', 'no_show'] as const

const progressSchema = z.object({
  progress: z.enum(TRIP_PROGRESS_VALUES).optional(),
  note: z.string().max(2000).optional(),
}).refine(
  d => d.progress !== undefined || d.note !== undefined,
  { message: 'At least one of progress or note must be provided' }
)

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { allowed } = await checkRateLimit('/api/driver/trip/progress', getClientIp(request))
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const { token } = await params
  const parsedToken = z.string().uuid().safeParse(token)
  if (!parsedToken.success) return NextResponse.json({ error: 'invalid_token' }, { status: 400 })

  let body: unknown
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const parsed = progressSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload', details: parsed.error.flatten() }, { status: 400 })
  }

  const supabase = createSupabaseServiceClient()
  const { data: assignment, error } = await supabase
    .from('driver_assignments')
    .select('id, driver_id, bookings!inner(driver_id, status)')
    .eq('trip_token', parsedToken.data)
    .single()

  if (error || !assignment) return NextResponse.json({ error: 'invalid_token' }, { status: 400 })

  const booking = assignment.bookings as unknown as { driver_id: string | null; status: string }
  const valid = isTripLinkValid({
    assignmentDriverId: assignment.driver_id,
    bookingDriverId: booking.driver_id,
    bookingStatus: booking.status,
  })
  if (!valid) return NextResponse.json({ error: 'invalid_token' }, { status: 400 })

  // Non-clobber: only present keys, following the PATCH-field-by-field convention
  // documented in STATE.md Phase 65 log ("PATCH .update() built field-by-field
  // from parsed.data (only present keys)").
  const updatePayload: Record<string, unknown> = { trip_updated_at: new Date().toISOString() }
  if (parsed.data.progress !== undefined) updatePayload.trip_progress = parsed.data.progress
  if (parsed.data.note !== undefined) updatePayload.trip_note = parsed.data.note

  const { error: updateError } = await supabase
    .from('driver_assignments')
    .update(updatePayload)
    .eq('id', assignment.id)

  if (updateError) return NextResponse.json({ error: 'update_failed' }, { status: 500 })

  return NextResponse.json({ ok: true, trip_progress: parsed.data.progress, trip_note: parsed.data.note })
}
```

Note: this route **imports nothing from `lib/gnet-client.ts` or `lib/booking-transitions.ts`**,
and its only `.update()` call targets `driver_assignments`, never `bookings` — this is the literal
enforcement mechanism for DTRIP-04, verifiable by grep at plan-acceptance time (see Common
Pitfall 1 and Validation Architecture).

### Pattern 3: Non-clobber field-by-field PATCH

**What:** Every existing PATCH endpoint in this codebase builds its `.update()` payload from only
the keys actually present in the parsed body, never spreading the whole parsed object — this is
called out explicitly in `STATE.md`'s Phase 65 log: *"PATCH .update() built field-by-field from
parsed.data (only present keys) so a horizon-only or days-only PATCH never clobbers
notification_flags."*

**When to use:** The new progress route, since `progress` and `note` can be submitted
independently (DTRIP-06 says the note is "optional" and separate from progress marking).

### Anti-Patterns to Avoid
- **Do not add `trip_progress`/`trip_note` as columns on `bookings`.** DTRIP-04 requires a fully
  separate field with no shared identity to `bookings.status` — putting them on `driver_assignments`
  (where `trip_token` already lives) makes the isolation structural, not just a code convention.
- **Do not reuse the existing `token`/`token_expires_at`/`token_used_at` accept/decline flow's
  validity check for the new write route.** Use `isTripLinkValid()` (the `trip_token`-based D-03
  predicate) — the accept/decline token is single-use and unrelated to the permanent trip link.
- **Do not skip the write-time `isTripLinkValid()` re-check.** The page.tsx render happened at an
  earlier point in time; between page load and the driver tapping a button, the booking could have
  been reassigned or completed. Re-querying and re-validating on every write closes this
  TOCTOU (time-of-check-to-time-of-use) window — this is exactly why Pattern 2 above re-runs the
  full join + predicate inside the POST handler rather than trusting a token param alone.
- **Do not add the new route's path to `isDynamicPath` in `middleware.ts`.** It's already covered
  (`pathname.startsWith('/api')` is already `true` for any `/api/*` route) — the ONLY middleware
  change needed is adding the new prefix to `CSRF_PROTECTED_PREFIXES` (see Common Pitfall 3).
- **Do not enforce a transition order on `trip_progress` values.** Unlike `bookings.status`
  (validated against `VALID_TRANSITIONS`), DTRIP-03/04 describe trip-progress as informational,
  driver-reported state with no admin-facing workflow gate — a driver should be able to correct a
  mis-tap (e.g., tap "Arrived" then "En Route" again) without the API rejecting it. Confirm this
  reading during planning if strict ordering turns out to be wanted (see Open Questions).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Trip-link validity check | A second/duplicate predicate for the write path | `isTripLinkValid()` from `lib/trip-token.ts` (Phase 66) | Already the single source of truth; the file's own header comment says it is "reused by app/driver/trip/[token]/page.tsx (Plan 01) and Phase 67" — literally written for this reuse |
| Rate limiting | A custom in-route counter | `checkRateLimit()` + `getClientIp()` from `lib/rate-limit.ts` | Already implements a distributed sliding-window limiter (Upstash) with in-memory fallback — the exact mechanism `/api/driver/respond` already uses for the same threat model (token oracle enumeration / abuse) |
| CSRF protection for a new mutation route | A custom Origin check inline in the route | Add the new prefix to `CSRF_PROTECTED_PREFIXES` in `middleware.ts` | Centralized, already covers every other mutation endpoint in the app; a route-local check would drift from the established pattern and risk being forgotten on a future edit |
| Vehicle-class / status label formatting for the admin badge | A new label map | Existing `STATUS_LABELS` pattern in `BookingsTable.tsx:83-92` (add a parallel `TRIP_PROGRESS_LABELS` map, same shape) | Matches the established label-map convention exactly; a raw enum string ("on_board") should never be shown to the admin unformatted |

**Key insight:** Every mechanism this phase's write path needs (validity predicate, rate limiter,
CSRF prefix list, non-clobber PATCH convention, uniform invalid-token response) already exists in
this codebase in a form built for exactly this reuse. The genuinely new work is two columns, one
route file, one client component, and a handful of render additions to an existing component.

## Runtime State Inventory

> Rename/refactor/migration trigger check: this phase adds columns and one new route; it does not
> rename or move any existing identifier, table, column, or file. The Runtime-State-Inventory
> trigger (rename/rebrand/refactor/migration) does not apply. Skipped — this is additive
> schema/feature work, not a rename.

## Common Pitfalls

### Pitfall 1: A future edit could accidentally couple `trip_progress` to `booking.status` or GNet
**What goes wrong:** Because `trip_progress`'s vocabulary deliberately reuses two literal strings
that also exist in `bookings.status` (`'en_route'`, `'completed'` — confirmed
`[VERIFIED: lib/booking-transitions.ts:11-19 — "en_route:    ['on_location', 'cancelled', 'completed'],"` and
`"completed:   [],"`), a future developer skimming the new route file could mistakenly believe
`trip_progress = 'completed'` should also update `bookings.status` or trigger the GNet push (since
`prestigoToGnetStatus('completed')` already maps to `'COMPLETE'` per
`[VERIFIED: lib/gnet-client.ts:118-124 — "completed:   'COMPLETE',"]`), silently reintroducing the
exact coupling DTRIP-04 forbids.
**Why it happens:** The value-string collision is real and intentional (driver-facing familiarity)
— the isolation exists ONLY at the column/table level, not the vocabulary level, so it's easy to
miss on a future read of the code.
**How to avoid:** The new route file must contain zero references to `gnet-client` or
`booking-transitions`, and its only Supabase `.update()` call must target `driver_assignments`.
Make this a literal grep-based acceptance criterion on the plan (mirrors Phase 66's own
grep-based checks): `grep -c "gnet-client\|VALID_TRANSITIONS\|booking-transitions" <new-route-file>`
must return `0`, and `grep -c "\.from('bookings')\.update\|\.from(\"bookings\")\.update"
<new-route-file>` must return `0`.
**Warning signs:** Any import of `pushGnetStatus`, `prestigoToGnetStatus`, or `VALID_TRANSITIONS`
inside the new Phase 67 route file.

### Pitfall 2: `driver_assignments.status` (accept/decline) vs the new `trip_progress` — naming collision risk
**What goes wrong:** `driver_assignments` already has a `status` column (values `'pending'` /
`'accepted'` / `'declined'`, confirmed `[VERIFIED: types/database.types.ts:389-400 — "status: string"`
and `app/api/driver/respond/route.ts:53 — ".update({ status: action, token_used_at: ...})"]`). A
migration or route that accidentally writes `trip_progress` values into this existing `status`
column (instead of a NEW column) would corrupt the accept/decline state machine and silently
break DTRIP-07 (Phase 66, already shipped and tested).
**Why it happens:** Both concepts live on the same table and both are colloquially "status."
**How to avoid:** The new columns MUST be named distinctly — `trip_progress` and `trip_note`, never
`status` or `progress` alone — and migration 061 must be a pure `ADD COLUMN`, never an `ALTER
COLUMN` on the existing `status` field.
**Warning signs:** Any `.update({ status: ... })` call inside a Phase 67 file, or a migration that
touches the existing `status`/`token`/`token_expires_at`/`token_used_at` columns.

### Pitfall 3: New mutation route is NOT automatically CSRF-protected
**What goes wrong:** `middleware.ts`'s `CSRF_PROTECTED_PREFIXES` list currently contains the exact
string `/api/driver/respond`, not a broader `/api/driver` prefix
`[VERIFIED: middleware.ts:7-14 — "'/api/driver/respond',"]`. A new route at, e.g.,
`/api/driver/trip/[token]/progress` will NOT match any existing prefix and therefore will NOT get
Origin-header CSRF validation unless explicitly added.
**Why it happens:** The prefix list is an explicit allowlist, not a wildcard on `/api/driver`.
**How to avoid:** Add the new route's prefix (e.g. `/api/driver/trip`) to
`CSRF_PROTECTED_PREFIXES` in `middleware.ts`. Decide whether it also needs
`CSRF_STRICT_ORIGIN_REQUIRED` (currently only `/api/admin` and `/api/create-payment-intent` are
strict — `/api/driver/respond` is NOT in that list, so a missing Origin header is allowed through
there; match that precedent unless there's a reason to diverge, since the token itself is already
the primary access control and CSRF's role here is defense-in-depth).
**Warning signs:** A cross-origin POST to the new route succeeding without an Origin check
(testable directly).

### Pitfall 4: `bookings!inner(...)` join type inference requires the same interface-cast workaround as Phase 66
**What goes wrong:** `createSupabaseServiceClient()` has no `Database` generic anywhere in this
codebase `[VERIFIED: app/driver/trip/[token]/page.tsx:19-23 comment — "createSupabaseServiceClient()\nis not generic-typed against Database (matches the rest of this codebase's\nservice-client call sites), so a `bookings!inner(*)` select-string join is\notherwise inferred as an array by supabase-js's string-literal parser"]`.
Any new join query in the write route (Pattern 2 above selects `bookings!inner(driver_id, status)`)
will hit the identical type-inference problem.
**Why it happens:** Same root cause Phase 66 Plan 01 already solved once.
**How to avoid:** Cast the raw result through an explicit interface, exactly as
`TripSheetAssignmentRow`/`TripSheetBookingRow` do in `page.tsx` — do not use `any`.
**Warning signs:** `tsc --noEmit` reporting the joined field as an array type instead of an object.

### Pitfall 5: Rate limit key must be a static string, not the dynamic token
**What goes wrong:** `checkRateLimit(pathname, ip)` keys its sliding-window store by the literal
`pathname` string passed in (`lib/rate-limit.ts:182 — "const limit = LIMITS[pathname]"`). If the
route handler passes the actual request URL (which includes the dynamic `[token]` segment) instead
of a fixed logical path, every distinct token gets its own independent rate-limit bucket —
defeating the per-IP abuse protection entirely (an attacker just rotates through different valid
tokens, or the same token gets a fresh budget on every different URL shape).
**Why it happens:** Next.js route handlers receive the full pathname via `request.url`/`nextUrl`,
which is easy to pass directly without normalizing.
**How to avoid:** Pass a fixed logical key like `'/api/driver/trip/progress'` (NOT
`request.nextUrl.pathname`) to `checkRateLimit()`, and add that exact string as a new key in
`LIMITS` in `lib/rate-limit.ts` (e.g. `'/api/driver/trip/progress': 20,` — matches
`/api/driver/respond`'s `10` but slightly higher since a driver may legitimately tap through up to
5 progress states plus a note in one trip).
**Warning signs:** `LIMITS` has no entry matching the literal string passed to `checkRateLimit`,
which means `checkRateLimit` silently returns `{ allowed: true, remaining: Infinity }` for every
request per `lib/rate-limit.ts:182-183` ("Returns `allowed: true` for routes that have no configured
limit") — i.e., rate limiting is silently disabled rather than erroring loudly.

## Code Examples

### Migration 061 shape
```sql
-- Migration 061: driver_assignments trip_progress + trip_note (Phase 67, DTRIP-03/04/05/06)
--
-- Adds THREE new nullable columns to driver_assignments, isolated from both
-- the existing accept/decline `status` column and from bookings.status:
--   trip_progress   — driver-reported progress, one of 5 known values or NULL
--                      (NULL = no update reported yet)
--   trip_note       — optional free-text driver feedback, NULL until submitted
--   trip_updated_at — bumped whenever EITHER trip_progress or trip_note changes
--
-- Deliberately NOT a Postgres ENUM (matches this repo's established TEXT+CHECK
-- convention for alterable status-like fields — see customer_profiles.account_type
-- and pricing_globals.dispatch_default_horizon precedent).
--
-- This migration touches NO SECURITY DEFINER RPC — a plain ADD COLUMN needs no
-- REVOKE/GRANT statement (contrast with migration 059's admin_search_bookings
-- signature change).
--
-- Applied LIVE by the operator (this repo's established convention — no
-- migrations are auto-pushed).

ALTER TABLE driver_assignments
  ADD COLUMN trip_progress text NULL
    CHECK (trip_progress IS NULL OR trip_progress IN
      ('en_route', 'arrived', 'on_board', 'completed', 'no_show')),
  ADD COLUMN trip_note text NULL,
  ADD COLUMN trip_updated_at timestamptz NULL;
```

### Extending the assignment GET route (exact precedent from Phase 66 Plan 02)
```typescript
// Source: app/api/admin/bookings/[id]/assignment/route.ts:20-26 (existing, read this session)
// Before:
.select('id, driver_id, status, created_at, trip_token, drivers(name, email)')
// After:
.select('id, driver_id, status, created_at, trip_token, trip_progress, trip_note, trip_updated_at, drivers(name, email)')
```
This is the literal precedent — Phase 66 Plan 02 made an identical one-line select-list edit to
this exact file to expose `trip_token` for the admin copy-link control
(`[VERIFIED: .planning/phases/66-.../66-02-SUMMARY.md — "GET /api/admin/bookings/[id]/assignment select gains trip_token"]`).

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| N/A | N/A | — | This is new functionality on top of Phase 66's already-current pattern set; nothing in this phase's domain is deprecated |

**Deprecated/outdated:** None identified.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `trip_progress` value vocabulary is exactly `en_route`/`arrived`/`on_board`/`completed`/`no_show` (snake_case, matching the phase description's plain-English wording) | Code Examples, Common Pitfalls | Low-medium — if the user wants different literal values (e.g. `on_location` reused, or a `boarded` synonym), the CHECK constraint and zod enum both need a one-line edit; no architectural impact |
| A2 | `trip_progress`/`trip_note`/`trip_updated_at` belong on `driver_assignments` (not `bookings`, not a new sibling table) | Summary, Standard Stack Alternatives | Low — matches the D-01 precedent (additive column beat sibling-table at Phase 66's checkpoint) and keeps the query surface identical to the already-built `trip_token` pattern; a sibling table would be a bigger and unnecessary lift for a single-current-value field |
| A3 | No transition/ordering validation is enforced on `trip_progress` writes (driver can jump between any of the 5 values, no VALID_TRANSITIONS-style gate) | Anti-Patterns to Avoid | Medium — if the user actually wants ordering enforced (e.g. can't go from `en_route` directly to `completed`), this is a straightforward addition (a parallel `TRIP_PROGRESS_TRANSITIONS` map) but changes the write route's rejection behavior; flagged as an Open Question below |
| A4 | The new route path is `/api/driver/trip/[token]/progress` (path param, matching the page's `/driver/trip/[token]` shape) rather than `/api/driver/trip-progress` with token in the JSON body (matching `/api/driver/respond`'s body-token style) | Recommended Project Structure, Code Examples | Low — purely a route-shape choice; either satisfies every requirement equally, this just picks the more consistent one given D-09's path-based precedent from Phase 66 |
| A5 | "Live" admin visibility (DTRIP-05) is satisfied by the existing re-fetch-on-row-expand behavior, no polling/websocket added | Summary, Standard Stack Alternatives | Low-medium — if the user's mental model of "live" requires the admin to see an update without any interaction (row already open, driver taps a button, badge changes on its own), a polling interval or Realtime subscription would be needed instead; flagged as an Open Question below |
| A6 | `trip_note` has no CRLF/header-injection restriction (unlike single-line PII fields) since it is never used in an email header — only rendered as JSX text in the admin UI (React auto-escapes, no `dangerouslySetInnerHTML` anywhere in this codebase's admin note fields) | Common Pitfalls, Code Examples | Low — matches the existing `special_requests` field's exact validation shape (`z.string().max(1000).optional()`, no `NO_CRLF` regex) `[VERIFIED: app/api/admin/bookings/route.ts:893]` |

**If this table is empty:** N/A — see entries above.

## Open Questions

1. **Does `trip_progress` need ordering/transition enforcement, or can the driver freely jump between states?**
   - What we know: `bookings.status` enforces `VALID_TRANSITIONS`; the phase description lists the
     states in a natural order ("en route → arrived → on board → completed") but also says "or mark
     the trip as a no-show" as a parallel/exception path.
   - What's unclear: Whether a driver who mis-taps should be able to self-correct (tap "En Route"
     again after accidentally tapping "Arrived"), or whether the UI should just hide already-passed
     buttons once a later state is reached.
   - Recommendation: No server-side ordering enforcement (Assumption A3) — keep the write route
     permissive, and let the UI (client island) optionally grey out/reorder buttons for guidance
     without hard-blocking a correction. This is the simpler, lower-risk default; confirm during
     planning if the user wants a hard gate.

2. **Does "live" (DTRIP-05) require push-without-interaction, or is re-fetch-on-expand sufficient?**
   - What we know: No polling/websocket/Realtime infrastructure exists anywhere in this codebase
     today (verified via grep). The existing `FlightStatusBlock.tsx` pattern is a manual
     "Refresh" button (fetch-on-click), and `DriverAssignmentSection.tsx` re-fetches automatically
     every time its parent row is expanded.
   - What's unclear: Whether the dispatcher workflow needs to see a status change while a row is
     already open and idle (true push), or whether opening/refreshing the row is an acceptable
     interaction to see the current value.
   - Recommendation: Ship re-fetch-on-expand for v1 (Assumption A5) — zero new infrastructure,
     matches every existing "freshness" pattern in this codebase. If the user wants a true push
     update, note that during planning as a follow-up (e.g. Supabase Realtime channel on
     `driver_assignments`), not a Phase 67 blocker.

3. **Should the admin bookings LIST (collapsed row, not just the row-detail expansion) show a
   trip-progress badge?**
   - What we know: The collapsed list row currently renders only `bookings.status` via `StatusBadge`
     (`components/admin/BookingsTable.tsx:1443-1449`), sourced from the `admin_search_bookings` RPC
     which does `SELECT b.* FROM bookings b` with no join to `driver_assignments`
     `[VERIFIED: supabase/migrations/059_admin_search_bookings_sort.sql:67-69 — "SELECT b.*\n    FROM public.bookings b"]`.
     Surfacing trip-progress at the list level would require modifying this RPC (a `LEFT JOIN
     LATERAL` to the latest `driver_assignments` row per booking, added to the `jsonb_build_object`
     output) — a DROP+CREATE+REVOKE migration in the same shape as migration 059's own change.
   - What's unclear: Whether "list/detail" in the success criteria means "at least one of the two"
     (satisfied by detail-only) or genuinely both.
   - Recommendation: Ship detail-only for Phase 67's first plan (extending
     `DriverAssignmentSection.tsx`, zero RPC risk) — this is the same admin bookings screen and
     satisfies the literal requirement text with the lowest-risk implementation. If list-level
     badges are wanted, that is a larger, separable follow-up plan given the RPC-surgery risk
     documented in Phase 65's own pitfall log (PUBLIC EXECUTE re-grant on DROP+CREATE).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Supabase (project database) | Migration 061, all trip-progress reads/writes | ✓ (used throughout existing codebase) | — | — |
| Upstash Redis (`UPSTASH_REDIS_REST_URL`/`TOKEN`) | Rate limiting the new write route | ✓ (already used by `/api/driver/respond` and others) | — | In-memory fallback already implemented in `lib/rate-limit.ts` (fail-open by default) |
| `NEXT_PUBLIC_SITE_URL` | Not directly needed by this phase (no new email) | ✓ | — | — |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** Upstash — degrades to in-memory rate limiting per
serverless instance if unavailable (existing, documented behavior, not new to this phase).

## Validation Architecture

`.planning/config.json` has no `workflow.nyquist_validation` key — treated as enabled per the
default rule.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest ^4.1.1 + @testing-library/react + user-event `[VERIFIED: package.json, vitest.config.ts]` |
| Config file | `vitest.config.ts` (jsdom environment, `tests/setup.ts`, `@/` alias to repo root) |
| Quick run command | `npx vitest run tests/driver-trip.test.ts tests/driver-trip-progress.test.ts tests/DriverAssignmentSection.test.tsx tests/admin-assignment.test.ts` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DTRIP-03 | POST with each of the 5 `trip_progress` values succeeds and persists | unit (mocked Supabase update, assert payload shape) | `npx vitest run tests/driver-trip-progress.test.ts` | ❌ Wave 0 — new file |
| DTRIP-03 | Invalid/unknown `progress` enum value is rejected (400) | unit | `npx vitest run tests/driver-trip-progress.test.ts` | ❌ Wave 0 |
| DTRIP-04 | The write route's source file contains zero references to `gnet-client`/`VALID_TRANSITIONS`/`booking-transitions` | static (grep) | `grep -c "gnet-client\|VALID_TRANSITIONS\|booking-transitions" app/api/driver/trip/\[token\]/progress/route.ts` (expect `0`) | ❌ Wave 0 — new acceptance check |
| DTRIP-04 | The write route's only `.update()` call targets `driver_assignments`, never `bookings` | unit (assert `stubSupabaseFrom` is called with `'driver_assignments'` only, never `'bookings'`, on the update call) | `npx vitest run tests/driver-trip-progress.test.ts` | ❌ Wave 0 |
| DTRIP-04 | `pushGnetStatus` mock is never invoked when `trip_progress` is written | unit (mock `lib/gnet-client`, assert zero calls) — this test should FAIL to compile/import if the route file has no import to mock, which is itself the strongest possible proof of isolation | `npx vitest run tests/driver-trip-progress.test.ts` | ❌ Wave 0 |
| DTRIP-04 | A `trip_progress` write for a booking whose `status` is `'completed'` does not change `bookings.status` (regression, reads booking row before/after) | unit | `npx vitest run tests/driver-trip-progress.test.ts` | ❌ Wave 0 |
| DTRIP-05 | `GET /api/admin/bookings/[id]/assignment` response includes `trip_progress`/`trip_note`/`trip_updated_at` | unit (extend existing) | `npx vitest run tests/admin-assignment.test.ts` | ✅ file exists, extend |
| DTRIP-05 | `DriverAssignmentSection` renders the trip-progress badge and note text when present | unit (extend existing) | `npx vitest run tests/DriverAssignmentSection.test.tsx` | ✅ file exists, extend |
| DTRIP-06 | POST with only `note` (no `progress`) succeeds; POST with neither is rejected by the `.refine()` | unit | `npx vitest run tests/driver-trip-progress.test.ts` | ❌ Wave 0 |
| DTRIP-08 (regression) | Invalid/reassigned/terminal token is rejected on the WRITE path with the same uniform `invalid_token` response as the read path | unit | `npx vitest run tests/driver-trip-progress.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** the quick run command above.
- **Per wave merge:** `npx vitest run` (full suite).
- **Phase gate:** Full suite green before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `tests/driver-trip-progress.test.ts` — covers DTRIP-03, DTRIP-04, DTRIP-06, DTRIP-08 regression (new file; no existing test targets the new write route)
- [ ] Extend `tests/admin-assignment.test.ts` with `trip_progress`/`trip_note`/`trip_updated_at` assertions on the assignment GET
- [ ] Extend `tests/DriverAssignmentSection.test.tsx` with a case rendering the new trip-progress badge + note
- [ ] Extend `tests/driver-trip.test.ts` (page render test) if `TripProgressClient` is mounted inside `page.tsx`'s valid-token render path — the existing RouteMap-style `vi.mock` stub pattern applies identically to the new client component
- Framework install: none — Vitest is already configured project-wide.

## Security Domain

`security_enforcement` is not set to `false` anywhere found in `.planning/config.json` — treated
as enabled.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | The write route is intentionally unauthenticated-by-design (token-as-credential), matching the already-established `/api/driver/respond` trust model — not a gap |
| V3 Session Management | No | No session is created or consumed |
| V4 Access Control | Yes | Enforced by `isTripLinkValid()` re-checked on every write (not just page load) — driver_id match + non-terminal status, live against current DB state |
| V5 Input Validation | Yes | `token` validated as UUID shape; `progress` validated as a closed enum (5 values); `note` length-capped (`z.string().max(2000)`) — mirrors `respondSchema`/`bookingPatchSchema` conventions |
| V6 Cryptography | Yes | No new crypto surface — reuses the existing `trip_token` (`gen_random_uuid()`) from Phase 66; this phase performs no new token generation |
| V7 Error Handling / Info Leakage | Yes | Uniform `invalid_token` response for every rejection reason on the write path (unknown token, malformed UUID, terminal, reassigned) — mirrors D-11 from Phase 66, must not differentiate reasons |
| V11 Business Logic | Yes | The isolation constraint (DTRIP-04) IS the business-logic control for this phase — no code path from the driver-facing write route may reach `bookings.status` or GNet |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Rate-limit-key bug silently disables rate limiting (Pitfall 5) | Denial of Service / Abuse | New `LIMITS` entry must use a fixed logical path string, not the dynamic request URL — verify with a unit test asserting `checkRateLimit` is called with the exact literal string that has a `LIMITS` entry |
| CSRF on the new mutation endpoint (Pitfall 3) | Tampering | Add the new route prefix to `CSRF_PROTECTED_PREFIXES` in `middleware.ts` — currently NOT covered by the existing list |
| Stale-token write after reassignment/completion (TOCTOU) | Elevation of Privilege / Tampering | Re-run `isTripLinkValid()` inside the write handler itself (fresh query), never trust a token's validity from an earlier page render — this is the core design of Pattern 2 above |
| Isolation bypass — trip-progress write accidentally cascading into `bookings.status`/GNet (Pitfall 1) | Tampering / Elevation of Privilege | Grep-verified absence of `gnet-client`/`booking-transitions` imports in the new route file; unit test asserting the only `.update()` target is `driver_assignments` |
| Oversized note payload | Denial of Service | `z.string().max(2000)` on `note`, plus `enforceMaxBody(request, 10_000)` on the route (mirrors `assign/route.ts`'s `50_000` — this route's body is much smaller, a tighter cap is appropriate) |

## Sources

### Primary (HIGH confidence — read directly this session)
- `app/driver/trip/[token]/page.tsx` — full file read, current trip-sheet server component
- `lib/trip-token.ts` — full file read, `isTripLinkValid()` predicate
- `lib/booking-transitions.ts` — full file read, `VALID_TRANSITIONS`/`UI_TRANSITIONS`
- `lib/gnet-client.ts` — full file read, `pushGnetStatus`/`prestigoToGnetStatus`
- `app/api/admin/bookings/route.ts` (lines 1-60, 95-149, 380-520) — PATCH handler, `bookingPatchSchema`,
  the single write-site for `bookings.status`, the single GNet-push call site
- `app/api/admin/bookings/[id]/assign/route.ts` (lines 1-80) — assignment insert, existing select-list pattern
- `app/api/admin/bookings/[id]/assignment/route.ts` — full file read, admin assignment GET
- `app/api/driver/respond/route.ts` — full file read, the exact template for the new write route
- `app/driver/response/DriverResponseClient.tsx` — full file read, the exact template for the new client island
- `components/admin/DriverAssignmentSection.tsx` — full file read, admin render/fetch pattern to extend
- `components/admin/BookingsTable.tsx` (lines 40-140, 1400-1460, 1760-1930, 2440-2480) — Booking interface,
  `STATUS_LABELS`, list-column rendering, row-expand conditional, `DriverAssignmentSection` mount site
- `components/admin/StatusBadge.tsx` — full file read, badge variant union
- `lib/rate-limit.ts` — full file read, `checkRateLimit`/`getClientIp`/`LIMITS`
- `lib/request-guards.ts` — full file read, `enforceMaxBody`, `safeString`, `NO_LINE_BREAKS` conventions
- `middleware.ts` (lines 1-160) — `CSRF_PROTECTED_PREFIXES`, `CSRF_STRICT_ORIGIN_REQUIRED`, `isDynamicPath`
- `types/database.types.ts` (lines 18-63, 389-422) — `bookings` and `driver_assignments` Row types
- `supabase/migrations/059_admin_search_bookings_sort.sql` — full file read, `admin_search_bookings` RPC body, DROP+CREATE+REVOKE convention, migration numbering (confirmed next is 061 via `ls supabase/migrations`)
- `tests/driver-trip.test.ts` (lines 1-80) — existing test conventions (`vi.hoisted`, Supabase mock shape)
- `package.json`, `vitest.config.ts` — dependency versions, test framework config
- `.planning/phases/66-driver-trip-portal-permanent-link-trip-sheet/66-RESEARCH.md`, `66-CONTEXT.md`,
  `66-01-SUMMARY.md`, `66-02-SUMMARY.md`, `66-PATTERNS.md` — Phase 66 artifacts (full read)
- `.planning/REQUIREMENTS.md`, `.planning/STATE.md` — full read, requirement text and decision history
- `npm view zod version`, `npm view next version` — registry verification (2026-09-02)

### Secondary (MEDIUM confidence)
- None — every claim in this research was answerable by reading the codebase or its own planning
  artifacts directly this session.

### Tertiary (LOW confidence)
- None — no WebSearch/Context7 lookups were needed for this phase's domain (entirely internal
  codebase extension, no new external API/library surface).

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages; both installed-version checks confirmed against the npm registry this session
- Architecture: HIGH — every pattern cited was read directly this session from the actual Phase 66 codebase, not inferred from the phase description alone
- Pitfalls: HIGH — all five pitfalls are grounded in files read this session (schema types, the exact GNet/status write site, the exact CSRF prefix list, the exact rate-limit key mechanism), not general framework knowledge

**Research date:** 2026-09-02
**Valid until:** 2026-10-02 (30 days — stable internal codebase patterns, no external API version drift risk since no new packages are introduced)
