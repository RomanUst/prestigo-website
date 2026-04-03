# Phase 22: Mobile Admin + Promo Code System — Research

**Researched:** 2026-04-03
**Domain:** Responsive admin UI (CSS/Tailwind), promo code CRUD (Supabase), atomic redemption (PostgreSQL UPDATE ... RETURNING), booking wizard integration (Zustand + fetch)
**Confidence:** HIGH

---

## Summary

Phase 22 delivers two independent workstreams that share one codebase. The first is a CSS-only responsive overhaul of the existing admin panel: the `AdminSidebar` component needs a hamburger toggle, the `BookingsTable` needs a card layout below 768px, and all interactive controls need 44px minimum touch targets. No new libraries are needed — Tailwind 4 breakpoints (`md:`, `hidden`, `flex`) are already in use in `PriceSummary.tsx` as a proven template.

The second workstream is the promo code system. The database table (`promo_codes`) was already created in Phase 18 migration `018_v13_schema_foundation.sql`. The schema has everything needed: `code` (UNIQUE), `discount_value`, `expiry_date`, `max_uses`, `current_uses`, `is_active`. Admin CRUD follows the exact pattern of the existing `/api/admin/pricing/route.ts` (auth guard via `getAdminUser()`, Zod validation, Supabase service client). Client-side, a promo input field is added to `Step6Payment` — it calls a new `/api/validate-promo` route that does an atomic `UPDATE ... WHERE current_uses < max_uses RETURNING id` only at PaymentIntent creation time (PROMO-04 race safety decision from STATE.md).

**Primary recommendation:** Build mobile responsiveness first (isolated CSS changes, no logic risk), then promo admin CRUD, then booking wizard integration — two separate test suites, zero new npm packages.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| UX-01 | Admin panel responsive on 375px+; bookings table card layout < 768px; sidebar hamburger; 44px touch targets | Tailwind breakpoints already used in `PriceSummary.tsx`; `AdminSidebar` is a self-contained component; `BookingsTable` uses `@tanstack/react-table` rows that can be conditionally rendered as cards |
| PROMO-01 | Operator creates promo code (code string, discount %, expiry, usage limit) in admin panel | `promo_codes` table exists; admin pattern (Zod + `getAdminUser()` + service client) fully established |
| PROMO-02 | Operator deactivates or deletes promo codes; deactivated codes rejected at checkout | `is_active` boolean column exists; PATCH + DELETE endpoints follow bookings route pattern |
| PROMO-03 | Client enters promo code in booking wizard at checkout; valid code updates total inline | New input in `Step6Payment`; client calls `/api/validate-promo` (read-only check for UX); Zustand store gains `promoCode` + `promoDiscount` fields |
| PROMO-04 | Server validates atomically before Stripe PaymentIntent creation; race-safe usage increment; specific error messages for invalid/expired/exhausted codes | Atomic `UPDATE promo_codes SET current_uses = current_uses + 1 WHERE id = $1 AND is_active AND (expiry_date IS NULL OR expiry_date >= CURRENT_DATE) AND (max_uses IS NULL OR current_uses < max_uses) RETURNING id`; runs inside `create-payment-intent` route before `stripe.paymentIntents.create()` |
</phase_requirements>

---

## Standard Stack

### Core (already installed — no new packages needed)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Tailwind CSS | 4 | Responsive breakpoints for mobile admin | Already used across booking components |
| @tanstack/react-table | 8.21.3 | Table rows for BookingsTable | Already installed; card layout = conditional render of row data |
| Zustand | 5.0.12 | Store promo code + discount in booking state | Existing booking-store pattern |
| Zod | 4.3.6 | Validate promo code admin payloads | Same pattern as bookings PATCH schema |
| @supabase/supabase-js | 2.101.0 | Promo CRUD + atomic update | Service client already used in all admin routes |
| Vitest + RTL | 4.1.1 / 16.3.2 | Tests for promo API + UI | Established test framework |

### No new dependencies required

