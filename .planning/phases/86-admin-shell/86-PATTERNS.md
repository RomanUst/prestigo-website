# Phase 86: admin-shell - Pattern Map

**Mapped:** 2026-11-02
**Files analyzed:** 12 new/rewritten shell files (+ ~34 mechanical colour-swap files, see RESEARCH inventory)
**Analogs found:** 10 / 12

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match |
|---|---|---|---|---|
| `app/(internal)/admin/layout.tsx` (new) | layout (server) | request-response (cookie read) | `app/(internal)/admin/(dashboard)/layout.tsx` + `settings/page.tsx` L3-8 (`await cookies()`) | role-match |
| `app/(internal)/admin/admin-theme.css` (new) | config (scoped CSS) | static | `.theme-light` block in `app/globals.css` ~L206-228 | role-match |
| `components/admin/AdminShell.tsx` (new) | provider (client) | event-driven (toggle -> cookie) | none in repo (RESEARCH Pattern 1 code) | no analog |
| `lib/admin-shell-prefs.ts` (new) | utility | transform | `lib/admin-next.ts` (pure parse helper, used by `tests/admin-login-next.test.ts`) | role-match |
| `components/admin/AdminSidebar.tsx` (rewrite) | component (client) | event-driven | itself (current file) | exact |
| `app/(internal)/admin/(dashboard)/layout.tsx` (edit) | layout | request-response | itself | exact |
| `app/(internal)/admin/login/page.tsx` (edit) | page | request-response | itself | exact |
| `tests/admin-no-hardcoded-colors.test.ts` | test (source scan) | batch | `tests/dashboard-app-isolation-guard.test.ts` | exact |
| `tests/admin-theme-css.test.ts` | test (source scan) | batch | same guard test | exact |
| `tests/admin-shell-prefs.test.ts` | test (unit) | transform | `tests/admin-login-next.test.ts` | role-match |
| `tests/admin-shell-layout.test.tsx` | test (server component) | request-response | `tests/admin-login-next.test.ts` L29-31 (`next/headers` mock) + `tests/AdminSidebar.test.tsx` | role-match |
| `tests/AdminSidebar.test.tsx` (extend) | test | render | itself | exact |

## Pattern Assignments

### `app/(internal)/admin/layout.tsx` (server layout, cookie read)

**Analog:** `app/(internal)/admin/(dashboard)/settings/page.tsx` lines 3-6 for the cookies call, and `(dashboard)/layout.tsx` for async-layout shape.

```tsx
import { cookies } from 'next/headers'
export default async function SettingsPage() {
  const cookieStore = await cookies()
```
```tsx
// (dashboard)/layout.tsx shape
export default async function AdminDashboardLayout({ children }: { children: React.ReactNode }) {
```
Parent `app/(internal)/layout.tsx` renders `<html lang="en"><SiteChrome>` and reads NO cookies. Leave it untouched (D-02). Use RESEARCH Pattern 1 code (lines 192-209): `jar.get(NAME)?.value` into `parseAdminTheme/parseAdminSidebar`, then `<AdminShell initialTheme initialSidebar>`; import `./admin-theme.css` at top. Do not touch the auth redirects in `(dashboard)/layout.tsx`: `if (!user) redirect('/admin/login')` and `if (!user.app_metadata?.is_admin) redirect('/')`.

### `(dashboard)/layout.tsx` edit

Replace on `<main>`: `className="md:ml-[280px] pt-16 md:pt-8"` becomes `admin-main pt-16 md:pt-8`. Remove inline `backgroundColor: 'var(--anthracite-mid)'`, `color: 'var(--offwhite)'` (set in CSS). Keep longhand padding comment (a `padding` shorthand would reset pt-16).

### `components/admin/AdminSidebar.tsx` (rewrite)

**Analog:** current file. Keep:
```tsx
'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { Menu, X } from 'lucide-react'
import { signOut } from '@/app/(internal)/admin/login/actions'
```
- navItems array of `{href,label}` (L9-21, label order and "Promos" label are asserted by tests).
- Hamburger: `className="md:hidden"`, `aria-label={open ? 'Close menu' : 'Open menu'}`, position fixed, zIndex 60, 44px min size.
- Aside: `className={open ? 'flex' : 'hidden md:flex'}`, fixed, zIndex 50; backdrop zIndex 40 with `md:hidden`.
- Each nav `<Link>` keeps `onClick={() => setOpen(false)}` (D-16) and inline `minHeight: 44` (test asserts every link has `min-height`).
- Sign out: `<form action={signOut}><button type="submit">`.
- Active check: `pathname.startsWith(item.href)`.
- All 13 hex + 1 rgba literals here (`#28282B`, `#4E4E56`, `#F5F2EE`, `#CFC9C2`, `#B87333`, `rgba(0,0,0,0.5)`) become tokens.
- Context consumer must have a default value (the test renders bare `<AdminSidebar />`). Logo must not become a link. Use RESEARCH shortcut handler (lines 449-460).

