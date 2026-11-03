---
phase: 86-admin-shell
reviewed: 2026-11-03T00:00:00Z
depth: standard
files_reviewed: 51
files_reviewed_list:
  - app/(internal)/admin/(dashboard)/accounts/[id]/page.tsx
  - app/(internal)/admin/(dashboard)/accounts/page.tsx
  - app/(internal)/admin/(dashboard)/bookings/page.tsx
  - app/(internal)/admin/(dashboard)/drivers/page.tsx
  - app/(internal)/admin/(dashboard)/layout.tsx
  - app/(internal)/admin/(dashboard)/outbox/page.tsx
  - app/(internal)/admin/(dashboard)/promo-codes/page.tsx
  - app/(internal)/admin/admin-theme.css
  - app/(internal)/admin/layout.tsx
  - app/(internal)/admin/login/page.tsx
  - components/admin/AccountForm.tsx
  - components/admin/AdminBookingWizard.tsx
  - components/admin/AdminShell.tsx
  - components/admin/AdminSidebar.tsx
  - components/admin/AdminStep6Create.tsx
  - components/admin/BookingChangeHistory.tsx
  - components/admin/BookingsTable.tsx
  - components/admin/DispatchDefault.tsx
  - components/admin/DriverAssignmentSection.tsx
  - components/admin/DriverForm.tsx
  - components/admin/DriversTable.tsx
  - components/admin/ErasureAuditTable.tsx
  - components/admin/ErasureConfirmForm.tsx
  - components/admin/ErasurePreview.tsx
  - components/admin/FlightStatusBlock.tsx
  - components/admin/HealthBanner.tsx
  - components/admin/KPICard.tsx
  - components/admin/ManualBookingForm.tsx
  - components/admin/MergedByPhoneTable.tsx
  - components/admin/Modal.tsx
  - components/admin/NotificationToggles.tsx
  - components/admin/OutboxTable.tsx
  - components/admin/PricingForm.tsx
  - components/admin/PromoCard.tsx
  - components/admin/PromoCodeForm.tsx
  - components/admin/PromoCodesTable.tsx
  - components/admin/RoutesTable.tsx
  - components/admin/SharedNumbersTable.tsx
  - components/admin/StatsChart.tsx
  - components/admin/StatusBadge.tsx
  - components/admin/ZoneMapInner.tsx
  - components/admin/adminFieldStyles.ts
  - components/admin/stats/B2BTab.tsx
  - components/admin/stats/CustomersTab.tsx
  - components/admin/stats/OverviewTab.tsx
  - components/booking/AddressInput.tsx
  - components/booking/steps/Step1TripType.tsx
  - components/booking/steps/Step2DateTime.tsx
  - components/booking/steps/Step5Passenger.tsx
  - lib/admin-shell-prefs.ts
  - scripts/qa/admin-caps-scan.mjs
findings:
  critical: 0
  warning: 3
  info: 4
  total: 7
status: issues_found
---

# Phase 86: Code Review Report

**Reviewed:** 2026-11-03
**Depth:** standard
**Files Reviewed:** 51
**Status:** issues_found

## Summary

Phase 86 is mostly a colour-to-token conversion plus a new cookie-driven shell. The security-relevant and
structural parts hold up:

- Cookie parsing in `lib/admin-shell-prefs.ts` uses strict equality onto two-value unions, so hostile values
  fall back to light / expanded. The cookie value is never reflected into markup. Serialisation emits only
  the two literal values, `Path=/admin`, `SameSite=Lax`, and `Secure` on https.
- No hydration mismatch. The server reads the cookies and seeds `useState` once, and `matchMedia` is only read
  inside event handlers.
- Admin styles do not leak onto public pages. Every rule is scoped under `.admin-shell`. The one
  exception, `html:has(.admin-shell[data-admin-theme="light"])`, only matches while a light admin wrapper exists.
- The `--status-*` tokens exist only inside `.admin-shell`. The public booking step fallbacks
  (`var(--status-danger-fg, #f87171)` and similar) therefore resolve to the original literals on public pages.
  No `--status-*` is defined in `globals.css`. No component under `components/admin` is imported by the driver
  or public routes.
- Every `var(--admin-*)` and `var(--status-*)` token used in `app/`, `components/` and `lib/` is declared in
  `admin-theme.css`. I found no undefined token.

No security or data-loss defects. Three warnings, all visual or behavioural drift from "dark equals today".

## Warnings

### WR-01: Heading and wordmark fonts use literal family names that next/font does not register

**File:** `app/(internal)/admin/admin-theme.css:42` (also `:87`, `:146`, `:190`)
**Issue:** `--admin-font-brand: 'Fraunces', Georgia, serif`, dark `--admin-font-heading: 'Fraunces', Georgia, serif`
and light `--admin-font-heading: 'Inter', 'Helvetica Neue', sans-serif` name the fonts literally.
`components/SiteChrome.tsx` loads them through `next/font/google` with `variable: '--font-cormorant'` and
`variable: '--font-montserrat'`. next/font registers the faces under hashed family names
(`__Fraunces_xxxx`), so the literal names `'Fraunces'` and `'Inter'` match nothing unless the font is
installed on the operator's machine.

The affected text falls back to Georgia or Helvetica Neue / system sans-serif:
- sidebar wordmark and login `h1` (`--admin-font-brand`, both themes)
- Modal titles, KPI values and the BookingsTable detail-sheet title (`--admin-font-heading`)
- every legacy `var(--font-cormorant)` reference in light, because `.admin-shell[data-admin-theme="light"]`
  remaps `--font-cormorant` to the literal `'Inter'` stack

