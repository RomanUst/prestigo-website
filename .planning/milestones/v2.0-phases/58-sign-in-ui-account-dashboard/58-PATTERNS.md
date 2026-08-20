# Phase 58: Sign-in UI + Account Dashboard — Pattern Map

**Mapped:** 2026-06-12
**Files analyzed:** 12 (9 new + 3 modified)
**Analogs found:** 12 / 12

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `supabase/migrations/047_*.sql` | migration | CRUD (ALTER TABLE) | `supabase/migrations/044_customer_profiles.sql` | exact |
| `supabase/migrations/048_*.sql` | migration | CRUD (CREATE TABLE + RLS) | `supabase/migrations/044_customer_profiles.sql` + `046_*.sql` | exact |
| `components/Nav.tsx` (MODIFY) | component | event-driven (auth subscription) | `components/auth/OAuthButtons.tsx`, `app/account/reset-password/page.tsx` | exact (same createBrowserClient + useMemo pattern) |
| `app/account/page.tsx` (MODIFY) | page (server component) | request-response | `app/account/page.tsx` itself | self (evolve existing) |
| `app/account/trips/page.tsx` | page (server component) | request-response | `app/account/page.tsx` | exact |
| `app/account/profile/page.tsx` | page (server component + client form child) | CRUD (read + form submit) | `app/account/page.tsx` + `app/login/page.tsx` | role-match |
| `app/account/actions.ts` | server actions module | CRUD (update, insert, delete) | `app/login/actions.ts` | exact |
| `components/account/ProfileForm.tsx` (optional) | component (client) | request-response (form) | `app/login/page.tsx` | role-match |
| `tests/nav-auth.test.tsx` | test | — | `tests/auth-customer.test.ts` | exact |
| `tests/profile-actions.test.ts` | test | — | `tests/auth-customer.test.ts` | exact |
| `tests/passenger-actions.test.ts` | test | — | `tests/auth-customer.test.ts` | exact |
| `tests/account-trips.test.tsx` | test | — | `tests/auth-customer.test.ts` | role-match |

---

## Pattern Assignments

### `supabase/migrations/047_customer_profiles_profile_fields.sql` (migration, ALTER TABLE)

**Analog:** `supabase/migrations/044_customer_profiles.sql`

**Full pattern** (lines 1–15 of analog):
```sql
-- Migration header convention (copy + adapt):
-- Migration 047: customer_profiles profile fields
-- Phase 58 — Sign-in UI + Account Dashboard (ACCT-02, ACCT-03, D-03, D-06)
-- Adds full_name, phone (D-06) and ico, vat_id (D-03) to customer_profiles.
-- NOTE: full_name and phone are required by ACCT-02 and do not exist in 044.
-- All four columns added in one ALTER TABLE so 047 is a single idempotent unit.

ALTER TABLE public.customer_profiles
  ADD COLUMN IF NOT EXISTS full_name TEXT,
  ADD COLUMN IF NOT EXISTS phone     TEXT,
  ADD COLUMN IF NOT EXISTS ico       TEXT,
  ADD COLUMN IF NOT EXISTS vat_id    TEXT;
```

**No RLS changes needed** — the existing UPDATE policy from migration 044 already covers the new columns. No new policies required.

---

### `supabase/migrations/048_saved_passengers.sql` (migration, CREATE TABLE + RLS + trigger)

**Analog:** `supabase/migrations/044_customer_profiles.sql` (table + RLS) and `supabase/migrations/046_customer_profiles_updated_at_trigger.sql` (trigger)

**Table creation pattern** (from analog 044, lines 7–15):
```sql
CREATE TABLE IF NOT EXISTS public.customer_profiles (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  -- ...
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS customer_profiles_user_id_idx
  ON public.customer_profiles (user_id);
```

**Differences for saved_passengers:** `user_id` is NOT UNIQUE (one user can have many passengers); add `is_default BOOLEAN NOT NULL DEFAULT false`; add partial unique index for single-default enforcement; add DELETE policy (unlike customer_profiles).

