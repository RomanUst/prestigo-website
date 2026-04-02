# Phase 15: UI Design Contract — Research

**Researched:** 2026-04-02
**Domain:** Admin UI design specification — dark-mode operator dashboard, component-level spec writing
**Confidence:** HIGH

---

## Summary

Phase 15 produces a single document (`UI-SPEC.md`) consumed by Phase 16 as a pixel-level contract. No code is written. The output answers every visual question a developer needs before touching a component: exact token values, layout measurements, component anatomy, and state variants.

The project already has a complete, authoritative design system (`design-system/MASTER.md`) and a brand style guide (`STYLEGUIDE.md`). The admin shell (sidebar + layout) is already built and uses dark anthracite styling. Phase 15 must extend that existing system into four new admin pages — it does **not** retheme or redesign what exists.

The critical insight is that the admin UI is **dark-mode only** (not "light admin UI adapted from copper/anthracite" as the roadmap suggests). The existing `AdminSidebar.tsx` and `app/admin/(dashboard)/layout.tsx` already use `var(--anthracite)` and `var(--anthracite-mid)` directly. The spec must match what's already built, not invent a new light-mode variant.

**Primary recommendation:** Write `UI-SPEC.md` as a flat Markdown file that specifies every component in the required inventory using the existing design system tokens verbatim, extending into admin-specific patterns (KPI cards, data tables, status badges, filter chips, charts) without introducing new design decisions beyond what's necessary.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PRICING-01 | Operator can edit base rates per vehicle class (business, first_class, business_van): rate_per_km, hourly_rate, daily_rate | PricingForm spec must show 3-row table with 3 numeric fields each; maps directly to pricing_config schema |
| PRICING-02 | Operator can edit extras surcharges (child seat, meet & greet, extra luggage) | Extras section in PricingForm; maps to pricing_globals.extra_* fields |
| PRICING-03 | Operator can edit the airport fee (flat surcharge) | Single numeric field in pricing_globals section |
| PRICING-04 | Operator can edit night coefficient and holiday coefficient | Two multiplier fields (decimal, e.g. 1.25) in pricing_globals section |
| ZONES-01 | Operator can draw a polygon on interactive Google Maps canvas | ZoneMap component spec: map canvas + terra-draw toolbar, draw mode toggle |
| ZONES-02 | Operator can assign name to drawn zone and save | Zone name input + Save button; post-draw modal or inline form |
| ZONES-03 | Operator can toggle zone active/inactive without deleting | Zone list row: name + active toggle (switch) + delete icon |
| BOOKINGS-01 | Operator sees paginated table of all bookings (most recent first) | BookingsTable spec: columns, pagination controls, row structure |
| BOOKINGS-02 | Table can be filtered by pickup date range | FilterChips / date range picker spec |
| BOOKINGS-03 | Table can be filtered by trip type | Trip type filter chip group spec |
| BOOKINGS-04 | Table has search by client name or booking reference | Search input spec in table header |
| BOOKINGS-05 | Clicking row expands full booking detail | Expandable row spec with all booking fields |
| STATS-01 | Dashboard shows total revenue (CZK) for current month and previous month | KPICard spec: revenue variant with CZK formatting |
| STATS-02 | Dashboard shows booking count for today, this week, this month | KPICard spec: count variant with period labels |
| STATS-03 | Revenue breakdown by vehicle class (pie or bar chart) | StatsChart spec: bar chart variant, vehicle class legend |
| STATS-04 | Revenue breakdown by trip type | StatsChart spec: second bar/pie for trip type |
| STATS-05 | 12-month revenue bar chart (monthly totals) | StatsChart spec: bar chart with monthly x-axis, 12 bars |
</phase_requirements>

---

## Standard Stack

### Core (already installed — confirmed from package.json)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js | 16.1.7 | App router, admin route group | Already in use |
| Tailwind CSS | ^4 | Utility styling | Already in use, v4 @theme config active |
| Montserrat | next/font | UI text font | Already loaded via next/font/google |
| Cormorant Garamond | next/font | Display / page title font | Already loaded via next/font/google |
| Lucide React | ^1.6.0 | SVG icons | Already installed, in design system |
| react-hook-form | ^7.72.0 | Form state | Already installed for booking wizard |
| Zod | ^4.3.6 | Form validation schemas | Already installed |

