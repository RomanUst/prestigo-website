# Phase 57: Customer Auth Foundation — Research

**Researched:** 2026-06-11
**Domain:** Supabase Auth (GoTrue) + Next.js App Router SSR auth patterns
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Magic-link is the primary email method; password is secondary (both supported). Sign-in form offers magic-link by default with a password option.
- **D-02:** Password is supported, so the phase must include a password reset flow and rely on Supabase email confirmation for password signups.
- **D-03:** Account type is chosen at email registration. Default is `personal`.
- **D-04:** OAuth sign-up (Google/Apple) does NOT prompt for account type — new OAuth customers default to `personal`; they can change later.
- **D-05:** `customer_profiles` schema is minimal: `account_type` (personal | corporate) + `company_name` (nullable). IČO/VAT, billing address deferred.
- **D-06:** A `customer_profiles` row is created for every customer on first sign-in/registration (email and OAuth), keyed by FK to `auth.users(id)`. RLS isolates each user to their own row (read + write).
- **D-07:** Customer login lives at `/login`; protected zone at `/account/*`. Admin keeps `/admin/login` + `/admin` unchanged.
- **D-08:** After sign-in, redirect to `return-to` param if present; otherwise land on `/account`.
- **D-09:** OAuth callback handled at `/auth/callback` — exchanges code, ensures `customer_profiles` row, then honors `return-to`/`/account` rule.
- **D-10:** Admin vs customer distinguished solely by `app_metadata.is_admin`. Customers never have this flag.
- **D-11:** Middleware: if authenticated user WITHOUT `app_metadata.is_admin` requests `/admin/*` (excluding `/admin/login`), redirect to `/` (home), not a 403.
- **D-12:** Middleware adds customer-route gating: unauthenticated requests to `/account/*` redirect to `/login` (with `return-to`). Must not alter `/admin` branches.
- **D-13:** Sign-out available from account menu and `/account`. Fully clears Supabase session; protected `/account/*` routes redirect to `/login` afterward.
- **D-14:** Full account-aware header nav is Phase 58. Phase 57 may add a minimal placeholder in `components/Nav.tsx` only if needed for sign-out testing; authoritative sign-out surface is `/account`.

### Claude's Discretion

- Exact form layout/copy for `/login` and registration (UI-SPEC will refine).
- Browser Supabase client setup (`createBrowserClient` from `@supabase/ssr`) and whether sign-in uses server actions (matching admin) or client calls.
- Naming of the OAuth callback route and the `return-to` query param.
- Whether `account_type` is a Postgres enum or a checked text column.
- Email template wording for magic-link / password reset.

### Deferred Ideas (OUT OF SCOPE)

- Corporate billing fields (IČO/VAT, billing address, billing contacts).
- Post-OAuth account-type onboarding interstitial.
- Full account-aware header nav with account dropdown — Phase 58.
- Linking customers to "my bookings" view / auto-filling booking forms from profile.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AUTH-01 | Customer can sign in by email (magic-link or password) | `signInWithOtp` + `signInWithPassword` patterns confirmed; rate-limit for `/login` follows admin pattern |
| AUTH-02 | Customer can sign in with Google OAuth | `signInWithOAuth({provider:'google'})` + `/auth/callback` code exchange confirmed |
| AUTH-03 | Customer can sign in with Apple OAuth | Same OAuth flow; requires Apple Services ID + secret key rotation every 6 months |
| AUTH-04 | Customer can register and choose account type (personal/corporate) | `signUp` with `emailRedirectTo`; account type stored via `customer_profiles` upsert in callback |
| AUTH-05 | Customer session and admin session coexist; middleware gates customer routes without touching `/admin` | Middleware update: add 2 new branches before existing `/admin` branches; `app_metadata.is_admin` remains the discriminator |
| AUTH-06 | `customer_profiles` table with `account_type` FK to `auth.users`; RLS isolates each user | Migration 044; standard `auth.uid()` RLS pattern confirmed; upsert on callback for OAuth |
| AUTH-07 | Customer can sign out from any account-aware surface | `signOut()` server action + redirect; same shape as `app/admin/login/actions.ts:signOut` |
| ACCT-04 | `bookings` table gets nullable `user_id` FK to `auth.users`; anonymous bookings stay valid | Migration 045 (or 044b): `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id)` — no NOT NULL, no default |
</phase_requirements>

---

## Summary

Phase 57 adds customer authentication on top of the existing Supabase Auth (GoTrue) infrastructure — the same stack already running for admin. No new auth libraries are needed. The implementation follows three well-established patterns already present in this codebase:

