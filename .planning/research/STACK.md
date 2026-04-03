# Stack Research — Prestigo v1.3 Pricing & Booking Management

**Domain:** Pricing enhancements + booking management + mobile-responsive admin UI — additions to an existing Next.js 16 / Supabase / Stripe app
**Researched:** 2026-04-03
**Confidence:** HIGH (Stripe SDK verified against GitHub releases today; TanStack Table patterns verified from official docs; all version notes current)

> This document covers ONLY the delta from v1.2. Every package in the existing `package.json` is
> assumed validated and in production. This research answers: do the four v1.3 feature areas require
> new libraries, version upgrades, or new usage patterns?
>
> **Existing stack (do not re-research):** Next.js 16.1.7, React 19.2.3, TypeScript, Tailwind CSS 4,
> Supabase (`@supabase/supabase-js` ^2.101.0, `@supabase/ssr` ^0.10.0), `stripe` ^21.0.1,
> `@stripe/react-stripe-js` ^6.0.0, `@stripe/stripe-js` ^9.0.0, Resend, Google Maps Platform,
> `@tanstack/react-table` ^8.21.3, `recharts` ^3.8.1, `terra-draw` ^1.27.0,
> `react-hook-form` + `@hookform/resolvers` + `zod`, `zustand`, `react-day-picker`, Vitest.

---

## Decision: No New npm Packages Required

All four v1.3 feature areas are implementable with the current package.json. The findings below
explain the reasoning and the correct usage patterns for each area.

---

## Feature Area Analysis

### 1. Stripe Refund API (BOOKINGS-08)

**Verdict:** Use `stripe.refunds.create()` — already in the installed SDK (`stripe` ^21.0.1). No upgrade or new package needed.

**API shape (confirmed from official Stripe docs, 2026-04-03):**

```typescript
// Full refund
const refund = await stripe.refunds.create({
  payment_intent: booking.stripe_payment_intent_id,
  reason: 'requested_by_customer', // optional: 'duplicate' | 'fraudulent' | 'requested_by_customer'
});

// Partial refund (amount in smallest currency unit, i.e. CZK haléřů or EUR cents)
const refund = await stripe.refunds.create({
  payment_intent: booking.stripe_payment_intent_id,
  amount: 5000, // e.g. 50.00 CZK
});
```

**Key constraints verified:**
- Refund accepts `payment_intent` OR `charge` — use `payment_intent` since that is what Prestigo persists
- `amount` is optional; omitting it refunds the full remaining amount
- Returns a Refund object; throws `StripeError` if already fully refunded or invalid ID
- Metadata can be attached to refunds (`metadata: { booking_ref: '...', operator_note: '...' }`)
- Multiple partial refunds allowed until the total equals the original charge

**Stripe SDK version note — important:**
`stripe` v22.0.0 was released on 2026-04-03 (today). It contains breaking changes:
- Removes callback support (already not used in the codebase — all code uses async/await)
- Separates params from options more strictly
- Removes per-request host override

The project's `^21.0.1` semver range will NOT auto-install v22 (major version bump). Do NOT upgrade
to v22 during v1.3. The async/await pattern in `stripe.refunds.create()` is identical in v21 and v22,
but v22 requires audit of any call that passes `apiKey` or `idempotencyKey` as a mixed param. Treat
the v22 upgrade as a separate, dedicated task after v1.3 ships.

**Implementation location:** New Route Handler `/api/admin/bookings/[id]/refund` (POST) — server-side
only, following the existing `/api/admin/*` pattern. Never expose Stripe secret key to client.

---

### 2. Promo Code System (PROMO-01 through PROMO-04)

**Verdict:** No new libraries. PostgreSQL table + Zod validation + existing `react-hook-form` + Supabase Row-Level Security is the complete solution.

**Database schema — new table `promo_codes`:**