### To Be Installed in Phase 16 (not Phase 15 — spec only)

| Library | Purpose | Phase 16 decision |
|---------|---------|-------------------|
| recharts | StatsChart (bar, pie) | npm install recharts |
| @tanstack/react-table | BookingsTable | npm install @tanstack/react-table |
| @vis.gl/react-google-maps | ZoneMap base map | npm install @vis.gl/react-google-maps |
| terra-draw | Polygon drawing on map | npm install terra-draw |

**Phase 15 installs nothing.** The spec document does not require package installation.

---

## Architecture Patterns

### Admin Page Structure (established in Phase 13)

```
app/
└── admin/
    └── (dashboard)/          ← route group, guarded by layout.tsx
        ├── layout.tsx         ← AdminSidebar + main wrapper (BUILT)
        ├── page.tsx           ← /admin index (BUILT)
        ├── pricing/
        │   └── page.tsx       ← Phase 16
        ├── zones/
        │   └── page.tsx       ← Phase 16
        ├── bookings/
        │   └── page.tsx       ← Phase 16
        └── stats/
            └── page.tsx       ← Phase 16

components/
└── admin/
    ├── AdminSidebar.tsx       ← BUILT — dark, 240px fixed left
    ├── StatusBadge.tsx        ← Phase 16
    ├── KPICard.tsx            ← Phase 16
    ├── BookingsTable.tsx      ← Phase 16
    ├── PricingForm.tsx        ← Phase 16
    ├── ZoneMap.tsx            ← Phase 16
    ├── StatsChart.tsx         ← Phase 16
    └── FilterChips.tsx        ← Phase 16
```

### Existing Admin Shell Measurements (from actual code)

The following are confirmed from reading the built source files — not estimated:

| Element | Value | Source |
|---------|-------|--------|
| Sidebar width | 240px | AdminSidebar.tsx inline style |
| Sidebar background | `var(--anthracite)` = `#1C1C1E` | AdminSidebar.tsx |
| Sidebar border | `1px solid var(--anthracite-light)` on right | AdminSidebar.tsx |
| Main content background | `var(--anthracite-mid)` = `#2A2A2D` | layout.tsx |
| Main content padding | 32px | layout.tsx |
| Nav item font size | 13px | AdminSidebar.tsx |
| Nav item color | `var(--warmgrey)` = `#9A958F` | AdminSidebar.tsx |
| Logo font | `var(--font-cormorant)`, 20px, `var(--offwhite)` | AdminSidebar.tsx |
| "Admin" label | 10px, `var(--warmgrey)`, 0.25em letter-spacing, uppercase | AdminSidebar.tsx |

These values are locked — the spec must use them exactly for sidebar tokens.

### Admin Color System (adapted for dark admin)

The admin UI is entirely dark-mode. There is no light-mode adaptation. The spec must NOT introduce white/light backgrounds.

| Semantic Role | Token | Hex |
|--------------|-------|-----|
| Page background | `var(--anthracite)` | `#1C1C1E` |
| Content area / cards | `var(--anthracite-mid)` | `#2A2A2D` |
| Elevated card hover / table row hover | `var(--anthracite-light)` | `#3A3A3F` |
| Primary text | `var(--offwhite)` | `#F5F2EE` |
| Secondary text / labels | `var(--warmgrey)` | `#9A958F` |
| Brand accent / active nav | `var(--copper)` | `#B87333` |
| Hover state | `var(--copper-light)` | `#D4924A` |
| Borders / dividers | `var(--anthracite-light)` | `#3A3A3F` |

### Status Badge Color System

No existing brand colors map cleanly to semantic status states (booking has no formal status field in the current schema — BOOKINGS-V2-01 is deferred). The design references from the roadmap describe: Open=red, Confirmed=green, Ongoing=orange.