**RLS policy pattern** (from analog 044, lines 22–42):
```sql
ALTER TABLE public.customer_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS customer_profiles_select_own ON public.customer_profiles;
CREATE POLICY customer_profiles_select_own
  ON public.customer_profiles FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS customer_profiles_insert_own ON public.customer_profiles;
CREATE POLICY customer_profiles_insert_own
  ON public.customer_profiles FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS customer_profiles_update_own ON public.customer_profiles;
CREATE POLICY customer_profiles_update_own
  ON public.customer_profiles FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);
-- (044 omits DELETE; saved_passengers MUST add a DELETE policy — users delete their own passengers)
```

**Trigger pattern** (from analog 046, lines 8–20):
```sql
CREATE OR REPLACE FUNCTION public.customer_profiles_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS customer_profiles_set_updated_at ON public.customer_profiles;
CREATE TRIGGER customer_profiles_set_updated_at
  BEFORE UPDATE ON public.customer_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.customer_profiles_set_updated_at();
```
Rename function and trigger to `saved_passengers_set_updated_at` throughout.

**Partial unique index for single-default** (no analog in codebase — use research pattern):
```sql
CREATE UNIQUE INDEX IF NOT EXISTS saved_passengers_one_default_per_user
  ON public.saved_passengers (user_id)
  WHERE is_default = true;
```

---

### `components/Nav.tsx` (MODIFY — add auth-aware state + dropdown)

**Analog:** `components/auth/OAuthButtons.tsx` (createBrowserClient + useMemo pattern) and `app/account/reset-password/page.tsx` (onAuthStateChange pattern)

**Existing Nav state/hook imports** (Nav.tsx lines 1–10 — extend these):
```typescript
'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
```
Add to imports: `useMemo, useRef` from `'react'`; `createBrowserClient` from `'@supabase/ssr'`; `type User` from `'@supabase/supabase-js'`; `customerSignOut` from `'@/app/login/actions'`.

**createBrowserClient + useMemo pattern** (from OAuthButtons.tsx lines 12–19):
```typescript
// Memoize so the browser client isn't re-instantiated on every render.
const supabase = useMemo(
  () =>
    createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    ),
  []
)
```

**onAuthStateChange subscription pattern** (from reset-password/page.tsx lines 35–55):
```typescript
useEffect(() => {
  let active = true
  const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
    if (!active) return
    setUser(session?.user ?? null)
  })
  return () => {
    active = false
    sub.subscription.unsubscribe()
  }
}, [supabase])
```
Simplified for Nav (no PASSWORD_RECOVERY check needed — just track user presence).

**Existing Nav mobile menu close-on-navigate pattern** (Nav.tsx lines 88–106 — replicate for dropdown):
```typescript
// Existing: onClick={() => setOpen(false)} on each Link
// Copy for dropdown: close dropdown on Link click via same inline handler
```

**NEW badge pattern in Nav** (Nav.tsx lines 51–52 — reuse for "Default" passenger badge):
```typescript
<span className="font-body font-light text-[9px] tracking-[0.14em] uppercase px-1.5 py-0.5 border border-copper/60 text-copper-light leading-none">NEW</span>
```
For "Default" badge: same classes, copy "Default".

**Existing "Book now" button slot** (Nav.tsx line 55 — insert "Sign in" / account trigger BEFORE this):
```typescript
<Link href="/book" className="btn-primary" style={{ padding: '10px 24px', fontSize: '10px' }}>
  Book now
</Link>
```
The "Sign in" `.btn-ghost` and the account dropdown trigger both slot in immediately before this element, in a `flex items-center gap-3` wrapper.