The entire phase is achievable with the existing stack. No new npm packages are necessary.

**Installation:** (none)

---

## Architecture Patterns

### Recommended Project Structure (additions only)

```
prestigo/
├── app/
│   ├── api/
│   │   ├── admin/
│   │   │   └── promo-codes/
│   │   │       └── route.ts          # GET list, POST create, PATCH deactivate, DELETE
│   │   └── validate-promo/
│   │       └── route.ts              # Client-side soft check (no usage increment)
│   └── admin/(dashboard)/
│       └── promo-codes/
│           └── page.tsx              # Admin promo management page
├── components/
│   └── admin/
│       └── PromoCodesTable.tsx       # List + deactivate/delete actions
└── tests/
    ├── admin-promo-codes.test.ts     # API route unit tests
    └── Step6Payment.test.tsx         # Updated with promo input tests (file exists, expand)
```

### Pattern 1: Admin API Route (established pattern — follow exactly)

**What:** Protect with `getAdminUser()`, validate body with Zod, execute via service client.

**When to use:** All `/api/admin/*` endpoints.

**Example (from `app/api/admin/bookings/route.ts`):**
```typescript
// Source: existing app/api/admin/bookings/route.ts
async function getAdminUser() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return { user: null, error: '401' as const }
  if (!user.app_metadata?.is_admin) return { user: null, error: '403' as const }
  return { user, error: null }
}
```

Apply to `app/api/admin/promo-codes/route.ts` identically.

### Pattern 2: Promo Code Admin Route Shape

```typescript
// app/api/admin/promo-codes/route.ts

const promoCreateSchema = z.object({
  code: z.string().min(3).max(50).toUpperCase(),
  discount_value: z.number().positive().max(100),   // percentage only (v1.3 scope)
  expiry_date: z.string().nullable().optional(),     // ISO date or null = no expiry
  max_uses: z.number().int().positive().nullable().optional(), // null = unlimited
})

const promoPatchSchema = z.object({
  id: z.string().uuid(),
  is_active: z.boolean().optional(),
})

// GET  → list all promo codes (admin view)
// POST → create
// PATCH → deactivate/reactivate
// DELETE → hard delete (id via query param)
```

### Pattern 3: Atomic Redemption (PROMO-04 — race-safe)

**What:** Single SQL statement that both validates AND increments in one round-trip. Prevents two simultaneous requests over-redeeming a single-use code.

**Decision from STATE.md (Phase 22):**
> atomic `UPDATE ... WHERE current_uses < max_uses RETURNING id` pattern; server re-validates promo independently, never trusts client-provided amount

```typescript
// Inside app/api/create-payment-intent/route.ts, BEFORE stripe.paymentIntents.create()
// Source: STATE.md decision + PostgreSQL UPDATE ... RETURNING pattern

const { data: claimed, error: claimError } = await supabaseService
  .from('promo_codes')
  .update({ current_uses: supabaseService.rpc('increment', { x: 1 }) })  // see note below
  .match({ code: promoCode, is_active: true })
  .filter('max_uses', 'is', null)        // unlimited — always claimable
  // OR use raw SQL via .rpc() for the atomic check

// Recommended: use Supabase RPC or raw SQL for the atomic WHERE current_uses < max_uses condition
// because Supabase JS client .update() cannot express "WHERE current_uses < max_uses" in one call
```

**Correct atomic pattern via Supabase RPC or raw PostgreSQL:**
```sql
-- Supabase SQL Editor — create this function once (Wave 0 migration):
CREATE OR REPLACE FUNCTION claim_promo_code(p_code TEXT)
RETURNS TABLE(id UUID, discount_value NUMERIC) AS $$
  UPDATE promo_codes
  SET current_uses = current_uses + 1
  WHERE code = p_code
    AND is_active = true
    AND (expiry_date IS NULL OR expiry_date >= CURRENT_DATE)
    AND (max_uses IS NULL OR current_uses < max_uses)
  RETURNING id, discount_value;
$$ LANGUAGE SQL;
```