For Phase 15/16, status colors must be **neutral semantic colors** that do not conflict with the copper/anthracite brand. These are admin-only tokens — not added to globals.css brand palette. Implement as inline styles or scoped CSS.

| Status | Background | Text | Border |
|--------|-----------|------|--------|
| Confirmed / Active | `#1a3a2a` | `#4ade80` | `1px solid #22c55e40` |
| Pending / Open | `#3a2a1a` | `#fb923c` | `1px solid #f9731640` |
| Inactive / Cancelled | `#2a1a1a` | `#f87171` | `1px solid #ef444440` |
| Quote | `#1a2a3a` | `#60a5fa` | `1px solid #3b82f640` |

These are dark-mode semantic colors — muted backgrounds, bright-enough text on dark surface, all WCAG AA compliant on `var(--anthracite-mid)`.

### Design Reference Synthesis

**Ref 1 (Requests dashboard):** Left sidebar with nav, filter chips row above table, data table with colored status badges, search bar. This maps to the `/admin/bookings` page.

**Ref 2 (TAYLOR chauffeur admin):** KPI metric cards in a row, booking volume bar+line charts, upcoming bookings table, recent activity panel, trip detail view. This maps to `/admin/stats` and `/admin/bookings` detail view.

Both references are text descriptions in the roadmap (no image files found in repo for these). The spec synthesizes these patterns using established design system tokens.

### Anti-Patterns to Avoid

- **Light background on admin pages:** Main content area is `var(--anthracite-mid)` — never white or near-white
- **Rounded corners > 4px:** Cards use `border-radius: 4px` per design system
- **Bold weights on Cormorant page titles:** `font-weight: 300` for all display text
- **Copper as background:** Copper is accent only — use for active nav indicator, icons, CTAs
- **Plain `<a>` tags in Phase 16:** State decisions say Phase 15/16 can upgrade to `next/link` for prefetching (noted in Phase 13 key decisions)

---

## Component Inventory — What the Spec Must Cover

### 1. AdminSidebar (BUILT — spec documents existing behavior)

Already implemented. Spec captures existing measurements for reference and adds:
- Active nav item indicator: left `3px solid var(--copper)` border, text color `var(--offwhite)`
- Hover state: text color `var(--offwhite)`, transition 150ms
- Section: the component uses plain `<a>` tags — Phase 16 upgrades to `next/link`

### 2. StatusBadge

| Property | Value |
|----------|-------|
| Display | `inline-flex`, `align-items: center`, `gap: 6px` |
| Padding | `3px 8px` |
| Font | Montserrat, 10px, weight 400, uppercase, letter-spacing 0.08em |
| Border-radius | 2px |
| Variants | active, inactive, pending, quote (see color table above) |
| Icon | 6px dot (colored circle) left of text |

### 3. KPICard

| Property | Value |
|----------|-------|
| Background | `var(--anthracite-mid)` |
| Border | `1px solid var(--anthracite-light)` |
| Border-radius | 4px |
| Padding | 24px |
| Min-width | 200px |
| Hover | border-color transitions to `var(--copper)`, 300ms |
| Label | Montserrat 9px, uppercase, letter-spacing 0.4em, `var(--copper)` |
| Value | Cormorant Garamond 32px, weight 300, `var(--offwhite)` |
| Sub-label | Montserrat 11px, `var(--warmgrey)` |
| Layout | `display: flex`, `flex-direction: column`, gap 8px |

### 4. BookingsTable

Columns for the table (from bookings schema):

| Column | Display Name | Width | Notes |
|--------|-------------|-------|-------|
| booking_reference | Ref | 120px | Monospace-style, copper color |
| pickup_date + pickup_time | Pickup | 140px | Date + time combined |
| client_first_name + client_last_name | Client | 180px | Full name |
| trip_type | Type | 100px | FilterChip-style label |
| vehicle_class | Vehicle | 120px | Business / First Class / Business Van |
| amount_czk | Amount | 100px | CZK formatted, right-aligned |
| (expand toggle) | — | 48px | Chevron icon, right-aligned |