**Click-outside pattern** (no analog in codebase — use standard DOM listener):
```typescript
const triggerRef = useRef<HTMLDivElement>(null)

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

**Sign-out form action pattern** (from app/account/page.tsx lines 54–63):
```typescript
<form action={customerSignOut}>
  <button type="submit" className="btn-ghost">
    Sign out
  </button>
</form>
```

---

### `app/account/page.tsx` (MODIFY — evolve placeholder into overview)

**Analog:** `app/account/page.tsx` itself (lines 1–68 — the current placeholder is the base)

**Force-dynamic + server auth read** (lines 1–10):
```typescript
import { createClient } from '@/lib/supabase/server'
import { customerSignOut } from '@/app/login/actions'

export const dynamic = 'force-dynamic'

export default async function AccountPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  // user is guaranteed non-null — middleware redirects unauthenticated requests to /login
```

**Page heading + copper-line pattern** (from current account/page.tsx lines 29–40 — extend with `.copper-line` div):
```typescript
<h1
  style={{
    fontFamily: 'var(--font-cormorant)',
    fontSize: '28px',
    fontWeight: 400,
    color: 'var(--offwhite)',
    letterSpacing: '0.12em',
    lineHeight: 1.1,
    marginBottom: '8px',
  }}
>
  My Account
</h1>
<div className="copper-line" style={{ marginBottom: '24px' }} />
```

**Container pattern** (lines 20–27 — matches UI-SPEC `max-w-7xl mx-auto px-6 md:px-12 pt-24 pb-16`):
```typescript
<div
  style={{
    maxWidth: '1280px',
    margin: '0 auto',
    padding: '96px 24px 64px',  // pt-24 = 96px to clear fixed 64px nav
  }}
  className="md:px-12"
>
```

---

### `app/account/trips/page.tsx` (NEW — empty state shell)

**Analog:** `app/account/page.tsx` (exact structure to copy)

**Full pattern to copy then adapt** (analog lines 1–10 + container + heading):
```typescript
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export default async function AccountTripsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  // user guaranteed non-null — /account/* middleware gate enforces auth
  void user  // not used in Phase 58 (no DB query); suppress unused warning

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--anthracite)', fontFamily: 'var(--font-montserrat)' }}>
      <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '96px 24px 64px' }} className="md:px-12">
        {/* h1 "My Trips" + .copper-line + empty-state panel */}
      </div>
    </div>
  )
}
```

**Empty state panel (UI-SPEC spec — no codebase analog; build fresh):**
- Outer: `max-w-md mx-auto mt-16 text-center`
- Panel: `bg-anthracite-mid border border-anthracite-light rounded p-12`
- Heading: Cormorant Garamond 18px offwhite (see heading pattern above)
- CTA: `<Link href="/book" className="btn-primary" style={{ padding: '12px 32px' }}>Book a transfer</Link>`

---

### `app/account/profile/page.tsx` (NEW — profile editing)

**Analog:** `app/account/page.tsx` (server component shell) + `app/login/page.tsx` (form patterns)

**Server component data load** (pattern from research, using analog `app/account/page.tsx` structure):
```typescript
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export default async function AccountProfilePage() {
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

  return <ProfileForm email={user!.email!} profile={profile} passengers={passengers ?? []} />
}
```

The page renders a `<ProfileForm>` client component child that owns all interactive state. This keeps the page as a server component for the initial data load.

---

### `app/account/actions.ts` (NEW — profile + passenger server actions)

**Analog:** `app/login/actions.ts` (exact module structure to mirror)

**Module header + imports** (from analog lines 1–9):
```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
// Note: synchronous helpers MUST live in a separate non-'use server' file.
// A 'use server' module may only export async functions.
```

**Ownership-stripping pattern** (from analog lines 209–223 — `saveBookingWithUserId`):
```typescript
// NEVER trust user_id from form data. Always derive from getUser():
const supabase = await createClient()
const { data: { user } } = await supabase.auth.getUser()
if (!user) return { error: 'Not authenticated.' }
// Strip any caller-supplied user_id; ownership comes from the session only.
const { user_id: _ignored, ...rest } = bookingRow
void _ignored
```

**Action return type pattern** (from analog lines 37–40):
```typescript
export async function updateProfile(
  prevState: { error?: string; success?: boolean } | null,
  formData: FormData
): Promise<{ error?: string; success?: boolean }> {
```

**Error handling pattern** (from analog lines 56–62):
```typescript
if (error) {
  return { error: 'Something went wrong. Please try again.' }
}
return { success: true }
```

**revalidatePath after mutation** (from analog lines 186–190):
```typescript
try {
  revalidatePath('/account/profile')
} catch {
  // revalidatePath throws outside Next.js request scope (e.g. in tests)
}
```

**Full updateProfile structure:**
```typescript
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
  const company_name = (formData.get('company_name') as string) || null
  const ico = (formData.get('ico') as string) || null
  const vat_id = (formData.get('vat_id') as string) || null

  const { error } = await supabase
    .from('customer_profiles')
    .update({ full_name, phone, account_type, company_name, ico, vat_id })
    .eq('user_id', user.id)  // RLS enforces this anyway; explicit is correct

  if (error) return { error: 'Something went wrong. Please try again.' }
  try { revalidatePath('/account/profile') } catch { /* outside request scope in tests */ }
  return { success: true }
}
```

---

### `components/account/ProfileForm.tsx` (NEW — client form component)

**Analog:** `app/login/page.tsx` (shared style objects, account type toggle, useActionState, conditional corporate fields)

**Shared style objects** (from login/page.tsx lines 23–53 — copy verbatim):
```typescript
const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '12px 14px',
  backgroundColor: 'var(--anthracite)',
  border: '1px solid var(--anthracite-light)',
  borderRadius: '4px',
  color: 'var(--offwhite)',
  fontSize: '14px',
  fontFamily: 'var(--font-montserrat)',
  boxSizing: 'border-box',
  outline: 'none',
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '11px',
  color: 'var(--warmgrey)',
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
  marginBottom: '8px',
}