```sql
CREATE TABLE promo_codes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        TEXT NOT NULL UNIQUE,            -- case-insensitive lookup via LOWER()
  discount_type TEXT NOT NULL CHECK (discount_type IN ('percent', 'fixed')),
  discount_value NUMERIC(10,2) NOT NULL,       -- percent: 0–100, fixed: currency amount
  expires_at  TIMESTAMPTZ,                     -- NULL = no expiry
  usage_limit INT,                              -- NULL = unlimited
  usage_count INT NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Fast lookup on code entry
CREATE UNIQUE INDEX promo_codes_code_lower_idx ON promo_codes (LOWER(code));
```

**Validation logic (server-side Route Handler `/api/promo/validate` — POST):**

```typescript
// Zod already installed — no new library
const PromoValidateSchema = z.object({ code: z.string().min(1) });

// Supabase query pattern
const { data } = await supabase
  .from('promo_codes')
  .select('*')
  .eq('is_active', true)
  .ilike('code', code)   // case-insensitive match
  .single();

if (!data) throw new Error('Invalid code');
if (data.expires_at && new Date(data.expires_at) < new Date()) throw new Error('Code expired');
if (data.usage_limit !== null && data.usage_count >= data.usage_limit) throw new Error('Usage limit reached');
```

**Usage count increment — on successful payment (webhook handler):**

```typescript
await supabase
  .from('promo_codes')
  .update({ usage_count: supabase.rpc('increment', { row_id: promoCode.id }) })
  .eq('id', promoCode.id);
```

Or use a Postgres function to increment atomically (preferred to avoid race conditions):

```sql
CREATE OR REPLACE FUNCTION increment_promo_usage(code_id UUID)
RETURNS VOID AS $$
  UPDATE promo_codes SET usage_count = usage_count + 1 WHERE id = code_id;
$$ LANGUAGE SQL;
```

**Key design decisions:**
- Validate server-side before PaymentIntent creation; embed `promo_code_id` in PaymentIntent metadata
- Increment `usage_count` in the Stripe webhook handler (`payment_intent.succeeded`) — same source-of-truth pattern already used for booking saves
- Store `promo_code_id` on the `bookings` row for auditability (requires a new nullable `TEXT` or `UUID` column)
- Admin CRUD reuses existing `react-hook-form` + Zod pattern; no new form library needed
- Client UI: a text input + "Apply" button in the booking wizard Step 4 or 6; price display updates client-side after server validates

**No library recommendation for promo code management** (e.g. Coupon Codes npm packages) — they
impose their own schema and are unnecessary when the Supabase table is trivial to write.

---

### 3. Mobile-Responsive Admin Tables and Forms (UX-01)

**Verdict:** No new libraries. TanStack Table v8 + Tailwind CSS v4 patterns are the complete solution.