Expandable row reveals:
- origin_address, destination_address
- extras (child_seat, meet_greet, extra_luggage — boolean badges)
- flight_number, terminal (if set)
- special_requests (if set)
- payment_intent_id (monospace, truncated)
- passengers, luggage count

Pagination controls: Previous / Next buttons + "Page X of Y" label + "Showing N–M of total" count.

### 5. FilterChips

| Property | Value |
|----------|-------|
| Height | 32px |
| Padding | 0 12px |
| Font | Montserrat 11px, weight 400, letter-spacing 0.06em |
| Border-radius | 2px |
| Inactive | border `1px solid var(--anthracite-light)`, text `var(--warmgrey)` |
| Active | border `1px solid var(--copper)`, text `var(--offwhite)`, bg `#B8733318` |
| Hover | border-color `var(--warmgrey)`, text `var(--offwhite)` |
| Gap between chips | 8px |

Trip type chips: All / Transfer / Hourly / Daily (maps to `trip_type` values: `transfer`, `hourly`, `daily`)

### 6. PricingForm

Two sections:

**Section A — Vehicle Class Rates**
Table layout with rows = vehicle classes, columns = rate_per_km / hourly_rate / daily_rate.

| Property | Value |
|----------|-------|
| Row label | Vehicle class name, Montserrat 13px, `var(--offwhite)` |
| Input field | Width 100px, text-align right, `var(--anthracite)` bg, `var(--offwhite)` text, `1px solid var(--anthracite-light)` border, `1px solid var(--copper)` on focus |
| Column header | Montserrat 9px, uppercase, letter-spacing 0.4em, `var(--warmgrey)` |
| Section | Card container with 24px padding, 4px radius, `var(--anthracite-mid)` bg |
| Units suffix | "EUR/km", "EUR/h", "EUR/day" shown as `var(--warmgrey)` suffix after input |

**Section B — Global Pricing Parameters**
Two-column grid of named fields:

| Field | Label | Type | Notes |
|-------|-------|------|-------|
| airport_fee | Airport Fee | number | EUR flat rate |
| night_coefficient | Night Coefficient | decimal | e.g. 1.25 means +25% |
| holiday_coefficient | Holiday Coefficient | decimal | e.g. 1.50 |
| extra_child_seat | Child Seat | number | EUR per booking |
| extra_meet_greet | Meet & Greet | number | EUR per booking |
| extra_luggage | Extra Luggage | number | EUR per booking |

Save button: Primary CTA style — `var(--copper)` border, uppercase, 14px 32px padding, flat (border-radius: 0). Disabled state during save: `opacity: 0.5`, `cursor: not-allowed`. Success: brief green status indicator (not a toast library — inline status text).

### 7. ZoneMap

| Property | Value |
|----------|-------|
| Map container | Full remaining height after header, min-height 480px |
| Map theme | Dark map tiles (Google Maps "dark" or night style) |
| Draw toolbar | Top-right overlay: "Draw Zone" button + "Cancel" button when drawing |
| Zone list panel | Right side panel, 280px wide, or below map on smaller viewports |
| Zone row | Name text + active toggle switch + delete icon (Lucide Trash2, `var(--warmgrey)`) |
| Active toggle | Custom switch: 36px wide, 20px tall, copper when active, anthracite-light when inactive |
| Save zone prompt | Appears after polygon closed: text input (zone name) + Save button, shown as overlay or below map |
| Empty state | "No zones defined. All bookings will be accepted." in `var(--warmgrey)` |

### 8. StatsChart

Library: recharts (Phase 16 install). Spec defines chart configuration.

| Property | Value |
|----------|-------|
| Chart background | transparent (inherits `var(--anthracite-mid)` from card) |
| Grid lines | `var(--anthracite-light)` #3A3A3F, dashed |
| Axis text | Montserrat 10px, `var(--warmgrey)` |
| Bar color — primary | `var(--copper)` `#B87333` |
| Bar color — secondary/comparison | `var(--copper-pale)` `#E8B87A` |
| Tooltip bg | `var(--anthracite)` with `1px solid var(--anthracite-light)` border |
| Tooltip text | Montserrat 11px, `var(--offwhite)` |
| Bar border-radius | 2px (top corners only) |
| Chart height | 280px |