const fieldWrapStyle: React.CSSProperties = { marginBottom: '16px' }

const errorStyle: React.CSSProperties = {
  color: '#e74c3c',
  fontSize: '12px',
  marginTop: '4px',
}
```

**useActionState hook usage** (from login/page.tsx lines 69–75):
```typescript
const [state, action, isPending] = useActionState(updateProfile, null)
```

**Account type toggle** (from login/page.tsx lines 527–556 — copy exactly):
```typescript
<div style={{ ...fieldWrapStyle }}>
  <span style={labelStyle}>Account type</span>
  <div style={{ display: 'flex', gap: '8px' }}>
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
          textTransform: 'uppercase' as const,
          fontFamily: 'var(--font-montserrat)',
          cursor: 'pointer',
          minHeight: '44px',
          transition: 'border-color 0.15s ease, color 0.15s ease',
        }}
      >
        {type === 'personal' ? 'Personal' : 'Corporate'}
      </button>
    ))}
  </div>
  <input type="hidden" name="account_type" value={accountType} />
</div>
```

**Conditional corporate fields with animation** (from login/page.tsx lines 558–578 — extend pattern):
```typescript
{accountType === 'corporate' && (
  <div style={{ ...fieldWrapStyle, animation: 'stepFadeUp 0.3s ease forwards' }}>
    <label htmlFor="company-name" style={labelStyle}>Company name</label>
    <input id="company-name" name="company_name" type="text" autoComplete="organization" style={inputStyle} />
  </div>
)}
```
Add `ico` and `vat_id` fields in the same conditional block following the same pattern.

**Submit button pending state** (from login/page.tsx lines 215–230):
```typescript
<button
  type="submit"
  disabled={isPending}
  aria-busy={isPending}
  className="btn-primary"
  style={{
    width: '100%',
    opacity: isPending ? 0.7 : 1,
    cursor: isPending ? 'wait' : 'pointer',
    pointerEvents: isPending ? 'none' : 'auto',
  }}
