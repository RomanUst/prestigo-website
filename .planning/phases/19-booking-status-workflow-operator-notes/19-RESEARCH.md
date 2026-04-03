# Phase 19: Booking Status Workflow + Operator Notes — Research

**Researched:** 2026-04-03
**Domain:** Next.js API route mutations + React admin table UX (status FSM, debounced auto-save)
**Confidence:** HIGH

---

## Summary

Phase 19 adds two capabilities to the existing admin bookings table: (1) a status transition control that lets the operator move a booking through a strict finite state machine (pending → confirmed → completed → cancelled, with cancellation available from confirmed too), and (2) an inline operator-notes text area that auto-saves on a debounce timer with no separate save button.

Both features share a single new API endpoint — `PATCH /api/admin/bookings` — which handles both the `status` and `operator_notes` fields on the `bookings` row. The DB columns (`status`, `operator_notes`) were added in Phase 18 migration `018_v13_schema_foundation.sql` and are already live. No migration work is needed in this phase.

The primary challenge is enforcing the FSM transition rules on the server without trusting the client to only send valid transitions. The secondary challenge is building a debounced auto-save that does not fire on every keystroke, yet is reliable on component unmount, and gives the operator clear visual feedback (saving… / saved / error).

**Primary recommendation:** Add a `PATCH` handler to the existing `app/api/admin/bookings/route.ts` (same file, same auth pattern), validate transition server-side with a hardcoded adjacency map, update `BookingsTable.tsx` in place, and reuse the `useRef`-based debounce pattern already present in that component for search.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| BOOKINGS-07 | Operator can change booking status from the admin bookings table; only valid state transitions are permitted | DB CHECK constraint already enforces valid values. Server-side transition map enforces direction. Client dropdown shows only allowed next states. |
| BOOKINGS-09 | Operator can add/edit internal operator notes on any booking; notes are visible in the expanded booking row and auto-save | `operator_notes TEXT` column already exists (Phase 18). Debounce pattern already used in BookingsTable for search. Auto-save = PATCH call after 800ms idle. |
</phase_requirements>

---

## Standard Stack

### Core (already installed)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `zod` | ^4.3.6 | Server-side validation of PATCH payload | Already in use in all admin routes |
| `@supabase/supabase-js` | ^2.101.0 | `.update().eq('id', id)` Supabase query | Already the project ORM |
| `@tanstack/react-table` | ^8.21.3 | Table already uses this for row expansion | Already in BookingsTable |
| React `useRef` + `setTimeout` | (native) | Debounce pattern | Already used in BookingsTable for search debounce |

### No new dependencies required

This phase adds zero new packages. All primitives (Zod, Supabase client, React hooks, existing UI style tokens) are already present.

**Installation:** none needed.

---

## Architecture Patterns

### Status Finite State Machine

The valid transitions form a DAG:

```
pending   -> confirmed, cancelled
confirmed -> completed, cancelled
completed -> (terminal — no transitions)
cancelled -> (terminal — no transitions)
```

Encode this as a constant map in the API route. The server reads the current status from DB, checks the requested next status against the map, and rejects invalid transitions with 422 before touching the DB.

```typescript
// Source: project pattern (server-side validation in all admin routes)
const VALID_TRANSITIONS: Record<string, string[]> = {
  pending:   ['confirmed', 'cancelled'],
  confirmed: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
}

// In PATCH handler:
const currentStatus = booking.status  // fetched from DB before update
const allowed = VALID_TRANSITIONS[currentStatus] ?? []
if (!allowed.includes(nextStatus)) {
  return NextResponse.json(
    { error: `Cannot transition from '${currentStatus}' to '${nextStatus}'` },
    { status: 422 }
  )
}
```

The DB CHECK constraint (`status IN ('pending','confirmed','completed','cancelled')`) added in Phase 18 is a second safety net; it will reject any typo or bug that slips past the application layer.

### PATCH Endpoint Shape

Add a `PATCH` export to the existing `app/api/admin/bookings/route.ts`. This keeps auth logic in one file and follows the pattern already used by `app/api/admin/zones/route.ts` (GET + POST + DELETE + PATCH in the same file).

```typescript
// Payload accepted by PATCH /api/admin/bookings
const bookingPatchSchema = z.object({
  id: z.string().uuid(),
  // Exactly one of the two fields must be present (union or partial — see pitfalls)
  status: z.enum(['pending', 'confirmed', 'completed', 'cancelled']).optional(),
  operator_notes: z.string().max(2000).optional(),
}).refine(d => d.status !== undefined || d.operator_notes !== undefined, {
  message: 'At least one of status or operator_notes must be provided',
})
```