Call from route.ts:
```typescript
const { data, error } = await supabaseService
  .rpc('claim_promo_code', { p_code: promoCode })

if (error || !data || data.length === 0) {
  return NextResponse.json(
    { error: 'Promo code is invalid, expired, or has reached its usage limit.' },
    { status: 400 }
  )
}
const discountPct = data[0].discount_value  // e.g. 15 = 15%
```

### Pattern 4: Soft Validation Endpoint (PROMO-03 — UX inline update)

**What:** A separate `/api/validate-promo` route that checks validity WITHOUT incrementing `current_uses`. Used by the booking wizard to show the discount to the client before they confirm payment.

**Important:** This endpoint does NOT claim the code. The atomic claim happens only when the PaymentIntent is created (PROMO-04). This means a code could pass soft validation but fail at payment time if another user claimed the last use concurrently — the error message must reflect this.

```typescript
// app/api/validate-promo/route.ts — read-only check
// GET /api/validate-promo?code=SUMMER20

const { data, error } = await supabaseService
  .from('promo_codes')
  .select('discount_value')
  .eq('code', code.toUpperCase())
  .eq('is_active', true)
  .or('expiry_date.is.null,expiry_date.gte.' + today)
  // Note: current_uses < max_uses check is soft (race window exists — handled at payment time)
  .maybeSingle()

if (!data) return NextResponse.json({ valid: false, error: 'Code not found or expired.' })
return NextResponse.json({ valid: true, discountPct: data.discount_value })
```

### Pattern 5: Responsive Admin (UX-01)

**What:** The admin layout uses inline `style` (not Tailwind classes) for the sidebar. The mobile approach adds a React `useState(false)` toggle inside `AdminSidebar` to collapse the nav and show a hamburger button.

**Note:** `PriceSummary.tsx` already demonstrates the mixed Tailwind + inline style pattern (`className="hidden md:block"` alongside `style={{}}`). The admin can follow the same hybrid approach.

**Key changes to `AdminSidebar.tsx`:**
1. Add `const [open, setOpen] = useState(false)` at component top
2. Add hamburger `<button>` visible only on mobile (Tailwind: `md:hidden`)
3. Wrap nav list in conditional: `open || (window.innerWidth >= 768)` — but prefer CSS (`md:flex hidden` on nav when closed)
4. Add `Menu` / `X` icons from `lucide-react` (already installed)

**Touch targets:** All `<button>` and `<Link>` elements need `minHeight: '44px'` and `minWidth: '44px'` — add to existing inline styles.

**BookingsTable card layout:** At `< 768px`, hide the `<table>` element and render a stack of `<div>` cards that show booking_reference, client name, status badge, date, and action buttons. This is a conditional render inside `BookingsTable` — check `window.innerWidth < 768` on mount (or use a `useMediaQuery` hook pattern with `useState` and `useEffect`).

### Anti-Patterns to Avoid

- **Trusting client-provided discount amount:** The server MUST re-validate the promo code and recompute the discounted price independently. Never accept `discountedTotal` from the client body.
- **Decrementing `current_uses` on failed payment:** The atomic increment happens before Stripe. If Stripe fails, `current_uses` is already incremented. This is acceptable for v1.3 (rare edge case). Do NOT attempt rollback — log it.
- **Hard-deleting active promo codes mid-checkout:** Soft-delete only (set `is_active = false`); hard DELETE is an admin action on codes that have never been used or are fully expired.
- **Using Tailwind Responsive Classes on `'use server'` components:** `AdminSidebar` is already `'use client'` — the hamburger toggle (`useState`) requires this; confirm the directive is present.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Race condition on promo redemption | Custom locking / Redis | PostgreSQL `UPDATE ... WHERE current_uses < max_uses RETURNING id` via Supabase RPC | DB-level atomicity, no extra infra |
| Responsive sidebar overlay | Custom CSS animation system | Tailwind `transition`, `translate-x`, `md:hidden` | Already configured; consistent with PriceSummary pattern |
| UUID generation for promo codes | Custom ID generator | `gen_random_uuid()` in DB DEFAULT (already in schema) | Standard Postgres pattern, already in place |
| Promo code normalization | Manual `.trim().toUpperCase()` scattered in UI | Normalize in Zod schema (`.transform(v => v.trim().toUpperCase())`) and re-apply on server | Single source of truth |

