# Phase 58: Sign-in UI + Account Dashboard — Research

**Researched:** 2026-06-12
**Domain:** Next.js 16 / React 19 / Supabase Auth client state / PostgreSQL RLS / account UI
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** "My trips" is a UI shell with an empty state only ("No trips yet" + a "Book now" CTA). Do NOT add `bookings` RLS, do NOT link bookings to `user_id` at submit time, do NOT query real history. Migration `045` assigns that work to Phase 60 — respect that boundary.
- **D-02:** The account zone uses separate routes: `/account` (overview), `/account/trips` (My trips), `/account/profile` (profile editing). All live under the existing `/account/*` middleware gate from Phase 57.
- **D-03:** Extend `customer_profiles` (new migration `047`) with: `ico` (IČO) + `vat_id` (DIČ / VAT). `company_name` already exists. Exposed/edited only when `account_type = corporate`.
- **D-04:** Cost-centre is deferred. "Book for a guest" is deferred to Phase 59.
- **D-05:** Account type is switchable on `/account/profile` (personal ⇄ corporate).
- **D-06:** Editable contact fields on `customer_profiles`: full name and phone. Email is read-only (sourced from `auth.users`).
- **D-07:** Add `saved_passengers` table (migration `048`) with per-user RLS mirroring migration 044 pattern. Columns: `user_id` FK, `full_name`, `phone`, `email` (nullable), `notes` (nullable), `is_default` flag.
- **D-08:** Signed-in state renders an account dropdown in `Nav` (My trips / Profile / Sign out); guests see a "Sign in" button. Desktop bar + mobile menu.
- **D-09:** `Nav` stays a client component and reads session state via `createBrowserClient` + `onAuthStateChange`. Avoids forcing marketing/static pages into dynamic rendering. A brief pre-hydration flash of the guest state is acceptable.

### Claude's Discretion
- Exact dropdown/menu markup, icons, copy, and empty-state wording (UI-SPEC has finalized these — see 58-UI-SPEC.md).
- Whether to extract a shared `lib/supabase/client.ts` browser helper or keep inline `createBrowserClient` calls (current pattern is inline).
- Whether profile/passenger writes use server actions (like `app/login/actions.ts`) or client mutations.
- Whether `saved_passengers` enforces a single-default via a partial unique index or app logic.
- Form validation specifics and field ordering on `/account/profile`.

### Deferred Ideas (OUT OF SCOPE)
- **Real booking history + `bookings` RLS + linking new bookings to `user_id`** → Phase 60 (per migration 045 comment; ACCT-04 lands there).
- **"Book for a guest" at checkout** → Phase 59 (BOOK-06).
- **Cost-centre and extended B2B fields** (billing address, billing contacts) → later corporate/B2B phase.
- **GA4 `login` / `sign_up` events (TRACK-04)** → Phase 60/61.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| NAV-01 | Header (desktop + mobile) has a Sign in button that routes to `/login`, placed before the existing "Book now" CTA in `components/Nav.tsx` | Section: Auth-Aware Nav Pattern |
| NAV-02 | When a customer is logged in, the header shows an account/sign-out affordance instead of "Sign in" | Section: Auth-Aware Nav Pattern, onAuthStateChange pattern |
| ACCT-01 | "My trips" page — UI shell + empty state only (real data Phase 60) | Section: Account Pages Pattern, D-01 enforced |
| ACCT-02 | Customer can view and edit their profile (contact details, saved passengers) | Section: Profile Editing Pattern, saved_passengers RLS |
| ACCT-03 | Corporate account exposes extra fields (company_name, IČO/VAT) and type switch | Section: Migration 047, Corporate Fields Pattern |
</phase_requirements>

---

## Summary

Phase 58 builds the customer-facing UI layer on top of the Phase 57 Supabase Auth foundation. The work is cleanly partitioned into four categories: (1) auth-aware header, (2) account route pages, (3) two new SQL migrations, and (4) profile/passenger server actions.

The header change is the highest-risk item for SEO/performance. `Nav.tsx` is already a client component using `useEffect` and `useState`. The D-09 decision — reading auth state via `createBrowserClient` + `onAuthStateChange` — is the **correct and already-established** pattern in this codebase (see `OAuthButtons.tsx` and `reset-password/page.tsx`). Marketing pages are kept static because middleware skips `updateSession()` for non-dynamic paths (see `middleware.ts: isDynamicPath()`), so `Nav` never triggers a server auth call on those pages. The pre-hydration flash is accepted per D-09.

Profile and passenger writes should mirror `app/login/actions.ts` (server actions in a `'use server'` module, returning error/success state). The `auth-helpers.ts` split is the established convention for keeping synchronous helpers out of the `'use server'` boundary.

The two migrations follow the exact patterns of migrations 044 and 046 already in the repo. Migration 047 (ALTER TABLE `customer_profiles` ADD COLUMN IF NOT EXISTS) and migration 048 (new `saved_passengers` table with own-row RLS) are straightforward. The `is_default` single-default enforcement should use a **partial unique index** (`WHERE is_default = true`) — this is the recommended approach as it provides atomic enforcement at the DB layer.

