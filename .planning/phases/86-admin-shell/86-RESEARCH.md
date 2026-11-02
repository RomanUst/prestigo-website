# Phase 86: Admin Shell - Research

**Researched:** 2026-11-02
**Domain:** Next.js 16 App Router admin shell (cookie-driven theme and sidebar state, CSS-variable theming, mechanical hard-coded-colour to token conversion, vitest guard tests)
**Confidence:** HIGH (nearly everything is in-repo and was read or measured this session); one MEDIUM item (Google Maps `colorScheme` with `mapId`), one MEDIUM item (Recharts `var()` in SVG attributes)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

### Carried forward (research + roadmap, not re-asked)
- **D-01:** Theme and sidebar state live in cookies `admin_theme` (`light|dark`) and `admin_sidebar` (`expanded|collapsed`), read server-side so the first paint is already correct (no flash, no layout shift). No `next-themes` (CSP nonce conflict), no inline theme script.
- **D-02:** The theme is applied on the admin wrapper only — never on `<html>`/root (`app/(internal)/layout.tsx` renders `<html>` via shared `SiteChrome`). Public pages must be byte-for-byte unaffected.
- **D-03:** Hex/rgba literals in `app/(internal)/admin` and `components/admin` (~222 occurrences, 33 files) are converted to tokens first, mechanically, before any visual restyle. Add semantic admin tokens (surfaces, borders, hover, `--status-ok/warn/danger/info` + chip bg/fg) defined for both themes.
- **D-04:** A test fails when a new hex/rgb(a) colour literal appears in `components/admin/**` or `app/(internal)/admin/**` (token definitions live in CSS, outside those paths, or in an explicit allowlist).

### Light theme — palette and default
- **D-05:** Light-theme palette = the existing site cream/navy-ink/antique-gold values of `.theme-light` (`app/globals.css` ~L206: surface `#EFE8DA`, ink `#16202A`, gold `#8C6A34`, AA-checked). Reuse the values, but scope admin light through an admin-only selector (e.g. `.admin-shell[data-admin-theme="light"]` or an `admin-theme-light` class that composes the same vars) — do **not** change `.theme-light` itself, because public sections use it. — **Reversibility:** reversible
- **D-06:** Default theme when no cookie is set = **light**. Dark is opt-in via the toggle. (Changes what the operator sees on first visit after deploy — intended.)
- **D-07:** Retired palette leftovers in dark mode (`#28282B`, `#36363B`, `#4E4E56`, `#B87333`, `#CFC9C2`, `#F5F2EE`, `#E8B87A`, `#D4924A` …) map to the current navy/gold tokens (`--anthracite*`, `--copper*`, `--offwhite`, `--warmgrey`). Dark admin becomes uniformly navy+gold; pixel-parity with today's dark admin is NOT required.

### Light theme — Notion-like look (light theme only)
- **D-08:** In the **light theme only**, the admin takes a Notion-like style. Dark theme keeps its current structure (only re-tokened per D-07). Because most admin styling is inline `style={{}}`, the theme-specific structural differences need className hooks / CSS scoped under the light-theme selector (or token values that differ per theme, e.g. label text-transform/letter-spacing/radius/shadow tokens) — planner decides the mechanism.
- **D-09:** Notion-like sidebar (light): panel a shade darker than the content surface, nav items with lucide icons, soft row highlight on hover and for the active item (no heavy border/accent bar), sentence-case labels (no UPPERCASE + tracking), compact ~14px Inter.
- **D-10:** Calm typography (light): sentence-case headings and labels instead of uppercase-tracked labels, Inter, more whitespace, thin 1px dividers.
- **D-11:** Tables and cards (light, all admin screens): flat tables without heavy borders, row hover highlight, cards without heavy shadows/borders.
- **D-12:** Modals and side panels (light): "Notion page" feel — clean sheet surface, soft shadow, larger title.

### Sidebar
- **D-13:** Collapsed desktop sidebar = icon rail (~72px) with lucide icons and a tooltip label on hover; expanded = current 280px. Width driven by a CSS variable (e.g. `--admin-sidebar-w`) on the wrapper replacing the hard-coded `md:ml-[280px]`, with a short margin transition.
- **D-14:** Collapse toggle at the top of the sidebar next to the logo; theme toggle (sun/moon) at the bottom next to Sign out. No new top bar.
- **D-15:** Keyboard shortcut Cmd/Ctrl+`\` toggles collapse (as in Notion); ignored while focus is in an input/textarea/select/contenteditable.
- **D-16:** Mobile stays as today: hamburger + slide-over panel; the collapsed state affects desktop only. The panel closes on navigation.

### Status colours, login, charts, map
- **D-17:** Status badges and messages (error/success/info/warn) in light = Notion-style pastel chips: light tinted fill + dark text of the same hue, AA contrast. Dark keeps today's look (re-tokened). All via semantic status tokens; `StatusBadge` and the inline `#f87171`/`#4ade80`/`#60a5fa` usages go through them.
- **D-18:** `/admin/login` follows the chosen theme (same `admin_theme` cookie; light when no cookie). Login logic (`app/(internal)/admin/login/actions.ts`) unchanged. Note: the login page is a client component and currently prerenderable — reading the cookie needs a server wrapper/layout for the login route.
- **D-19:** Stats charts (`StatsChart`, `components/admin/stats/*`) take axis/grid/label/series colours from tokens and adapt to the theme; the zones map (`ZoneMapInner`) uses a light map style in the light theme.

### Claude's Discretion
- Exact token names and the CSS mechanism for theme-scoped structural differences (D-08).
- Exact pastel chip hues (must pass AA on the cream surface).
- Icon choice per nav item; tooltip implementation (CSS/title vs small component).
- Cookie attributes (path `/admin`, long max-age, `SameSite=Lax`) and whether the toggle uses a server action or `document.cookie` + `router.refresh()`.
- Order of plans (token conversion before restyle is locked by D-03).