---

## Common Pitfalls

### Pitfall 1: Double-Spending (Race Condition on Single-Use Codes)
**What goes wrong:** Two simultaneous requests both read `current_uses = 0`, both see `0 < 1 (max_uses)`, both insert/update, resulting in 2 uses of a single-use code.
**Why it happens:** Two-step read-then-write pattern without locking.
**How to avoid:** Use the SQL function `claim_promo_code()` that does the check and increment atomically in one statement.
**Warning signs:** `current_uses` exceeds `max_uses` in the DB.

### Pitfall 2: Server Trusting Client-Computed Discounted Price
**What goes wrong:** Client sends `discountedTotal: 50` to `/api/create-payment-intent`; server uses it without recomputing — client can send `discountedTotal: 1`.
**Why it happens:** Convenience / copy-paste from existing flow.
**How to avoid:** Server always computes `finalPrice = basePrice * (1 - discountPct/100)` independently after claiming the promo. STATE.md decision: "server re-validates promo independently, never trusts client-provided amount."
**Warning signs:** `create-payment-intent` route accepts a `discountedAmount` field from client body.

### Pitfall 3: Sidebar Hamburger on SSR
**What goes wrong:** `AdminSidebar` reads `window.innerWidth` during render — throws ReferenceError on server.
**Why it happens:** Next.js App Router server-renders components unless `'use client'` is declared.
**How to avoid:** `AdminSidebar` already has `'use client'`. Use `useState(false)` for `open` — initial state is closed (mobile) and the CSS `md:flex` class handles desktop visibility without JS.
**Warning signs:** Hydration mismatch warnings or `window is not defined` errors.

### Pitfall 4: BookingsTable Card Layout Hydration Mismatch
**What goes wrong:** `window.innerWidth` is checked at render time — server sees no window, client sees actual width. Next.js throws hydration error.
**Why it happens:** Using `window.innerWidth` directly in render.
**How to avoid:** Use a `useEffect` + `useState` approach: start with `isMobile = false` (default desktop), then set to `true` if `window.innerWidth < 768` inside `useEffect`. This means mobile users see the table briefly, then it switches — acceptable for admin (single operator).
**Better approach:** Use CSS `hidden md:table` on the table and `md:hidden` on the card stack — no JS needed, pure CSS.

### Pitfall 5: Promo Code Input Triggers PaymentIntent Refetch
**What goes wrong:** Adding `promoCode` to the `useEffect` dependency array of the PaymentIntent creation effect causes a new PaymentIntent to be created every time the user types a promo code.
**Why it happens:** The current `Step6Payment` `useEffect` watches `[totalEur, selectedCurrency]`.
**How to avoid:** Keep promo code separate from the PaymentIntent creation effect. The promo validation (soft check, `/api/validate-promo`) is a separate fetch that only updates the displayed total. The actual promo claim happens when the user clicks "Pay" — inside `handleSubmit`, before or alongside the PaymentIntent call. Consider restructuring `Step6Payment` to: (1) validate promo on button click in checkout summary, (2) call `/api/create-payment-intent` with `promoCode` in body, (3) server claims + computes final amount.

### Pitfall 6: Expiry Date Timezone Off-by-One
**What goes wrong:** Promo code with `expiry_date = '2026-04-30'` is rejected on April 30 in Prague (UTC+2) because the server checks in UTC where it's already May 1.
**Why it happens:** PostgreSQL `CURRENT_DATE` returns server-side date in its timezone.
**How to avoid:** Store and compare dates as UTC dates. Document that `expiry_date` means "last valid day inclusive" and use `expiry_date >= CURRENT_DATE` (not `>`). Supabase runs in UTC — this means codes expire at midnight UTC, which is 2am Prague time. Acceptable for v1.3.