Three chart instances:
1. **Revenue 12-month bar:** x-axis = month abbreviations (Jan–Dec), y-axis = CZK, single bar series
2. **Revenue by vehicle class:** Grouped bar or stacked bar — 3 series (business/first_class/business_van)
3. **Revenue by trip type:** Grouped bar or pie — 3 series (transfer/hourly/daily)

---

## Page Layout Specifications

### Layout Grid

```
[Sidebar 240px fixed] | [Main content area — flex: 1]
                         padding: 32px (existing)
                         background: var(--anthracite-mid)
```

**Minimum supported width:** 1024px (desktop-first per roadmap)
**No mobile admin breakpoints** — admin is desktop-only tool, min 1024px.

### /admin/stats — Dashboard Page

```
[Page Title row]                              (Cormorant 28px, weight 400)
[KPI cards row — 4 cards in flex wrap]        (today count / week count / month count / month revenue)
[12-month revenue chart — full width card]
[2-column row: Vehicle Class chart | Trip Type chart]
```

### /admin/bookings — Bookings Page

```
[Page Title row]
[KPI summary row — 2 small cards: today's bookings, this week's revenue]
[Filter bar: Search input | Date range | Trip type chips]
[BookingsTable — full width]
[Pagination controls row]
```

### /admin/pricing — Pricing Page

```
[Page Title row]
[Section A: Vehicle Class Rates — card]
[Section B: Global Parameters — card]
[Save button row]
```

### /admin/zones — Zones Page

```
[Page Title row]
[2-column: ZoneMap canvas (flex: 1) | Zone list panel (280px)]
```

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Data tables with sort/filter/pagination | Custom table from scratch | @tanstack/react-table | Sorting, pagination, row expansion — 200+ edge cases |
| Chart rendering | SVG charts by hand | recharts | Responsive container, tooltips, axis formatting |
| Map polygon drawing | Custom canvas event handlers | terra-draw | Hit detection, polygon closing, vertex snapping are complex |
| Form validation UI | Manual error state logic | react-hook-form + zod (already installed) | Already established pattern in booking wizard |
| Toast/notification system | Custom toast component | Inline status text (no library) | Phase 15 spec calls for inline status — admin is single user, complexity not worth it |

---

## Common Pitfalls

### Pitfall 1: Inventing a "Light Admin UI"
**What goes wrong:** Spec describes a light-mode admin (white backgrounds, dark text) that conflicts with existing AdminSidebar and layout that are already dark.
**Why it happens:** Roadmap phrasing says "PRESTIGO copper/anthracite adapted for light admin UI" — this is misleading. The actual admin shell is dark.
**How to avoid:** Use `var(--anthracite-mid)` as main content bg, `var(--anthracite)` as sidebar. No white surfaces.
**Warning signs:** Spec mentions `#FFFFFF`, `#F8F9FA`, `background: white`.

### Pitfall 2: Specifying Inline Styles vs Tailwind Tokens
**What goes wrong:** Existing admin components use inline `style={{}}` objects, not Tailwind classes. A spec that specifies Tailwind `className` patterns will create a mismatch.
**Why it happens:** AdminSidebar and layout.tsx use inline styles because Tailwind v4 CSS variable syntax wasn't established when they were built.
**How to avoid:** The spec should use token names (e.g. `var(--copper)`) not Tailwind class names (e.g. `bg-copper`). Phase 16 developer can choose implementation approach.

### Pitfall 3: Over-specifying the ZoneMap
**What goes wrong:** Spec tries to describe terra-draw API behavior, map event handling, or drawing lifecycle.
**Why it happens:** Zone drawing is technically complex so there's temptation to specify it at code level.
**How to avoid:** ZoneMap spec covers visual layout, panel dimensions, button appearance, and UX flow only. terra-draw implementation details belong in Phase 16 PLAN, not the design spec.