>
  {isPending ? 'Saving…' : 'Save changes'}
</button>
```

**Error/success feedback** (from login/page.tsx error pattern lines 293–296):
```typescript
{state?.error && (
  <p role="alert" style={{ color: '#e74c3c', fontSize: '12px', marginTop: '8px' }}>
    {state.error}
  </p>
)}
{state?.success && (
  <p style={{ color: 'var(--copper-light)', fontSize: '12px', letterSpacing: '0.08em', marginTop: '8px' }}>
    Changes saved.
  </p>
)}
```

---

### `tests/nav-auth.test.tsx` (NEW — Wave 0 scaffold)

**Analog:** `tests/auth-customer.test.ts`

**vi.hoisted mock factory** (from analog lines 16–56 — copy structure, adapt mocks):
```typescript
const {
  mockOnAuthStateChange,
  mockGetUser,
  // ... etc
} = vi.hoisted(() => {
  const mockOnAuthStateChange = vi.fn()
  const mockGetUser = vi.fn()
  return { mockOnAuthStateChange, mockGetUser }
})
```

**Module mock declarations** (from analog lines 62–82):
```typescript
vi.mock('@supabase/ssr', () => ({
  createBrowserClient: vi.fn(() => ({
    auth: {
      onAuthStateChange: mockOnAuthStateChange,
      getUser: mockGetUser,
    },
  })),
}))

vi.mock('@/app/login/actions', () => ({
  customerSignOut: vi.fn(),
}))
```

**Component test with @testing-library/react** (no codebase analog for component render tests; use standard pattern):
```typescript
import { render, screen, fireEvent } from '@testing-library/react'
import Nav from '@/components/Nav'

