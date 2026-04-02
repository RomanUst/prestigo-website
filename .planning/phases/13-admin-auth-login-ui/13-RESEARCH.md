# Phase 13: Admin Auth + Login UI — Research

**Researched:** 2026-04-02
**Domain:** Supabase SSR auth with Next.js 16 (proxy.ts), admin route protection, login UI
**Confidence:** HIGH

---

## Summary

Phase 13 wires up the auth layer that Phase 10 deliberately left incomplete. The project runs Next.js 16.1.7, where `middleware.ts` is deprecated and replaced by `proxy.ts` — the file already exists at `prestigo/proxy.ts` and calls `updateSession()`. The task is to add redirect logic inside `updateSession()` in `lib/supabase/middleware.ts`, then create the login page and admin layout shell.

The infinite-redirect-loop risk is the dominant concern. It happens when the redirect logic triggers on `/admin/login` itself. The prevention rule is simple: exclude `/admin/login` from the unauthenticated redirect path. The cookie dual-write pattern already present in `lib/supabase/middleware.ts` is correct — the session refresh must write to both `request.cookies` (for Server Components) and `response.cookies` (for the browser). Do not change this pattern.

The admin layout (`app/admin/layout.tsx`) adds a second layer of defense via a server-side `getUser()` call that redirects if no user is found. This is the recommended "defense in depth" pattern — proxy redirects are optimistic, server components are authoritative.

**Primary recommendation:** Add redirect logic to `updateSession()`, create `/admin/login` as a Server Action form, and double-guard in `app/admin/layout.tsx`. The `proxy.ts` file requires no changes — only `lib/supabase/middleware.ts` gains redirect logic.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| AUTH-01 | Unauthenticated requests to `/admin/*` are redirected to `/admin/login` | Redirect logic in `updateSession()` in `lib/supabase/middleware.ts`; already wired through `proxy.ts` |
| AUTH-02 | Operator can sign in with email + password at `/admin/login` | `signInWithPassword` Server Action in `app/admin/login/actions.ts`; login page at `app/admin/login/page.tsx` |
| AUTH-03 | Authenticated session persists across browser refresh (HTTP-only Supabase cookie) | Cookie dual-write already implemented in `lib/supabase/middleware.ts`; `@supabase/ssr` 0.10.0 handles HTTP-only cookie persistence |
| AUTH-04 | Operator can sign out and be redirected to `/admin/login` | `signOut` Server Action called from a button in `AdminSidebar`; clears session cookie, redirects to `/admin/login` |
</phase_requirements>

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@supabase/ssr` | 0.10.0 (installed) | SSR-safe Supabase client — cookie-based session | Already installed in Phase 10; official Supabase SSR package |
| `next` | 16.1.7 (installed) | App framework with `proxy.ts` convention | Project framework |
| Server Actions (`"use server"`) | Next.js built-in | Login/logout form handlers | Avoids client-side auth state; works with HTTP-only cookies |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `redirect` from `next/navigation` | Built-in | Server-side redirect after auth actions | In Server Actions and Server Components |
| `revalidatePath` from `next/cache` | Built-in | Clears router cache after sign-out | Ensures UI reflects signed-out state |

### No New Installs Required
All packages needed for Phase 13 are already installed.

---

## Architecture Patterns

### New Files to Create
```
prestigo/
├── app/
│   └── admin/
│       ├── layout.tsx         # Server component double-guard + AdminSidebar shell
│       └── login/
│           ├── page.tsx       # Login form (client or server component)
│           └── actions.ts     # "use server" — signIn, signOut actions
├── components/
│   └── admin/
│       └── AdminSidebar.tsx   # Sidebar shell (placeholder, styled in Phase 15)
```

### Existing Files to Modify
```
prestigo/
└── lib/
    └── supabase/
        └── middleware.ts      # Add redirect logic to updateSession()