### Deferred Ideas (OUT OF SCOPE)
- Notion-like structural restyle of the **dark** theme — not requested; dark keeps current structure.
- Mobile bottom tab bar — rejected; mobile stays hamburger + slide-over.
- Per-account (DB-stored) theme/sidebar preference syncing across devices — cookies only for now.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ADM-01 | Admin sidebar can be collapsed and expanded; the choice persists between visits | Cookie `admin_sidebar` parsed server-side in a new `app/(internal)/admin/layout.tsx`; CSS-variable width driven by `data-admin-sidebar`; collapse toggle + `Ctrl/Cmd+\` shortcut in `AdminSidebar`; existing `tests/AdminSidebar.test.tsx` kept green via default context (sections Architecture Patterns 1-3, Pitfalls 4-7, Validation) |
| ADM-02 | Admin has a light theme toggle; the choice persists, with no flash on load and no effect on the public site | Cookie `admin_theme` read in the same server layout so first HTML already carries `data-admin-theme`; all theme CSS scoped to `.admin-shell` in a dedicated stylesheet loaded only under `/admin`; scoping test + existing 6 golden-HTML snapshot tests prove public pages untouched (Pattern 1, 4; Validation) |
| ADM-03 | All admin screens are readable in both themes (hard-coded colours replaced with theme tokens; a test blocks new hard-coded colours) | Measured inventory: 234 hex + 37 `rgb(a)` literals in 34 files (table below) converted by token map; ratcheting guard test with per-file allowlist; companion token-completeness and contrast tests (Inventory, Pattern 5, Validation) |
</phase_requirements>

## Summary

This phase is a well-trodden pattern with no new dependencies. The server layout reads two preference cookies, renders one client wrapper `<div class="admin-shell" data-admin-theme data-admin-sidebar>`, and a dedicated stylesheet scoped entirely to `.admin-shell` defines every token for both themes. Because ~900 `var(--anthracite|offwhite|copper|warmgrey)` references already exist in admin code (measured: 171 warmgrey, 130 anthracite-light, 129 offwhite, 114 copper, 48 anthracite, 32 anthracite-mid, 8 copper-light), re-declaring those legacy variables inside the light wrapper flips most of the admin for free. What remains is the mechanical conversion of 271 colour literals (34 files) to semantic tokens, the shell (sidebar rail, toggles, layout), the light-only Notion look, and the guard tests.

Three findings change the plan relative to the UI-SPEC and must be handled explicitly: (1) the UI-SPEC "safety net" attribute selectors `[style*="text-transform: uppercase"]` and `[style*="font-weight: 300"]` will NOT match server-rendered HTML, because React SSR serialises inline styles without a space (`text-transform:uppercase`) while client-created DOM serialises with a space; both forms must be listed. (2) `AdminBookingWizard` renders the **public** booking steps (`Step1..Step5`, `ProgressBar`, `AddressInput` from `components/booking/**`), which contain their own hard-coded colours (`#f87171` is 2.52:1 on the light ivory surface) and sit outside the guarded paths; they need `var(--status-*, <old-literal>)` fallbacks so public rendering is unchanged. (3) A CSS tooltip positioned absolutely inside the scrolling rail `<nav>` will be clipped by `overflow-y:auto`; the tooltip must be `position: fixed`.

**Primary recommendation:** Create `app/(internal)/admin/layout.tsx` (server, reads cookies, imports `./admin-theme.css`, renders a client `AdminShell` wrapper that owns theme/sidebar state with a safe default context), do all theming in CSS keyed on the wrapper's data attributes (no JS media-query state, so no flash and no layout shift), convert literals in four file-disjoint parallel plans after a foundation plan, and land the guard test in the foundation plan with a per-file allowlist that each conversion plan shrinks to empty.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Read theme and sidebar preference | Frontend Server (SSR layout) | Browser (cookie write) | Server must read the cookie to emit the final attributes in the first HTML (no flash). Browser writes the cookie on toggle. |
| Apply theme (colours, radii, label casing) | CDN / Static (CSS file) | Browser (attribute flip) | All token values live in one stylesheet keyed on `[data-admin-theme]`; the browser only flips the attribute. |
| Sidebar width / collapsed rail layout | CSS keyed on `[data-admin-sidebar]` | Browser (React state for toggle) | CSS-only avoids a JS "is desktop" state, so mobile always shows the 280px panel regardless of the cookie and nothing shifts on load. |
| Toggle state and `Ctrl/Cmd+\` shortcut | Browser / Client (`AdminShell` context) | — | Instant, no round trip; writes cookie via `document.cookie`. |
| Cookie value validation | Frontend Server | Browser | Cookie is user-controlled; server maps it to a 2-value enum before it reaches an attribute. |
| Hard-coded colour regression block | Test suite (vitest, node env) | — | Static source scan; no runtime component. |
| Stats chart / map colours | Browser (SVG `var()` / Maps init option) | — | Third-party renderers; fed `var(--…)` strings or a Maps init option. |
| Admin auth / session | API / Backend (unchanged) | — | Explicitly untouched: `(dashboard)/layout.tsx` auth redirects and `login/actions.ts` stay as is. |

## Standard Stack

No new packages. Everything needed is already installed.

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| next | ^16.2.3 (`package.json`) | App Router, `cookies()` from `next/headers` (async) | Already the framework; `const cookieStore = await cookies()` already used in `app/(internal)/admin/(dashboard)/settings/page.tsx` and `pricing/page.tsx` [VERIFIED: repo grep `cookies()` this session] |
| lucide-react | 1.8.0 installed [VERIFIED: `require('lucide-react/package.json').version`] | Rail/nav/toggle icons | All 16 icons the UI-SPEC names resolve as exports: Tag, Map, CalendarCheck, Building2, Car, Ticket, Settings, ChartColumn, Send, IdCard, Eraser, PanelLeftClose, PanelLeftOpen, Sun, Moon, LogOut (+ existing Menu, X) [VERIFIED: `node -e` this session, all `object`] |
| recharts | ^3.8.1 | Stats charts, already used by `StatsChart.tsx` | No change of library |
| @vis.gl/react-google-maps | 1.8.3 installed [VERIFIED: node_modules package.json] | `Map` already used by `ZoneMapInner`; `colorScheme` prop exists in its types (`colorScheme?: ColorScheme`, `index.d.ts:1012`) | No change of library |
| vitest | 4.1.5, jsdom default, `css: false`, `globals: true`, setup `tests/setup.ts` [VERIFIED: `vitest.config.ts`, `npx vitest --version`] | Tests | Existing |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Dedicated `admin-theme.css` | Append to `app/globals.css` | globals.css is loaded by every public page and guarantees ordering, but changes public CSS bytes; dedicated file loads only under `/admin` |
| `document.cookie` write | Server action + `router.refresh()` | Server action adds a POST round trip and a re-render; `document.cookie` is instant and matches the UI-SPEC "no reload" contract |
| `next-themes` | — | Rejected by D-01 (inline script conflicts with nonce CSP) |

**Installation:** none.

## Package Legitimacy Audit

No external packages are installed or added by this phase.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| (none) | — | — | — | — | — | No installs |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
Browser request  GET /admin/...  (Cookie: admin_theme, admin_sidebar)
        |
        v
middleware.ts  (/admin is NON_LOCALIZED + dynamic path; nonce CSP; Supabase session refresh) -- unchanged
        |
        v
app/(internal)/layout.tsx  -> <html lang="en"> -> SiteChrome (fonts, globals.css)   [unchanged, no cookies read]
        |
        v
app/(internal)/admin/layout.tsx   NEW (server)
   |  imports ./admin-theme.css  (all rules scoped to .admin-shell)
   |  await cookies() -> parseAdminTheme()/parseAdminSidebar()  (enum or default light/expanded)
   v
<AdminShell initialTheme initialSidebar>   NEW (client; context + wrapper div)
   <div class="admin-shell" data-admin-theme="light|dark" data-admin-sidebar="expanded|collapsed">
        |
        +--> /admin/login/page.tsx        (client page; now inside the wrapper -> themed, D-18)
        |
        +--> (dashboard)/layout.tsx       (server; auth redirects UNCHANGED)
                 |-- <AdminSidebar/>      (client; reads/writes context; toggles; Ctrl/Cmd+\)
                 |-- <main class="admin-main">  margin-left: var(--admin-sidebar-w) from md up
                          |-- page.tsx / BookingsTable / modals / panels  (token-only colours)

Toggle click -> setState in AdminShell -> wrapper attribute flips (CSS repaints instantly)
            -> document.cookie = "admin_theme=dark; Path=/admin; Max-Age=31536000; SameSite=Lax[; Secure]"
Next full load -> server reads cookie -> first HTML already has the right attributes (no flash)
```

### Recommended Project Structure
```
app/(internal)/admin/
├── layout.tsx            # NEW server: cookies -> AdminShell, imports admin-theme.css
├── admin-theme.css       # NEW: tokens for both themes, legacy remap, light structural hooks, sidebar/rail CSS
├── (dashboard)/layout.tsx# EDIT: drop md:ml-[280px] + inline bg/color; keep auth redirects untouched
└── login/page.tsx        # EDIT: tokens only (1 hex literal); logic untouched
components/admin/
├── AdminShell.tsx        # NEW client: context {theme, sidebar, setTheme, toggleSidebar}, wrapper div
├── AdminSidebar.tsx      # REWRITE: icon rail, toggles, tooltips, shortcut; keep a11y/test hooks
└── (all other files)     # literal -> token swaps only
lib/admin-shell-prefs.ts  # NEW pure: cookie names, parse*, serialize cookie string (client-safe, unit-testable)
tests/
├── admin-shell-prefs.test.ts
├── admin-no-hardcoded-colors.test.ts
├── admin-theme-css.test.ts
├── admin-shell-layout.test.tsx
└── AdminSidebar.test.tsx (extend)
```

The stylesheet is placed in `app/(internal)/admin/`, not `app/(internal)/`, so it does not load for `/driver/**` pages (they share the `(internal)` root layout). The UI-SPEC suggested `app/(internal)/admin-theme.css`; both work because every rule is `.admin-shell`-scoped, but the nested location is tighter. Next docs confirm global CSS "can be imported into any layout, page, or component inside the `app` directory", with the caveat that stylesheets are not removed on client navigation between routes [CITED: nextjs.org/docs/app/getting-started/css]. That caveat is harmless here: leaving `/admin` for a public page is a cross-root-layout navigation (`(internal)` vs `[locale]`), i.e. a full document load, and the rules are scoped anyway.

### Pattern 1: Cookie-driven server layout + client wrapper with safe default context
**What:** server layout parses cookies to an enum and passes `initial*` props; a client component owns state so a later `router.refresh()` or `revalidatePath` (e.g. `signOut` does `revalidatePath('/', 'layout')`) cannot reset a toggle. Context has a default value so components and tests that render without the provider (`tests/AdminSidebar.test.tsx` renders `<AdminSidebar />` bare) keep working.
**Example:**
```tsx
// lib/admin-shell-prefs.ts  (pure, no 'use client' needed; safe to import in both tiers)
export const ADMIN_THEME_COOKIE = 'admin_theme'
export const ADMIN_SIDEBAR_COOKIE = 'admin_sidebar'
export type AdminTheme = 'light' | 'dark'
export type AdminSidebarState = 'expanded' | 'collapsed'

export const parseAdminTheme = (v: string | undefined | null): AdminTheme => (v === 'dark' ? 'dark' : 'light')
export const parseAdminSidebar = (v: string | undefined | null): AdminSidebarState =>
  v === 'collapsed' ? 'collapsed' : 'expanded'

export function serializePrefCookie(name: string, value: string, secure: boolean): string {
  return `${name}=${value}; Path=/admin; Max-Age=31536000; SameSite=Lax${secure ? '; Secure' : ''}`
}
```
```tsx
// app/(internal)/admin/layout.tsx
import { cookies } from 'next/headers'
import './admin-theme.css'
import AdminShell from '@/components/admin/AdminShell'
import { ADMIN_THEME_COOKIE, ADMIN_SIDEBAR_COOKIE, parseAdminTheme, parseAdminSidebar } from '@/lib/admin-shell-prefs'

export default async function AdminRootLayout({ children }: { children: React.ReactNode }) {
  const jar = await cookies()
  return (
    <AdminShell
      initialTheme={parseAdminTheme(jar.get(ADMIN_THEME_COOKIE)?.value)}
      initialSidebar={parseAdminSidebar(jar.get(ADMIN_SIDEBAR_COOKIE)?.value)}
    >
      {children}
    </AdminShell>
  )
}
```
Client wrapper renders `className="admin-shell" data-admin-theme={theme} data-admin-sidebar={sidebar}` and writes cookies in the toggle handlers with `secure = location.protocol === 'https:'` (Safari rejects `Secure` cookies on `http://localhost`) [ASSUMED]. Derive `--admin-sidebar-w` and `color-scheme` in CSS from the data attributes rather than via an inline style (no TS custom-property cast, and the first HTML carries the width through the attribute alone).

**Why a new `admin/layout.tsx` and not just `(dashboard)/layout.tsx`:** `/admin/login` is outside the `(dashboard)` group; a layout one level up covers both and satisfies D-18 with no separate login layout. The login page is currently a prerenderable client page; with a cookie-reading ancestor layout it becomes dynamic, which costs nothing because `/admin` is already a dynamic path (`isDynamicPath` includes `pathname.startsWith('/admin')`) [VERIFIED: middleware.ts, read this session].

### Pattern 2: Everything layout-related in CSS keyed on data attributes
- Main offset: a class in `admin-theme.css`, not `md:ml-[var(--admin-sidebar-w)]`:
  `.admin-shell .admin-main { margin-left: 0 } @media (min-width: 768px) { .admin-shell .admin-main { margin-left: var(--admin-sidebar-w); transition: margin-left 200ms ease } } @media (prefers-reduced-motion: reduce) { … transition: none }`. 768px is Tailwind's `md` breakpoint [ASSUMED: Tailwind v4 default].
- Aside width: `.admin-aside { width: 280px }` and `@media (min-width:768px) { .admin-aside { width: var(--admin-sidebar-w) } }`, so the mobile slide-over is always 280px with labels, whatever the cookie says (D-16).
- Collapsed label hiding must be inside `@media (min-width: 768px)` for the same reason: `[data-admin-sidebar="collapsed"] .admin-nav-label` becomes a visually-hidden pattern (clip), not `display:none`, so `screen.getByText('Promos')` and screen readers still find it.
- Do not put `transform`, `filter`, `will-change`, `contain` or `perspective` on `.admin-shell`: any of those makes the wrapper the containing block for `position: fixed` descendants (sidebar, hamburger, modal overlays; 8 `position: 'fixed'` usages exist in admin code) and breaks them [ASSUMED: CSS spec behaviour].

### Pattern 3: Rail tooltips must be `position: fixed`
The nav list needs `overflow-y: auto` (UI-SPEC E1 overflow). A non-visible `overflow-y` forces `overflow-x` to compute to `auto`, so an absolutely positioned tooltip to the right of the rail is clipped. Use a small `RailTooltip` that on `mouseenter`/`focus` measures the item (`getBoundingClientRect`) and sets `--tip-y` on the tooltip element, which is `position: fixed; left: calc(72px + 8px)`; `fixed` descendants are not clipped by an `overflow` ancestor unless that ancestor is their containing block [ASSUMED: CSS spec behaviour]. 300ms hover delay via `transition-delay` on `opacity/visibility`, shown also on `:focus-visible`. Z-index stack from the UI-SPEC is kept (sidebar 50 < hamburger 60 < tooltip 70 < modal 100).

### Pattern 4: Light-theme-only structure via tokens + a scoped safety net
Prefer tokens (`--admin-radius-*`, `--admin-font-heading`, `--admin-shadow-sheet`, label `text-transform`/`letter-spacing` as tokens) consumed by the shared primitives `adminFieldStyles.ts` (`labelStyle`, `inputBaseStyle`), `Modal`, `StatusBadge`, `KPICard`. For the ~101 scattered inline `textTransform: 'uppercase'` and ~68 inline `fontWeight: 300` usages (counted by grep this session) use a scoped override, with **both** serialisations:
```css
.admin-shell[data-admin-theme="light"] [style*="text-transform:uppercase"],
.admin-shell[data-admin-theme="light"] [style*="text-transform: uppercase"] {
  text-transform: none !important; letter-spacing: normal !important;
}
.admin-shell[data-admin-theme="light"] [style*="font-weight:300"],
.admin-shell[data-admin-theme="light"] [style*="font-weight: 300"] { font-weight: 400 !important }
```
Evidence for the two forms [VERIFIED: ran `react-dom/server` and jsdom this session]: `renderToString` produced `style="text-transform:uppercase;letter-spacing:0.1em;font-weight:300;color:#fff"` (no space), while setting `el.style.textTransform` in a DOM produced `style="text-transform: uppercase; font-weight: 300;"` (with space). First-load SSR HTML is unspaced; elements React creates client-side during later navigation are spaced. Listing only the spaced form (as the UI-SPEC does) would leave the first load uppercase.
Known limits of the safety net (planner should list as Light-theme polish checks): it does not reach class-based uppercase (`.btn-primary`, `.btn-ghost`, `.btn-secondary` in `app/globals.css` set `text-transform: uppercase; letter-spacing: 0.35em`; add scoped `.admin-shell[data-admin-theme="light"] .btn-primary { text-transform:none; letter-spacing:normal }` etc. — these classes are used by `AdminBookingWizard` and public steps), and it does not reach labels typed in capitals in the source (e.g. `12-MONTH REVENUE`, `NEW BOOKING — STEP {n} OF 6`); those need a manual sentence-case edit in the restyle plan.

### Pattern 5: Ratcheting guard test (green suite throughout the phase)
Write the guard test in the foundation plan with a `LEGACY_PENDING` allowlist listing every file that currently has literals, each entry `{ file, reason: 'pending 86-0N' }`. Each conversion plan deletes its entries; the last plan adds an assertion that the allowlist is empty. This keeps `npx vitest run` green on every commit and still blocks new literals from day one (D-04, criterion 4). Style reference: `tests/dashboard-app-isolation-guard.test.ts` (`// @vitest-environment node`, `fs`/`path` walk, `SCOPE_FLOOR` array so the scan can never shrink silently).

### Anti-Patterns to Avoid
- **Theme on `<html>`/`<body>`/`SiteChrome`:** breaks D-02 and byte-parity of 7 locales. Everything hangs off `.admin-shell`.
- **`next-themes` or an inline `<script>`:** rejected (D-01).
- **JS-measured "is desktop" state to decide rail vs panel:** causes hydration flash; use `@media` CSS.
- **Editing `.theme-light` in `app/globals.css`:** public sections use it (D-05). Re-declare the vars under `.admin-shell[data-admin-theme="light"]` instead.
- **Putting the stylesheet in `public/`:** `middleware.ts` matcher rules apply to `public/` files (CLAUDE.md hard rule); a bundled import (`import './admin-theme.css'`) is served from `/_next/static/**` which the matcher already excludes. No matcher change is needed or wanted.
- **Hex resolved in TS as a fallback for Recharts:** would trip the guard. If `var()` fails, read `getComputedStyle(wrapper).getPropertyValue('--admin-chart-1')` at runtime.

## Colour-literal inventory (measured)

Method: Node script run this session over every `.ts/.tsx/.css` under `components/admin` and `app/(internal)/admin`, hex regex `(?<![\w&])#(?:[0-9a-fA-F]{8}|{6}|{4}|{3})(?![\w-])` (the `&` lookbehind excludes HTML entities such as `&#10003;`) plus `rgb|rgba|hsl|hsla|oklch|oklab|color-mix\(`. Totals: **234 hex + 37 `rgba(` = 271 literals in 34 files**; `hsl/oklch/color-mix/rgb(` (without a): 0. CONTEXT's "~222 / 33 files" was an estimate; use these numbers. No hex/rgba appears in comments (checked). No Tailwind palette classes (`bg-white`, `text-red-500`…) and no bare CSS colour keywords exist in admin code; the only keyword in use is `transparent` (41 usages), which the guard should allow (with `inherit`, `currentColor`, `none`). [VERIFIED: scripts run this session]

| File | hex | rgba | Group (proposed plan) |
|------|----:|-----:|-----------------------|
| components/admin/BookingsTable.tsx (2,887 lines) | 32 | 13 | B (alone) |
| components/admin/StatusBadge.tsx | 28 | 14 | A primitives |
| components/admin/PromoCodesTable.tsx | 27 | 0 | D |
| components/admin/DriversTable.tsx | 21 | 0 | D |
| components/admin/AdminSidebar.tsx | 13 | 1 | Shell (rewritten) |
| components/admin/FlightStatusBlock.tsx | 11 | 2 | C |
| components/admin/StatsChart.tsx | 10 | 0 | A |
| components/admin/AccountForm.tsx | 8 | 0 | D |
| components/admin/DriverForm.tsx | 8 | 0 | D |
| components/admin/PromoCodeForm.tsx | 8 | 0 | D |
| components/admin/ErasurePreview.tsx | 7 | 0 | D |
| components/admin/HealthBanner.tsx | 4 | 2 | A |
| components/admin/PricingForm.tsx | 6 | 0 | D |
| components/admin/stats/OverviewTab.tsx | 6 | 0 | A |
| components/admin/Modal.tsx | 4 | 1 | A |
| components/admin/adminFieldStyles.ts | 5 | 0 | A |
| app/(internal)/admin/(dashboard)/drivers/page.tsx | 5 | 0 | D |
| app/(internal)/admin/(dashboard)/promo-codes/page.tsx | 5 | 0 | D |
| components/admin/DispatchDefault.tsx | 3 | 1 | C |
| components/admin/ManualBookingForm.tsx (1,118 lines) | 3 | 1 | C |
| app/(internal)/admin/(dashboard)/accounts/[id]/page.tsx | 3 | 1 | D |
| components/admin/DriverAssignmentSection.tsx | 2 | 0 | C |
| components/admin/NotificationToggles.tsx (has a `<style>` block, hex inside) | 2 | 0 | D |
| components/admin/PromoCard.tsx | 2 | 0 | D |
| components/admin/ZoneMapInner.tsx | 2 | 0 | A (+ colorScheme in restyle plan) |
| app/(internal)/admin/(dashboard)/accounts/page.tsx | 2 | 0 | D |
| components/admin/AdminBookingWizard.tsx | 0 | 1 | C |
| components/admin/AdminStep6Create.tsx | 1 | 0 | C |
| components/admin/BookingChangeHistory.tsx | 1 | 0 | C |
| components/admin/ErasureAuditTable.tsx | 1 | 0 | D |
| components/admin/ErasureConfirmForm.tsx | 1 | 0 | D |
| components/admin/RoutesTable.tsx | 1 | 0 | D |
| app/(internal)/admin/(dashboard)/outbox/page.tsx | 1 | 0 | D |
| app/(internal)/admin/login/page.tsx | 1 | 0 | Shell |

Value frequency (hex, lowercased): `#f87171` x52, `#cfc9c2` x35, `#f5f2ee` x25, `#4e4e56` x21, `#4ade80` x14, `#b87333` x12, `#36363b` x11, `#2a1a1a` x7, `#e8b87a` x6, `#1a3a2a` x5, `#28282b` x4, `#1a2a3a` x3, `#60a5fa` x3, `#ff6b6b` x3, `#d4924a` x3, then singletons/pairs (`#2a2a1a`, `#f59e0b`, `#252528`, `#ef4444`, `#3a2a1a`, `#c0392b`, `#1a3a35`, `#34d399`, `#3a2a0a`, `#fbbf24`, `#1a1a1c`, `#27ae60`, `#e67e22`, `#fb923c`, `#1a2f3a`, `#38bdf8`, `#2a1f3a`, `#a78bfa`, `#3a1a12`, `#e74c3c`). `rgba(` values outside `StatusBadge`: `rgba(59,130,246,0.25)` x3, `rgba(184,115,51,0.15)` x2, `rgba(245,158,11,0.06)` x2, `rgba(184,115,51,0.25)` x2, `rgba(184,115,51,0.09)` x2, `rgba(0,0,0,0.6)` x2, `rgba(34,197,94,0.25)` x2, and singletons `rgba(239,68,68,0.25)`, `rgba(191,160,106,0.09)` x2, `rgba(59,130,246,0.08)`, `rgba(245,158,11,0.09)`, `rgba(0,0,0,0.5)`, `rgba(0,0,0,0.7)`.

### Token-map gaps vs the UI-SPEC Token Map (planner must add tokens)
The UI-SPEC Token Map does not cover these measured literals:
- `rgba(184,115,51,0.09/0.15/0.25)` (old copper tints, 6 usages in `BookingsTable`, `FlightStatusBlock`): map 0.09 to `--admin-accent-tint`; add `--admin-accent-tint-strong` (0.15) and `--admin-accent-border` (0.25).
- `rgba(59,130,246,0.25/0.08)` (BookingsTable): `--status-info-border` / `--status-info-bg`.
- `rgba(245,158,11,0.09)` next to `0.06`: `--status-warn-bg`.
- `rgba(0,0,0,0.7)` (AdminBookingWizard overlay): `--admin-scrim`.
- `#38bdf8` / `#1a2f3a` (StatusBadge `confirmed`): UI-SPEC folds `confirmed` into the `info` family (accepted loss).
- `#ff8a7a` (public `Step1TripType`), `#25D366` (public `Step2DateTime`): see Wizard finding below.

### Shared public components rendered inside admin (outside the guard)
`components/admin/AdminBookingWizard.tsx` imports `ProgressBar`, `Step1TripType`, `Step2DateTime`, `Step3Vehicle`, `Step4Extras`, `Step5Passenger` and `AdminStep6Create`; `ManualBookingForm`/others import `@/components/booking/AddressInput` [VERIFIED: import grep]. Their literals (measured): `Step5Passenger.tsx` has `#f87171` x many (field error borders/text), `#27AE60` (landed), `#E67E22` x2; `AddressInput.tsx` has `#C0392B` x2; `Step1TripType.tsx` `#ff8a7a`; `Step2DateTime.tsx` `#25D366`. In the light admin `#f87171` on `#F7F4EF` measures **2.52:1** (fails AA) [VERIFIED: contrast computed this session]. These files are public code: changing a literal to a token with a fallback, e.g. `color: 'var(--status-danger-fg, #f87171)'`, renders identically on public pages (the token is undefined outside `.admin-shell`) and themes correctly inside admin. None of those literals occur in the six golden snapshots (`grep -c` of `f87171|C0392B|E67E22|27AE60` over `tests/__snapshots__/*` returned 0 for all six files), so snapshot bytes are unaffected. Plan this as a separate small task in the booking-group plan, with `npx vitest run tests/Step5Passenger.test.tsx tests/AddressInput.test.tsx tests/Step1TripType.test.tsx tests/Step2DateTime.test.tsx tests/book-page-render.test.tsx` as its verify step. The alternative (leave them) keeps pink error text at 2.5:1 on the cream wizard and would contradict success criterion 3.

## Proposed wave / file-ownership split (no file overlap)

D-03 requires conversion before restyle; tokens must exist before anything is converted.

| Wave | Plan | Files owned | Notes |
|------|------|-------------|-------|
| 1 | Foundation | `lib/admin-shell-prefs.ts`, `app/(internal)/admin/admin-theme.css`, `tests/admin-shell-prefs.test.ts`, `tests/admin-theme-css.test.ts`, `tests/admin-no-hardcoded-colors.test.ts` | Tokens for both themes, legacy-var remap, status tokens, chart tokens, rail/main CSS. Guard test with full `LEGACY_PENDING` allowlist. No TSX component edited, so Wave 2 can start from it. |
| 2 | A: primitives + charts | `StatusBadge`, `Modal`, `adminFieldStyles.ts`, `KPICard`, `HealthBanner`, `StatsChart`, `stats/OverviewTab`, `ZoneMapInner` (literals only) | Highest leverage; `StatusBadge` becomes variant to family lookup rendering only `var(--status-*)`. |
| 2 | B: BookingsTable | `BookingsTable.tsx`, `tests/BookingsTable.test.tsx` | 45 literal sites in 2,887 lines; colour swaps only (Phase 90 extracts the panel later). Alone because of size and test edits. |
| 2 | C: booking group | `FlightStatusBlock`, `DriverAssignmentSection`, `DispatchDefault`, `ManualBookingForm`, `AdminBookingWizard`, `AdminStep6Create`, `BookingChangeHistory`, plus the `var(--token, fallback)` edits in `components/booking/{steps/Step5Passenger,steps/Step1TripType,steps/Step2DateTime,AddressInput}.tsx` | Public-file edits isolated in one plan with snapshot verify. |
| 2 | D: tables, forms, pages | `PromoCodesTable`, `PromoCodeForm`, `PromoCard`, `DriversTable`, `DriverForm`, `AccountForm`, `PricingForm`, `RoutesTable`, `NotificationToggles`, `ErasurePreview`, `ErasureConfirmForm`, `ErasureAuditTable`, pages `drivers`, `promo-codes`, `accounts`, `accounts/[id]`, `outbox`, `tests/erasure-page.test.tsx`, `tests/identities-page.test.tsx` | Mechanical. |
| 3 | Shell | `app/(internal)/admin/layout.tsx`, `components/admin/AdminShell.tsx`, `components/admin/AdminSidebar.tsx`, `(dashboard)/layout.tsx`, `login/page.tsx`, `tests/AdminSidebar.test.tsx`, `tests/admin-shell-layout.test.tsx` | Depends on Wave 1 CSS. Could run in Wave 2 in parallel with A-D (no file overlap) if the planner wants fewer waves; keep it after A-D only if it wants to restyle on already-tokenised primitives. |
| 4 | Light restyle + map + closeout | Class hooks / CSS for tables, cards, modals, buttons in `admin-theme.css` (+ shared primitives' radius/font tokens), `ZoneMapInner` `colorScheme`, `.btn-*` light overrides, sentence-case edits to typed-caps labels, assertion that `LEGACY_PENDING` is empty | Holds the visual QA checklist. |

Existing tests that assert literals and must be edited by the plan that converts the matching file:
- `tests/BookingsTable.test.tsx` lines 688-689 and 718-719: asserts `futureSegment.style.border` not/contains `var(--copper)` and `style.background` contains `rgba(191, 160, 106, 0.09)` (the active-segment tint). After the swap to `--admin-accent-tint` the second pair of assertions must assert the token instead [VERIFIED: read this session].
- `tests/erasure-page.test.tsx` line 235 and 450: `toMatch(/#f87171|rgb\(248, 113, 113\)/)` on the confirm button and the "Failed" cell; must assert `var(--status-danger-fg)` (or `--admin-danger-solid`) [VERIFIED].
- `tests/identities-page.test.tsx` lines 438-440: row `style.background` is `var(--anthracite-mid)` then `var(--anthracite-light)` on hover; only changes if those references are retokened (pure hex swaps do not touch them). Line 429 forbids `fontWeight` in `['300','700','bold','lighter']` on any element except `#modal-title`; if the Modal heading weight becomes a `var(--…)` string it still passes [VERIFIED].
- `tests/content-brand-template.test.ts` asserts `#B87333` in generated HTML — unrelated (content tooling), do not touch.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Theme token system | A JS theme object / runtime CSS-in-JS | CSS custom properties in one stylesheet keyed on `data-admin-theme` | Zero JS cost, works in first HTML, already how `.theme-light` works |
| Contrast maths | Guessing AA | The WCAG relative-luminance formula in the test (about 6 lines, see Validation) | UI-SPEC values were re-verified this session; a test keeps them true |
| Icons | Inline SVG | `lucide-react` (installed) | Already used by sidebar (`Menu`, `X`) |
| Cookie parsing in layout | Manual header parsing | `await cookies()` from `next/headers` | Already used in two admin pages |
| Theme persistence | `localStorage` | Cookies | `localStorage` is unreadable server-side, so the first paint would be wrong (the exact flash D-01 forbids) |

**Key insight:** the work is 90 percent mechanical substitution and 10 percent shell; the risk is in places a regex does not reach (class-based styles, SSR vs client style serialisation, shared public components, third-party renderers), which is where the pitfalls below sit.

## Common Pitfalls

### Pitfall 1: Attribute-selector safety net misses SSR HTML
**What goes wrong:** the light theme still shows UPPERCASE tracked labels and weight-300 text on first load but looks right after client navigation (or vice versa).
**Why:** React SSR emits `text-transform:uppercase` (no space); client-created DOM serialises `text-transform: uppercase;`. Measured this session.
**How to avoid:** list both forms in every `[style*=…]` selector (Pattern 4). Test: in `admin-theme-css.test.ts`, assert each `[style*="…: …"]` selector in the CSS has its no-space twin.
**Warning signs:** labels uppercase right after a hard refresh only.

### Pitfall 2: Public booking steps inside the admin wizard keep dark-only literals
See "Shared public components" above. Use `var(--status-danger-fg, #f87171)` fallbacks; do not fork the steps.

### Pitfall 3: Containing-block trap
Adding `transform`, `filter`, `will-change`, `contain` or `backdrop-filter` to `.admin-shell` re-parents every `position: fixed` descendant (sidebar, hamburger, 8 fixed overlays). Keep the wrapper style-minimal: `min-height`, background, colour, `color-scheme`.

### Pitfall 4: Rail tooltip clipped by the scrolling nav
Use `position: fixed` tooltips (Pattern 3).

### Pitfall 5: Mobile accidentally renders the rail
If label hiding or the 72px width is not wrapped in `@media (min-width: 768px)`, a `collapsed` cookie produces an icon-only slide-over on phones. Keep the media gate; add a unit-level CSS test that the collapsed rules appear only inside a `min-width: 768px` block.

### Pitfall 6: `Ctrl/Cmd+\` on non-US keyboards
The operator is in Prague. On Czech layouts the backslash needs AltGr (Windows reports `ctrlKey && altKey` for AltGr) or an Option chord on macOS [ASSUMED]. Match `(e.key === '\\' || e.code === 'Backslash') && (e.ctrlKey || e.metaKey)`, call `preventDefault`, and skip when the target is `input|textarea|select|[contenteditable]` or a dialog (`[aria-modal="true"]`) is present. The shortcut is a convenience; the visible collapse button is the primary control, so a layout-dependent shortcut is acceptable (D-15 is locked, this only hardens it).

### Pitfall 7: `AdminSidebar` existing test contract
`tests/AdminSidebar.test.tsx` renders `<AdminSidebar />` with no props and no provider, asserts `getByLabelText(/open menu/i)` has class `md:hidden`, link order (`/admin/outbox` followed by `/admin/identities` followed by `/admin/erasure`), `getByText('Promos')` links to `/admin/promo-codes`, and that **every** `getAllByRole('link')` has an inline `style` containing `min-height` [VERIFIED: read this session]. So: default context value, no extra `<a>` in the sidebar (the logo must not become a link), and every nav link keeps inline `minHeight`. New button labels must not match `/open menu/i`.

### Pitfall 8: Viewport background and scrollbar stay dark in light theme
`app/globals.css` sets `body { background-color: var(--anthracite); … }` and global `::-webkit-scrollbar-track { background: var(--anthracite) }` (4px wide, `--anthracite` = navy). Because the theme is scoped to the wrapper, overscroll/rubber-band areas and the root scrollbar track remain navy beside the cream page. Options: accept; or add `html:has(.admin-shell[data-admin-theme="light"]), body:has(.admin-shell[data-admin-theme="light"]) { background-color: <token> }` which only matches when `.admin-shell` exists (so public pages are structurally unaffected) — this is a deliberate, narrow exception to the UI-SPEC "no rule targets html/body" line and needs a planner/owner decision (Open Question 2).

### Pitfall 9: Recharts and `var()` in SVG attributes
`StatsChart.tsx` passes colours via `tick={{ fill: '#CFC9C2' }}`, `Bar fill`, `CartesianGrid stroke`, `Legend wrapperStyle.color`, tooltip `contentStyle`. Moving to `'var(--admin-text-muted)'` relies on the browser resolving `var()` in the SVG `fill`/`stroke` presentation attributes Recharts emits. This works in current Chromium/Firefox/Safari in practice, but it was not verified in this session [ASSUMED]. Verify in a browser; if any element does not resolve, set it via the `style` prop instead (`style={{ fill: 'var(--…)' }}`), and as a last resort read computed values at runtime. Series colours also arrive through props from the stats tabs (`series.color`, 6 hex literals in `OverviewTab.tsx`): convert those to `var(--admin-chart-N)` too.

### Pitfall 10: Google Maps `colorScheme` is init-only
See Map section. A theme toggle needs a remount (`key={theme}`), which re-creates `DrawLayer` (terra-draw) and drops an in-progress polygon.

### Pitfall 11: Local admin browser checks are impossible
Admin sign-in on localhost always fails (fail-closed Upstash limiter; `.env.local` has no Upstash) — recorded in project memory (`project_phase82_execution`: "Do admin browser checks on prod"). So authenticated screens cannot be screenshotted locally. Plan automated coverage (below) plus an explicit owner UAT on production after merge. `/admin/login` (unauthenticated GET) works locally and is the only route usable for the first-paint curl check.

### Pitfall 12: 404s inside `/admin`
Unknown `/admin/xyz` URLs resolve to `app/(internal)/not-found.tsx`, which renders outside `.admin-shell` and inherits the global dark `body`. It is minimal (no colours of its own, `<a href="/admin">`) and is already an ESLint baseline file. Treat as accepted; do not scope the shell around it [ASSUMED acceptable; low impact].

## Code Examples

### Guard test (vitest, repo style)
```ts
// @vitest-environment node
// tests/admin-no-hardcoded-colors.test.ts
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '..')
const SCAN_ROOTS = ['components/admin', 'app/(internal)/admin']
const EXT = new Set(['.ts', '.tsx'])            // the .css token file is intentionally NOT scanned
const HEX = /(?<![\w&])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})(?![\w-])/g
const FN = /\b(?:rgb|rgba|hsl|hsla|oklch|oklab|color-mix)\(/g
const KEYWORD = /\b(?:color|background(?:Color)?|border(?:Color|Top|Right|Bottom|Left)?|fill|stroke|outline|boxShadow)\s*:\s*['"`]?\s*(?:white|black|red|green|blue|gray|grey|orange|yellow|purple)\b/g

/** { file, reason } — every entry needs a reason; Wave-2 plans delete theirs; final plan asserts it is empty. */
const ALLOWLIST: { file: string; reason: string }[] = [ /* seeded with the 34 files of the inventory table */ ]