### Pitfall 4: Missing the "no existing status field" reality
**What goes wrong:** Spec defines a booking status workflow (confirmed/in-progress/completed) that doesn't exist in the DB schema.
**Why it happens:** Design reference (Ref 1) shows colored status badges. BOOKINGS-V2-01 (status workflow) is deferred.
**How to avoid:** No status column in bookings table. StatusBadge component spec should be defined but applied to zone active/inactive state and potentially trip_type display — not booking status.

### Pitfall 5: Specifying responsive breakpoints below 1024px for admin
**What goes wrong:** Spec adds mobile/tablet admin layouts that Phase 16 would then build, wasting time.
**Why it happens:** Design system has mobile breakpoints; temptation to apply them.
**How to avoid:** Admin is explicitly desktop-first, min 1024px. State this clearly. Spec one breakpoint only: ≥1024px.

---

## Code Examples

### Existing Admin Shell Pattern (confirmed from source)

```typescript
// Source: prestigo/app/admin/(dashboard)/layout.tsx
// Main content wrapper — confirmed values
<main
  style={{
    flex: 1,
    padding: '32px',
    backgroundColor: 'var(--anthracite-mid)',
    fontFamily: 'var(--font-montserrat)',
    color: 'var(--offwhite)',
  }}
>
```

```typescript
// Source: prestigo/app/admin/(dashboard)/page.tsx
// Page title pattern — confirmed values
<h1
  style={{
    fontFamily: 'var(--font-cormorant)',
    fontSize: '28px',
    fontWeight: 400,
    color: 'var(--offwhite)',
    letterSpacing: '0.08em',
    marginBottom: '16px',
  }}
>
```

### Pricing API Response Shape (from route.ts — field names for PricingForm)

```typescript
// Source: prestigo/app/api/admin/pricing/route.ts
// GET response shape — PricingForm must bind to these field names
{
  config: [
    { vehicle_class: 'business', rate_per_km: 2.80, hourly_rate: 55, daily_rate: 320 },
    { vehicle_class: 'first_class', rate_per_km: 4.20, hourly_rate: 85, daily_rate: 480 },
    { vehicle_class: 'business_van', rate_per_km: 3.50, hourly_rate: 70, daily_rate: 400 },
  ],
  globals: {
    airport_fee: 0,
    night_coefficient: 1.0,
    holiday_coefficient: 1.0,
    extra_child_seat: 15,
    extra_meet_greet: 25,
    extra_luggage: 20,
  }
}
```

### Bookings Table Columns (from bookings schema)

```sql
-- Source: supabase/migrations/0001_create_bookings.sql
-- Table columns visible in BookingsTable (primary row):
booking_reference, pickup_date, pickup_time, client_first_name, client_last_name,
trip_type, vehicle_class, amount_czk

-- Expanded row detail columns:
origin_address, destination_address, hours, passengers, luggage,
extra_child_seat, extra_meet_greet, extra_luggage,
flight_number, terminal, special_requests, payment_intent_id, return_date
```

### Trip Type Values (from booking wizard)