**Primary recommendation:** Use server actions for all profile/passenger writes (matching the `actions.ts` pattern), keep Nav as a client component with `onAuthStateChange`, and implement the `is_default` enforcement via a partial unique index in migration 048.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Nav auth state read | Browser / Client | — | Nav is already `'use client'`; `onAuthStateChange` is a browser subscription; server read would require making every marketing page dynamic |
| Auth dropdown (sign out) | API / Backend | Browser / Client | `customerSignOut` is a server action (already exists); dropdown trigger and open/close state lives in the client |
| `/account` overview page | Frontend Server (SSR) | — | `force-dynamic` server component; reads `auth.users` email server-side via `createClient()` |
| `/account/trips` empty state | Frontend Server (SSR) | — | Static UI shell with no DB queries this phase; still `force-dynamic` to stay inside the auth-gated zone |
| `/account/profile` — load data | Frontend Server (SSR) | — | Server component reads `customer_profiles` + `saved_passengers` for the authenticated user |
| `/account/profile` — save/update | API / Backend | Browser / Client | Server actions (`updateProfile`, `savePassenger`, `deletePassenger`); client component handles form state |
| Migration 047 + 048 | Database / Storage | — | Schema-only; no app-tier involvement |
| Corporate fields (conditional UI) | Browser / Client | — | Client-side conditional render based on `accountType` state |
| Saved passengers CRUD | API / Backend | Browser / Client | Server actions own writes; client component owns editor open/close state |

---

## Standard Stack

### Core (already installed — no new packages needed)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@supabase/ssr` | `^0.10.0` | Browser + server Supabase clients | Already installed; provides `createBrowserClient` + `createServerClient` [VERIFIED: package.json] |
| `@supabase/supabase-js` | `^2.101.0` | Supabase Auth + DB client | Already installed [VERIFIED: package.json] |
| `next` | `^16.2.3` | App Router, server actions, `useActionState` | Project framework [VERIFIED: package.json] |
| `react` | `19.2.3` | Client components, hooks | Project runtime [VERIFIED: package.json] |

### Supporting (already in project — no install needed)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `vitest` | `^4.1.1` | Unit/integration tests | Wave-0 test scaffolds for new server actions and migrations [VERIFIED: package.json] |
| `@testing-library/react` | (project dep) | Component interaction tests | Nav dropdown open/close, profile form state |

### No New Packages Required

This phase installs **zero new packages**. All required libraries (`@supabase/ssr`, `@supabase/supabase-js`, `next`, `react`, `vitest`) are already in `package.json`. The UI is built with the existing bespoke CSS system (Tailwind v4 + `globals.css` custom classes) and inline SVG icons per the UI-SPEC and project convention.

**Installation:**
```bash
# No new packages to install
```

---

## Package Legitimacy Audit

No new packages are introduced in this phase. All dependencies already exist in `package.json` and have been used in the codebase since Phase 57.

| Package | Registry | Verdict | Disposition |
|---------|----------|---------|-------------|
| `@supabase/ssr` | npm | OK — official Supabase package, project already uses it | Approved (existing) |
| `@supabase/supabase-js` | npm | OK — official Supabase package, project already uses it | Approved (existing) |

**Packages removed due to SLOP verdict:** none
**Packages flagged as suspicious SUS:** none

---

## Architecture Patterns

### System Architecture Diagram

```
Browser                     Next.js App Router               Supabase (DB + Auth)
──────────────────────────────────────────────────────────────────────────────────

[Marketing page load]
  Nav (client) ──────── createBrowserClient
        │                onAuthStateChange ──────────────── auth.users session
        │                                                   (JWT subscription)
        │
        ├─ guest:    [Sign in] button → /login (existing)
        └─ signed-in: [Account ▾] dropdown
                          ├─ "My trips"  → /account/trips
                          ├─ "Profile"   → /account/profile
                          └─ "Sign out"  ──── customerSignOut() server action
                                              │
                                              └─ supabase.auth.signOut()
                                                 redirect('/')

[/account/* request]
  middleware.ts
    isDynamicPath('/account') → true
    updateSession() ──────────────────── auth.getUser() [JWT validate]
    no user → redirect /login?return-to=...
    user present → continue

[/account — server component]
  createClient().auth.getUser() ──────── auth.users.email
  render overview + "Signed in as {email}"

[/account/trips — server component]
  createClient().auth.getUser() ──────── (session only, no bookings query Phase 58)
  render empty state UI

[/account/profile — profile section]
  createClient().from('customer_profiles')
    .select('*').eq('user_id', user.id) ── customer_profiles (own-row RLS)
  createClient().from('saved_passengers')
    .select('*').eq('user_id', user.id) ── saved_passengers (own-row RLS)

[Profile save — server action]
  updateProfile(formData)
    createClient().from('customer_profiles').update({...})
                                             ─── own-row RLS enforces ownership

[Passenger CRUD — server actions]
  addPassenger / updatePassenger / deletePassenger
    createClient().from('saved_passengers').insert/update/delete
                                             ─── own-row RLS enforces ownership
```

### Recommended Project Structure

```
app/
├── account/
│   ├── page.tsx              # Overview — EVOLVE from current placeholder
│   ├── trips/
│   │   └── page.tsx          # My Trips — NEW (empty state shell)
│   └── profile/
│       └── page.tsx          # Profile editing — NEW
├── login/
│   ├── actions.ts            # EXTEND: add updateProfile, passenger CRUD actions
│   └── auth-helpers.ts       # (unchanged)
components/
├── Nav.tsx                   # EXTEND: add auth state read + dropdown
└── account/
│   └── ProfileForm.tsx       # NEW (optional extraction if profile page grows large)
supabase/
└── migrations/
    ├── 047_customer_profiles_corporate_fields.sql   # NEW
    └── 048_saved_passengers.sql                     # NEW
types/
└── database.types.ts         # REGENERATE after migrations pushed
tests/
├── nav-auth.test.tsx          # NEW — Wave-0 scaffold
├── profile-actions.test.ts    # NEW — Wave-0 scaffold
└── passenger-actions.test.ts  # NEW — Wave-0 scaffold
```