Two separate client actions (status dropdown change; notes auto-save) call the same endpoint. Using optional fields with a `.refine` keeps it one endpoint without leaking internal logic to the client.

### Auto-Save Debounce Pattern (notes)

BookingsTable already implements a `useRef`-based debounce for search (lines 89-102 of the current file). Reuse the identical pattern for notes:

```typescript
// Source: existing BookingsTable.tsx lines 89–102 pattern
const notesDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

function handleNotesChange(bookingId: string, value: string) {
  // 1. Optimistic local state update (immediate)
  setLocalNotes(prev => ({ ...prev, [bookingId]: value }))
  // 2. Cancel pending save
  if (notesDebounceRef.current) clearTimeout(notesDebounceRef.current)
  // 3. Schedule save after 800ms idle
  notesDebounceRef.current = setTimeout(async () => {
    await patchBooking({ id: bookingId, operator_notes: value })
  }, 800)
}

// Flush on unmount to avoid lost writes
useEffect(() => {
  return () => {
    if (notesDebounceRef.current) clearTimeout(notesDebounceRef.current)
  }
}, [])
```

800ms is the recommended debounce for textarea auto-save (fast enough to feel responsive; slow enough to batch rapid typing). This is consistent with the 300ms used for the search field (typing speed differs between search and prose entry).

### Client Dropdown for Status Transitions

The operator sees a `<select>` (or small button group) in the expanded row showing only the valid next states for that booking. Derive valid options from the same transition map as the server — replicate the constant on the client side (it is simple enough to keep in sync; no shared module needed for v1.3).

```typescript
// In expanded row render
const VALID_TRANSITIONS_CLIENT: Record<string, string[]> = {
  pending:   ['confirmed', 'cancelled'],
  confirmed: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
}

const nextOptions = VALID_TRANSITIONS_CLIENT[booking.status] ?? []
// If nextOptions.length === 0 → show static StatusBadge only, no dropdown
```

This means completed and cancelled bookings show only a static badge (no control), satisfying requirement BOOKINGS-07 ("completed and cancelled show no transition options").

### Recommended Project Structure Changes

No new files beyond the API handler addition. All changes are in-file edits:

```
prestigo/
├── app/api/admin/bookings/route.ts   # ADD: PATCH handler
├── components/admin/BookingsTable.tsx # MODIFY: status dropdown + notes textarea
├── components/admin/StatusBadge.tsx   # MODIFY: add 'confirmed' and 'completed' variants
└── tests/admin-bookings.test.ts       # ADD: PATCH tests
```

### StatusBadge Extension

Current variants: `active | inactive | pending | quote`. Phase 19 needs booking-status variants. Options:

1. Add new variants directly to `StatusBadge.tsx`: `confirmed`, `completed`, `cancelled`.
2. Map booking statuses to existing variants before passing to the component.

**Recommended: option 1** — add explicit variants. The badge component is intentionally small and this keeps the mapping in one place. Add:

```typescript
confirmed: { bg: '#1a2f3a', color: '#38bdf8', border: '1px solid rgba(56,189,248,0.25)' },
completed: { bg: '#1a3a2a', color: '#4ade80', border: '1px solid rgba(34,197,94,0.25)' },
cancelled: { bg: '#2a1a1a', color: '#f87171', border: '1px solid rgba(239,68,68,0.25)' },
// pending variant already exists
```

### Anti-Patterns to Avoid

- **Trusting client-provided current status:** Always read current status from DB in the PATCH handler before evaluating the transition. Never trust the `from` value if the client sends it.
- **Single PATCH field per endpoint:** Don't create `/api/admin/bookings/status` and `/api/admin/bookings/notes` as separate routes — one `PATCH /api/admin/bookings` with optional fields is cleaner and matches the zone PATCH precedent.
- **No cleanup on unmount:** The debounce timer must be cleared on unmount or a write will fire after the component is gone, potentially causing React state updates on unmounted components.
- **Firing status update on every render:** Status change must only call PATCH on a deliberate user action (select onChange), not in a useEffect that watches `booking.status`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Input validation on PATCH body | Custom type checks | `zod` `.safeParse()` | Already pattern in all admin routes; Zod handles missing fields, type coercion, enum validation |
| Status enum enforcement | Application-only check | DB CHECK constraint (Phase 18) + Zod enum | DB is the final safety net — do not remove the constraint |
| Debounce timer | npm debounce package | `useRef + setTimeout` | Already in BookingsTable; zero new dependencies |
| Auth check in new PATCH handler | New auth function | Reuse `getAdminUser()` at top of existing route file | Same pattern in GET handler |

---

## Common Pitfalls

### Pitfall 1: Race condition on rapid status clicks