```

### Pattern 1: updateSession() Redirect Logic

The `proxy.ts` file is unchanged — it calls `updateSession(request)` and the matcher already covers all routes. All redirect logic lives inside `updateSession()` in `lib/supabase/middleware.ts`.

**Redirect rules:**
1. `/admin/*` (excluding `/admin/login`) + no valid user → redirect to `/admin/login`
2. `/admin/login` + valid user → redirect to `/admin`

**Example (extends existing `lib/supabase/middleware.ts`):**
```typescript
// Source: Supabase SSR docs + community verified pattern
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // IMPORTANT: getUser() validates JWT with auth server — never use getSession() here
  const { data: { user } } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  // Unauthenticated → redirect to login (exclude /admin/login itself to prevent loop)
  if (pathname.startsWith('/admin') && pathname !== '/admin/login' && !user) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/admin/login'
    return NextResponse.redirect(loginUrl)
  }

  // Authenticated on login page → redirect to /admin
  if (pathname === '/admin/login' && user) {
    const adminUrl = request.nextUrl.clone()
    adminUrl.pathname = '/admin'
    return NextResponse.redirect(adminUrl)
  }

  return response
}
```

**Critical:** The `setAll` cookie dual-write (writing to both `request.cookies` and `response.cookies`) must be preserved exactly as-is. Do not simplify it. This is what prevents session loss on refresh (AUTH-03).

### Pattern 2: Login Page — Server Action

```typescript
// app/admin/login/actions.ts
'use server'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export async function signIn(formData: FormData) {
  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({
    email: formData.get('email') as string,
    password: formData.get('password') as string,
  })
  if (error) {
    // Return error to display in form — do NOT redirect to an error page
    // (admin-only form; just show "Invalid credentials")
    return { error: error.message }
  }
  redirect('/admin')
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/admin/login')
}
```

Note: Server Actions that call `redirect()` throw internally — always call `redirect()` outside a try/catch, or in the `finally` block.

### Pattern 3: Admin Layout — Server-Side Double Guard

```typescript
// app/admin/layout.tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AdminSidebar from '@/components/admin/AdminSidebar'

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) {
    redirect('/admin/login')
  }

  return (
    <div className="admin-layout">
      <AdminSidebar />
      <main>{children}</main>
    </div>
  )
}
```

This layout does NOT wrap `/admin/login` — that page is a peer of the layout, not nested inside it. In Next.js App Router, `app/admin/layout.tsx` applies to all routes under `app/admin/` EXCEPT `app/admin/login/` only if login is excluded. Actually, login IS inside `/admin/` so the layout WILL wrap it. The layout must check `pathname !== '/admin/login'` before redirecting, OR the login page must be placed outside the admin layout.

**Resolution:** Place `/admin/login` outside the `app/admin/layout.tsx` scope by using a route group, OR the layout must be smart about the login page. The simplest solution that avoids complexity: the layout redirects unauthenticated users, but `/admin/login` uses its own layout (no `app/admin/layout.tsx` applies there when the file structure places login outside the admin layout). In Next.js App Router, `app/admin/layout.tsx` applies to `app/admin/page.tsx` and nested routes but NOT to `app/admin/login/` if we use a route group.

**Recommended file structure:**
```
app/
└── admin/
    ├── layout.tsx          # Guards all /admin/* routes (NOT /admin/login)
    ├── page.tsx            # /admin — redirect to /admin/pricing (placeholder)
    ├── login/
    │   └── page.tsx        # /admin/login — has no layout.tsx, uses root layout
    ├── pricing/
    │   └── page.tsx        # placeholder for Phase 16
    ...
```

Wait — in Next.js App Router, `app/admin/layout.tsx` DOES apply to `app/admin/login/page.tsx` because login is nested under admin. This creates the conflict.

**The correct pattern is a route group:**
```
app/
└── admin/
    ├── (dashboard)/
    │   ├── layout.tsx      # Guards — only wraps dashboard routes
    │   ├── page.tsx        # /admin
    │   ├── pricing/
    │   └── ...
    └── login/
        └── page.tsx        # /admin/login — not wrapped by dashboard layout
```

OR: Keep the simpler flat structure but check in layout.tsx that the current path is not login before redirecting. The flat structure is simpler. The proxy redirect already handles the redirect loop — by the time an unauthenticated user reaches `app/admin/layout.tsx`, they've already been redirected to `/admin/login` by the proxy. So `app/admin/layout.tsx` will only ever run for authenticated users. But an edge case remains: if proxy fails for any reason, the layout is the safety net. The layout's `redirect('/admin/login')` on unauthenticated would redirect to login, and login would call the layout again — BUT the layout only runs for `/admin/*` not `/admin/login` if login is outside the layout scope.

**Final decision for the planner:** Use the route group approach `(dashboard)` to keep login outside the guarded layout. This is the clearest structure.

### Pattern 4: AdminSidebar Shell (Phase 13 placeholder)

```typescript
// components/admin/AdminSidebar.tsx
'use client'  // Needs to be client for interactive sign-out button
import { signOut } from '@/app/admin/(dashboard)/actions'

export default function AdminSidebar() {
  return (
    <nav className="admin-sidebar">
      <div className="admin-sidebar__brand">PRESTIGO Admin</div>
      <ul>
        <li><a href="/admin/pricing">Pricing</a></li>
        <li><a href="/admin/zones">Zones</a></li>
        <li><a href="/admin/bookings">Bookings</a></li>
        <li><a href="/admin/stats">Stats</a></li>
      </ul>
      <form action={signOut}>
        <button type="submit">Sign out</button>
      </form>
    </nav>
  )
}
```

Note: `signOut` Server Action can be passed as a form action — this works without `'use client'` on the sidebar if it's a plain form. If signout needs a button click handler, mark as `'use client'`.

### Setting Up the Supabase Admin User

Manual step (no code):
1. Supabase Dashboard → Authentication → Users → "Invite user" or "Add user"
2. Set email + password
3. After user is created: Dashboard → Authentication → Users → click user → edit `app_metadata` → add `{ "is_admin": true }`

Alternative via Supabase SQL editor:
```sql
UPDATE auth.users
SET raw_app_meta_data = raw_app_meta_data || '{"is_admin": true}'::jsonb
WHERE email = 'operator@prestigo.com';
```

The `is_admin` flag is available on `user.app_metadata.is_admin` in server-side code. Phase 13 only needs to verify the user exists and can log in. Phase 14 will use `is_admin` for API route guards.

### Anti-Patterns to Avoid
- **Using `getSession()` in proxy/middleware:** `getSession()` reads JWT from cookie without server validation. Always use `getUser()` in server-side code.
- **Redirecting `/admin/login` to itself:** Occurs if the admin layout wraps the login page AND redirects unauthenticated users unconditionally.
- **Client-side `router.push()` after login:** Prefer Server Action + `redirect()` — works with HTTP-only cookies that the browser JS cannot read.
- **Simplifying the cookie setAll:** Do not remove the dual-write (`request.cookies.set` + `response.cookies.set`). Removing it breaks session persistence (AUTH-03 failure).
- **Checking `is_admin` in Phase 13 proxy:** Not needed in Phase 13 — Phase 13 only checks for auth presence. `is_admin` guard goes in Phase 14 API routes.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cookie-based session management | Custom cookie serialization | `@supabase/ssr` `createServerClient` with `getAll`/`setAll` | Token refresh, SameSite, HttpOnly flags, expiry — all handled |
| Password hashing + auth | Custom auth table + bcrypt | Supabase Auth email provider | PKCE flow, rate limiting, secure token rotation |
| JWT validation in proxy | Manual JWT decode | `supabase.auth.getUser()` | Validates against Supabase auth server; detects revoked tokens |
| CSRF protection | Custom CSRF tokens | Next.js Server Actions built-in | Server Actions include origin header validation |

**Key insight:** Supabase Auth + `@supabase/ssr` handles all the complexity of cookie-based session management. The only code needed is the routing logic (redirect rules) and the form UI.

---

## Common Pitfalls

### Pitfall 1: Infinite Redirect Loop on `/admin/login`
**What goes wrong:** Unauthenticated request to `/admin/login` → proxy redirects to `/admin/login` → infinite loop → browser "too many redirects" error.
**Why it happens:** Redirect condition `pathname.startsWith('/admin') && !user` matches `/admin/login` itself.
**How to avoid:** Condition must be `pathname.startsWith('/admin') && pathname !== '/admin/login' && !user`.
**Warning signs:** Browser shows "ERR_TOO_MANY_REDIRECTS" on `/admin/login`.

### Pitfall 2: Session Not Persisting on Refresh (AUTH-03 Failure)
**What goes wrong:** User logs in, refreshes page, gets logged out immediately.
**Why it happens:** The `setAll` in `updateSession()` was simplified — token is refreshed but not written back to the browser cookie.
**How to avoid:** Keep the full dual-write pattern: `request.cookies.set` (for Server Components to read) AND `response.cookies.set` (for browser to store).
**Warning signs:** Login works once, but next GET request shows no session.

### Pitfall 3: Admin Layout Wrapping Login Page
**What goes wrong:** `app/admin/layout.tsx` applies to `app/admin/login/page.tsx` → unauthenticated user → layout redirects to `/admin/login` → layout triggers again → loop.
**Why it happens:** Next.js App Router layout applies to all nested routes including login.
**How to avoid:** Use route group `(dashboard)` to exclude login from the guarded layout scope.
**Warning signs:** Login page immediately redirects to itself.

### Pitfall 4: `redirect()` Inside Try/Catch
**What goes wrong:** `redirect()` after successful login is silently swallowed.
**Why it happens:** `redirect()` throws a special Next.js error internally; a try/catch catches it before it can redirect.
**How to avoid:** Call `redirect()` outside try/catch, or in a separate scope after the try block.
**Warning signs:** Sign-in succeeds (no error), but page doesn't redirect.

### Pitfall 5: NEXT_PUBLIC_SUPABASE_ANON_KEY Still a Placeholder
**What goes wrong:** All auth calls return errors; `getUser()` always returns null.
**Why it happens:** Noted in STATE.md: "NEXT_PUBLIC_SUPABASE_ANON_KEY: Placeholder value in .env.local — must retrieve real anon key from Supabase Dashboard before Phase 13 auth UI works."
**How to avoid:** Retrieve the real anon key from Supabase Dashboard before starting Phase 13 tasks.
**Warning signs:** All `supabase.auth.getUser()` calls return errors even with valid credentials.

---

## Code Examples

Verified patterns from official sources:

### updateSession() with Redirect Logic (extends existing Phase 10 code)
```typescript
// Source: Supabase SSR docs — getAll/setAll pattern; redirect logic verified from community
// lib/supabase/middleware.ts — FULL file replacement
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  const { pathname } = request.nextUrl

  if (pathname.startsWith('/admin') && pathname !== '/admin/login' && !user) {
    const url = request.nextUrl.clone()
    url.pathname = '/admin/login'
    return NextResponse.redirect(url)
  }

  if (pathname === '/admin/login' && user) {
    const url = request.nextUrl.clone()
    url.pathname = '/admin'
    return NextResponse.redirect(url)
  }

  return response
}
```

### Server Action: signIn
```typescript
// Source: Supabase SSR official pattern + verified community usage
// app/admin/login/actions.ts
'use server'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export async function signIn(formData: FormData) {
  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({
    email: formData.get('email') as string,
    password: formData.get('password') as string,
  })
  if (error) {
    return { error: error.message }
  }
  redirect('/admin')
}
```

### Server Action: signOut (for AdminSidebar)
```typescript
// Source: Supabase SSR official pattern
'use server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  redirect('/admin/login')
}
```

### Admin Layout Double Guard
```typescript
// Source: Supabase SSR "defense in depth" pattern
// app/admin/(dashboard)/layout.tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AdminSidebar from '@/components/admin/AdminSidebar'

export default async function AdminDashboardLayout({
  children,
}: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/admin/login')

  return (
    <div style={{ display: 'flex' }}>
      <AdminSidebar />
      <main style={{ flex: 1 }}>{children}</main>
    </div>
  )
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `@supabase/auth-helpers-nextjs` | `@supabase/ssr` | 2023 | auth-helpers deprecated; ssr is the standard |
| `getSession()` in server code | `getUser()` in server code | 2024 | getSession doesn't validate JWT with server; getUser does |
| `middleware.ts` at root | `proxy.ts` at root | Next.js 16.0 (2026) | Renamed; same API surface; project already uses proxy.ts |
| Edge runtime middleware | Node.js runtime proxy | Next.js 15.5+ stable | proxy.ts defaults to Node.js; no Edge restriction |

**Deprecated/outdated:**
- `middleware.ts` (Next.js naming): deprecated in Next.js 16; renamed to `proxy.ts`. Project already migrated.
- `@supabase/auth-helpers-nextjs`: replaced by `@supabase/ssr`. Project already uses `@supabase/ssr`.

---

## Open Questions

1. **`app/admin/page.tsx` placeholder**
   - What we know: `/admin` must exist for the post-login redirect to land
   - What's unclear: Should it redirect to `/admin/pricing`, show a dashboard stub, or be empty?
   - Recommendation: Create a minimal `app/admin/(dashboard)/page.tsx` that renders "Admin Dashboard" as text; full content comes in Phase 16

2. **Login form error display**
   - What we know: Server Actions can return `{ error: string }` using `useActionState` (React 19)
   - What's unclear: Phase 13 description says simple form — inline error or toast?
   - Recommendation: Use `useActionState` (available in React 19.x which is installed) to display inline error message below password field; no toast library needed

3. **`/admin/login` page styling**
   - What we know: Phase 15 (UI Design Contract) covers admin UI design; Phase 13 only needs functional login
   - Recommendation: Minimal functional login form using existing brand CSS variables (`--anthracite`, `--copper`, `--off-white`) from `globals.css`; no new CSS framework

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.1 |
| Config file | `vitest.config.ts` (existing) |
| Quick run command | `nvm use 22 && npx vitest run --reporter=verbose 2>&1 \| tail -20` |
| Full suite command | `nvm use 22 && npx vitest run 2>&1` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AUTH-01 | GET `/admin/pricing` unauthenticated → 302 to `/admin/login` | smoke (curl) | `curl -s -o /dev/null -w "%{http_code}" -L http://localhost:3000/admin/pricing` | ❌ Wave 0 manual |
| AUTH-02 | `signInWithPassword` with valid creds → session cookie set | smoke (curl) | Manual browser test — cookie validation requires browser | manual-only |
| AUTH-03 | Session cookie persists across refresh | smoke (browser) | Manual: login, reload, verify still on /admin | manual-only |
| AUTH-04 | Sign out → 302 to `/admin/login` + cookie cleared | smoke (curl) | Manual browser test | manual-only |

Note: AUTH-02, AUTH-03, AUTH-04 are manual-only because they require a live Supabase connection and browser cookie inspection. Unit testing the Server Actions directly is not viable without mocking the Supabase client. The regression gate is: `nvm use 22 && npx vitest run` must stay green (no new test failures).

### Sampling Rate
- **Per task commit:** `nvm use 22 && npx vitest run --reporter=verbose 2>&1 | tail -20`
- **Per wave merge:** `nvm use 22 && npx vitest run 2>&1`
- **Phase gate:** Full vitest suite green + manual smoke: unauthenticated `/admin/pricing` → `/admin/login` → login → `/admin`

### Wave 0 Gaps
- No new test files needed for Phase 13 (auth flows are manual-only)
- Existing vitest suite must remain green — regression check only

---

## Sources

### Primary (HIGH confidence)
- Next.js official docs `proxy.ts` API reference (v16.2.2, fetched 2026-04-02) — confirmed proxy.ts is middleware.ts renamed; same NextRequest/NextResponse API
- `prestigo/proxy.ts` and `prestigo/lib/supabase/middleware.ts` — actual project code confirming existing Phase 10 implementation
- `prestigo/package.json` — confirmed Next.js 16.1.7, @supabase/ssr 0.10.0

### Secondary (MEDIUM confidence)
- Supabase community discussions #21468, #27873 — `getUser()` vs `getSession()`, redirect loop prevention (verified against Supabase official guidance)
- Medium: "Next.js + Supabase Cookie-Based Auth Workflow" (2025) — updateSession redirect pattern, confirmed cookie dual-write requirement
- WebSearch synthesis of Supabase signInWithPassword + signOut Server Action patterns — multiple consistent sources

### Tertiary (LOW confidence)
- `app_metadata` SQL update pattern — community-reported, not directly tested against this Supabase version

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — installed packages confirmed from node_modules
- Architecture: HIGH — proxy.ts and middleware.ts inspected directly; patterns verified against official Next.js 16 docs
- Pitfalls: HIGH — infinite loop prevention and cookie dual-write verified from official sources and community consensus
- app_metadata admin flag: MEDIUM — standard pattern, but manual setup step not verifiable without live Supabase access

**Research date:** 2026-04-02
**Valid until:** 2026-05-02 (30 days — `@supabase/ssr` 0.x is stable; Next.js 16 proxy.ts API is stable)