function walk(rel: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(path.join(ROOT, rel), { withFileTypes: true })) {
    const p = `${rel}/${e.name}`
    if (e.isDirectory()) walk(p, out)
    else if (EXT.has(path.extname(e.name))) out.push(p)
  }
  return out
}

describe('admin code has no hard-coded colours (ADM-03)', () => {
  const files = SCAN_ROOTS.flatMap((r) => walk(r))
  it('scan scope cannot silently shrink (floor)', () => {
    for (const f of ['components/admin/AdminSidebar.tsx', 'components/admin/BookingsTable.tsx',
      'app/(internal)/admin/login/page.tsx']) expect(files).toContain(f)
  })
  it('no literal outside the allowlist', () => {
    const allowed = new Set(ALLOWLIST.map((a) => a.file))
    const hits: string[] = []
    for (const f of files) {
      if (allowed.has(f)) continue
      fs.readFileSync(path.join(ROOT, f), 'utf8').split('\n').forEach((line, i) => {
        for (const re of [HEX, FN, KEYWORD]) { re.lastIndex = 0
          for (const m of line.matchAll(re)) hits.push(`${f}:${i + 1} ${m[0]} -> use a var(--admin-*|--status-*) token`) }
      })
    }
    expect(hits).toEqual([])
  })
  it('every allowlist entry has a reason and points at an existing file', () => {
    for (const a of ALLOWLIST) { expect(a.reason.trim().length).toBeGreaterThan(0); expect(files).toContain(a.file) }
  })
})
```
`transparent`, `inherit`, `currentColor`, `none` are intentionally not flagged. Verified: the same regex set run over the tree this session found no false positives (every match was a real colour).

### CSS scoping + token-completeness test (outline)
```ts
// @vitest-environment node  — tests/admin-theme-css.test.ts
const css = fs.readFileSync(path.join(ROOT, 'app/(internal)/admin/admin-theme.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
// 1. Scoping (D-02): every rule prelude (outside @media/@keyframes bodies) starts with ".admin-shell"
//    — and no bare 'html', 'body', ':root', '.theme-light' selector (allow the single documented html:has(.admin-shell…) if Open Question 2 is accepted).
// 2. Token parity: tokens declared under [data-admin-theme="light"] === tokens declared under [data-admin-theme="dark"].
// 3. Every var(--admin-*|--status-*) referenced in components/admin/**/*.tsx, app/(internal)/admin/**/*.tsx
//    (and the 4 edited components/booking files) is declared for BOTH themes.   ("a token cannot exist for one theme only")
// 4. Safety-net selectors: each [style*="a: b"] has its [style*="a:b"] twin.
// 5. Collapsed-rail rules appear only inside a (min-width: 768px) block.
// 6. app/globals.css still contains the .theme-light values  --anthracite: #EFE8DA; --offwhite: #16202A;  (D-05 untouched).
```

### Contrast test (cheap, makes criterion 3 measurable)
Parse the token values from `admin-theme.css` and assert pairs: text/muted/accent-text on bg, sidebar-bg, surface (>= 4.5); `--admin-border-strong` on input-bg/bg (>= 3); each `--status-*-fg` on `--status-*-bg` (>= 4.5) and on bg; on-accent on accent; danger-solid text. Re-verified this session against the UI-SPEC values: text `#16202A` on `#EFE8DA` 13.52, muted `#4F5B64` on `#EFE8DA` 5.72 / sidebar `#E5DCCB` 5.12 / surface 6.35, accent-text `#6F5224` on bg 5.92 / sidebar 5.31, on-accent `#F7F4EF` on `#7A5A28` 5.76, border-strong `#857A60` on input `#F7F4EF` 3.87 / bg 3.48, nav hover blend `#ddd2be` with muted 4.66, all light chips 5.31-7.86, dark muted `#A9AEB0` on `#17293B` 6.61, dark border-strong `#6B829A` on `#0F1D2C` 4.29 (>= 3), dark danger-solid text `#F3EEE3` on `#C0392B` 4.70. Two near-misses to note: muted text directly on the active fill `#D6CAB4` is 4.30 (so inactive-style text must never sit on the active fill; the UI-SPEC already uses ink text there), and the light chart-2 `#9A7A44` on `#F7F4EF` is 3.65 (fine for graphics, 3:1, not for text). [VERIFIED: computed this session]

### Keyboard shortcut handler (Pitfall 6)
```tsx
useEffect(() => {
  const onKey = (e: KeyboardEvent) => {
    if (!(e.ctrlKey || e.metaKey) || !(e.key === '\\' || e.code === 'Backslash')) return
    const t = e.target as HTMLElement | null
    if (t && (t.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]'))) return
    if (document.querySelector('[aria-modal="true"]')) return
    e.preventDefault()
    toggleSidebar()
  }
  document.addEventListener('keydown', onKey)
  return () => document.removeEventListener('keydown', onKey)
}, [toggleSidebar])
```

## Google Maps `colorScheme` + `mapId` (the UI-SPEC's unresolved item)

- `ZoneMapInner` renders `<Map … mapId={process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || undefined} …>` (line 204) and sets no `colorScheme` [VERIFIED: read this session]. The installed `@vis.gl/react-google-maps` 1.8.3 `Map` accepts `colorScheme?: ColorScheme` (`index.d.ts:1012`) and exports `ColorScheme`.
- Google documents `colorScheme` as `LIGHT`, `DARK` or `FOLLOW_SYSTEM`, **default light**, settable **only when the map is initialised** (later changes have no effect), applying to `roadmap` and `terrain` map types [CITED: developers.google.com/maps/documentation/javascript/mapcolorscheme; developers.google.com/maps/documentation/javascript/reference/map#MapOptions.colorScheme]. Neither page states how it interacts with a `mapId`. A search-result snippet claimed "custom styles using Map IDs are only compatible with the light colour scheme for roadmap map types" and that dark map-ID styling is configured in the Cloud console; I did not see that sentence on the fetched pages, so treat it as [ASSUMED].
- The value of `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID` could not be inspected (never read `.env.local`) and the Cloud style attached to it is unknown.
- Consequence: today's map is effectively a light-scheme map in both admin themes (default is LIGHT) [ASSUMED from the documented default]. D-19's requirement "light map style in the light theme" is therefore likely already satisfied with no change; the only open question is whether the dark theme gets a dark map.
- **Recommendation:** (1) Light theme: pass `colorScheme={ColorScheme.LIGHT}` explicitly (no visible change). (2) Dark theme: try `ColorScheme.DARK`; because it is init-only, render `<Map key={theme} colorScheme={…}>` and accept that a toggle remounts `DrawLayer`. (3) Verify in the browser on production (owner's session): if the Map-ID style overrides the scheme, keep the light map in dark theme too and record the deviation. This makes the item low-risk either way. Keep Google logo/attribution visible (project memory: hiding it risks API-key suspension). Also note the Places autocomplete dropdown `.pac-container` is appended to `<body>` outside `.admin-shell` and is Google-styled (light) in both themes; `app/globals.css` only sets its `z-index` and font, so it needs no change [VERIFIED: grep + read].

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Inline hex per component | Semantic CSS custom properties per theme | this phase | Single place to change palette; guard test blocks regressions |
| `next-themes` + inline script | Server-read cookie + data attribute on a wrapper | project decision D-01 | Compatible with nonce CSP; no flash |
| Fixed `md:ml-[280px]` | `margin-left: var(--admin-sidebar-w)` in CSS | this phase | One variable drives main offset and aside width |

**Deprecated/outdated in this repo:** the retired anthracite/copper palette literals (`#28282B`, `#36363B`, `#4E4E56`, `#B87333`, `#CFC9C2`, `#F5F2EE`) — superseded by the navy/gold tokens already in `app/globals.css` (D-07).

## Runtime State Inventory

Not a rename/migration phase. No stored data, services, OS registrations or secrets are renamed. The only new runtime state is two first-party preference cookies (`admin_theme`, `admin_sidebar`); existing operators have neither, so they fall back to light/expanded (D-06). Build artifacts: none.

## Project Constraints (from CLAUDE.md)

- Brand spelling **Prestigo** / **rideprestigo.com** (never "Prestigio").
- Type check `npx tsc --noEmit` (baseline: 8 old errors in `tests/` only); lint `npx eslint --quiet <files>` (baseline: `<a>`→`<Link>` errors in both `not-found.tsx`); tests `npx vitest run [files]` (full suite ~90s; `vitest related` crashes here, grep `tests/` instead); full gate is the `verify` skill; dev server via `preview_start` name `prestigo`, never `npm run dev` in Bash.
- No hard-coded `€` prices in `app/` or `components/` (pre-commit enforces) — irrelevant to colours but every edited file is scanned.
- No secrets or `.env*` in commits; never read `.env.local`.
- `middleware.ts` matcher must exclude every static/metadata extension; this phase should not touch `middleware.ts` (the CSS is a bundled import, not a `public/` file).
- New EN strings in `messages/en.json` need translations: **not applicable** — admin copy is English-only, not routed through next-intl (UI-SPEC). Do not add keys to `messages/`.
- Golden-HTML / JSON-LD snapshot tests must normalise `priceValidUntil`; no new snapshot is added by this phase; the six existing ones must pass unedited.
- Security-related work commits with a `security:` prefix; this phase does not change auth/CSRF/validation (cookie enum validation is the only security-adjacent item).
- Vercel Preview deploys fail by design (missing Supabase env); non-blocking.
- Project memory rules that apply: admin browser checks happen on production, not localhost; `.env.local` is hard-denied; Phase 90 later extracts `BookingDetailPanel` from `BookingsTable.tsx` (colour swaps only here); Google Maps attribution must stay visible.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node | build, tests | yes | v24.14.1 | — |
| vitest | tests | yes | 4.1.5 (jsdom) | — |
| lucide-react icons | rail/toggles | yes | 1.8.0 (all 16 names verified) | — |
| Browser preview (`preview_start prestigo`) | first-paint check on `/admin/login`, visual QA of login | yes (project tool) | — | curl against the dev server for raw HTML |
| Authenticated admin session locally | visual QA of dashboard screens | no (fail-closed Upstash limiter on localhost sign-in) | — | Owner UAT on production after merge; component-level tests |
| Google Maps key / Map ID | map colour-scheme check | present in env but unreadable here | — | Production browser check; fallback = keep current map |

**Missing dependencies with no fallback:** none blocking.
**Missing dependencies with fallback:** authenticated local admin → production owner UAT.

## Validation Architecture

(`workflow.nyquist_validation` is absent from `.planning/config.json`, which only contains `workflow._auto_chain_active` and `use_worktrees`; treated as enabled.)

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.5 + @testing-library/react 16 + jest-dom, jsdom default; `// @vitest-environment node` for source-scanning tests |
| Config file | `vitest.config.ts` (`css: false` — CSS is never parsed by vitest, so CSS tests read the file with `fs`; alias `@` to repo root; setup `tests/setup.ts` mocks `matchMedia`, `scrollIntoView`) |
| Quick run command | `npx vitest run tests/admin-shell-prefs.test.ts tests/admin-theme-css.test.ts tests/admin-no-hardcoded-colors.test.ts tests/AdminSidebar.test.tsx tests/admin-shell-layout.test.tsx` |
| Full suite command | `npx vitest run` (~90s) plus `npx tsc --noEmit` (~7s) and `npx eslint --quiet <changed files>` |

Baseline captured this session: `npx vitest run tests/AdminSidebar.test.tsx tests/identities-page.test.tsx tests/erasure-page.test.tsx tests/BookingsTable.test.tsx` → 4 files, 112 tests, all pass.

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ADM-01 | Cookie value parsed to enum; invalid/missing falls back to `expanded`; cookie string has `Path=/admin; Max-Age=31536000; SameSite=Lax` (+`Secure` only on https) | unit | `npx vitest run tests/admin-shell-prefs.test.ts` | ❌ Wave 0 |
| ADM-01 | Server layout renders `data-admin-sidebar` from mocked `cookies()` (collapsed, expanded, garbage, absent) | unit (async server component, `await Layout({children})` then render) | `npx vitest run tests/admin-shell-layout.test.tsx` | ❌ Wave 0 |
| ADM-01 | Collapse button flips attribute, sets `aria-expanded`, writes `admin_sidebar=collapsed`; `Ctrl+\` and `Meta+\` toggle; ignored in `input`/`select`/open dialog; labels stay in DOM when collapsed; mobile hamburger still `md:hidden`; panel closes on nav link click | component | `npx vitest run tests/AdminSidebar.test.tsx` | ✅ exists, extend |
| ADM-01 | Collapsed styles exist only inside `@media (min-width: 768px)`; `--admin-sidebar-w` is 280px/72px | CSS source | `npx vitest run tests/admin-theme-css.test.ts` | ❌ Wave 0 |
| ADM-02 | Layout renders `data-admin-theme="light"` with no cookie, `dark` for `admin_theme=dark`, `light` for garbage; wrapper is a `div.admin-shell`, no `<html>` attribute set | unit | `npx vitest run tests/admin-shell-layout.test.tsx` | ❌ Wave 0 |
| ADM-02 | Theme toggle flips `data-admin-theme`, writes `admin_theme`, label is "Switch to dark theme" in light / "Switch to light theme" in dark (icon Moon in light, Sun in dark) | component | `npx vitest run tests/AdminSidebar.test.tsx` | extend |
| ADM-02 | Public pages unchanged: all rules scoped `.admin-shell`; no `html/body/:root/.theme-light` selector; `app/globals.css` `.theme-light` values intact; existing golden snapshots pass unedited | CSS source + snapshot | `npx vitest run tests/admin-theme-css.test.ts tests/book-page-render.test.tsx tests/fleet-page-render.test.tsx tests/route-page-render.test.tsx tests/routes-hub-render.test.tsx tests/multi-day-page-render.test.tsx tests/nav-locale-render-parity.test.tsx` | partly ❌ (css test), snapshots ✅ |
| ADM-02 | First paint: raw HTML of `/admin/login` already contains `data-admin-theme="dark"` when `Cookie: admin_theme=dark` is sent, and `light` with no cookie (no JS) | manual-scripted | `curl -s -H 'Cookie: admin_theme=dark' http://localhost:3000/admin/login \| grep -o 'data-admin-theme="[a-z]*"'` (dev server via `preview_start`) | manual |
| ADM-03 | No colour literal in `components/admin/**`, `app/(internal)/admin/**` outside allowlist; allowlist empty at phase end | source scan | `npx vitest run tests/admin-no-hardcoded-colors.test.ts` | ❌ Wave 0 |
| ADM-03 | Every `var(--admin-*|--status-*)` used in admin code is defined for both themes; token sets equal | CSS source | `npx vitest run tests/admin-theme-css.test.ts` | ❌ Wave 0 |
| ADM-03 | Contrast pairs meet 4.5:1 (text) / 3:1 (controls) in both themes | CSS source | `npx vitest run tests/admin-theme-css.test.ts` (or `admin-theme-contrast.test.ts`) | ❌ Wave 0 |
| ADM-03 | `StatusBadge` renders only `var(--status-*)` for all 14 variants (no colour strings, label + dot) | component | `npx vitest run tests/StatusBadge.test.tsx` | ❌ Wave 0 |
| ADM-03 | Converted screens still behave: bookings, erasure, identities, promos, routes, flight status, assignment, stats | component | `npx vitest run tests/BookingsTable.test.tsx tests/erasure-page.test.tsx tests/identities-page.test.tsx tests/PromoCard.test.tsx tests/RoutesTable.test.tsx tests/FlightStatusBlock.test.tsx tests/DriverAssignmentSection.test.tsx tests/stats-page.test.tsx tests/outbox-admin-page.test.tsx` | ✅ (3 need assertion edits, see list above) |
| ADM-03 | Shared public steps unchanged after `var(--token, fallback)` edit | component + snapshot | `npx vitest run tests/Step5Passenger.test.tsx tests/AddressInput.test.tsx tests/Step1TripType.test.tsx tests/Step2DateTime.test.tsx tests/book-page-render.test.tsx` | ✅ |
| ADM-03 | Every admin screen readable in both themes at 1280px and 390px (bookings, drivers, stats, outbox, settings, login, modals, side panels, wizard, zones map) | manual UAT on production | owner session; checklist in the verify plan | manual |

### Sampling Rate
- **Per task commit:** the Quick run command (about 10s) plus the plan's own file tests.
- **Per wave merge:** `npx vitest run` full suite, `npx tsc --noEmit`, `npx eslint --quiet <changed>`.
- **Phase gate:** full suite green and `LEGACY_PENDING` empty before `/gsd-verify-work`; owner production UAT for authenticated screens.

### Wave 0 Gaps
- [ ] `tests/admin-shell-prefs.test.ts` — covers ADM-01/02 (parse, serialise)
- [ ] `tests/admin-theme-css.test.ts` — scoping, token parity, token completeness, contrast, media gate, safety-net twins, `.theme-light` untouched
- [ ] `tests/admin-no-hardcoded-colors.test.ts` — ADM-03 guard with seeded 34-file allowlist
- [ ] `tests/admin-shell-layout.test.tsx` — server layout cookie handling (mock `next/headers` `cookies`)
- [ ] `tests/StatusBadge.test.tsx` — variant to family lookup
- [ ] extend `tests/AdminSidebar.test.tsx` (new props default via context; keep the five existing assertions)
- [ ] no framework install needed

## Security Domain

`security_enforcement` is absent from config, so treated as enabled. Scope is small: no auth, session, CSRF, or API change.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no (unchanged; `signIn`/`signOut` and `(dashboard)/layout.tsx` redirects untouched) | existing Supabase auth |
| V3 Session Management | no (the new cookies are UI preferences, not sessions; must not be named or scoped like the Supabase session cookie) | — |
| V4 Access Control | no change; the new `admin/layout.tsx` performs no auth and must not be mistaken for the gate — the gate stays in `(dashboard)/layout.tsx` | existing |
| V5 Input Validation | yes — cookie values are user-controlled | allow-list enum parse (`'dark'` or `'collapsed'`, everything else to default); never interpolate the raw cookie into an attribute, class or style |
| V6 Cryptography | no | — |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Cookie value injected into `data-*`/`style` (attribute/CSS injection) | Tampering | Parse to a 2-value union; render only the union member. Unit-tested with hostile strings (`"><script>`, `dark; x`) |
| Preference cookie readable by other paths | Information disclosure (negligible) | `Path=/admin`, `SameSite=Lax`, `Secure` on https; value carries no PII |
| Nonce CSP broken by an inline theme script | Denial of function | No inline script at all (D-01); CSS file is `'self'` under `style-src`; inline styles already allowed by `style-src 'unsafe-inline'` [VERIFIED: middleware.ts `buildCsp`] |
| Cookie banner / consent | Compliance | Functional preference cookies set only on explicit user action are generally outside consent requirements [ASSUMED; no legal review done] |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Safari rejects `Secure` cookies set from `http://localhost`, so write `Secure` only when `location.protocol === 'https:'` | Pattern 1 | Low: dev-only persistence glitch |
| A2 | `transform/filter/will-change/contain` on the wrapper make it the containing block for `position: fixed` descendants | Pattern 2, Pitfall 3 | Low: CSS spec behaviour; the mitigation (do not add them) costs nothing |
| A3 | `position: fixed` tooltips are not clipped by a scrolling ancestor that is not their containing block | Pattern 3 | Low; verify in browser at rail QA |
| A4 | Tailwind `md` = 768px, used as the media-query breakpoint in `admin-theme.css` | Pattern 2 | Low: mismatch would shift where the sidebar appears; verify against `md:hidden` behaviour |
| A5 | On Czech keyboard layouts the backslash needs AltGr/Option chords, so the shortcut is awkward there | Pitfall 6 | Low: the visible button is primary |
| A6 | Recharts SVG `fill`/`stroke` attributes accept `var(--x)` in current browsers | Pitfall 9 | Medium: charts could render black/transparent; fallback paths documented |
| A7 | A Maps `mapId` style may constrain `colorScheme`, and today's map is effectively light | Maps section | Medium: dark-theme map may not turn dark; fallback = keep light map and record deviation |
| A8 | Unknown `/admin/*` 404s rendering outside the shell is acceptable | Pitfall 12 | Low |
| A9 | Preference cookies need no consent banner entry | Security | Low; owner may want to confirm for the privacy policy |
| A10 | Root `body`/scrollbar remaining navy beside the light admin is cosmetically acceptable unless the `:has()` exception is approved | Pitfall 8, Open Question 2 | Low-medium: visible navy edge on overscroll |

## Open Questions

1. **Where does the booking-wizard (public steps) get its light-theme colours?**
   - What we know: 4 public files carry dark-only literals; `var(--token, fallback)` keeps public rendering identical and is not covered by the snapshots.
   - What's unclear: whether the owner accepts touching `components/booking/**` in an admin phase (D-02 says public pages must look the same, which the fallback satisfies).
   - Recommendation: do it in plan C with the listed verify command; the alternative leaves 2.5:1 error text.
2. **May `admin-theme.css` include one narrow `html:has(.admin-shell…)` / `body:has(…)` rule?**
   - What we know: the UI-SPEC bans html/body rules; global `body` and the root scrollbar track stay navy next to a cream admin.
   - What's unclear: tolerance for the navy edge.
   - Recommendation: allow exactly one `:has()`-gated rule (matches only when `.admin-shell` exists, so no public effect) and encode the exception in the scoping test.
3. **Does the dark theme get a dark Google map?**
   - Recommendation: attempt `ColorScheme.DARK` behind `key={theme}`, verify on production, otherwise keep the light map (deviation recorded).
4. **Should the shell plan run in Wave 2 parallel with A-D?**
   - No file overlap exists, so it can; ordering it after A-D only matters if the executor wants restyled primitives under the new shell for screenshots.

## Sources

### Primary (HIGH confidence — read or executed this session)
- `/Users/romanustyugov/Desktop/Prestigo/CLAUDE.md`; `86-CONTEXT.md`; `86-UI-SPEC.md`; `.planning/REQUIREMENTS.md` (ADM-01..03)
- `app/(internal)/layout.tsx`, `app/(internal)/admin/(dashboard)/layout.tsx`, `app/(internal)/admin/login/page.tsx` and `actions.ts`, `components/SiteChrome.tsx`, `middleware.ts` (CSP, `isDynamicPath`, `NON_LOCALIZED_PREFIXES`), `app/globals.css` (`.theme-light`, `body`, `.btn-*`, `.pac-container`, scrollbar), `components/admin/{AdminSidebar,Modal,StatusBadge,KPICard,adminFieldStyles,StatsChart,ZoneMapInner,AdminBookingWizard}`, `tests/AdminSidebar.test.tsx`, `tests/BookingsTable.test.tsx`, `tests/erasure-page.test.tsx`, `tests/identities-page.test.tsx`, `tests/dashboard-app-isolation-guard.test.ts`, `vitest.config.ts`, `.husky/pre-commit`
- Node scripts run this session: literal inventory, lucide export check, React SSR vs DOM style serialisation, WCAG contrast computations, vitest baseline (112 passed)

### Secondary (MEDIUM confidence — official docs fetched)
- Next.js CSS docs: https://nextjs.org/docs/app/getting-started/css
- Google Maps colour scheme: https://developers.google.com/maps/documentation/javascript/mapcolorscheme and https://developers.google.com/maps/documentation/javascript/reference/map#MapOptions.colorScheme

### Tertiary (LOW confidence — marked for validation)
- Search snippet on Map IDs and light-only custom styles (not seen on the fetched pages): see Assumption A7

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages; versions and icon exports verified.
- Architecture: HIGH — layouts, middleware, CSP and existing tests read directly; cookie pattern already used in repo.
- Inventory and token gaps: HIGH — measured by script with zero false positives.
- Pitfalls: HIGH for SSR style serialisation (measured), shared-public-component finding (read), tooltip clipping and containing block (spec behaviour, tagged assumed); MEDIUM for Recharts `var()` and Maps `colorScheme`.

**Research date:** 2026-11-02
**Valid until:** 2026-12-02 (stable stack; revisit only if Next/Tailwind majors change)

## Owner Decisions on Open Questions (2026-11-02)

- **OQ1 — shared public booking steps:** YES. Touch `components/booking/**` colour literals used by `AdminBookingWizard` with `var(--token, <original hex>)` fallbacks; public rendering must stay byte-identical.
- **OQ2 — html/body edge in light admin:** YES. Allow exactly one `html:has(.admin-shell[data-admin-theme="light"])` (and matching `body`) background/scrollbar rule; no other selector above `.admin-shell`.
- **OQ3 — zones map:** keep the map LIGHT in both themes (no `colorScheme` switching, no `key={theme}` remount). Resolves the UI-SPEC unresolved map item.
- **OQ4 — shell plan wave placement:** planner's call (Wave 2 alongside A–D is fine if there is no file overlap).