---

## Code Examples

### Existing Mobile Breakpoint Pattern (from PriceSummary.tsx)

```typescript
// Source: prestigo/components/booking/PriceSummary.tsx (production code)
// Desktop panel — hidden on mobile
<div className="hidden md:block" style={{ ... }}>
  ...
</div>

// Mobile bar — hidden on desktop
<div className="flex md:hidden" style={{ position: 'fixed', bottom: 0, ... }}>
  ...
</div>
```

Use the same `hidden md:block` / `flex md:hidden` pattern for the sidebar and table/card toggle.

### Hamburger Toggle Pattern for AdminSidebar

```typescript
// Source: pattern derived from existing 'use client' + lucide-react in project
'use client'
import { useState } from 'react'
import { Menu, X } from 'lucide-react'

export default function AdminSidebar() {
  const [open, setOpen] = useState(false)

  return (
    <>
      {/* Hamburger — only visible on mobile */}
      <button
        className="md:hidden"
        onClick={() => setOpen(o => !o)}
        style={{ minWidth: 44, minHeight: 44, ... }}
        aria-label={open ? 'Close menu' : 'Open menu'}
      >
        {open ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* Sidebar — always visible md+, conditionally on mobile */}
      <aside className={open ? 'flex' : 'hidden md:flex'} style={{ ... }}>
        ...
      </aside>
    </>
  )
}
```

### Admin Layout Update for Mobile

```typescript
// Source: prestigo/app/admin/(dashboard)/layout.tsx
// Current: <div style={{ display: 'flex', minHeight: '100vh' }}>
// Updated: needs relative positioning for overlay on mobile

return (
  <div style={{ display: 'flex', minHeight: '100vh', position: 'relative' }}>
    <AdminSidebar />
    <main style={{ flex: 1, padding: '32px', ... }}>
      {children}
    </main>
  </div>
)
```

On mobile (< 768px), sidebar overlays content (position: fixed or absolute) rather than pushing it.

### Promo Code Soft Validation in Step6Payment

```typescript
// app/api/validate-promo/route.ts (new file)
// GET /api/validate-promo?code=SUMMER20
export async function GET(request: Request) {
  const code = new URL(request.url).searchParams.get('code')?.trim().toUpperCase()
  if (!code) return NextResponse.json({ valid: false, error: 'No code provided.' })

  const today = new Date().toISOString().split('T')[0]
  const supabase = createSupabaseServiceClient()
  const { data } = await supabase
    .from('promo_codes')
    .select('discount_value, max_uses, current_uses')
    .eq('code', code)
    .eq('is_active', true)
    .or(`expiry_date.is.null,expiry_date.gte.${today}`)
    .maybeSingle()

  if (!data) return NextResponse.json({ valid: false, error: 'Code not found, expired, or inactive.' })
  const exhausted = data.max_uses !== null && data.current_uses >= data.max_uses
  if (exhausted) return NextResponse.json({ valid: false, error: 'This promo code has reached its usage limit.' })

  return NextResponse.json({ valid: true, discountPct: Number(data.discount_value) })
}
```

### Atomic Claim Function (migration — Wave 0)

```sql
-- supabase/migrations/022_promo_claim_function.sql
CREATE OR REPLACE FUNCTION claim_promo_code(p_code TEXT)
RETURNS TABLE(id UUID, discount_value NUMERIC) AS $$
  UPDATE promo_codes
  SET current_uses = current_uses + 1
  WHERE code = p_code
    AND is_active = true
    AND (expiry_date IS NULL OR expiry_date >= CURRENT_DATE)
    AND (max_uses IS NULL OR current_uses < max_uses)
  RETURNING id, discount_value;
$$ LANGUAGE SQL;
```

### Promo Application in create-payment-intent Route