---

### Pattern 1: Auth-Aware Nav — `createBrowserClient` + `onAuthStateChange`

**What:** Nav reads Supabase session entirely in the browser using `onAuthStateChange`, which fires once immediately with the current session and then on subsequent changes. Marketing pages remain static/SSR because middleware skips `updateSession()` for non-dynamic paths.

**Why it keeps marketing pages static:** `middleware.ts:isDynamicPath()` returns `false` for `/`, `/services`, `/fleet`, etc. — those requests skip `updateSession()` entirely, never making an auth roundtrip. The Nav `'use client'` component hydrates after the static HTML is delivered, so no server auth call is made during the initial page request.

**When to use:** Any client component that needs to react to auth state changes without making the host page dynamic.

**Example — exact pattern from `OAuthButtons.tsx` and `reset-password/page.tsx`:**
```typescript
// Source: components/auth/OAuthButtons.tsx (confirmed in codebase)
'use client'

import { useMemo, useEffect, useState } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import type { User } from '@supabase/supabase-js'

// In Nav.tsx — memoize to avoid re-instantiation on every render
const supabase = useMemo(
  () =>
    createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    ),
  []
)

// Subscribe to auth changes — fires immediately with current session
useEffect(() => {
  const { data: { subscription } } = supabase.auth.onAuthStateChange(
    (_event, session) => {
      setUser(session?.user ?? null)
    }
  )
  return () => subscription.unsubscribe()
}, [supabase])
```

**Critical note:** Use `onAuthStateChange`, NOT `getSession()`. The codebase convention (enforced throughout `lib/supabase/middleware.ts`) is `getUser()` server-side (JWT-validated). `onAuthStateChange` is the browser equivalent that picks up the session from the Supabase cookie/localStorage and reacts to changes.