```typescript
// Source: prestigo/types/booking.ts
export type TripType = 'transfer' | 'hourly' | 'daily'
// Display labels for FilterChips:
// 'transfer' → 'Transfer'
// 'hourly'   → 'Hourly'
// 'daily'    → 'Daily'
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Tailwind config.js color tokens | Tailwind v4 `@theme` block in globals.css | Phase 1 (v4 setup) | Colors defined as CSS custom properties in @theme, usable as `var(--color-*)` or Tailwind classes like `bg-copper` |
| CSS-in-JS / styled-components | Inline styles with CSS variables | Throughout v1.2 | Admin components use `style={{}}` with `var(--*)` references |
| `next/link` | Plain `<a>` tags in admin sidebar | Phase 13 decision | Noted for Phase 16 upgrade |

---

## Validation Architecture

`workflow.nyquist_validation` is `true` in `.planning/config.json` — include validation section.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest ^4.1.1 |
| Config file | `prestigo/vitest.config.ts` |
| Quick run command | `nvm use 22 && npx vitest run` |
| Full suite command | `nvm use 22 && npx vitest run` |

### Phase Requirements → Test Map

Phase 15 produces only a document (`UI-SPEC.md`). There are no runtime components to test. All listed requirements are design specs, not code behavior.

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PRICING-01–04 | PricingForm field spec exists in UI-SPEC.md | manual-only | n/a — document review | n/a |
| ZONES-01–03 | ZoneMap component spec complete | manual-only | n/a — document review | n/a |
| BOOKINGS-01–05 | BookingsTable spec matches schema | manual-only | n/a — document review | n/a |
| STATS-01–05 | StatsChart + KPICard specs defined | manual-only | n/a — document review | n/a |

Manual-only justification: Phase 15 output is a Markdown specification document, not executable code. No automated tests are applicable. Phase 16 tests will cover the implemented components.

### Sampling Rate

- **Per task commit:** n/a — document phase, no automated tests
- **Per wave merge:** n/a
- **Phase gate:** UI-SPEC.md reviewed and approved before Phase 16 begins

### Wave 0 Gaps

None — existing test infrastructure covers future phases. No new test infrastructure required for a document phase.

---

## Open Questions

1. **Active nav item indicator**
   - What we know: AdminSidebar currently uses `var(--warmgrey)` for all nav items with no active distinction
   - What's unclear: Phase 13 used plain `<a>` tags — no `usePathname()` active state logic exists
   - Recommendation: Spec the active indicator visually (left copper border), note that Phase 16 must upgrade `<a>` to `next/link` and add `usePathname()` active detection

2. **BookingsTable — no status column**
   - What we know: The bookings table schema has no `status` column; BOOKINGS-V2-01 (status workflow) is deferred
   - What's unclear: Design Ref 1 shows colored status badges (Open/Confirmed/Ongoing) — none of these states exist in the current schema
   - Recommendation: StatusBadge component is still specced and built (useful for zone active/inactive display), but BookingsTable rows do not show a booking status column in Phase 16

3. **Currency display**
   - What we know: `amount_czk` is stored as integer CZK; booking wizard uses EUR for calculation
   - What's unclear: Should KPI cards show EUR or CZK revenue totals?
   - Recommendation: Display CZK (column name is `amount_czk`, operator is Prague-based, CZK is primary currency)

---

## Sources

### Primary (HIGH confidence)

- `prestigo/components/admin/AdminSidebar.tsx` — exact sidebar measurements and token values
- `prestigo/app/admin/(dashboard)/layout.tsx` — exact layout shell measurements
- `prestigo/app/api/admin/pricing/route.ts` — exact pricing API field names and shape
- `prestigo/app/api/admin/bookings/route.ts` — exact bookings query params and response shape
- `prestigo/app/api/admin/zones/route.ts` — exact zone schema for ZoneMap
- `supabase/migrations/0001_create_bookings.sql` — exact bookings table columns
- `supabase/migrations/0002_create_pricing_config.sql` — exact pricing tables
- `design-system/MASTER.md` — authoritative design system tokens, spacing, component patterns
- `STYLEGUIDE.md` — brand identity, colour system, typography scale

### Secondary (MEDIUM confidence)

- `.planning/ROADMAP.md` Phase 15 + Phase 16 sections — design references text descriptions, component inventory list
- `.planning/REQUIREMENTS.md` — requirement IDs and descriptions

### Tertiary (LOW confidence)

- None required — all critical findings sourced from project files directly.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — confirmed from package.json and existing source files
- Architecture: HIGH — confirmed from built admin shell source code
- Component specs: HIGH for token values (from design system), MEDIUM for specific px measurements not yet built
- Pitfalls: HIGH — derived from explicit code decisions in STATE.md and actual source inspection

**Research date:** 2026-04-02
**Valid until:** 2026-05-02 (stable project — no external library churn risk for a document phase)