**What goes wrong:** Operator clicks pending → confirmed, then immediately clicks confirmed → completed before the first PATCH resolves. Two PATCHes in-flight; second may arrive first at DB if network reorders them.

**Why it happens:** No client-side lock prevents double-clicks.

**How to avoid:** Set a loading state (`statusUpdating: Record<string, boolean>`) on the booking row. Disable the status control while an update is in-flight. Since this is a single-operator admin panel, optimistic update (update local state immediately, roll back on error) is an acceptable alternative.

**Warning signs:** Status appears to change then snap back to a previous value.

### Pitfall 2: Auto-save fires after component unmount

**What goes wrong:** Operator navigates away mid-edit. The debounce timer fires after unmount and calls `setLocalNotes` on an unmounted component (React warning) or silently makes a stale PATCH request.

**Why it happens:** Timer scheduled in event handler, cleanup not registered.

**How to avoid:** Return cleanup function in `useEffect` that calls `clearTimeout(notesDebounceRef.current)`.

### Pitfall 3: Notes textarea loses focus during re-renders

**What goes wrong:** If the bookings list re-fetches after a status change (triggering a full `setBookings` re-render), the active textarea loses focus mid-edit, resetting the debounce.

**Why it happens:** Full data re-fetch replaces the `bookings` array, causing the expanded row to re-mount.

**How to avoid:** Keep a separate `localNotes` map (`Record<string, string>`) as component state, seeded from fetched booking data but not overwritten by subsequent fetches unless the row is not currently focused. After a status PATCH succeeds, update only the booking's `status` in the local `bookings` array (optimistic update) rather than triggering a full re-fetch.

### Pitfall 4: Status column missing from BookingsTable Booking interface

**What goes wrong:** The `Booking` interface in `BookingsTable.tsx` (lines 15-45) does not include `status` or `operator_notes`. TypeScript will error when accessing them.

**Why it happens:** These columns were added to the DB in Phase 18 but the component interface predates Phase 18.

**How to avoid:** Add `status: string` and `operator_notes: string | null` to the `Booking` interface at the top of `BookingsTable.tsx` as a first task. The GET route already returns `*` (all columns), so the data is already arriving — it just has no type.

### Pitfall 5: `booking_source` needed to gate transition options

**What goes wrong:** The requirement only specifies pending/confirmed/completed/cancelled transitions, but Phase 20 will add manual bookings (`booking_source: 'manual'`). If the transition map in Phase 19 does not account for this, Phase 20 may need to re-edit the same logic.

**Why it happens:** Phase 19 and Phase 20 share the bookings table and admin UI.

**How to avoid:** In Phase 19, the transition map is purely status-based and is correct as-is. `booking_source` does not affect status transitions (Phase 20 only adds the manual booking *creation* and a cancel-with-refund flow). No pre-emption needed — just be aware the same component and route will be extended in Phase 20.

---

## Code Examples

### PATCH handler skeleton (verified against zones PATCH pattern)

```typescript
// Source: app/api/admin/zones/route.ts PATCH — same project, same auth pattern
export async function PATCH(request: Request) {
  const { error } = await getAdminUser()
  if (error === '401') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (error === '403') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  const parsed = bookingPatchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid payload', issues: parsed.error.issues },
      { status: 400 }
    )
  }

  const supabase = createSupabaseServiceClient()

  // For status updates: fetch current status first, validate transition
  if (parsed.data.status !== undefined) {
    const { data: current, error: fetchError } = await supabase
      .from('bookings')
      .select('status')
      .eq('id', parsed.data.id)
      .single()

    if (fetchError || !current) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
    }

    const allowed = VALID_TRANSITIONS[current.status] ?? []
    if (!allowed.includes(parsed.data.status)) {
      return NextResponse.json(
        { error: `Cannot transition from '${current.status}' to '${parsed.data.status}'` },
        { status: 422 }
      )
    }
  }

  // Build update payload from only the provided fields
  const updatePayload: Record<string, unknown> = {}
  if (parsed.data.status !== undefined) updatePayload.status = parsed.data.status
  if (parsed.data.operator_notes !== undefined) updatePayload.operator_notes = parsed.data.operator_notes

  const { error: dbError } = await supabase
    .from('bookings')
    .update(updatePayload)
    .eq('id', parsed.data.id)

  if (dbError) return NextResponse.json({ error: 'DB update failed' }, { status: 500 })

  return NextResponse.json({ ok: true })
}
```

### Vitest test stub for PATCH (follows admin-bookings.test.ts pattern)

