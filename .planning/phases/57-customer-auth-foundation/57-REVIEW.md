---
phase: 57-customer-auth-foundation
reviewed: 2026-06-11T00:00:00Z
depth: standard
files_reviewed: 11
files_reviewed_list:
  - app/account/page.tsx
  - app/account/reset-password/page.tsx
  - app/auth/callback/route.ts
  - app/login/actions.ts
  - app/login/page.tsx
  - components/auth/OAuthButtons.tsx
  - lib/rate-limit.ts
  - lib/supabase/middleware.ts
  - middleware.ts
  - supabase/migrations/044_customer_profiles.sql
  - supabase/migrations/045_bookings_user_id.sql
findings:
  critical: 2
  warning: 6
  info: 4
  total: 12
status: issues_found
---

# Phase 57: Code Review Report

**Reviewed:** 2026-06-11T00:00:00Z
**Depth:** standard
**Files Reviewed:** 11
**Status:** issues_found

## Summary

Reviewed the customer-auth foundation: login page/actions, OAuth, auth callback,
account/reset pages, middleware gating, rate limiter, and migrations 044/045.

The core flows are well-structured (open-redirect guard present, `getUser()` used
instead of `getSession()`, admin gating preserved, RLS on `customer_profiles` is
correct and uses the `(select auth.uid())` optimization). However, two issues rise
to BLOCKER:

1. The open-redirect guard (`safeReturnTo`) does not reject backslash-prefixed
   paths, which several browsers normalize to a protocol-relative URL — a real
   open-redirect bypass.
2. `saveBookingWithUserId` inserts a fully caller-controlled row (including
   `user_id`) using the request-scoped client and never derives `user_id` from the
   authenticated session, so the linked owner is forgeable / spoofable.

There is no project `CLAUDE.md` at the repo root, so review follows the
phase-context focus areas and general Next.js/Supabase security conventions.

## Critical Issues

### CR-01: Open-redirect guard misses backslash-prefixed paths (`/\evil.com`)