```typescript
// Inside POST handler, before stripe.paymentIntents.create():
let discountedTotal = totalEur  // default: no discount

if (promoCode) {
  const supabaseService = createSupabaseServiceClient()
  const { data: claimed } = await supabaseService
    .rpc('claim_promo_code', { p_code: promoCode.trim().toUpperCase() })

  if (!claimed || claimed.length === 0) {
    return NextResponse.json(
      { error: 'Promo code is invalid, expired, or has reached its usage limit.' },
      { status: 400 }
    )
  }
  const discountPct = Number(claimed[0].discount_value)
  discountedTotal = Math.round(totalEur * (1 - discountPct / 100))
}

// Then create PaymentIntent with discountedTotal (not totalEur)
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Client-side promo validation only | Server-side atomic claim before PaymentIntent | v1.3 design | Prevents race conditions and price manipulation |
| Table-only admin views | Responsive card layout for mobile | Phase 22 | Single operator can manage bookings from phone |
| No promo code support | Full CRUD + wizard integration | Phase 22 | Enables marketing discounts |

**Deprecated/outdated:**
- The `discount_type` column in `promo_codes` is set to `'percentage'` default. Flat CZK discount is explicitly OUT OF SCOPE (see REQUIREMENTS.md). Do not implement `discount_type` switching logic — keep it as a schema placeholder for v2.

---

## Open Questions

1. **Overlay vs. push sidebar on mobile**
   - What we know: The current layout is `display: flex` — sidebar takes 240px, main takes remaining width.
   - What's unclear: On mobile (375px), should the sidebar overlay the content (position: fixed) or should the layout switch to single-column with sidebar on top?
   - Recommendation: Use overlay pattern (position: fixed, full height, z-index above main). This is simpler — the main content doesn't need to reflow. Widely used in mobile admin UIs.

2. **Promo code display in booking confirmation email**
   - What we know: The webhook handler builds `BookingEmailData` from Stripe metadata.
   - What's unclear: Should the promo code and discount amount appear in confirmation emails?
   - Recommendation: Pass `promoCode` and `discountPct` as Stripe metadata keys on the PaymentIntent so they flow through to the webhook. Add display to the email template. Keep the implementation in the same wave as the wizard integration.

3. **Zustand store fields for promo state**
   - What we know: `BookingStore` in `types/booking.ts` needs new fields: `promoCode: string | null`, `promoDiscount: number` (percentage, 0 = no discount).
   - What's unclear: Should the applied discount be stored as a percentage or absolute EUR amount?
   - Recommendation: Store as percentage (`promoDiscount: number`). The server recomputes the absolute amount anyway — storing percentage keeps the client state honest.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.1 |
| Config file | `prestigo/vitest.config.ts` |
| Quick run command | `cd prestigo && npx vitest run tests/admin-promo-codes.test.ts` |
| Full suite command | `cd prestigo && npx vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| UX-01 | Sidebar renders hamburger button on mobile (aria-label) | unit (component) | `npx vitest run tests/AdminSidebar.test.tsx` | ❌ Wave 0 |
| UX-01 | BookingsTable renders card layout at < 768px (conditional render) | unit (component) | `npx vitest run tests/BookingsTable.test.tsx` | ❌ Wave 0 |
| PROMO-01 | POST /api/admin/promo-codes creates code in Supabase | integration | `npx vitest run tests/admin-promo-codes.test.ts` | ❌ Wave 0 |
| PROMO-01 | POST returns 400 on duplicate code (UNIQUE constraint) | integration | `npx vitest run tests/admin-promo-codes.test.ts` | ❌ Wave 0 |
| PROMO-02 | PATCH /api/admin/promo-codes sets is_active=false | integration | `npx vitest run tests/admin-promo-codes.test.ts` | ❌ Wave 0 |
| PROMO-02 | DELETE /api/admin/promo-codes removes code from DB | integration | `npx vitest run tests/admin-promo-codes.test.ts` | ❌ Wave 0 |
| PROMO-03 | GET /api/validate-promo returns discountPct for valid code | unit (API) | `npx vitest run tests/validate-promo.test.ts` | ❌ Wave 0 |
| PROMO-03 | GET /api/validate-promo returns valid:false for expired code | unit (API) | `npx vitest run tests/validate-promo.test.ts` | ❌ Wave 0 |
| PROMO-04 | claim_promo_code RPC increments current_uses atomically | unit (API route) | `npx vitest run tests/admin-promo-codes.test.ts` | ❌ Wave 0 |
| PROMO-04 | Returns 400 with specific message for exhausted code | unit (API route) | `npx vitest run tests/create-payment-intent.test.ts` | Exists (stubs only) |
| PROMO-04 | PaymentIntent amount reflects discount | unit (API route) | `npx vitest run tests/create-payment-intent.test.ts` | Exists (stubs only) |

