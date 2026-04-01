# Phase 10: Auth Infrastructure - Research

**Researched:** 2026-04-01
**Domain:** @supabase/ssr + Next.js 16 App Router middleware setup
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| AUTH-01 (partial) | Unauthenticated requests to `/admin/*` are redirected to `/admin/login` | This phase installs the infrastructure only — session refresh middleware at root, no redirect logic yet. Redirect logic is deferred to Phase 13. |
</phase_requirements>

---

## Summary

This phase installs `@supabase/ssr` (v0.10.0) and creates the three-file middleware infrastructure that all subsequent auth phases depend on. The work is purely additive: no existing files are modified, no redirect logic is added. The booking wizard remains completely unaffected.

The critical insight from research: Next.js 15+ (and this project uses Next 16.1.7) made `cookies()` from `next/headers` asynchronous. The server client wrapper **must** `await cookies()` and the `createClient()` function **must** be `async`. This is the single most common breakage point when setting up `@supabase/ssr` with recent Next.js versions.

The existing `lib/supabase.ts` uses `@supabase/supabase-js` directly with the service role key for server-side booking operations. This file is untouched in Phase 10. The new `lib/supabase/server.ts` uses the anon key (NEXT_PUBLIC_) and is for user-facing auth operations only — these are two different clients serving different purposes.

**Primary recommendation:** Follow the official `@supabase/ssr` pattern exactly — `getAll`/`setAll` cookie methods, `await cookies()` in server.ts, `getUser()` (not `getSession()`) in middleware, and do NOT add any redirect logic to `updateSession()` in this phase.

---

## Existing Project State (Codebase Audit)

### What Already Exists