1. **Server actions for auth mutations** — mirror `app/admin/login/actions.ts` for sign-in, sign-out, magic-link dispatch, password signup, and password reset.
2. **`createClient()` / `updateSession()` for SSR session handling** — already wired; customer server-side code reuses `lib/supabase/server.ts:createClient()` unchanged.
3. **`createBrowserClient` for OAuth initiation** — the one new client variant, needed only for `signInWithOAuth` calls in the client component (Google/Apple buttons trigger a browser redirect, not a form POST).

The OAuth callback route (`app/auth/callback/route.ts`) is the most critical new piece: it exchanges the PKCE code for a session, upserts the `customer_profiles` row, and redirects to `return-to` or `/account`.

The biggest operational risk is **Apple Sign In setup**: it requires a Services ID, a `.p8` key, and the secret must be regenerated every 6 months. Google is straightforward. Both require Supabase dashboard configuration and no code-level difference beyond `provider: 'google'` vs `provider: 'apple'`.

**Primary recommendation:** Implement customer sign-in as server actions (matching admin) for email flows; use a `'use client'` component for the OAuth button clicks that call `createBrowserClient().auth.signInWithOAuth(...)`. Keep all mutations behind the existing rate-limiter pattern.

---

## Standard Stack

### Core (all already installed — no new packages)

| Library | Installed Version | Latest | Purpose |
|---------|-------------------|--------|---------|
| `@supabase/ssr` | 0.10.2 | 0.12.0 [VERIFIED: npm registry] | SSR cookie-based session via `createServerClient` / `createBrowserClient` |
| `@supabase/supabase-js` | ^2.101.0 | 2.108.1 [VERIFIED: npm registry] | Core GoTrue auth methods: `signInWithOtp`, `signInWithPassword`, `signInWithOAuth`, `signUp`, `signOut`, `exchangeCodeForSession`, `resetPasswordForEmail` |
| `next` | (project version) | — | App Router route handlers, server actions, middleware |
| `vitest` | ^4.1.1 | — | Test runner (already configured) |
| `@testing-library/react` | ^16.3.2 | — | Component tests |

> **Version gap note:** `@supabase/ssr` 0.10.2 is installed; latest is 0.12.0. The API used in this phase (`createBrowserClient`, `createServerClient`) has been stable across 0.10.x–0.12.x. [ASSUMED: no breaking changes in 0.10→0.12 for these methods — verify changelog if upgrading.] No upgrade is required to implement this phase.

### No new dependencies required

All auth functionality needed for Phase 57 is covered by the packages already in `package.json`. Do NOT add `next-auth`, `lucia`, or any other auth library.

---

## Architecture Patterns

### Recommended Project Structure (new files only)

```
app/
├── login/
│   └── page.tsx              # Customer sign-in / sign-up UI ('use client')
├── account/
│   └── page.tsx              # Minimal account landing (server component, gated)
├── auth/
│   └── callback/
│       └── route.ts          # OAuth + email confirm code exchange (GET handler)
lib/
└── supabase/
    └── server.ts             # UNCHANGED — createClient() + getAdminUser() reused as-is
    └── middleware.ts         # MODIFIED — add /account gating + non-admin /admin redirect
middleware.ts                  # MODIFIED — add /login, /account, /auth to isDynamicPath
```

### Pattern 1: OAuth Code Exchange at `/auth/callback`

This is the PKCE flow required by `@supabase/ssr`. The route handler calls `exchangeCodeForSession`, then upserts the `customer_profiles` row, then redirects.

```typescript
// Source: Supabase SSR docs [CITED: supabase.com/docs/guides/auth/server-side-rendering]
// app/auth/callback/route.ts
import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const returnTo = searchParams.get('return-to') ?? '/account'

  if (code) {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error && data.user) {
      // Upsert customer_profiles row (D-06, D-04)
      await supabase.from('customer_profiles').upsert(
        { user_id: data.user.id, account_type: 'personal' },
        { onConflict: 'user_id', ignoreDuplicates: true }
      )
      return NextResponse.redirect(`${origin}${returnTo}`)
    }
  }
  // Exchange failed — redirect to login with error param
  return NextResponse.redirect(`${origin}/login?error=auth_callback_error`)
}
```

**Critical:** The `return-to` param must be forwarded through the OAuth `state` or appended to `redirectTo`. The Supabase-recommended pattern is to encode it in the `redirectTo` URL as a query parameter on the callback route itself (e.g., `redirectTo: \`${origin}/auth/callback?return-to=${encodeURIComponent(returnTo)}\``).

### Pattern 2: signInWithOAuth — Client Component

`signInWithOAuth` triggers a browser redirect; it cannot be a server action. The OAuth buttons live in a `'use client'` component.