TanStack Table does not have built-in responsive column collapsing. The standard pattern is to apply
Tailwind responsive classes via column `meta`. This is the documented community pattern confirmed by
the TanStack Table GitHub discussions (#3259) and is compatible with the existing `@tanstack/react-table`
^8.21.3.

**Pattern A — Column visibility via `meta.className` (recommended for bookings table):**

Extend TypeScript column meta type once in `src/types/table.d.ts`:

```typescript
import '@tanstack/react-table';

declare module '@tanstack/react-table' {
  interface ColumnMeta<TData, TValue> {
    className?: string;
  }
}
```

Define columns with Tailwind responsive classes:

```typescript
{
  accessorKey: 'pickup_location',
  header: 'Pickup',
  meta: { className: 'hidden md:table-cell' }, // hide on mobile, show md+
},
```

Apply `meta.className` when rendering `<th>` and `<td>`:

```typescript
<td className={cell.column.columnDef.meta?.className}>
  {flexRender(cell.column.columnDef.cell, cell.getContext())}
</td>
```

**Pattern B — Card layout on mobile, table on desktop (recommended for forms and bookings detail):**

```tsx
<div className="block md:hidden">
  {/* Card per row — show priority fields only */}
  {rows.map(row => (
    <div key={row.id} className="border-b p-4 space-y-1">
      <div className="font-medium">{row.getValue('booking_ref')}</div>
      <div className="text-sm text-muted">{row.getValue('pickup_location')}</div>
      <div className="text-sm">{row.getValue('status')}</div>
    </div>
  ))}
</div>
<div className="hidden md:block">
  <table>...</table>
</div>
```

**Pattern for admin forms (manual booking creation, pricing editor, promo code admin):**

Standard Tailwind responsive grid — no new library:

```tsx
<div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
  <div className="col-span-1 md:col-span-2">{/* wide field */}</div>
  <div>{/* narrow field */}</div>
</div>
```

**Touch target sizing:** Already established — WCAG 44px minimum. Apply `min-h-[44px]` or `py-3` to
all interactive elements in the admin UI. Existing booking wizard already follows this pattern.

**Sidebar navigation on mobile:** Existing `AdminSidebar` needs a hamburger toggle on mobile.
Pattern: `useState(false)` for `isOpen`, `translate-x-[-100%]` / `translate-x-0` transition with
a fixed overlay backdrop. No new library — Tailwind CSS transition utilities handle this.

---

### 4. Holiday Dates Storage and Application (PRICING-07)

**Verdict:** No new libraries. Two valid PostgreSQL approaches; the simpler wins for this scope.

**Option A — Extend `pricing_config` JSONB (recommended):**

Add a `holiday_dates` key to the existing `pricing_config.data` JSONB column:

```json
{
  "...existing pricing fields...",
  "holiday_dates": ["2026-12-25", "2026-12-26", "2027-01-01", "2027-04-05"]
}
```

Rationale: The pricing engine already reads all configuration from this table. Holiday dates are
pricing configuration — they determine which coefficient applies. Adding a new key to the existing
JSONB avoids a schema migration. Cache invalidation follows the existing pattern (tag `pricing-config`).

Holiday date matching in `lib/pricing.ts`:

```typescript
const tripDate = format(pickupDateTime, 'yyyy-MM-dd'); // date-fns already available via react-day-picker peer dep
const isHoliday = pricingConfig.holiday_dates?.includes(tripDate) ?? false;
const coefficient = isHoliday
  ? pricingConfig.holiday_coefficient
  : isNightTime(pickupDateTime)
  ? pricingConfig.night_coefficient
  : 1;
```

**Option B — Separate `holiday_dates` table (use only if per-date metadata is needed):**

```sql
CREATE TABLE holiday_dates (
  id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL UNIQUE,
  label TEXT  -- optional: "Christmas Day", "New Year"
);
```

This adds flexibility for per-date labels and querying ranges. For v1.3 scope (apply holiday
coefficient, no per-date labels needed), this is over-engineered. Prefer Option A.

**Date format:** Store as `YYYY-MM-DD` ISO strings (not timestamps). Avoids timezone edge cases.
The booking wizard captures local Prague time; compare date strings directly.

**Date library:** `date-fns` is NOT in `package.json` directly, but `react-day-picker` ^9.14.0
depends on it as a peer and it will be available. The `format()` function from `date-fns` is safe
to import. Alternatively, the comparison can be done with native `Date` without any library:

```typescript
const tripDate = pickupDateTime.toISOString().slice(0, 10); // 'YYYY-MM-DD'
```

Native slice is sufficient — no additional dependency required.

**Admin UI for holiday dates:** A date picker (multiple selection) or a tag-style input for entering
dates. `react-day-picker` ^9.14.0 is already installed and supports multi-select mode
(`mode="multiple"`). No new library needed.

---

## Summary: What to Install

```bash
# Nothing to install for v1.3.
# All four feature areas are implemented with the current package.json.
```

---

## Version Compatibility Notes

| Package | Current in package.json | v1.3 Impact | Action |
|---------|------------------------|-------------|--------|
| `stripe` | ^21.0.1 | `stripe.refunds.create()` works identically in v21 | Stay on ^21.0.1; do NOT upgrade to v22 during v1.3 |
| `@tanstack/react-table` | ^8.21.3 | `meta.className` pattern fully supported | No change |
| `react-day-picker` | ^9.14.0 | `mode="multiple"` for holiday date picker | No change; multi-select is a built-in prop |
| `zod` | ^4.3.6 | Promo code validation schema | No change |
| `react-hook-form` + `@hookform/resolvers` | ^7.72.0 / ^5.2.2 | Admin forms for promo codes, manual booking | No change |
| `@supabase/supabase-js` | ^2.101.0 | New `promo_codes` table queries, `.rpc()` for increment | No change |

---

## What NOT to Add

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Any promo code npm library (e.g. `voucher-codes`, `coupon-node`) | They impose their own schema and generation logic; the Supabase table is trivial to write and gives full control | Custom `promo_codes` table with Zod validation |
| `date-fns` as a direct dependency | `react-day-picker` already brings it as a peer; adding it directly risks version conflicts | Import from `date-fns` (it is already in `node_modules`), or use native `Date.toISOString().slice(0,10)` |
| `stripe` v22.0.0 | Breaking changes released 2026-04-03; removing callbacks requires auditing all SDK call sites; `refunds.create()` usage pattern is the same in v21 — upgrade adds risk with zero v1.3 benefit | Stay on `stripe` ^21.0.1 for v1.3; schedule v22 upgrade as a separate task |
| Radix UI / shadcn/ui | Would standardize admin form components but introduces a new design system dependency mid-project; existing Tailwind CSS components are consistent with the PRESTIGO brand | Tailwind CSS utility classes following existing component patterns |
| A headless UI library (Headless UI, Radix UI) for the mobile sidebar | Single hamburger toggle is two lines of `useState` + Tailwind transitions | `useState` + `translate-x-*` + `transition` classes |
| `ag-grid-community` or `react-virtualized` | Admin bookings table will not exceed thousands of rows for a single-operator Prague service | `@tanstack/react-table` with Tailwind responsive classes |
| PostGIS extension for holiday date queries | Spatial extension is only needed for geographic queries; holiday dates are simple date comparisons | JSONB array on `pricing_config` or a `DATE[]` column |

---

## Stripe Upgrade Path (post-v1.3)

Document for future reference — v22 upgrade requires:

1. Remove all callback patterns (already none in codebase — LOW risk)
2. Audit calls where `apiKey` is passed inline to individual methods — move to request options
3. Check `createFetchHttpClient` compatibility with v22 (the existing Vercel Hobby workaround)
4. Run full Vitest suite after upgrade to catch argument-ordering regressions

Estimated effort: 1–2 hours. Not blocking v1.3.

---

## Sources

- [Stripe — Create a Refund (Node.js)](https://docs.stripe.com/api/refunds/create?lang=node) — `stripe.refunds.create({ payment_intent })` signature; HIGH confidence
- [Stripe — Refund and cancel payments](https://docs.stripe.com/refunds) — partial refunds, metadata, constraints; HIGH confidence
- [stripe-node v22.0.0 Release Notes](https://github.com/stripe/stripe-node/releases/tag/v22.0.0) — breaking changes confirmed, async/await unaffected; HIGH confidence
- [TanStack Table — Column Visibility Guide](https://tanstack.com/table/v8/docs/guide/column-visibility) — `meta.className` pattern; HIGH confidence
- [TanStack Table — Responsive Collapse Discussion #3259](https://github.com/TanStack/table/discussions/3259) — community-verified mobile pattern; MEDIUM confidence
- [DEV Community — Responsive Collapse of Columns in TanStack Table](https://dev.to/juancruzroldan/responsive-collapse-of-columns-in-tanstack-table-2175) — implementation walkthrough; MEDIUM confidence
- [Tailwind CSS — Responsive Design](https://tailwindcss.com/docs/responsive-design) — mobile-first breakpoint strategy; HIGH confidence
- [PostgreSQL — JSON Types](https://www.postgresql.org/docs/current/datatype-json.html) — JSONB for holiday dates storage; HIGH confidence
- [react-day-picker v9 — Mode multiple](https://react-day-picker.js.org/docs/selection-modes) — `mode="multiple"` for holiday date admin picker; HIGH confidence (installed version confirmed)

---

*Stack research for: Prestigo v1.3 Pricing & Booking Management*
*Researched: 2026-04-03*
