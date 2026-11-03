# Phase 86: Admin Shell - Context

**Gathered:** 2026-11-02
**Status:** Ready for planning

<domain>
## Phase Boundary

The admin (`/admin/*`) gets a collapsible desktop sidebar and a persistent light/dark theme; every admin screen
(bookings, drivers, stats, outbox, settings, pricing, zones, accounts, promo codes, identities, erasure, login,
plus modals and side panels) is converted from hard-coded colours to theme tokens and is readable in both themes;
a test blocks new hard-coded colours in admin code. The light theme additionally gets a Notion-like look.
Public pages in every locale must look exactly as before. Admin auth and the session model are untouched.
Requirements: ADM-01, ADM-02, ADM-03.

</domain>

<decisions>
## Implementation Decisions

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

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope and requirements
- `.planning/ROADMAP.md` §"Phase 86: Admin Shell" — goal, 4 success criteria, planning notes
- `.planning/REQUIREMENTS.md` — ADM-01, ADM-02, ADM-03

### Research (v5.0)
- `.planning/research/ARCHITECTURE.md` §Admin shell (~L18, ~L226-227) — cookie-driven server layout, `--admin-sidebar-w`, theme on wrapper only, top hex offenders, components to recheck (`StatsChart`, `ZoneMapInner`, Modal overlays, `StatusBadge`)
- `.planning/research/STACK.md` §Light/dark theme (~L113) — reuse `.theme-light`, cookie, no next-themes, hex codemod cost
- `.planning/research/SUMMARY.md` (~L15, ~L71) — theme approach summary

### Project rules
- `CLAUDE.md` — no hard-coded `€` prices in `app/`/`components/`; commands (tsc, eslint, vitest); `verify` skill
- `app/globals.css` — `@theme` navy/gold tokens (L5-34), `:root` vars (L51-63), `.theme-light` (L199-230)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `.theme-light` in `app/globals.css`: remaps both Tailwind `--color-*` tokens and bare `--anthracite/--offwhite/--copper/--warmgrey` vars — ~900 `var(--…)` references in admin flip for free.
- `lucide-react` already a dependency (sidebar already imports `Menu`, `X`) — icons for the rail and sun/moon toggle.
- `components/admin/adminFieldStyles.ts` — shared field styles; a natural place for tokenised input styles.
- `components/admin/Modal.tsx`, `StatusBadge.tsx`, `KPICard.tsx` — shared primitives; restyling them covers many screens.

### Established Patterns
- Admin styling is mostly inline `style={{}}` with `var(--…)` plus hex literals; Tailwind classes used for responsive bits (`md:hidden`, `md:ml-[280px]`).
- `app/(internal)/admin/(dashboard)/layout.tsx` is an async server component (already dynamic: `supabase.auth.getUser()`) — can read cookies with `cookies()` at no extra cost.
- Top hex offenders: `#f87171` ×52, `#CFC9C2` ×35, `#F5F2EE` ×25, `#4E4E56` ×21, `#4ade80` ×14, `#B87333` ×12, `#36363B` ×11, `#2a1a1a` ×7.

### Integration Points
- `app/(internal)/admin/(dashboard)/layout.tsx` — wrapper gets theme attribute/class + sidebar width var; `main` margin `md:ml-[280px]` → var.
- `components/admin/AdminSidebar.tsx` (152 lines, client) — fixed 280px aside with inline old-palette hex; needs collapsed prop/state, toggles, shortcut.
- `app/(internal)/admin/login/page.tsx` — client page with `var(--anthracite)` background; needs theme from cookie (server wrapper).
- `BookingsTable.tsx` (~2,886 lines) — largest hex consumer; Phase 90 later extracts `BookingDetailPanel` from it, so keep changes to colour/token swaps here, no structural refactor.

</code_context>

<specifics>
## Specific Ideas

- "Like Notion" for the light theme: sidebar, calm sentence-case typography, flat tables with hover rows, page-like modals/panels, pastel status tags.
- Cmd/Ctrl+`\` to collapse the sidebar, as in Notion.
- Light is the default theme on first visit.

</specifics>

<deferred>
## Deferred Ideas

- Notion-like structural restyle of the **dark** theme — not requested; dark keeps current structure.
- Mobile bottom tab bar — rejected; mobile stays hamburger + slide-over.
- Per-account (DB-stored) theme/sidebar preference syncing across devices — cookies only for now.

</deferred>

---

*Phase: 86-admin-shell*
*Context gathered: 2026-11-02*