Before the phase these used `var(--font-cormorant)`, which resolves to the loaded Fraunces. This contradicts
the stated "dark equals today's inline values". Georgia and Helvetica look close enough that visual UAT
probably missed it.

**Fix:** Reference the next/font variables instead of family names.
- Dark: drop the `--admin-font-heading` override, or set it to `var(--font-cormorant)`.
- Light: set `--admin-font-heading: var(--font-montserrat)`.
- `--admin-font-brand`: `var(--font-cormorant)` cannot be used on the same element that remaps
  `--font-cormorant` in light, because it would resolve to the remapped value. Add a dedicated
  `variable: '--font-fraunces'` in `SiteChrome`, or define `--admin-font-brand` on a parent element that
  does not remap. Then use `var(--font-fraunces), Georgia, serif`.

```css
.admin-shell[data-admin-theme="light"] { --admin-font-heading: var(--font-montserrat), 'Helvetica Neue', sans-serif; }
.admin-shell[data-admin-theme="dark"]  { --admin-font-heading: var(--font-cormorant); }
```

### WR-02: Dark booking wizard panel now has the same colour as the public step inputs and cards

**File:** `components/admin/AdminBookingWizard.tsx:138` (also `:158`)
**Issue:** The slide-over panel and its sticky header changed from `var(--anthracite)` (dark #0F1D2C) to
`var(--admin-surface)` (dark #17293B). The public booking steps rendered inside it (Step 1 to 5) style their
inputs and cards with `var(--anthracite-mid)`, which is also #17293B in dark. In dark the inputs and cards
are now flush with the panel and are separated only by their border, with no raised look. The light theme is
unaffected because both resolve to #F7F4EF. The same step markup on the public site keeps the navy-on-raised-navy
look, so only the admin copy regressed.

**Fix:** Keep the wizard on the base surface for dark, for example `var(--admin-sidebar-bg)`. That is #0F1D2C in
dark and #E5DCCB in light, where the inputs are #F7F4EF, so contrast is preserved. Alternatively add a
`--admin-sheet-bg` token (dark #0F1D2C, light #F7F4EF) and use it for the wizard panel and header.

### WR-03: Collapse button changes both its accessible name and its `aria-expanded` state

**File:** `components/admin/AdminSidebar.tsx:181-184`
**Issue:** The button sets `aria-label` to "Collapse sidebar" or "Expand sidebar" and also sets
`aria-expanded={!collapsed}`. Screen readers announce "Collapse sidebar, expanded" and then
"Expand sidebar, collapsed". The WAI-ARIA disclosure pattern keeps the label static and lets
`aria-expanded` carry the state, so toggling both is contradictory and was introduced by this phase.
The tooltip text also depends on the label.

**Fix:** Use a static label and let `aria-expanded` convey state. Keep the dynamic string only for the visual
tooltip.

```tsx
aria-label="Sidebar"
aria-expanded={!collapsed}
aria-controls="admin-sidebar"
{...tipHandlers(collapseLabel, SHORTCUT_HINT)}
```

## Info

### IN-01: Rail tooltip opens on focus caused by a mouse click and has no keyboard dismissal

**File:** `components/admin/AdminSidebar.tsx:96-104`, `:216`
**Issue:** `onFocus` shows the tooltip immediately, with no hover intent. After clicking a nav item in the
collapsed rail, the link keeps focus across navigation and the tooltip stays until blur or mouse-leave. It
cannot be dismissed with Escape (WCAG 1.4.13). The tooltip is supplementary, since the items have
visually-hidden labels, so impact is small.
**Fix:** Add an Escape `keydown` handler that calls `clearTip()`, or show the focus tooltip only when
`e.currentTarget.matches(':focus-visible')`.

### IN-02: Ctrl/Cmd+\ also toggles the sidebar below the md breakpoint, where it has no visible effect

**File:** `components/admin/AdminSidebar.tsx:121-135`
**Issue:** The shortcut handler has no viewport guard. On a phone with a hardware keyboard it silently flips
and persists `admin_sidebar`, which then shows as collapsed on the next desktop visit. The handler also
ignores `e.repeat`, so holding the keys toggles repeatedly.
**Fix:** Add `if (e.repeat) return` and, optionally, `if (!window.matchMedia('(min-width: 768px)').matches) return`.

### IN-03: Dark sidebar hover and active backgrounds are identical

**File:** `app/(internal)/admin/admin-theme.css:162-163`
**Issue:** In dark, `--admin-sidebar-hover` and `--admin-sidebar-active` are both #17293B. Expanded rows are
still distinguished by the 3px accent bar. In the collapsed rail, hovering any icon looks the same as the
active item apart from that bar. Light uses distinct values.
**Fix:** Make the hover token a lighter step (for example `#13243A`), or use the hover colour from
`--admin-hover`.

### IN-04: Modal action-row stickiness is applied in dark too and adds padding the spec scoped to the sheet

**File:** `app/(internal)/admin/admin-theme.css:321-327`
**Issue:** The sticky action-row rule is intentionally theme-independent (the E6 requirement), but
`padding-top: 16px` is added on top of the action rows' existing inline `marginTop` (16px in AccountForm and
DriverForm, 24px in ErasureConfirmForm). The visible gap above the buttons grows, and content scrolling under
the row shows through the margin gap, which sits outside the row's background.
**Fix:** Because the margin is inline, a stylesheet rule needs `margin-top: 0 !important` to cancel it. Add that
to the sticky selectors and rely on the 16px padding alone.

---

_Reviewed: 2026-11-03_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