**Pre-hydration flash:** Initial server render sees no user state (Nav doesn't read session server-side). After hydration, `onAuthStateChange` fires and sets the user. The accepted outcome: marketing pages show the "Sign in" button briefly before potentially updating to the signed-in state. Per D-09 this is acceptable.

---

### Pattern 2: Server Actions for Profile/Passenger Writes

**What:** Profile and passenger mutations live in the `'use server'` module (`app/login/actions.ts` or a sibling `app/account/actions.ts`), exporting only `async` functions. Synchronous helpers are split into a separate non-`'use server'` file per the `auth-helpers.ts` precedent.

**Why server actions, not client mutations:** The existing `actions.ts` and admin action patterns in the project consistently use server actions. Server actions: (1) keep ownership enforcement server-side (strip user_id from caller, derive from `getUser()` — exactly as `saveBookingWithUserId` does), (2) avoid exposing mutation API surface in client bundles, (3) integrate cleanly with `useActionState` for loading/error state.

**`'use server'` module rule (from `auth-helpers.ts` comment):**
```
A file with the 'use server' directive may only export async functions
(every export is treated as a Server Action endpoint). Synchronous helpers
MUST live in a separate non-'use server' file.
```

**Pattern from `app/login/actions.ts`:**
```typescript
// Source: app/login/actions.ts (confirmed in codebase)
'use server'

import { createClient } from '@/lib/supabase/server'

export async function updateProfile(
  prevState: { error?: string; success?: boolean } | null,
  formData: FormData
): Promise<{ error?: string; success?: boolean }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }

  const full_name = formData.get('full_name') as string
  const phone = formData.get('phone') as string
  const account_type = formData.get('account_type') as string
  // Corporate fields only if account_type === 'corporate':
  const company_name = formData.get('company_name') as string | null
  const ico = formData.get('ico') as string | null
  const vat_id = formData.get('vat_id') as string | null

  const { error } = await supabase
    .from('customer_profiles')
    .update({ full_name, phone, account_type, company_name, ico, vat_id })
    .eq('user_id', user.id)  // RLS enforces this anyway, but explicit is correct

  if (error) return { error: 'Something went wrong. Please try again.' }
  return { success: true }
}
```

**Caller pattern using `useActionState` (from `app/login/page.tsx`):**
```typescript
// Source: app/login/page.tsx (confirmed in codebase)
const [state, action, isPending] = useActionState(updateProfile, null)
```

---

### Pattern 3: Migration SQL — `IF NOT EXISTS` + Trigger Convention

**What:** All migrations are sequential, idempotent, and follow the ADD COLUMN / CREATE TABLE IF NOT EXISTS convention.

**Next free migration numbers:** 047 and 048 (confirmed: 046 is the latest in `supabase/migrations/`).

**Migration 047 — ALTER TABLE (mirror of migration 044's ADD COLUMN pattern):**
```sql
-- Source: confirmed from migrations 044 and 046 in codebase
-- Migration 047: customer_profiles corporate fields
-- Phase 58 — Sign-in UI + Account Dashboard (ACCT-03, D-03)

ALTER TABLE public.customer_profiles
  ADD COLUMN IF NOT EXISTS ico TEXT,
  ADD COLUMN IF NOT EXISTS vat_id TEXT;
```

**Migration 048 — new table (mirror migration 044's table + RLS pattern):**
```sql
-- Source: confirmed from migration 044 pattern in codebase
CREATE TABLE IF NOT EXISTS public.saved_passengers (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name  TEXT        NOT NULL,
  phone      TEXT        NOT NULL,
  email      TEXT,
  notes      TEXT,
  is_default BOOLEAN     NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS saved_passengers_user_id_idx
  ON public.saved_passengers (user_id);

-- Single-default enforcement: partial unique index
-- Only one row per user can have is_default = true
CREATE UNIQUE INDEX IF NOT EXISTS saved_passengers_one_default_per_user
  ON public.saved_passengers (user_id)
  WHERE is_default = true;

ALTER TABLE public.saved_passengers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS saved_passengers_select_own ON public.saved_passengers;
CREATE POLICY saved_passengers_select_own
  ON public.saved_passengers FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS saved_passengers_insert_own ON public.saved_passengers;
CREATE POLICY saved_passengers_insert_own
  ON public.saved_passengers FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS saved_passengers_update_own ON public.saved_passengers;
CREATE POLICY saved_passengers_update_own
  ON public.saved_passengers FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS saved_passengers_delete_own ON public.saved_passengers;
CREATE POLICY saved_passengers_delete_own
  ON public.saved_passengers FOR DELETE
  TO authenticated
  USING ((select auth.uid()) = user_id);
-- (Unlike customer_profiles, passengers CAN be deleted by the user — no cascade-only rule here)
```

**updated_at trigger (mirror migration 046's convention):**
```sql
-- Source: confirmed from migration 046 in codebase
CREATE OR REPLACE FUNCTION public.saved_passengers_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS saved_passengers_set_updated_at ON public.saved_passengers;
CREATE TRIGGER saved_passengers_set_updated_at
  BEFORE UPDATE ON public.saved_passengers
  FOR EACH ROW
  EXECUTE FUNCTION public.saved_passengers_set_updated_at();
```

---

### Pattern 4: Account Pages — Server Components + `force-dynamic`

**What:** All `/account/*` pages are server components reading auth state via `createClient().auth.getUser()` (JWT-validated). They declare `export const dynamic = 'force-dynamic'` — matching the existing `app/account/page.tsx` which already has this.

**Why `force-dynamic` is correct here:** `/account/*` paths are in the `isDynamicPath()` list in `middleware.ts`, meaning middleware runs `updateSession()` on every request, refreshing the JWT. Without `force-dynamic`, Next.js might cache the server component output at the edge, serving stale auth state. The existing `app/account/page.tsx` already uses `force-dynamic` — new pages under `/account/*` must too.

**Confirmed from existing `app/account/page.tsx`:**
```typescript
// Source: app/account/page.tsx (confirmed in codebase)
import { createClient } from '@/lib/supabase/server'
export const dynamic = 'force-dynamic'

export default async function AccountPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  // ...
}
```

---

### Pattern 5: `is_default` Enforcement — Partial Unique Index

**Recommendation:** Enforce single-default via a partial unique index (see migration 048 above), NOT app logic.

**Rationale:** A partial unique index (`WHERE is_default = true`) is atomic and consistent — concurrent requests cannot both set `is_default = true` for different rows. App logic (read-then-update) has a race condition window. The index approach also reduces server action complexity: the `SET DEFAULT` action is a single UPDATE; the DB rejects a duplicate.

**Implication for server action:** When setting a passenger as default, the action should:
1. `UPDATE saved_passengers SET is_default = false WHERE user_id = $uid` (clear all)
2. `UPDATE saved_passengers SET is_default = true WHERE id = $id AND user_id = $uid` (set one)

Or use a transaction. The partial unique index enforces the constraint regardless; the two-step pattern is a safe client-facing sequence.

---

### Pattern 6: Nav Dropdown — Client-Side State Management

**What:** The dropdown open/close state is purely client-side (`useState`). The dropdown closes on: outside click (via `useEffect` + `document.addEventListener`), Escape key, and navigation (via `usePathname` change in a `useEffect`).

**Existing Nav pattern for reference:** Nav already uses `const [open, setOpen] = useState(false)` for the mobile menu and `const pathname = usePathname()` for active link detection. The dropdown follows the same pattern.

**Click-outside pattern:**
```typescript
// Standard pattern for the project — no external library needed
useEffect(() => {
  if (!dropdownOpen) return
  const handler = (e: MouseEvent) => {
    if (triggerRef.current && !triggerRef.current.contains(e.target as Node)) {
      setDropdownOpen(false)
    }
  }
  document.addEventListener('mousedown', handler)
  return () => document.removeEventListener('mousedown', handler)
}, [dropdownOpen])
```

**Escape key:**
```typescript
useEffect(() => {
  const handler = (e: KeyboardEvent) => {
    if (e.key === 'Escape') setDropdownOpen(false)
  }
  document.addEventListener('keydown', handler)
  return () => document.removeEventListener('keydown', handler)
}, [])
```

---

### Anti-Patterns to Avoid

- **Reading auth state server-side in Nav:** Would force every marketing page into dynamic rendering. Nav MUST use `createBrowserClient` + `onAuthStateChange` per D-09.
- **`getSession()` instead of `onAuthStateChange` in the client:** `getSession()` returns a cached value and doesn't react to sign-in/out events. `onAuthStateChange` fires immediately with current state and updates on changes.
- **Exporting synchronous helpers from a `'use server'` module:** Breaks the build with "Server Actions must be async functions". Mirror the `auth-helpers.ts` split.
- **App-logic single-default enforcement for `is_default`:** Race condition. Use the partial unique index.
- **Omitting `force-dynamic` on `/account/*` pages:** Next.js may cache the server component, serving stale or incorrect auth state to the user.
- **Trusting `user_id` from form data in server actions:** Strip it and derive from `supabase.auth.getUser()` — see `saveBookingWithUserId` pattern in `actions.ts`.
- **Using `full_name` column that doesn't exist yet on `customer_profiles`:** Migration 044 schema only has `account_type`, `company_name`, `created_at`, `updated_at`. Migration 047 adds `ico` + `vat_id` only. `full_name` and `phone` are NEW columns that migration 047 must also add alongside the corporate fields. **See Open Questions #1.**

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Auth state subscription | Custom polling / `getSession()` timer | `onAuthStateChange` from `@supabase/ssr` | Single source of truth, fires on sign-in/out, no polling needed |
| Single-default enforcement | Read-then-update in server action | Partial unique index in migration 048 | Race-condition-free, atomic |
| CSRF protection | Custom token | Already done in `middleware.ts` `checkCsrf()` | Server actions use same-origin cookies with SameSite=Lax — no additional CSRF token needed |
| Input sanitisation | Custom regex | Supabase parameterized queries + TypeScript type coercion in the action | RLS + parameterized = SQL injection covered |
| Open-redirect guard | Custom check | `safeReturnTo()` from `app/login/auth-helpers.ts` | Already implemented and tested |

**Key insight:** Every security-sensitive operation in this phase is already covered by existing infrastructure. Do not re-invent.

---

## Research Answers to Key Questions

### Q1: Server actions vs client mutations for profile/passenger writes

**Answer:** Use server actions in `'use server'` modules, matching the `app/login/actions.ts` pattern. [VERIFIED: from codebase] Reasons:
1. Ownership is derived server-side via `getUser()`, never trusted from the client (prevents IDOR — see `saveBookingWithUserId` for the established ownership-stripping pattern).
2. `useActionState` integration for loading/error state is already established in `app/login/page.tsx`.
3. Rate-limiting via `checkRateLimit` can be added consistently.

Where to add the new actions: extend `app/login/actions.ts` OR create a parallel `app/account/actions.ts` (either works; the latter keeps account-specific code organized separately from the auth-specific login actions). The planner should decide — both approaches are valid.

### Q2: Nav auth state without dynamic rendering

**Answer:** [VERIFIED: from codebase] `Nav.tsx` is already `'use client'`. Add `createBrowserClient` (memoized in `useMemo`) + `onAuthStateChange` in `useEffect`. Marketing pages stay static because `middleware.ts:isDynamicPath()` skips `updateSession()` for non-dynamic paths — the auth roundtrip never happens server-side for marketing page requests. The Nav hydrates client-side and subscribes to auth state changes post-load.

### Q3: `saved_passengers` RLS — exact SQL pattern + single-default enforcement

**Answer:** [VERIFIED: from migration 044] Use the exact RLS policy structure from migration 044 (confirmed above in migration 048 pattern). Key differences from `customer_profiles`: (a) DELETE policy IS needed (users must be able to delete their own passengers — unlike profile rows which only delete via CASCADE), (b) use a partial unique index for `is_default = true` enforcement.

### Q4: Migration sequencing / idempotency

**Answer:** [VERIFIED: from codebase] Next free numbers are **047** and **048**. All migrations use `IF NOT EXISTS` for `CREATE TABLE`, `CREATE INDEX`, `ADD COLUMN`, and `CREATE TRIGGER`. `CREATE OR REPLACE FUNCTION` for trigger functions (idempotent by definition). `DROP POLICY IF EXISTS` + `CREATE POLICY` for RLS (also idempotent — matching migration 044's pattern).

### Q5: `supabase db push` / type regeneration

**Answer:** [ASSUMED — no supabase CLI on PATH, project has no `supabase:types` script] The project uses `types/database.types.ts` which is manually regenerated. After migrations are pushed, types must be regenerated. Standard flow:
```bash
# Requires SUPABASE_PROJECT_REF from project config or .env.local
npx supabase gen types typescript --project-id <ref> > types/database.types.ts
```
OR via the Supabase dashboard → Settings → API → Download types. The planner should add a [BLOCKING] migration-push task that includes type regeneration before any TypeScript code that references the new columns is written.

### Q6: `/account/*` route structure + `force-dynamic`

**Answer:** [VERIFIED: from codebase] All new pages under `/account/*` automatically inherit the middleware gate (the `pathname.startsWith('/account')` check in `lib/supabase/middleware.ts`). New pages MUST declare `export const dynamic = 'force-dynamic'` — matching `app/account/page.tsx`. The new routes are:
- `app/account/trips/page.tsx` — new file
- `app/account/profile/page.tsx` — new file
- `app/account/page.tsx` — evolve existing placeholder

---

## Critical Finding: Missing Columns on `customer_profiles`

Migration 044 created `customer_profiles` with these columns: `id`, `user_id`, `account_type`, `company_name`, `created_at`, `updated_at`. [VERIFIED: from migration 044 SQL in codebase]

The profile editing form (ACCT-02) requires `full_name` and `phone` fields — **these columns do not exist yet**. Migration 047 (scoped to "corporate fields" in D-03) must also add `full_name TEXT` and `phone TEXT` to `customer_profiles`, or a separate migration (still numbered 047, with a more inclusive name like `customer_profiles_profile_fields`) must cover all four new columns.

**Recommended migration 047 scope:**
```sql
ALTER TABLE public.customer_profiles
  ADD COLUMN IF NOT EXISTS full_name TEXT,
  ADD COLUMN IF NOT EXISTS phone     TEXT,
  ADD COLUMN IF NOT EXISTS ico       TEXT,
  ADD COLUMN IF NOT EXISTS vat_id    TEXT;
```

This is all one migration because all four columns are added simultaneously in Phase 58. The planner must account for this.

---

## Common Pitfalls

### Pitfall 1: Marketing Pages Becoming Dynamic

**What goes wrong:** If any code in the Nav's server-render path calls `cookies()`, `headers()`, or any dynamic function, Next.js marks the entire page as dynamic. This breaks edge caching and adds ~100–500ms TTFB to every marketing page.

**Why it happens:** A developer adds server-side auth logic to Nav for a "cleaner" initial render, not realising Nav is used on both static and dynamic pages.

**How to avoid:** Nav reads auth state only via `createBrowserClient` + `onAuthStateChange` (D-09). Never call `cookies()` or `createClient()` (server) from within a client component. The pre-hydration flash of guest state is the explicit trade-off.

**Warning signs:** `next build` output shows marketing routes (e.g., `/`, `/services`) as `λ` (dynamic) instead of `○` (static) or `●` (SSG).

### Pitfall 2: `'use server'` Module Exporting Synchronous Functions

**What goes wrong:** Build fails with "Server Actions must be async functions" if any non-async function is exported from a `'use server'` module.

**Why it happens:** Moving a helper into `actions.ts` without checking it's async.

**How to avoid:** Any synchronous helper (validation, sanitisation, etc.) must live in a separate file without `'use server'`. This is the exact reason `auth-helpers.ts` exists as a separate module.

**Warning signs:** Next.js build error mentioning "Server Actions must be async functions".

### Pitfall 3: `is_default` Race Condition Without DB Enforcement

**What goes wrong:** Two concurrent "set as default" requests both read zero defaults, both set themselves — resulting in two rows with `is_default = true`.

**Why it happens:** Application-level read-then-update without atomicity.

**How to avoid:** Partial unique index (`WHERE is_default = true`) in migration 048 enforces the constraint atomically. If the app tries to set a second default, PostgreSQL returns a unique constraint violation (which the server action converts to a user-facing error).

**Warning signs:** Multiple passengers show the "Default" badge simultaneously.

### Pitfall 4: `full_name` / `phone` Missing from `customer_profiles`

**What goes wrong:** Profile form saves fail at the DB level because `full_name` and `phone` columns don't exist.

**Why it happens:** D-03 describes migration 047 as "corporate fields only" but ACCT-02 requires `full_name` + `phone` editing.

**How to avoid:** Migration 047 must add ALL four new columns: `full_name`, `phone`, `ico`, `vat_id`. Confirmed via migration 044 schema inspection.

### Pitfall 5: Stale TypeScript Types After Schema Push

**What goes wrong:** TypeScript type errors for `customer_profiles.ico`, `customer_profiles.vat_id`, `saved_passengers.*` because `database.types.ts` hasn't been regenerated.

**Why it happens:** Schema is pushed but type regeneration is skipped.

**How to avoid:** Make type regeneration an explicit [BLOCKING] task in the plan immediately after migrations are pushed. All TypeScript code referencing new columns must come after types are regenerated.

### Pitfall 6: Nav Dropdown z-index Conflict

**What goes wrong:** The dropdown panel renders beneath other page elements (images, cards with `position: relative`).

**Why it happens:** Nav is `position: fixed` with `z-50` (Tailwind) but the dropdown panel inherits the stacking context.

**How to avoid:** The dropdown panel must have `position: absolute` relative to the trigger's wrapper, and the Nav's `z-50` Tailwind class already puts it above page content. The UI-SPEC specifies `position: absolute right-0 top-full mt-2` — follow exactly.

---

## Code Examples

### Account Overview Page Pattern
```typescript
// Source: app/account/page.tsx (existing — confirmed in codebase)
// Pattern for new /account/trips and /account/profile pages
import { createClient } from '@/lib/supabase/server'
export const dynamic = 'force-dynamic'

export default async function AccountTripsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  // user is guaranteed non-null (middleware redirects unauthenticated to /login)
  // ...
}
```

### Profile Data Load Pattern
```typescript
// /account/profile/page.tsx — server component reads both tables
const supabase = await createClient()
const { data: { user } } = await supabase.auth.getUser()

const [{ data: profile }, { data: passengers }] = await Promise.all([
  supabase
    .from('customer_profiles')
    .select('full_name, phone, account_type, company_name, ico, vat_id')
    .eq('user_id', user!.id)
    .single(),
  supabase
    .from('saved_passengers')
    .select('*')
    .eq('user_id', user!.id)
    .order('created_at', { ascending: true }),
])
```

### customerSignOut Reuse in Dropdown
```typescript
// Source: app/login/actions.ts (confirmed in codebase)
// Already exported — the dropdown Sign out item uses it directly:
import { customerSignOut } from '@/app/login/actions'

// In Nav JSX (inside the dropdown):
<form action={customerSignOut}>
  <button type="submit" role="menuitem" ...>Sign out</button>
</form>
```

### Account Type Toggle (from `app/login/page.tsx`)
```typescript
// Source: app/login/page.tsx (confirmed in codebase)
// Profile form mirrors this exact pattern:
{(['personal', 'corporate'] as const).map(type => (
  <button
    key={type}
    type="button"
    onClick={() => setAccountType(type)}
    style={{
      flex: 1,
      padding: '10px 20px',
      border: `1px solid ${accountType === type ? 'var(--copper)' : 'var(--anthracite-light)'}`,
      borderRadius: '4px',
      background: 'transparent',
      color: accountType === type ? 'var(--offwhite)' : 'var(--warmgrey)',
      fontSize: '11px',
      letterSpacing: '0.18em',
      textTransform: 'uppercase',
      fontFamily: 'var(--font-montserrat)',
      cursor: 'pointer',
      minHeight: '44px',
      transition: 'border-color 0.15s ease, color 0.15s ease',
    }}
  >
    {type === 'personal' ? 'Personal' : 'Corporate'}
  </button>
))}
<input type="hidden" name="account_type" value={accountType} />
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `getSession()` for client auth state | `onAuthStateChange` | Supabase SSR ~v0.5 | `getSession()` returns stale cached value; `onAuthStateChange` always reflects current state |
| `useFormState` | `useActionState` | React 19 | `useFormState` deprecated; `useActionState` is the React 19 hook — already used in `app/login/page.tsx` |
| `createClientComponentClient` | `createBrowserClient` | `@supabase/ssr` v0.1+ | Old helper from deprecated `@supabase/auth-helpers-nextjs`; project uses the new `@supabase/ssr` package |

**Deprecated/outdated:**
- `@supabase/auth-helpers-nextjs`: Not used in this project (uses `@supabase/ssr` instead). Do not introduce.
- `useFormState`: Renamed to `useActionState` in React 19. Project already uses `useActionState` in `app/login/page.tsx` — follow this.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Type regeneration requires `npx supabase gen types typescript --project-id <ref>` | Q5: supabase db push | If the project uses a different regeneration method (e.g., a custom script not in package.json), the planner's [BLOCKING] task would specify the wrong command |
| A2 | `/account/profile` page will be a server component that passes data to a client component form (not a fully client-side page) | Profile Pattern | If implemented as a fully client-side page, it would need additional auth checks and the data load pattern would differ |

**All other claims in this research were verified from the codebase directly.**

---

## Open Questions

1. **`full_name` and `phone` columns on `customer_profiles`**
   - What we know: Migration 044 does NOT include these columns. ACCT-02 requires them. D-03 says migration 047 adds "corporate fields."
   - What's unclear: Is migration 047 intentionally extended to include `full_name`/`phone`, or is a separate migration 047a expected?
   - Recommendation: Migration 047 should add all four new columns in a single ALTER TABLE. This is confirmed by the research — the planner should reflect this in the migration task for 047.

2. **Where to put the new server actions**
   - What we know: `app/login/actions.ts` already has auth + booking actions. New profile/passenger actions could go there or in `app/account/actions.ts`.
   - What's unclear: No clear project convention for routing account actions vs login actions.
   - Recommendation: Create `app/account/actions.ts` as a new `'use server'` module for profile/passenger mutations. This keeps concerns separated without breaking the existing `actions.ts` structure.

3. **Profile form architecture: server component + client form, or pure client component**
   - What we know: `/account/profile` needs to pre-load `customer_profiles` and `saved_passengers` data, then allow interactive editing (add/edit/delete passengers). This is interactive-heavy.
   - What's unclear: Whether the page itself should be a server component passing initial data as props to a client form component, or a pure client component.
   - Recommendation: Server component page (for initial data load from DB) + client form component child (for interactive account type toggle, passenger editor open/close state). This is the SSR pattern consistent with the rest of the codebase.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `@supabase/ssr` | createBrowserClient, createServerClient | Yes | `^0.10.0` in package.json | — |
| Supabase project (remote) | migration push + type regen | Confirmed (Phase 57 ran migrations) | — | — |
| `supabase` CLI | `supabase db push`, type gen | Not on PATH | — | Use Supabase MCP tool or dashboard for migration push |
| `npx supabase` | type generation | [ASSUMED] available via npx | — | Manual type edit or dashboard download |
| `vitest` | test runs | Yes | `^4.1.1` | — |

**Note on migration push:** The project does not have a `supabase:migrate` script in `package.json`. Phase 57 used the Supabase MCP to push migrations. The plan should follow the same approach.

---

## Validation Architecture

Config `workflow.nyquist_validation` key is absent from `.planning/config.json` — treat as enabled.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.1 |
| Config file | `vitest.config.ts` (project root) |
| Quick run command | `npx vitest run tests/nav-auth.test.tsx tests/profile-actions.test.ts tests/passenger-actions.test.ts` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| NAV-01 | Guest state: Nav renders "Sign in" button linking to /login | unit | `npx vitest run tests/nav-auth.test.tsx` | ❌ Wave 0 |
| NAV-02 | Signed-in state: Nav renders account trigger with dropdown items | unit | `npx vitest run tests/nav-auth.test.tsx` | ❌ Wave 0 |
| NAV-02 | Sign out: `customerSignOut` server action called when Sign out pressed | unit | `npx vitest run tests/nav-auth.test.tsx` | ❌ Wave 0 |
| ACCT-01 | /account/trips renders empty state with "No trips yet" and Book CTA | unit | `npx vitest run tests/account-trips.test.tsx` | ❌ Wave 0 |
| ACCT-02 | `updateProfile` server action: updates customer_profiles, returns success | unit | `npx vitest run tests/profile-actions.test.ts` | ❌ Wave 0 |
| ACCT-02 | `updateProfile` server action: unauthenticated call returns error | unit | `npx vitest run tests/profile-actions.test.ts` | ❌ Wave 0 |
| ACCT-02 | `addPassenger` server action: inserts saved_passengers row | unit | `npx vitest run tests/passenger-actions.test.ts` | ❌ Wave 0 |
| ACCT-02 | `deletePassenger` server action: removes the correct row (own-row only) | unit | `npx vitest run tests/passenger-actions.test.ts` | ❌ Wave 0 |
| ACCT-03 | Corporate fields (ico, vat_id) appear in profile form when account_type=corporate | unit | `npx vitest run tests/profile-actions.test.ts` | ❌ Wave 0 |
| Migration 047 | customer_profiles gains full_name, phone, ico, vat_id columns | manual (Supabase MCP verify) | Supabase MCP `list_tables` / `execute_sql` | N/A |
| Migration 048 | saved_passengers table exists with correct RLS + partial unique index | manual (Supabase MCP verify) | Supabase MCP `list_tables` / `execute_sql` | N/A |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/nav-auth.test.tsx tests/profile-actions.test.ts tests/passenger-actions.test.ts tests/account-trips.test.tsx`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `tests/nav-auth.test.tsx` — NAV-01, NAV-02: auth state rendering + dropdown items + sign-out action
- [ ] `tests/profile-actions.test.ts` — ACCT-02, ACCT-03: updateProfile action (success, unauthed, corporate fields)
- [ ] `tests/passenger-actions.test.ts` — ACCT-02: addPassenger, updatePassenger, deletePassenger actions (success, ownership, RLS simulation)
- [ ] `tests/account-trips.test.tsx` — ACCT-01: empty state render

**Test pattern guidance (from project's `vi.hoisted` convention — see `tests/auth-customer.test.ts`, `tests/middleware-customer.test.ts`):**
- All mock factories use `vi.hoisted()` — this is the established project pattern.
- Server actions are tested by importing the action and mocking `@/lib/supabase/server` with a Supabase client mock.
- Component tests use `@testing-library/react` with `render` + `screen` + `fireEvent` / `userEvent`.

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | Yes (reads session) | `onAuthStateChange` client-side; `getUser()` server-side — already established |
| V3 Session Management | Yes | Supabase SSR cookie-based sessions; `SameSite=Lax`; middleware `updateSession()` |
| V4 Access Control | Yes | own-row RLS on `customer_profiles` and `saved_passengers`; ownership derived server-side |
| V5 Input Validation | Yes | TypeScript type coercion in server actions; Supabase parameterized queries prevent SQL injection |
| V6 Cryptography | No | No new crypto operations this phase |

### Known Threat Patterns for This Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| IDOR (Insecure Direct Object Reference) | Elevation of Privilege | Own-row RLS on both tables; server actions derive `user_id` from `getUser()`, strip any caller-supplied `user_id` |
| CSRF on profile mutation | Tampering | Server actions use same-origin cookies (`SameSite=Lax`); `middleware.ts checkCsrf()` already covers API routes; server actions don't go through CSRF-checked prefixes |
| Open redirect after sign-out | Tampering | `customerSignOut` hardcodes `redirect('/')` — no redirect param |
| Mass assignment on profile update | Tampering | Server action explicitly names fields to update; never spreads raw `formData` into DB update |
| XSS via passenger name display | Tampering | React's JSX escaping handles this; no `dangerouslySetInnerHTML` usage |

---

## Sources

### Primary (HIGH confidence)
- `supabase/migrations/044_customer_profiles.sql` — own-row RLS pattern (VERIFIED: codebase)
- `supabase/migrations/045_bookings_user_id.sql` — boundary confirmation, Phase 60 scope (VERIFIED: codebase)
- `supabase/migrations/046_customer_profiles_updated_at_trigger.sql` — trigger convention (VERIFIED: codebase)
- `app/login/actions.ts` — server action pattern, ownership derivation, `'use server'` rules (VERIFIED: codebase)
- `app/login/auth-helpers.ts` — synchronous helper split from `'use server'` module (VERIFIED: codebase)
- `components/auth/OAuthButtons.tsx` — `createBrowserClient` + `useMemo` pattern (VERIFIED: codebase)
- `app/account/reset-password/page.tsx` — `onAuthStateChange` subscription pattern (VERIFIED: codebase)
- `components/Nav.tsx` — existing structure to extend (VERIFIED: codebase)
- `app/account/page.tsx` — `force-dynamic` + `createClient().auth.getUser()` pattern (VERIFIED: codebase)
- `middleware.ts` + `lib/supabase/middleware.ts` — `isDynamicPath()` + `/account/*` gating (VERIFIED: codebase)
- `app/globals.css` — CSS classes: `.btn-primary`, `.btn-ghost`, `.btn-secondary`, `.copper-line`, `.skeleton-bar`, `.animate-step-enter`, `stepFadeUp`, `prefers-reduced-motion` (VERIFIED: codebase)
- `app/login/page.tsx` — `inputStyle`, `labelStyle`, account type toggle, `useActionState` usage (VERIFIED: codebase)
- `package.json` — confirmed installed packages + versions (VERIFIED: codebase)

### Secondary (MEDIUM confidence)
- `58-CONTEXT.md` — locked decisions D-01..D-09 (VERIFIED: planning artifact)
- `58-UI-SPEC.md` — visual contract for all surfaces (VERIFIED: planning artifact)
- `57-CONTEXT.md` — auth foundation boundary decisions (VERIFIED: planning artifact)

### Tertiary (LOW confidence — ASSUMED)
- `npx supabase gen types typescript` command syntax for type regeneration (A1 in Assumptions Log)

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages confirmed in package.json; no new packages needed
- Architecture: HIGH — all patterns verified from existing codebase files
- Migration SQL: HIGH — migration 044/046 patterns read directly from the repo
- Pitfalls: HIGH — derived from direct codebase inspection (missing columns, `'use server'` rule from auth-helpers.ts comment)
- Type regeneration flow: MEDIUM — supabase CLI not on PATH; assumed npx availability

**Research date:** 2026-06-12
**Valid until:** 2026-07-12 (stable stack — @supabase/ssr and Next.js App Router patterns are stable)