**File:** `app/login/actions.ts:19-23`, duplicated at `app/auth/callback/route.ts:9-13`
**Issue:** `safeReturnTo` accepts any string that `startsWith('/')` and does NOT
`startsWith('//')`. A value like `/\evil.com` or `/\/evil.com` passes the check
(first char is `/`, second is `\`, not `/`). Chromium-family and several other
browsers normalize backslashes to forward slashes in the URL path/authority, so a
redirect to `/\evil.com` is interpreted by the browser as `//evil.com` →
`https://evil.com`. Because `redirect(returnTo)` (actions.ts:113) and
`NextResponse.redirect(\`${origin}${returnTo}\`)` (callback route.ts:60, 77) emit
this value directly as a redirect target, this is an exploitable open redirect on
both the password-login and OAuth/email-callback paths. The `return-to` value is
fully attacker-controllable via the login URL query string (`page.tsx:61`,
`OAuthButtons.tsx:17-19`).
**Fix:**
```ts
export function safeReturnTo(raw: string | null): string {
  if (!raw) return '/account'
  // Reject protocol-relative and backslash tricks; require a single leading slash
  // followed by a non-slash, non-backslash char. Also reject control chars.
  if (!/^\/(?![/\\])[^\s\x00-\x1f]*$/.test(raw)) return '/account'
  return raw
}
```
Apply the same hardened helper in both files (and prefer importing the single
exported `safeReturnTo` into the callback route instead of re-declaring it — see
WR-05).

### CR-02: `saveBookingWithUserId` trusts caller-supplied `user_id` and request-scoped client

**File:** `app/login/actions.ts:204-209`
**Issue:** The function accepts an arbitrary `Record<string, unknown>` and inserts
it verbatim:
```ts
export async function saveBookingWithUserId(bookingRow: Record<string, unknown>) {
  const supabase = await createClient()
  await supabase.from('bookings').insert(bookingRow)
}
```
Two problems:
1. **Forgeable owner.** `user_id` is taken from the caller's payload, not from
   `await supabase.auth.getUser()`. A caller can attach any `user_id` (e.g. another
   customer's UUID), mislinking a booking to a victim account. The function name
   ("WithUserId") implies it establishes ownership, but it never authenticates the
   owner it writes.
2. **No validation / unbounded shape.** An unconstrained object is inserted into a
   privileged table. Combined with migration 045 adding `user_id` with no
   customer-facing RLS (booking RLS deferred to Phase 60), there is no DB-side
   backstop. The insert also uses the request-scoped anon client and silently
   ignores any error (no `.select()`, no error check), so failures are invisible.
**Fix:** Derive `user_id` from the authenticated session, never from input, and
fail loudly:
```ts
export async function saveBookingWithUserId(bookingRow: Record<string, unknown>) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const { error } = await supabase
    .from('bookings')
    .insert({ ...bookingRow, user_id: user.id }) // server-derived, overrides any caller value
  if (error) throw new Error(`Booking insert failed: ${error.message}`)
}
```

## Warnings

### WR-01: Rate limiter is fixed-window, not "sliding-window" as documented, and is bypassable across cold starts

**File:** `lib/rate-limit.ts:1-11, 54-92`
**Issue:** The module header and exported docs describe a "Sliding-window rate
limiter," but both the Upstash Lua path (`INCR` + 60s `EXPIRE`) and the in-memory
path implement a **fixed window**. At a window boundary an attacker gets up to
`2 × limit` requests in a short span (end of window N + start of window N+1). For
`/login` (limit 5) and `/admin/login` (limit 5) this materially weakens
brute-force protection. Additionally, the `/login` server actions call
`checkRateLimit('/login', ip, { failClosed: false })` (actions.ts:65, 97, 125), so
when Upstash is down the limiter degrades to a per-serverless-instance in-memory
Map — already documented as `N × limit` bypass. For credential brute-force this is
arguably an auth-critical path that should match `/admin/login`'s posture.
**Fix:** Either (a) correct the docs to say "fixed-window" and accept the boundary
behavior, or (b) implement a true sliding window (sorted-set / two-bucket Lua), and
reconsider `failClosed: true` for `signInWithPassword`'s `/login` check.

### WR-02: `sendPasswordReset` is not rate-limited (email-bombing / cost abuse)

**File:** `app/login/actions.ts:169-183`
**Issue:** Every other auth action calls `checkRateLimit('/login', ...)`, but
`sendPasswordReset` omits it entirely. An attacker can POST this action in a loop
to mail-bomb any address and burn the project's transactional-email quota. The
enumeration-safe "always return success" design (good) actually makes abuse
cheaper, since there is no feedback or throttle.
**Fix:** Add the same guard used by the sibling actions:
```ts
const ip = await getIp()
const rl = await checkRateLimit('/login', ip, { failClosed: false })
if (!rl.allowed) return { error: 'Too many attempts. Please try again in a minute.' }
```

### WR-03: `customer_profiles.updated_at` is never updated (no trigger)

**File:** `supabase/migrations/044_customer_profiles.sql:14`
**Issue:** `updated_at` defaults to `now()` on insert but there is no
`BEFORE UPDATE` trigger to refresh it, so it permanently reflects creation time
after any profile update. The established convention in this repo is an explicit
trigger (see `042_content_automation.sql:67-79`,
`content_items_set_updated_at`). The column is therefore misleading data.
**Fix:** Add a trigger mirroring the existing pattern:
```sql
CREATE OR REPLACE FUNCTION public.customer_profiles_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

CREATE TRIGGER customer_profiles_set_updated_at
  BEFORE UPDATE ON public.customer_profiles
  FOR EACH ROW EXECUTE FUNCTION public.customer_profiles_set_updated_at();
```

### WR-04: Callback `upsertProfile` uses `ignoreDuplicates: true` — OAuth metadata never reconciled

**File:** `app/auth/callback/route.ts:31`
**Issue:** The callback upsert uses `{ onConflict: 'user_id', ignoreDuplicates: true }`,
whereas the signup action (actions.ts:158) uses a real upsert (no
`ignoreDuplicates`). On a returning OAuth user whose `account_type`/`company_name`
changed in `user_metadata`, the callback silently no-ops, so the profile drifts
from the identity provider's data. More importantly, `ignoreDuplicates: true`
compiles to `INSERT ... ON CONFLICT DO NOTHING`; if a row was created by a prior
flow, the upsert does nothing — acceptable for "create if missing," but the comment
("authoritative upsert will also fire in /auth/callback") in actions.ts:151-152
overstates this path's authority since it intentionally ignores conflicts.
**Fix:** Decide on one semantic. If the callback should be authoritative, drop
`ignoreDuplicates` and update on conflict; if it is create-only, soften the
"authoritative" comment in `actions.ts`.

### WR-05: Open-redirect guard duplicated instead of imported (drift risk)

**File:** `app/auth/callback/route.ts:9-13` vs `app/login/actions.ts:19-23`
**Issue:** `safeReturnTo` is implemented twice. The callback even comments "mirrors
the one in app/login/actions.ts." `actions.ts` already `export`s it. Duplicated
security logic guarantees the two will eventually diverge — and the CR-01 fix must
now be applied in two places, the exact failure mode duplication causes.
**Fix:** Import the single exported helper:
`import { safeReturnTo } from '@/app/login/actions'` and delete the local copy.

### WR-06: Reset-password page lets stale/absent recovery session silently update a password — and reuses a non-singleton browser client

**File:** `app/account/reset-password/page.tsx:15-37`
**Issue:** The page calls `supabase.auth.updateUser({ password })` with no check
that a valid recovery session is actually present. If the user lands here without a
recovery token (e.g. middleware already redirected an unauthenticated user to
`/login`, but a logged-in-but-not-recovery user navigates here directly), the call
either fails opaquely or updates the wrong session's password. There is also no
confirmation field and only client-side `minLength={8}`; Supabase enforces its own
policy, but the UI gives no second-entry safety. Minor: `createBrowserClient` is
re-invoked on every render rather than memoized (also true in `OAuthButtons.tsx:10`).
**Fix:** Verify a session/recovery state before enabling submit
(`supabase.auth.getUser()` / handle `onAuthStateChange('PASSWORD_RECOVERY')`),
redirect to `/login` if absent, and memoize the client with `useState`/`useMemo`.

## Info

### IN-01: `getIp` / `getClientIp` trust unvalidated `x-forwarded-for`

**File:** `app/login/actions.ts:29-41`, `lib/rate-limit.ts:175-181`
**Issue:** Both take the first `x-forwarded-for` entry as the client IP. A client
can send an arbitrary `X-Forwarded-For`, rotating the rate-limit key per request and
defeating the limiter, unless a trusted proxy (Vercel) overwrites it. On Vercel the
platform sets `x-forwarded-for`/`x-real-ip`, so this is usually safe — note the
assumption explicitly so it is not broken by a future infra change.
**Fix:** Document the trusted-proxy assumption, or prefer a platform-verified header
(e.g. Vercel's `x-vercel-forwarded-for`).

### IN-02: `signInWithPassword` does not pass `return-to` to OAuth, and OAuth ignores rate limiting

**File:** `components/auth/OAuthButtons.tsx:15-26`
**Issue:** OAuth sign-in runs entirely client-side and is not subject to the
`/login` rate limit (only the server actions are). Not a brute-force vector (no
credentials), but worth noting the asymmetry. The `return-to` handling here is
correct and URL-encoded via `URL.searchParams`.
**Fix:** None required; informational.

### IN-03: Account page shows "Loading..." for unauthenticated users that middleware should have already redirected

**File:** `app/account/page.tsx:51`
**Issue:** `user ? 'You are signed in.' : 'Loading...'` renders "Loading..."
permanently if `user` is null. Middleware (`lib/supabase/middleware.ts:64-70`)
redirects unauthenticated `/account` requests to `/login`, so this branch is
effectively dead — but if middleware is ever bypassed (e.g. matcher change), the
page presents a stuck "Loading..." rather than a real state.
**Fix:** Treat null `user` as an explicit signed-out/redirect state rather than a
perpetual loading label.

### IN-04: Duplicated inline style objects across login/reset pages

**File:** `app/login/page.tsx:23-53` and `app/account/reset-password/page.tsx:39-59`
**Issue:** `inputStyle`, `labelStyle`, brand header, and card styles are copy-pasted
between the two auth pages. Pure maintainability; no behavioral defect.
**Fix:** Extract shared auth-form style constants / a small layout component.

---

_Reviewed: 2026-06-11T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