### `components/admin/AdminShell.tsx` (no analog)

Use RESEARCH Pattern 1 and Pattern 2. Closest in-repo hint for a comment on cookies: none. `document.cookie` is not written anywhere else in repo (only a comment in `components/LocaleSwitcher.tsx` L91), so follow `serializePrefCookie` in RESEARCH L187-189. Wrapper must have no transform/filter/will-change/contain (fixed descendants).

### `lib/admin-shell-prefs.ts`

Pure module, enum parsers (RESEARCH L178-189). Test style: `tests/admin-login-next.test.ts` tests the pure `safeAdminNext` from `@/lib/admin-next` imported after mocks.

### `app/(internal)/admin/admin-theme.css`

**Analog:** `app/globals.css` `.theme-light` (L206-228) — copy VALUES but scope under `.admin-shell[data-admin-theme="light"]`; never edit `.theme-light` (a test asserts it is unchanged).
```css
.theme-light {
  --anthracite: #EFE8DA;  --anthracite-mid: #E5DCCB;  --anthracite-light: #D6CAB4;
  --offwhite: #16202A;  --warmgrey: #5E6B75;
  --copper: #8C6A34;  --copper-light: #8C6A34;  --copper-pale: #9A7A44;
}
```
Re-declaring these legacy bare vars inside the wrapper flips the ~900 existing `var(--anthracite|offwhite|copper|warmgrey)` references. Remaining rules: RESEARCH Patterns 2-4 (both `text-transform:uppercase` and `text-transform: uppercase` selector forms; collapsed rules only in `@media (min-width:768px)`; `position: fixed` tooltips).

### Guard tests (`// @vitest-environment node`)

**Analog:** `tests/dashboard-app-isolation-guard.test.ts` lines 1-60 (verified tracked via git). Copy:
```ts
// @vitest-environment node
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
const REPO_ROOT = path.resolve(__dirname, '..')
...
/** The floor of the guard's scope: these entry modules must always be in it, so it can never shrink silently. */
const SCOPE_FLOOR = [...ENTRY_FILES]
```
Pattern: `fs`/`path` walk, `CODE_EXT` set, `SCOPE_FLOOR` assertion that the scan can't shrink. Full test skeleton for the colour guard is in RESEARCH lines 380-426 (`LEGACY_PENDING` allowlist, each plan deletes its entries). Note its vitest default env is jsdom, so the node pragma line must be the first line.

### Server-component test mocking `next/headers`

**Analog:** `tests/admin-login-next.test.ts` L28-37:
```ts
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'x-forwarded-for': '203.0.113.9' }),
}))
```
For the new layout mock `cookies` instead: `vi.mock('next/headers', () => ({ cookies: async () => ({ get: (n: string) => mockJar[n] ? { value: mockJar[n] } : undefined }) }))` with `vi.hoisted` for the jar (project convention). Call the async layout directly: `const el = await AdminRootLayout({ children: <div/> })` then `render(el)` and assert `data-admin-theme` / `data-admin-sidebar` on `.admin-shell`; also mock `@/lib/supabase/server` the way lines 33-35 do if rendering `(dashboard)/layout`. Also mock the CSS import (vitest `css: false` already handles it). Component tests mock `next/navigation`, `next/link`, and the `signOut` action as in `tests/AdminSidebar.test.tsx` L1-19.

## Shared Patterns

- **Existing test contract** for sidebar: `tests/AdminSidebar.test.tsx` renders bare, asserts `md:hidden` hamburger, link order, `Promos` href, inline `min-height` on every link.
- **Tests asserting literals that must be edited with their file:** `tests/BookingsTable.test.tsx` ~L688-719, `tests/erasure-page.test.tsx` L235/L450, `tests/identities-page.test.tsx` L429-440 (see RESEARCH L317-321).
- **No-hard-coded-price rule / matcher:** CSS imported via bundle, not `public/` (CLAUDE.md matcher rule).
- Auth/login logic (`login/actions.ts`) stays unchanged.

## No Analog Found

| File | Role | Reason |
|---|---|---|
| `components/admin/AdminShell.tsx` | client provider/context | No theme/preference context or cookie-writing client component exists; use RESEARCH Pattern 1 |
| RailTooltip (inside sidebar) | component | No tooltip component in repo; RESEARCH Pattern 3 |

## Metadata

**Analog search scope:** `app/(internal)`, `components/admin`, `lib`, `tests`, `app/globals.css`
**Not read:** RESEARCH.md lines 466-643 (Map/validation tail) and 86-CONTEXT.md / 86-UI-SPEC.md (decisions taken from RESEARCH's copy of CONTEXT)
**Pattern extraction date:** 2026-11-02