```typescript
// Source: existing tests/admin-bookings.test.ts — vi.hoisted + supabase mock pattern
it('PATCH returns 422 for invalid transition (completed -> pending)', async () => {
  // Mock: booking fetched from DB has status 'completed'
  const singleFn = vi.fn().mockResolvedValue({ data: { status: 'completed' }, error: null })
  const eqFn = vi.fn().mockReturnValue({ single: singleFn })
  const selectFn = vi.fn().mockReturnValue({ eq: eqFn })
  supabaseServiceStub.from.mockReturnValue({ select: selectFn })

  const req = new Request('http://localhost/api/admin/bookings', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: 'some-uuid', status: 'pending' }),
  })
  const res = await PATCH(req)
  expect(res.status).toBe(422)
})
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Supabase `.upsert()` for partial updates | `.update(payload).eq('id', id)` with partial payload object | Supabase JS v2 | Safer — only updates specified columns; no accidental nulling |
| Separate endpoints per field | Single PATCH with optional field union | REST best practice | Fewer auth checks, simpler client code |

**Deprecated/outdated:**
- Using `PUT` for partial booking updates: `PATCH` is semantically correct for partial updates and matches project zones pattern.

---

## Open Questions

1. **Should status change trigger a re-fetch or optimistic update?**
   - What we know: Full re-fetch causes the textarea to lose focus (Pitfall 3). Optimistic update avoids this.
   - What's unclear: Whether the operator ever needs to see server-derived changes to other fields after a status update.
   - Recommendation: Optimistic update — mutate only the `status` field in the local `bookings` array on success. Roll back to old value on error with an inline error message.

2. **Notes debounce: flush on blur vs flush on timer?**
   - What we know: Timer-based debounce is already the project pattern for search.
   - What's unclear: Whether the operator expects the save to be immediate on blur (clicking away from the textarea).
   - Recommendation: Flush immediately on `onBlur` in addition to the 800ms timer. This covers the "navigate away" UX scenario without requiring unmount detection in the component.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.1 |
| Config file | `prestigo/vitest.config.ts` |
| Quick run command | `npx vitest run tests/admin-bookings.test.ts` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BOOKINGS-07 | PATCH returns 200 for valid transition (pending → confirmed) | unit | `npx vitest run tests/admin-bookings.test.ts` | ✅ (extend existing file) |
| BOOKINGS-07 | PATCH returns 422 for invalid transition (completed → pending) | unit | `npx vitest run tests/admin-bookings.test.ts` | ✅ (extend existing file) |
| BOOKINGS-07 | PATCH returns 422 for invalid transition (cancelled → confirmed) | unit | `npx vitest run tests/admin-bookings.test.ts` | ✅ (extend existing file) |
| BOOKINGS-07 | PATCH returns 404 when booking id not found | unit | `npx vitest run tests/admin-bookings.test.ts` | ✅ (extend existing file) |
| BOOKINGS-07 | PATCH returns 401/403 for unauthenticated/non-admin | unit | `npx vitest run tests/admin-bookings.test.ts` | ✅ (extend existing file) |
| BOOKINGS-09 | PATCH returns 200 for operator_notes update (no status) | unit | `npx vitest run tests/admin-bookings.test.ts` | ✅ (extend existing file) |
| BOOKINGS-09 | PATCH returns 400 when neither status nor operator_notes provided | unit | `npx vitest run tests/admin-bookings.test.ts` | ✅ (extend existing file) |

### Sampling Rate

- **Per task commit:** `npx vitest run tests/admin-bookings.test.ts`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

None — existing `tests/admin-bookings.test.ts` and its mock infrastructure (vi.hoisted Supabase stubs) cover all the new PATCH tests by extension. No new test files or framework setup needed.

---

## Sources

### Primary (HIGH confidence)

- Existing `app/api/admin/zones/route.ts` — PATCH handler pattern confirmed directly in source
- Existing `app/api/admin/bookings/route.ts` — GET handler + auth pattern confirmed
- Existing `components/admin/BookingsTable.tsx` — debounce pattern + `Booking` interface confirmed
- `supabase/migrations/018_v13_schema_foundation.sql` — `status`, `operator_notes`, `booking_source` column definitions confirmed
- `tests/admin-bookings.test.ts` — vi.hoisted Supabase mock pattern confirmed
- `package.json` — Zod v4, @tanstack/react-table v8, Supabase JS v2 versions confirmed

### Secondary (MEDIUM confidence)

- Supabase JS v2 `.update().eq()` partial update behaviour — consistent with all existing admin routes in this project; no breaking changes expected at ^2.101.0

### Tertiary (LOW confidence)

- None

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries are already installed and in active use
- Architecture: HIGH — patterns directly copied from existing admin routes and components in this codebase
- Pitfalls: HIGH — identified from direct code inspection of BookingsTable.tsx and the existing PATCH route pattern

**Research date:** 2026-04-03
**Valid until:** 2026-05-03 (stable project, no fast-moving dependencies)