| File | What It Is | Impact on Phase 10 |
|------|-----------|---------------------|
| `lib/supabase.ts` | Service-role Supabase client, booking ops (`createSupabaseServiceClient`, `saveBooking`, `buildBookingRow`) | UNTOUCHED in Phase 10. Different purpose from new `lib/supabase/server.ts`. |
| `middleware.ts` | Does NOT exist yet | Phase 10 creates it |
| `lib/supabase/` directory | Does NOT exist yet | Phase 10 creates it |
| `.env.local` | Has `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` but NOT `NEXT_PUBLIC_SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Phase 10 adds the two missing NEXT_PUBLIC_ vars |

### Existing Env Vars (what is already in .env.local)

```
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=...
GOOGLE_MAPS_API_KEY=...
SUPABASE_URL=https://enakcryrtxlnjvjutfpv.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
STRIPE_SECRET_KEY=sk_live_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
RESEND_API_KEY=re_...
MANAGER_EMAIL=info@rideprestigo.com
HEALTH_SECRET=...
```

**Missing (must be added):**
- `NEXT_PUBLIC_SUPABASE_URL` — same value as `SUPABASE_URL` (public, safe for browser)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — the anon/public key from Supabase dashboard (NOT service_role)

Note: `SUPABASE_URL` exists but `NEXT_PUBLIC_SUPABASE_URL` does not. Both are needed — the service client (`lib/supabase.ts`) uses `SUPABASE_URL`, the SSR client (`lib/supabase/server.ts`) uses `NEXT_PUBLIC_SUPABASE_URL`.

### Routes That Must Not Break

The booking wizard spans these routes:
- `/book` — main booking page
- `/book/confirmation` — confirmation page
- `/api/calculate-price` — POST, no auth, uses `lib/pricing.ts` directly
- `/api/create-payment-intent` — POST, Stripe
- `/api/submit-quote` — POST, Supabase service client
- `/api/webhooks/stripe` — POST, Stripe webhook
- `/api/health` — GET, health check
- All public marketing pages (`/`, `/about`, `/contact`, etc.)

The middleware matcher must exclude static assets and the API routes used by the booking wizard must NOT be affected by the session refresh middleware (the middleware just passes them through — it only reads cookies, it does not block).

### Existing Supabase Migration

```
supabase/migrations/0001_create_bookings.sql
```

Phase 10 adds no migrations. Phase 11 adds migrations 0002 and 0003.

### Test Infrastructure

- Framework: vitest 4.x (use `nvm use 22` first — fails on Node 16)
- Config: `prestigo/vitest.config.ts`
- Quick run: `cd prestigo && npx vitest run`
- Tests live in: `prestigo/tests/`
- Most `calculate-price` tests are `it.todo` — not yet implemented. Existing tests that DO run cover pricing logic, booking store, and component rendering.

---

## Standard Stack

### Core Packages to Install

| Library | Verified Version | Purpose | Why |
|---------|-----------------|---------|-----|
| `@supabase/ssr` | 0.10.0 | Server-side Supabase client with cookie session management | Official Supabase package for SSR/App Router auth |
| `@turf/boolean-point-in-polygon` | 7.3.4 | Geo: test if a point is inside a polygon | Required for Phase 12 zone check — install now per roadmap |
| `@turf/helpers` | 7.3.4 | Turf.js utility types/functions | Required peer for `boolean-point-in-polygon` |

**Versions verified against npm registry on 2026-04-01.**

**Installation:**
```bash
cd prestigo
npm install @supabase/ssr @turf/boolean-point-in-polygon @turf/helpers
```

Note: `@supabase/supabase-js` (v2.101.0) is already installed and should NOT be updated in this phase — it powers the existing booking flow.

---

## Architecture Patterns

### File Structure for Phase 10

```
prestigo/
├── lib/
│   ├── supabase.ts              # EXISTING — service role client, untouched
│   └── supabase/                # NEW in Phase 10
│       ├── server.ts            # createServerClient wrapper (anon key, cookies)
│       └── middleware.ts        # updateSession() function
├── middleware.ts                # NEW at project root — calls updateSession only
```

### Pattern 1: lib/supabase/server.ts

**What:** Async factory function that creates a server-side Supabase client bound to the request's cookie store.

**Critical requirement for Next.js 15+/16:** `cookies()` is async — must be `await`ed. `createClient()` must be `async`.

```typescript
// lib/supabase/server.ts
// Source: https://supabase.com/docs/guides/auth/server-side/creating-a-client
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies() // MUST await — Next.js 15+/16 requirement

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Called from a Server Component — writes fail silently.
            // Middleware (updateSession) handles the actual cookie persistence.
          }
        },
      },
    }
  )
}
```

### Pattern 2: lib/supabase/middleware.ts — updateSession

**What:** Session refresh function. Called by root `middleware.ts` on every request. In Phase 10 this is session-refresh-only — NO redirect logic.

**Critical rules:**
1. Call `supabase.auth.getUser()` — never `getSession()` in server code.
2. Do NOT insert any code between `createServerClient(...)` and `supabase.auth.getUser()`.
3. Return the same `response` object that was passed to `setAll` — do not create a new response after the fact.

```typescript
// lib/supabase/middleware.ts
// Source: https://supabase.com/docs/guides/auth/server-side/nextjs
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
          // Write cookies to both the request (for server) and response (for browser)
          cookiesToSet.forEach(({ name, value, options }) =>
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

  // Session refresh only — no redirect logic in Phase 10
  // Phase 13 adds redirect logic here
  await supabase.auth.getUser()

  return response
}
```

### Pattern 3: middleware.ts (project root)

**What:** Next.js middleware entry point. Calls `updateSession` and returns its response.

**Matcher:** Must exclude static assets. Must NOT exclude `/api/` routes — the session cookie refresh is harmless on API routes (it just reads cookies and refreshes if needed; it never blocks). However, excluding API routes is also valid and reduces latency on API calls.

```typescript
// middleware.ts (at prestigo/ root, same level as app/)
import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function middleware(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico (favicon)
     * - public files with extensions (svg, png, jpg, etc.)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
```

### Anti-Patterns to Avoid

- **Using `get`/`set`/`remove` cookie methods:** Deprecated. The old per-cookie API is broken in recent `@supabase/ssr` versions. Use `getAll`/`setAll` only.
- **Not awaiting `cookies()`:** In Next.js 15+/16, `cookies()` is async. Synchronous usage produces a runtime error in production builds.
- **Calling `getSession()` in server code:** `getSession()` does not validate the JWT against the auth server. Always use `getUser()` for server-side auth checks.
- **Adding redirect logic to `updateSession()` in Phase 10:** Redirect logic belongs in Phase 13. Adding it now risks infinite redirect loops before the `/admin/login` page exists.
- **Creating a new `NextResponse.next()` after cookie writes:** Breaks the cookie chain. The `response` object used in `setAll` must be the one returned from `updateSession`.
- **Using `CookieOptions` type import:** In `@supabase/ssr` 0.10.0, the `CookieOptions` type may produce TypeScript strict-mode warnings due to a missing `@types/cookie` dependency. If TypeScript complains, omit the explicit type annotation on `cookiesToSet` — TypeScript can infer it.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Session cookie refresh | Custom token/cookie logic | `@supabase/ssr` `updateSession()` | Token rotation, dual write (request + response cookies), cache headers — all handled correctly |
| Server-side Supabase client with cookies | Manual cookie parsing | `createServerClient` from `@supabase/ssr` | Handles cookie getAll/setAll contract with Next.js correctly |
| JWT validation | Manual JWT decode | `supabase.auth.getUser()` | Sends request to auth server for true validation — local decode is not authoritative |
| Point-in-polygon check | Custom geometry math | `@turf/boolean-point-in-polygon` | Edge cases (boundary, winding order, antimeridian) are notoriously hard |

---

## Common Pitfalls

### Pitfall 1: `cookies()` Not Awaited (Next.js 16 breakage)

**What goes wrong:** Build succeeds but runtime throws: `"Route used cookies(). cookies() should be awaited before using its value."`
**Why it happens:** Next.js 15 made dynamic APIs async. `@supabase/ssr` examples online predate this change.
**How to avoid:** Always `const cookieStore = await cookies()` in `lib/supabase/server.ts`.
**Warning signs:** Console warning during `next dev`, hard error during `next build`.

### Pitfall 2: `NEXT_PUBLIC_SUPABASE_ANON_KEY` vs `SUPABASE_SERVICE_ROLE_KEY` Confusion

**What goes wrong:** Developer puts the service role key in `NEXT_PUBLIC_SUPABASE_ANON_KEY`, exposing it to the browser.
**Why it happens:** The existing `.env.local` only has `SUPABASE_SERVICE_ROLE_KEY` — it's tempting to reuse it.
**How to avoid:** The anon key is different from the service role key. Retrieve the anon key from Supabase Dashboard → Project Settings → API → `anon` `public` key. The service role key bypasses RLS and must NEVER be in a `NEXT_PUBLIC_` variable.
**Warning signs:** `NEXT_PUBLIC_SUPABASE_ANON_KEY` value starts with `eyJ` and has `"role":"service_role"` when decoded — wrong key.

### Pitfall 3: Infinite Redirect Loop (Preview of Phase 13 risk)

**What goes wrong:** Middleware redirects all unauthenticated `/admin/*` requests to `/admin/login`, but `/admin/login` is also matched and redirected, causing a loop.
**Why it happens:** Redirect condition doesn't exclude the login page.
**How to avoid:** This phase intentionally has NO redirect logic. When Phase 13 adds redirects, the condition must check `!request.nextUrl.pathname.startsWith('/admin/login')`.
**Warning signs:** Browser shows ERR_TOO_MANY_REDIRECTS on any `/admin/` URL.

### Pitfall 4: Middleware Runs on Wrong Paths

**What goes wrong:** Middleware matcher is too broad and runs on `/api/webhooks/stripe`, causing Stripe webhook signature validation to fail (body is read twice).
**Why it happens:** Middleware that reads/modifies request body would break raw body access. However, this middleware only reads cookies — it does NOT read the request body.
**How to avoid:** The session refresh middleware is body-safe — it only accesses `request.cookies`. The standard matcher pattern (excluding `_next/static`, `_next/image`, etc.) is sufficient.
**Warning signs:** Stripe webhook returns 400 (signature mismatch). Not expected to occur with cookie-only middleware.

### Pitfall 5: Forgetting to Add Env Vars to Vercel

**What goes wrong:** Works locally, fails in production. `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` missing from Vercel environment.
**Why it happens:** `.env.local` is gitignored; Vercel env vars must be added separately.
**How to avoid:** Add both vars to Vercel Dashboard → Project → Settings → Environment Variables after adding to `.env.local`.
**Warning signs:** Production API routes return 500; browser console shows `NEXT_PUBLIC_SUPABASE_URL is not defined`.

---

## Code Examples

### Retrieving the Anon Key from Supabase Dashboard

The Supabase project URL is already known: `https://enakcryrtxlnjvjutfpv.supabase.co`

Get the anon key from: Supabase Dashboard → `enakcryrtxlnjvjutfpv` project → Project Settings → API → "Project API keys" → `anon` `public`

The `NEXT_PUBLIC_SUPABASE_URL` value is the same as the existing `SUPABASE_URL`:
```
NEXT_PUBLIC_SUPABASE_URL=https://enakcryrtxlnjvjutfpv.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key from dashboard>
```

### Regression Test — Booking Wizard Still Works

After Phase 10 is complete, manually verify:
1. Navigate to `/book` — page loads, wizard shows step 1
2. Select trip type, enter origin/destination, click "Calculate" — price appears (API call succeeds)
3. Navigate to `/api/health` — returns 200 OK

The vitest suite can be run to check that no existing unit tests broke:
```bash
cd /Users/romanustyugov/Desktop/Prestigo/prestigo
# Use Node 22 (vitest 4.x requires it)
export NVM_DIR="$HOME/.nvm" && source "$NVM_DIR/nvm.sh" && nvm use 22
npx vitest run
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `@supabase/auth-helpers-nextjs` | `@supabase/ssr` | 2023 (auth-helpers deprecated) | New package name, same cookie concept but cleaner API |
| `get`/`set`/`remove` cookie methods | `getAll`/`setAll` cookie methods | `@supabase/ssr` v0.5+ | Batch cookie write fixes last-cookie-wins bug |
| `cookies()` synchronous | `await cookies()` | Next.js 15 | All server.ts factory functions must be `async` |
| `getSession()` for server auth | `getUser()` for server auth | Supabase docs 2024+ | `getUser()` validates with auth server; `getSession()` trusts local state only |
| Redirect logic in middleware | Redirect logic in Server Components/pages | Supabase best practice 2024 | Cleaner separation of concerns, easier to debug infinite redirects |

**Deprecated/outdated:**
- `@supabase/auth-helpers-nextjs`: Deprecated in 2023, replaced by `@supabase/ssr`
- `createMiddlewareClient` (from auth-helpers): Maps to `createServerClient` in `@supabase/ssr`
- Single-cookie `get`/`set`/`remove` interface: Replaced by `getAll`/`setAll`

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest 4.1.1 |
| Config file | `prestigo/vitest.config.ts` |
| Quick run command | `cd /Users/romanustyugov/Desktop/Prestigo/prestigo && npx vitest run` |
| Full suite command | `cd /Users/romanustyugov/Desktop/Prestigo/prestigo && npx vitest run` |
| Node version required | 22 (`nvm use 22` — vitest 4.x fails on Node 16) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AUTH-01 (partial) | Middleware file exists and exports `middleware` function | smoke/manual | manual inspect + `next build` succeeds | ❌ Wave 0 |
| AUTH-01 (partial) | `updateSession()` is called on every non-static request | smoke | manual: check middleware runs via `next dev` logs | ❌ Wave 0 |
| AUTH-01 (partial) | Booking wizard regression: `/api/calculate-price` still returns prices | manual | manual: POST to endpoint with test data | ❌ Wave 0 |
| AUTH-01 (partial) | No new TypeScript errors introduced | static | `cd prestigo && npx tsc --noEmit` | N/A — run on existing infra |

Note: Phase 10 is infrastructure-only. There is no testable auth behavior until Phase 13 adds redirect logic. The regression gate is the most important check.

### Sampling Rate

- **Per task commit:** `npx vitest run` (existing test suite passes)
- **Per wave merge:** `npx vitest run` + `npx tsc --noEmit`
- **Phase gate:** All existing tests still pass + manual booking wizard smoke test before moving to Phase 11

### Wave 0 Gaps

- [ ] `tests/middleware.test.ts` — unit test for `updateSession()` (verifies cookie passthrough, no redirect in Phase 10)
- [ ] TypeScript check command: `cd prestigo && npx tsc --noEmit` — run after creating new lib files

*(Existing test infrastructure covers all non-Phase-10 functionality. New files need new tests.)*

---

## Open Questions

1. **Anon key value**
   - What we know: The Supabase project URL is `https://enakcryrtxlnjvjutfpv.supabase.co`, project ID `enakcryrtxlnjvjutfpv`
   - What's unclear: The actual anon key value — it is not in `.env.local` (only service_role key is there)
   - Recommendation: Retrieve from Supabase Dashboard → Project Settings → API → anon `public` key before executing Phase 10

2. **Turf.js types package needed?**
   - What we know: `@turf/boolean-point-in-polygon` 7.3.4 and `@turf/helpers` 7.3.4 ship with their own TypeScript declarations
   - What's unclear: Whether `@types/turf__*` packages are needed (older turf versions required separate types)
   - Recommendation: Install without `@types/` packages first; only add types packages if TypeScript errors appear. Turf v7 bundles its own types.

3. **Middleware matcher scope — should `/api/` be excluded?**
   - What we know: The cookie-only middleware is body-safe, so it won't break Stripe webhooks
   - What's unclear: Whether running session refresh on every API call adds latency that matters
   - Recommendation: Include `/api/` in middleware scope (default matcher). The getUser() call on API routes has sub-millisecond overhead when the session cookie is valid. Excluding API routes entirely is also valid and can be added to the matcher config.

---

## Sources

### Primary (HIGH confidence)
- [Supabase SSR Next.js Guide](https://supabase.com/docs/guides/auth/server-side/nextjs) — middleware and server client patterns
- [Supabase Creating a Client](https://supabase.com/docs/guides/auth/server-side/creating-a-client) — `createServerClient` API, `await cookies()` pattern
- [Supabase Advanced Guide](https://supabase.com/docs/guides/auth/server-side/advanced-guide) — infinite redirect prevention

### Secondary (MEDIUM confidence)
- [Next.js 15 async cookies() issue thread](https://github.com/supabase/ssr/issues/75) — confirms `await cookies()` is required for Next.js 15+
- [supabase/ssr GitHub Discussion #34842](https://github.com/orgs/supabase/discussions/34842) — confirms `setAll` over `set`/`remove`, documents old API breakage
- npm registry — verified `@supabase/ssr@0.10.0`, `@turf/boolean-point-in-polygon@7.3.4`, `@turf/helpers@7.3.4`

### Tertiary (LOW confidence)
- None — all critical claims verified against official sources

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — versions verified against npm registry 2026-04-01
- Architecture: HIGH — patterns verified against official Supabase docs and confirmed by Next.js 15 async cookies() issue tracker
- Pitfalls: HIGH — confirmed by multiple official GitHub issues and Supabase troubleshooting docs

**Research date:** 2026-04-01
**Valid until:** 2026-05-01 (30 days — `@supabase/ssr` is pre-1.0 and actively developed)

---

## RESEARCH COMPLETE