### Sampling Rate
- **Per task commit:** `cd prestigo && npx vitest run tests/admin-promo-codes.test.ts tests/validate-promo.test.ts`
- **Per wave merge:** `cd prestigo && npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/AdminSidebar.test.tsx` — covers UX-01 (hamburger button rendering)
- [ ] `tests/BookingsTable.test.tsx` — covers UX-01 (card layout conditional render) — note: existing `BookingsTable.tsx` has no test file
- [ ] `tests/admin-promo-codes.test.ts` — covers PROMO-01, PROMO-02, PROMO-04
- [ ] `tests/validate-promo.test.ts` — covers PROMO-03 soft validation endpoint
- [ ] SQL migration: `supabase/migrations/022_promo_claim_function.sql` — `claim_promo_code` function (required before PROMO-04 implementation)

---

## Sources

### Primary (HIGH confidence)
- `/Users/romanustyugov/Desktop/Prestigo/supabase/migrations/018_v13_schema_foundation.sql` — `promo_codes` table schema confirmed; all columns verified
- `/Users/romanustyugov/Desktop/Prestigo/prestigo/components/admin/AdminSidebar.tsx` — current sidebar implementation confirmed (no responsive logic, no `'use client'` wait — confirmed present)
- `/Users/romanustyugov/Desktop/Prestigo/prestigo/components/booking/PriceSummary.tsx` — `hidden md:block` / `flex md:hidden` Tailwind pattern confirmed in production code
- `/Users/romanustyugov/Desktop/Prestigo/.planning/STATE.md` — Phase 22 promo race condition decision: atomic `UPDATE ... WHERE current_uses < max_uses RETURNING id`
- `/Users/romanustyugov/Desktop/Prestigo/prestigo/app/api/create-payment-intent/route.ts` — current payment flow; promo integration point confirmed
- `/Users/romanustyugov/Desktop/Prestigo/prestigo/types/booking.ts` — `BookingStore` interface; promo fields not yet present (need addition)
- `/Users/romanustyugov/Desktop/Prestigo/prestigo/app/api/admin/bookings/route.ts` — `getAdminUser()` guard + Zod pattern for all new admin routes

### Secondary (MEDIUM confidence)
- `/Users/romanustyugov/Desktop/Prestigo/.planning/codebase/CONVENTIONS.md` — coding conventions cross-referenced
- `/Users/romanustyugov/Desktop/Prestigo/.planning/codebase/TESTING.md` — test patterns cross-referenced
- `/Users/romanustyugov/Desktop/Prestigo/.planning/codebase/ARCHITECTURE.md` — layer structure cross-referenced

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new packages, all existing libraries verified in package.json
- Architecture: HIGH — promo_codes table schema exists and confirmed, admin route pattern established in multiple prior phases
- Atomic redemption: HIGH — pattern locked in STATE.md, confirmed achievable with Supabase RPC + PostgreSQL
- Mobile responsive: HIGH — Tailwind breakpoint pattern confirmed in PriceSummary.tsx
- Pitfalls: HIGH — race condition, hydration, and trust-client pitfalls derived from existing codebase analysis

**Research date:** 2026-04-03
**Valid until:** 2026-05-03 (stable stack — Tailwind 4, Supabase JS 2.x, Next.js 16 all pinned)