```typescript
// Source: Supabase Auth docs [CITED: supabase.com/docs/guides/auth/social-login/auth-google]
// components/auth/OAuthButtons.tsx ('use client')
import { createBrowserClient } from '@supabase/ssr'

export function OAuthButtons({ returnTo }: { returnTo?: string }) {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  async function signInWithGoogle() {
    const callbackUrl = new URL('/auth/callback', window.location.origin)
    if (returnTo) callbackUrl.searchParams.set('return-to', returnTo)
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: callbackUrl.toString() }
    })
  }

  async function signInWithApple() {
    const callbackUrl = new URL('/auth/callback', window.location.origin)
    if (returnTo) callbackUrl.searchParams.set('return-to', returnTo)
    await supabase.auth.signInWithOAuth({
      provider: 'apple',
      options: { redirectTo: callbackUrl.toString() }
    })
  }
  // ... render buttons
}
```

### Pattern 3: Magic-Link Server Action

```typescript
// Source: Supabase Auth docs [CITED: supabase.com/docs/guides/auth/server-side-rendering]
// app/login/actions.ts ('use server')
export async function sendMagicLink(
  prevState: { error?: string; success?: boolean } | null,
  formData: FormData
) {
  const email = formData.get('email') as string
  // Rate-limit: add '/login' to LIMITS in lib/rate-limit.ts (5/min)
  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`
    }
  })
  if (error) return { error: 'Something went wrong. Please try again.' }
  return { success: true }
}
```

### Pattern 4: Password Sign-Up Server Action

```typescript
// Source: Supabase Auth docs [CITED: supabase.com/docs/guides/auth/passwords]
export async function signUpWithPassword(
  prevState: { error?: string } | null,
  formData: FormData
) {
  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const accountType = (formData.get('account_type') as string) ?? 'personal'
  const companyName = formData.get('company_name') as string | null

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signUp({
    email, password,
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`
    }
  })
  if (error) return { error: 'Something went wrong. Please try again.' }
  // If email confirmation is enabled (default on hosted Supabase), user is
  // not yet active — show "check your email" state. No profile upsert here;
  // it happens at /auth/callback after email confirmation.
  // If confirmation is disabled (dev), upsert profile immediately:
  if (data.user) {
    await supabase.from('customer_profiles').upsert(
      { user_id: data.user.id, account_type: accountType, company_name: companyName },
      { onConflict: 'user_id' }
    )
  }
  return { success: true }
}
```

> **Note on email confirmation vs. immediate session:** Hosted Supabase projects have email confirmation enabled by default. After `signUp`, the user does NOT have an active session yet — they must click the link. The confirmation link redirects through `/auth/callback` (the `token_hash` + `type=signup` path). The `customer_profiles` upsert therefore must also happen in `/auth/callback` when `type=signup`. [VERIFIED: Supabase docs]

### Pattern 5: Email Confirm Token at `/auth/callback`

The callback route must handle BOTH the OAuth `code` param AND the email confirmation `token_hash` + `type` params:

```typescript
// Source: Supabase Auth docs [CITED: supabase.com/docs/guides/auth/passwords]
import { type EmailOtpType } from '@supabase/supabase-js'

// In /auth/callback/route.ts GET handler:
const token_hash = searchParams.get('token_hash')
const type = searchParams.get('type') as EmailOtpType | null

if (token_hash && type) {
  const { data, error } = await supabase.auth.verifyOtp({ type, token_hash })
  if (!error && data.user) {
    // Upsert customer_profiles — needed for email signup confirm
    await supabase.from('customer_profiles').upsert(
      { user_id: data.user.id, account_type: 'personal' },
      { onConflict: 'user_id', ignoreDuplicates: true }
    )
    return NextResponse.redirect(`${origin}${returnTo}`)
  }
}
```

### Pattern 6: Middleware Update (additive, non-breaking)

The new branches are inserted BEFORE the existing `/admin` check. Order matters.

```typescript
// lib/supabase/middleware.ts — modified updateSession()
// IMPORTANT: getUser() is already called above this block.

// NEW: Non-admin user trying to access /admin/* → redirect to home
if (
  pathname.startsWith('/admin') &&
  pathname !== '/admin/login' &&
  user &&
  !user.app_metadata?.is_admin
) {
  const url = request.nextUrl.clone()
  url.pathname = '/'
  return NextResponse.redirect(url)
}

// EXISTING: Unauthenticated → redirect to admin login (unchanged)
if (pathname.startsWith('/admin') && pathname !== '/admin/login' && !user) {
  const url = request.nextUrl.clone()
  url.pathname = '/admin/login'
  return NextResponse.redirect(url)
}

// EXISTING: Authenticated on admin login page → redirect to /admin (unchanged)
if (pathname === '/admin/login' && user) {
  const url = request.nextUrl.clone()
  url.pathname = '/admin'
  return NextResponse.redirect(url)
}

// NEW: Unauthenticated customer trying to access /account/*
if (pathname.startsWith('/account') && !user) {
  const url = request.nextUrl.clone()
  const returnTo = encodeURIComponent(pathname + request.nextUrl.search)
  url.pathname = '/login'
  url.search = `?return-to=${returnTo}`
  return NextResponse.redirect(url)
}
```

### Pattern 7: Migration 044 — customer_profiles

```sql
-- supabase/migrations/044_customer_profiles.sql
-- Phase 57 — Customer Auth Foundation (AUTH-06)

CREATE TYPE IF NOT EXISTS public.account_type_enum AS ENUM ('personal', 'corporate');
-- NOTE: If enum type conflicts risk from future changes, use TEXT + CHECK instead
-- Decision per CONTEXT.md Claude's Discretion: TEXT + CHECK is equally valid

CREATE TABLE IF NOT EXISTS public.customer_profiles (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  account_type TEXT        NOT NULL DEFAULT 'personal'
                           CHECK (account_type IN ('personal', 'corporate')),
  company_name TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS customer_profiles_user_id_idx
  ON public.customer_profiles (user_id);

ALTER TABLE public.customer_profiles ENABLE ROW LEVEL SECURITY;

-- Users can only read their own row
DROP POLICY IF EXISTS customer_profiles_select_own ON public.customer_profiles;
CREATE POLICY customer_profiles_select_own
  ON public.customer_profiles FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = user_id);

-- Users can insert their own row
DROP POLICY IF EXISTS customer_profiles_insert_own ON public.customer_profiles;
CREATE POLICY customer_profiles_insert_own
  ON public.customer_profiles FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

-- Users can update their own row
DROP POLICY IF EXISTS customer_profiles_update_own ON public.customer_profiles;
CREATE POLICY customer_profiles_update_own
  ON public.customer_profiles FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- Service-role has full access (no RLS bypass needed — service_role bypasses RLS by default)
```

> **TEXT + CHECK vs. enum:** TEXT + CHECK is chosen over a Postgres ENUM because enums are hard to ALTER (require multiple migration steps). This matches the existing pattern in this codebase (e.g., `booking_source`, `status` use CHECK constraints).

### Pattern 8: Migration 045 — bookings.user_id FK

```sql
-- supabase/migrations/045_bookings_user_id.sql
-- Phase 57 — Customer Auth Foundation (ACCT-04)
-- Adds nullable user_id FK to bookings table.
-- CRITICAL: NO NOT NULL, NO DEFAULT — existing anonymous bookings stay valid.

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS user_id UUID
  REFERENCES auth.users(id)
  ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS bookings_user_id_idx
  ON public.bookings (user_id)
  WHERE user_id IS NOT NULL;
```

> **bookings RLS:** The `bookings` table is currently accessed via the service-role client in all write paths (Stripe webhook, admin routes). Anonymous inserts go through the service-role client in `saveBooking()`. This migration DOES NOT add customer-facing RLS to `bookings` — that is Phase 60 scope (auth-in-checkout). The nullable column is inert from an RLS perspective for now.

### Pattern 9: Password Reset Server Action

```typescript
// app/login/actions.ts
export async function sendPasswordReset(
  prevState: { error?: string; success?: boolean } | null,
  formData: FormData
) {
  const email = formData.get('email') as string
  const supabase = await createClient()
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback?type=recovery`
  })
  // Always return success to prevent email enumeration
  return { success: true }
}
```

The `/auth/callback` handles `type=recovery` via `verifyOtp`, then redirects to `/account/reset-password` (a page with an update-password form). [ASSUMED: A minimal `/account/reset-password` sub-page is needed in this phase. Confirm whether to include or gate behind Phase 58.]

### Anti-Patterns to Avoid

- **Using `getSession()` instead of `getUser()`:** `getSession()` reads from the cookie without JWT validation — it can be forged. All customer gating MUST use `getUser()`. [VERIFIED: codebase pattern in `lib/supabase/middleware.ts` line 33]
- **Calling `createBrowserClient` in a Server Component:** It won't have access to cookies. Use `createClient()` from `lib/supabase/server.ts` on the server side.
- **Not adding `/login`, `/account`, `/auth` to `isDynamicPath` in `middleware.ts`:** Without this, these routes bypass `updateSession()` entirely — the session cookie is never refreshed and auth checks fail. [VERIFIED: codebase, `middleware.ts` lines 91-97]
- **Adding the non-admin `/admin/*` redirect AFTER the existing unauthenticated check:** If the unauthenticated check fires first for a logged-in non-admin, it passes through (user exists). The non-admin check must come first.
- **Forgetting `export const dynamic = 'force-dynamic'` on `/account` pages:** Next.js may cache the page between requests, leaking session data. [CITED: supabase.com/docs/guides/auth/server-side-rendering]

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| PKCE code exchange | Custom crypto / manual token exchange | `supabase.auth.exchangeCodeForSession(code)` | GoTrue handles PKCE verifier/challenge storage automatically in the SSR client |
| Session cookie refresh | Manual cookie writes | `updateSession()` in middleware (already exists) | Handles rotating tokens, SameSite, Secure flags correctly |
| Email validation | Custom regex | Supabase validates on `signUp`/`signInWithOtp` | Edge cases in email RFCs are numerous |
| Password hashing | Any DIY approach | Supabase/GoTrue bcrypt (built-in) | Never touch this |
| OAuth state parameter | Custom CSRF token for OAuth | Supabase PKCE flow handles state automatically | GoTrue generates and validates `state` in the browser client |
| Rate limiting | New rate limiter | `checkRateLimit('/login', ip)` from `lib/rate-limit.ts` | Add `/login: 5` entry to LIMITS — same Upstash pattern |

---

## Common Pitfalls

### Pitfall 1: `/login` and `/auth` not in `isDynamicPath`

**What goes wrong:** Middleware skips `updateSession()` for `/login`, `/auth/callback`, and `/account`. Session cookie is never refreshed; `getUser()` on those routes returns null even for valid sessions; the OAuth callback route gets a stale Supabase client.

**Why it happens:** `isDynamicPath` is a whitelist. New routes must be explicitly added.

**How to avoid:** Add `/login`, `/account`, and `/auth` to `isDynamicPath` in `middleware.ts`.

**Warning signs:** OAuth callback redirects to error even with a valid `code` param.

### Pitfall 2: CSP blocks `accounts.google.com` OAuth redirect

**What goes wrong:** Browser CSP policy blocks the navigation to Google/Apple auth pages. Or the return navigation from Google is blocked.

**Why it happens:** The current `buildCsp()` function does not whitelist `accounts.google.com` in `connect-src` or `form-action`. OAuth uses browser navigation (not XHR), but `form-action` CSP may apply on the POST-back from Apple.

**How to avoid:** Add `https://accounts.google.com` to `connect-src` and `form-action 'self' https://accounts.google.com https://appleid.apple.com` to the CSP. The customer login page uses `buildCspStatic()` by default (it's not in `isDynamicPath`), but once we add it as a dynamic path (see Pitfall 1), it will get `buildCsp(nonce)`. Check CSP coverage for OAuth domains. [ASSUMED: current CSP does not cover OAuth domains — verify in buildCsp()]

**Warning signs:** Browser console shows CSP violations on Google/Apple redirect. OAuth buttons appear to do nothing.

### Pitfall 3: Apple Sign In JWT secret expiry (6-month rotation)

**What goes wrong:** Apple Sign In stops working silently 6 months after the secret was generated.

**Why it happens:** Apple requires the client secret (derived from a `.p8` key) to be regenerated every 180 days.

**How to avoid:** Document the rotation date in Supabase dashboard notes. Set a calendar reminder. The `.p8` key itself does not expire — only the derived secret. [CITED: supabase.com/docs/guides/auth/social-login/auth-apple]

**Warning signs:** Apple OAuth returns `invalid_client` errors.

### Pitfall 4: `customer_profiles` row missing for email-confirmed users

**What goes wrong:** A user signs up with email+password, confirms their email, is redirected to `/account`, but has no `customer_profiles` row — subsequent profile reads return null.

**Why it happens:** The `customer_profiles` upsert in `/auth/callback` only runs for OAuth flows if not coded to also handle `token_hash` + `type=signup`. The upsert must handle ALL paths through the callback route (OAuth code, email confirmation, magic-link).

**How to avoid:** In `/auth/callback`, after ANY successful auth action (`exchangeCodeForSession` OR `verifyOtp`), always upsert the `customer_profiles` row with `ignoreDuplicates: true`.

**Warning signs:** Users can sign in but accessing `/account` throws a null-dereference error.

### Pitfall 5: Return-to redirect open redirect vulnerability

**What goes wrong:** An attacker sends a user to `/login?return-to=https://evil.com`; after sign-in, the user is redirected to the attacker's site.

**Why it happens:** Naively using `searchParams.get('return-to')` as the redirect target.

**How to avoid:** Validate that `return-to` is a relative path (starts with `/` and does not start with `//`). Reject any absolute URL or protocol-relative URL. `const safe = returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/account'`

**Warning signs:** Security audit flags open redirect on `/login`.

### Pitfall 6: `useActionState` requires React 19 / Next.js 15

**What goes wrong:** Using `useActionState` (not `useFormState`) fails in older React versions.

**Why it happens:** `useActionState` was added in React 19. The project runs React 19.2.3 [VERIFIED: package.json], so this is fine. But the import must be from `'react'`, not from `'react-dom'`.

**How to avoid:** Use `import { useActionState } from 'react'` — matching the admin login page pattern [VERIFIED: `app/admin/login/page.tsx` line 3].

### Pitfall 7: `bookings` anonymous inserts broken by accidental NOT NULL on `user_id`

**What goes wrong:** Existing Stripe webhook and quote submission routes break because `user_id` is required.

**Why it happens:** Migration adds `NOT NULL` or a default to `user_id`.

**How to avoid:** Migration must use `ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL` — no `NOT NULL`, no `DEFAULT`. The `saveBooking()` function already builds the row without `user_id` — it will simply not include the column and Postgres will default to NULL. [VERIFIED: `lib/supabase.ts:buildBookingRow()` — no `user_id` field in the row builder]

---

## Code Examples

### Verified Pattern: `useActionState` for customer sign-in form

```typescript
// Source: app/admin/login/page.tsx [VERIFIED: codebase]
// Mirror this exactly for /login/page.tsx
'use client'
import { useActionState } from 'react'
import { sendMagicLink } from './actions'

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(sendMagicLink, null)
  // render form...
}
```

### Verified Pattern: signOut server action

```typescript
// Source: app/admin/login/actions.ts [VERIFIED: codebase]
// Mirror for customer sign-out
export async function customerSignOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  redirect('/')
}
```

### Verified Pattern: RLS auth.uid() performance-safe form

```sql
-- Source: Supabase RLS docs [CITED: supabase.com/docs/guides/auth/row-level-security]
-- Wrap auth.uid() in SELECT for per-statement caching (not per-row)
USING ((select auth.uid()) = user_id)
```

### Verified Pattern: Bookings ALTER TABLE (nullably add FK column)

```sql
-- Source: supabase/migrations/041_booking_driver_id.sql [VERIFIED: codebase]
-- Same pattern: add nullable FK column to bookings without breaking existing rows
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS driver_id uuid
  REFERENCES public.drivers(id)
  ON DELETE SET NULL;
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `useFormState` (react-dom) | `useActionState` (react) | React 19 / Next.js 15 | Must import from `'react'`, not `'react-dom'` |
| `getSession()` for auth checks | `getUser()` (JWT-validated) | @supabase/ssr 0.1+ | `getSession()` is unsafe for gating — reads cookie without server validation |
| Implicit flow OAuth | PKCE flow (default in @supabase/ssr) | @supabase/ssr 0.1+ | All OAuth now goes through `/auth/callback` code exchange |
| `createPagesBrowserClient` | `createBrowserClient` from `@supabase/ssr` | When Pages Router was dropped | Pages Router helpers removed |

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `@supabase/ssr` | OAuth callback, server auth | ✓ | 0.10.2 | — |
| `@supabase/supabase-js` | All auth methods | ✓ | ^2.101.0 | — |
| Supabase project (hosted) | Auth, DB, GoTrue | ✓ (assumed — existing admin auth works) | — | — |
| Google OAuth credentials | AUTH-02 | [ASSUMED: not yet configured for customer auth — admin uses different Google client] | — | Phase can proceed; must be configured before testing |
| Apple Sign In credentials | AUTH-03 | ✗ [ASSUMED: not configured] | — | Phase can proceed; Apple setup is a Supabase dashboard + Apple Developer task, not a code task |
| Supabase OAuth provider settings | AUTH-02, AUTH-03 | [ASSUMED: not yet enabled in Supabase dashboard] | — | Must be enabled before E2E testing |

**Missing dependencies with no fallback:**
- None that block code implementation. Google and Apple OAuth credentials are needed for integration testing but not for unit tests or code authoring.

**Missing dependencies with fallback:**
- Google OAuth credentials: code can be written and unit-tested without them; manual E2E test requires configuration.
- Apple Sign In: same as Google. Apple requires a paid Apple Developer account and Service ID setup — confirm this is already in place.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.1 + @testing-library/react 16.3.2 |
| Config file | `vitest.config.ts` (project root) |
| Quick run command | `npx vitest run tests/auth-customer.test.ts tests/auth-callback.test.ts` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AUTH-01 | `sendMagicLink` server action dispatches OTP, returns `{success:true}` | unit | `npx vitest run tests/auth-customer.test.ts` | ❌ Wave 0 |
| AUTH-01 | `signInWithPassword` server action returns error on bad credentials | unit | same | ❌ Wave 0 |
| AUTH-01 | Rate limit fires after 5 attempts on `/login` | unit | same | ❌ Wave 0 |
| AUTH-02 | `signInWithOAuth({provider:'google'})` is called with correct `redirectTo` | unit (mock Supabase client) | same | ❌ Wave 0 |
| AUTH-03 | `signInWithOAuth({provider:'apple'})` is called with correct `redirectTo` | unit (mock) | same | ❌ Wave 0 |
| AUTH-04 | `signUpWithPassword` inserts `customer_profiles` row with chosen `account_type` | unit | same | ❌ Wave 0 |
| AUTH-05 | Middleware: non-admin authenticated user requesting `/admin/dashboard` → redirect to `/` | unit (mock `getUser` returns user without `is_admin`) | `npx vitest run tests/middleware-customer.test.ts` | ❌ Wave 0 |
| AUTH-05 | Middleware: unauthenticated user requesting `/account` → redirect to `/login?return-to=...` | unit | same | ❌ Wave 0 |
| AUTH-05 | Middleware: admin user requesting `/admin` → unchanged (still works) | unit | same | ❌ Wave 0 |
| AUTH-06 | `/auth/callback` GET: valid code → `exchangeCodeForSession` called → `customer_profiles` upserted → redirect to `/account` | unit | `npx vitest run tests/auth-callback.test.ts` | ❌ Wave 0 |
| AUTH-06 | `/auth/callback` GET: valid `token_hash` + `type=signup` → `verifyOtp` called → profile upserted | unit | same | ❌ Wave 0 |
| AUTH-06 | `customer_profiles` row isolates per user (RLS: policy SQL reviewed in migration) | manual (Supabase dashboard policy check) | — | manual-only |
| AUTH-07 | `customerSignOut` server action clears session and redirects to `/` | unit | `npx vitest run tests/auth-customer.test.ts` | ❌ Wave 0 |
| ACCT-04 | `bookings` INSERT without `user_id` still succeeds (anonymous booking path) | unit (regression) | `npx vitest run tests/webhooks-stripe.test.ts` | ✅ (existing) |
| ACCT-04 | `bookings` INSERT with `user_id` populated succeeds | unit | `npx vitest run tests/auth-customer.test.ts` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `npx vitest run tests/auth-customer.test.ts tests/auth-callback.test.ts tests/middleware-customer.test.ts`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green + ACCT-04 regression (`tests/webhooks-stripe.test.ts`) green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `tests/auth-customer.test.ts` — covers AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-07, ACCT-04
- [ ] `tests/auth-callback.test.ts` — covers AUTH-06 (code exchange + profile upsert, token_hash path)
- [ ] `tests/middleware-customer.test.ts` — covers AUTH-05 (all middleware branches)

*(Existing `tests/webhooks-stripe.test.ts` already covers ACCT-04 regression for anonymous bookings — verify it passes after migration 045 is applied.)*

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Supabase GoTrue (bcrypt passwords, PKCE OAuth, OTP magic-links) |
| V3 Session Management | yes | `@supabase/ssr` cookie-based sessions, `SameSite=Lax`, JWT `getUser()` validation |
| V4 Access Control | yes | Middleware `getUser()` gating + `app_metadata.is_admin` discriminator |
| V5 Input Validation | yes | Email validated by GoTrue; `account_type` validated by DB CHECK constraint; `return-to` validated to relative path only |
| V6 Cryptography | no (hand-rolled) | GoTrue handles all crypto; never call custom crypto for auth |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Open redirect via `return-to` param | Spoofing / Tampering | Validate `return-to` is a relative path (`/` prefix, no `//`) |
| Session fixation / cookie theft | Spoofing | `SameSite=Lax` + Supabase cookie rotation on `updateSession()` |
| Brute-force on `/login` (magic-link dispatch) | DoS / Spoofing | `checkRateLimit('/login', ip, { failClosed: false })` — add to LIMITS (5/min) |
| CSRF on sign-out form POST | Tampering | Server action form POSTs carry Next.js action ID; add `/account` server action paths to `CSRF_PROTECTED_PREFIXES` |
| OAuth CSRF (state parameter forgery) | Tampering | Supabase PKCE handles `state` automatically; do not disable |
| Non-admin user accessing admin | Elevation of Privilege | D-11 middleware branch: redirect to `/` |
| Apple JWT secret not rotated | Spoofing | Document 6-month rotation; Apple returns `invalid_client` if expired |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `@supabase/ssr` 0.10→0.12 has no breaking changes for `createBrowserClient`/`createServerClient` | Standard Stack | Upgrade may be needed; check changelog before bumping |
| A2 | Google OAuth credentials for customer auth are not yet configured in Supabase dashboard | Environment Availability | If already configured, the setup step is skipped |
| A3 | Apple Sign In credentials are not yet configured in Supabase dashboard | Environment Availability | If not configured, Apple E2E testing is blocked |
| A4 | Current CSP in `buildCsp()` does not cover `accounts.google.com` / `appleid.apple.com` for OAuth navigation | Common Pitfalls | CSP may need `form-action` or `connect-src` additions; verify in code |
| A5 | `bookings` table does NOT currently have RLS enabled | Migration 045 | If RLS is already on, anonymous inserts may already be restricted; check with Supabase MCP before applying 045 |
| A6 | A minimal `/account/reset-password` page is needed for the password reset flow | Pattern 9 | If omitted, reset link has no landing page — users see the callback error page |
| A7 | `CSRF_PROTECTED_PREFIXES` should include customer server action paths | Security Domain | If omitted, server actions for sign-in/sign-out lack CSRF protection; verify if Next.js action ID provides sufficient protection |

---

## Open Questions

1. **Should `/account/reset-password` be in-scope for Phase 57 or deferred?**
   - What we know: `resetPasswordForEmail` sends a recovery link; the user clicks it and lands at `/auth/callback?type=recovery`; the callback must then redirect to a page with an `updateUser({password})` form.
   - What's unclear: Without this page, the password reset flow is broken end-to-end in Phase 57.
   - Recommendation: Include a minimal reset-password page in Phase 57 (single field: new password + submit). It mirrors the account skeleton approach.

2. **Does `buildCsp()` need `form-action` additions for Apple Sign In?**
   - What we know: Apple's OAuth uses a POST-back (form POST from `appleid.apple.com`) to the callback URL.
   - What's unclear: Whether the current `form-action` (implied `'self'`) blocks this POST from Apple's domain.
   - Recommendation: Add `form-action 'self' https://appleid.apple.com` to `buildCsp()` and test with Apple Sign In in staging.

3. **Confirm `bookings` table RLS status before writing migration 045**
   - What we know: All booking writes use the service-role client, which bypasses RLS by default.
   - What's unclear: Whether RLS is enabled on the `bookings` table at all.
   - Recommendation: Use Supabase MCP `list_tables` or `execute_sql` to check `pg_tables.rowsecurity` for `bookings` before writing the migration. If RLS is off, migration 045 is safe. If it's on with a deny-all policy, anonymous inserts via service-role still work (service-role bypasses), but document this.

---

## Sources

### Primary (HIGH confidence)
- Supabase Auth SSR Guide [CITED: supabase.com/docs/guides/auth/server-side-rendering] — PKCE flow, `exchangeCodeForSession`, `signInWithOtp`, `signOut`
- Supabase Passwords Guide [CITED: supabase.com/docs/guides/auth/passwords] — `signUp`, `signInWithPassword`, `resetPasswordForEmail`, `verifyOtp`, `token_hash` confirm route
- Supabase RLS Guide [CITED: supabase.com/docs/guides/auth/row-level-security] — `auth.uid()` pattern, per-operation policies
- Supabase Apple OAuth Guide [CITED: supabase.com/docs/guides/auth/social-login/auth-apple] — Services ID, `.p8` key, 6-month secret rotation
- Supabase Google OAuth Guide [CITED: supabase.com/docs/guides/auth/social-login/auth-google] — `signInWithOAuth`, callback URI setup
- Codebase: `lib/supabase/server.ts`, `lib/supabase/middleware.ts`, `middleware.ts`, `app/admin/login/actions.ts`, `app/admin/login/page.tsx` [VERIFIED: codebase read]
- Codebase: `supabase/migrations/039_*`, `040_*`, `041_*` [VERIFIED: codebase read] — migration patterns
- npm registry: `@supabase/ssr@0.12.0`, `@supabase/supabase-js@2.108.1` [VERIFIED: npm view]

### Secondary (MEDIUM confidence)
- `force-dynamic` requirement for authenticated routes: [CITED: supabase.com/docs/guides/auth/server-side-rendering] — Supabase SSR docs explicitly state this requirement

### Tertiary (LOW confidence / ASSUMED)
- A3, A4, A5, A6, A7 — see Assumptions Log above

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages verified in package.json and npm registry
- Architecture patterns: HIGH — OAuth callback, server action, middleware patterns verified against official Supabase docs and existing codebase
- Migration SQL: HIGH — RLS patterns from Supabase docs; ALTER TABLE pattern from existing codebase migrations
- Apple/Google OAuth setup: MEDIUM — Supabase docs describe requirements; actual credential state is ASSUMED (not checked in this session)
- Pitfalls: HIGH — verified against codebase code (isDynamicPath whitelist, getUser vs getSession, open redirect) and official docs

**Research date:** 2026-06-11
**Valid until:** 2026-07-11 (Supabase auth APIs are stable; Apple key rotation is the main expiry risk)