it('renders Sign in button when no session', () => {
  mockOnAuthStateChange.mockImplementation((cb) => {
    cb('SIGNED_OUT', null)
    return { data: { subscription: { unsubscribe: vi.fn() } } }
  })
  render(<Nav />)
  expect(screen.getByText('Sign in')).toBeInTheDocument()
})
```

---

### `tests/profile-actions.test.ts` and `tests/passenger-actions.test.ts` (NEW — Wave 0 scaffolds)

**Analog:** `tests/auth-customer.test.ts` (exact same vi.hoisted + module mock + import pattern)

**Mock for customer_profiles table** (adapt from analog mockFrom + mockUpsert pattern, lines 38–42):
```typescript
const mockUpdate = vi.fn()
const mockDelete = vi.fn()
const mockSelect = vi.fn()
const mockEq = vi.fn()
const mockSingle = vi.fn()
const mockFrom = vi.fn(() => ({
  update: vi.fn(() => ({ eq: mockEq })),
  insert: vi.fn(),
  delete: vi.fn(() => ({ eq: mockEq })),
  select: vi.fn(() => ({ eq: vi.fn(() => ({ single: mockSingle, order: vi.fn() })) })),
}))
```

**Ownership security test pattern** (from analog lines 316–331):
```typescript
it('SECURITY: a caller-supplied user_id cannot override the session user', async () => {
  mockGetUser.mockResolvedValue({ data: { user: { id: 'session-user-uuid' } } })
  // attempt to inject a different user_id via formData — action must strip it
  const formData = new FormData()
  formData.set('user_id', 'victim-uuid')
  formData.set('full_name', 'Attacker')
  await updateProfile(null, formData)
  // Verify the update was called with eq('user_id', 'session-user-uuid'), not victim
})
```

**Unauthenticated guard pattern** (from analog lines 333–342):
```typescript
it('returns { error: "Not authenticated." } when no session', async () => {
  mockGetUser.mockResolvedValue({ data: { user: null } })
  const formData = new FormData()
  const result = await updateProfile(null, formData)
  expect(result).toEqual({ error: 'Not authenticated.' })
})
```

---

### `tests/account-trips.test.tsx` (NEW — Wave 0 scaffold)

**Analog:** `tests/auth-customer.test.ts` (module mock structure) — but this tests a server component render, which has no codebase precedent.

**Pattern (use research guidance — render static output):**
- Mock `@/lib/supabase/server` createClient to return a user
- Import and render `AccountTripsPage` as an async server component
- Assert "No trips yet" text and `href="/book"` link are present
- No `mockFrom` needed (no DB query in Phase 58)

---

## Shared Patterns

### `force-dynamic` on all `/account/*` pages
**Source:** `app/account/page.tsx` line 4
**Apply to:** `app/account/page.tsx` (already has it), `app/account/trips/page.tsx` (new), `app/account/profile/page.tsx` (new)
```typescript
export const dynamic = 'force-dynamic'
```

### Server-side auth read (JWT-validated)
**Source:** `app/account/page.tsx` lines 6–10
**Apply to:** All three `/account/*` server component pages
```typescript
const supabase = await createClient()
const { data: { user } } = await supabase.auth.getUser()
// user guaranteed non-null inside /account/* (middleware gate)
```

### Ownership derivation in server actions
**Source:** `app/login/actions.ts` lines 209–222 (`saveBookingWithUserId`)
**Apply to:** All actions in `app/account/actions.ts`
```typescript
const { data: { user } } = await supabase.auth.getUser()
if (!user) return { error: 'Not authenticated.' }
// Never trust user_id from formData — derive from session only
```

### `'use server'` module synchronous helper split
**Source:** `app/login/actions.ts` lines 10–14 (comment) + `app/login/auth-helpers.ts` existence
**Apply to:** `app/account/actions.ts`
```
A file with 'use server' may only export async functions.
Synchronous helpers MUST live in a separate non-'use server' file.
```

### CSS custom class palette (btn-primary, btn-ghost, btn-secondary, copper-line)
**Source:** `app/globals.css` (confirmed used throughout login/page.tsx and Nav.tsx)
**Apply to:** All new UI components
- `.btn-primary` — copper-bordered CTA button (Book now, Save changes, Book a transfer)
- `.btn-ghost` — transparent bordered button (Sign in, Cancel)
- `.btn-secondary` — like btn-ghost but copper on hover (Add passenger)
- `.copper-line` — decorative horizontal accent below page headings
- `.label` — 11px uppercase Montserrat warmgrey label
- `.body-text` — 14px weight-300 Montserrat warmgrey
- `.animate-step-enter` / `stepFadeUp` — entrance animation for conditional blocks

### Error display (role="alert")
**Source:** `app/login/page.tsx` lines 293–296
**Apply to:** All form error states in account pages
```typescript
{state?.error && (
  <p role="alert" style={{ color: '#e74c3c', fontSize: '12px', marginTop: '4px' }}>
    {state.error}
  </p>
)}
```

### vi.hoisted test mock pattern
**Source:** `tests/auth-customer.test.ts` lines 16–56
**Apply to:** All four new Wave-0 test files
```typescript
const { mockX, mockY } = vi.hoisted(() => {
  const mockX = vi.fn()
  const mockY = vi.fn()
  return { mockX, mockY }
})
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({ auth: { getUser: mockX }, from: mockY }),
}))
```

---

## No Analog Found

All files have analogs. No entries.

---

## Metadata

**Analog search scope:** `/Users/romanustyugov/Desktop/Prestigo` — components/, app/, supabase/migrations/, tests/
**Files read directly:** Nav.tsx, app/login/actions.ts, app/login/page.tsx, components/auth/OAuthButtons.tsx, app/account/page.tsx, app/account/reset-password/page.tsx, supabase/migrations/044_customer_profiles.sql, supabase/migrations/046_customer_profiles_updated_at_trigger.sql, tests/auth-customer.test.ts
**Pattern extraction date:** 2026-06-12
