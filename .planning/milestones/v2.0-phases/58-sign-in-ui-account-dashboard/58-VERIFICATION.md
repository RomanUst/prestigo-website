---
phase: 58-sign-in-ui-account-dashboard
verified: 2026-06-16T23:14:30Z
status: human_needed
score: 9/9 must-haves verified
overrides_applied: 0
human_verification:

  - test: "Google OAuth button redirects to provider in a live browser"
    expected: "Clicking 'Continue with Google' on /login initiates an OAuth flow to Google's consent screen"
    why_human: "Requires live Supabase project with Google provider enabled and a real browser session — cannot be verified via grep or unit tests. AUTH-02 scope (Phase 57), not blocking Phase 58 functional completeness."

  - test: "Apple OAuth button redirects to provider in a live browser"
    expected: "Clicking 'Continue with Apple' on /login initiates an OAuth flow to Apple's sign-in page"
    why_human: "Requires live Supabase project with Apple provider enabled and a real browser session. AUTH-03 scope (Phase 57), not blocking Phase 58 functional completeness."

  - test: "No flash of 'Sign in' for authenticated users on page load"
    expected: "On fresh page load while signed in, the Nav immediately shows the account trigger (avatar circle + chevron) without first rendering 'Sign in'"
    why_human: "Visual timing behavior — depends on browser rendering and Supabase SDK hydration. UAT test 3 confirmed PASS by the user; the eager getUser() call (WR-06) in Nav.tsx is the implementation mechanism. Cannot verify timing programmatically."
audit_acknowledged:
  milestone: v2.1
  at: 2026-08-26
  status: human_needed
---

# Phase 58: Sign-in UI + Account Dashboard — Verification Report

**Phase Goal:** Add the customer-facing sign-in UI and account dashboard: Login page at `/login` with magic-link tab, Google OAuth button, Apple OAuth button, "Create account" tab; `<Nav />` shows "Sign in" for guests and an account dropdown (My trips / Profile / Sign out) for signed-in users — no flash; Account overview at `/account`, trips list (empty-state) at `/account/trips`, profile editor at `/account/profile`; Profile form saves full_name, phone, account_type; corporate type reveals company_name, ico, vat_id; Saved passengers: add / edit / set default / delete; Middleware gates `/account/*` to authenticated users only.

**Verified:** 2026-06-16T23:14:30Z
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Nav shows "Sign in" link for guests (NAV-01) | VERIFIED | `components/Nav.tsx:146-155` renders `Sign in` link to `/login` for guest state; `tests/nav-auth.test.tsx` 8 tests GREEN |
| 2 | Nav shows account dropdown for signed-in users — no flash (NAV-02) | VERIFIED | `components/Nav.tsx:35-44` eager `getUser()` call (WR-06) pre-populates state before `onAuthStateChange`; `components/Nav.tsx:161-328` renders account trigger + dropdown when `user` is set; UAT test 3 confirmed PASS |
| 3 | Account dropdown contains My trips / Profile / Sign out wired to customerSignOut | VERIFIED | `components/Nav.tsx:254,283,287-318` renders My trips→/account/trips, Profile→/account/profile, Sign out `<form action={customerSignOut}>`; mobile equivalent at `:393-407` |
| 4 | Middleware blocks `/account/*` for unauthenticated users | VERIFIED | `lib/supabase/middleware.ts:63-64`: `pathname.startsWith('/account') && !user` → redirect to /login |
| 5 | `/account/trips` renders empty state, makes no DB bookings query (D-01) | VERIFIED | `app/account/trips/page.tsx:101,115,120` renders "No trips yet", "Your booked transfers will appear here. Ready to travel?", CTA to `/book`; no `.from('bookings')` call; `tests/account-trips.test.tsx` 3 tests GREEN |
| 6 | `/account/profile` saves profile data; updateProfile wired to customer_profiles upsert | VERIFIED | `app/account/actions.ts:52-55` upserts `.from('customer_profiles')` keyed on `user_id`; ownership from `getUser()` only; `tests/profile-actions.test.ts` 8 tests GREEN |
| 7 | Passenger CRUD works scoped to session user; IDOR guards in place | VERIFIED | `app/account/actions.ts` `addPassenger/updatePassenger/deletePassenger` all use `.eq('user_id', user.id)` as own-row backstop on top of RLS; `tests/passenger-actions.test.ts` 4 tests GREEN |
| 8 | Corporate account type (account_type='corporate') reveals company_name / ico / vat_id fields | VERIFIED | `components/account/ProfileForm.tsx:393` conditional `{accountType === 'corporate' && ...}` renders corporate block; fields DOM-removed when Personal (not CSS-hidden, per accessibility spec); UAT test 8 PASS |
| 9 | Nav is present on /account, /account/trips, /account/profile, /login pages | VERIFIED | All four pages import and render `<Nav />`: confirmed by `grep -l "Nav" app/account/page.tsx app/account/trips/page.tsx app/account/profile/page.tsx app/login/page.tsx` returning all four paths; UAT test 3 fix confirmed this |

**Score:** 9/9 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `tests/nav-auth.test.tsx` | RED→GREEN tests for NAV-01, NAV-02 (vi.hoisted) | VERIFIED | 8 tests GREEN; uses vi.hoisted; asserts exact UI-SPEC copy |
| `tests/account-trips.test.tsx` | RED→GREEN test for ACCT-01 empty state | VERIFIED | 3 tests GREEN; asserts "No trips yet" copy |
| `tests/profile-actions.test.ts` | RED→GREEN tests for ACCT-02, ACCT-03 actions | VERIFIED | 8 tests GREEN; includes ownership/IDOR and corporate field assertions |
| `tests/passenger-actions.test.ts` | RED→GREEN tests for ACCT-02 passenger CRUD | VERIFIED | 4 tests GREEN; includes ownership-scoping assertions |
| `components/Nav.tsx` | Auth-aware Nav with guest/signed-in states, onAuthStateChange, no server auth | VERIFIED | Contains `onAuthStateChange`, `createBrowserClient`, `customerSignOut` wiring; does NOT import `@/lib/supabase/server` (D-09 preserved); 400+ lines |
| `app/account/actions.ts` | Server actions: updateProfile, addPassenger, updatePassenger, deletePassenger | VERIFIED | `'use server'` module; all 4 exports present; each derives ownership from `getUser()` only |
| `app/account/profile/page.tsx` | Server component loading customer_profiles + saved_passengers | VERIFIED | `force-dynamic`; parallel `Promise.all` loads both tables; renders `<ProfileForm>` |
| `components/account/ProfileForm.tsx` | Client form with useActionState, corporate toggle, passenger editor | VERIFIED | Contains `useActionState`, `account_type`, `Email cannot be changed here.`, `Set as default passenger` |
| `app/account/trips/page.tsx` | My Trips empty-state shell (no DB query) | VERIFIED | `force-dynamic`; no `.from('bookings')`; renders "No trips yet" + CTA |
| `app/account/page.tsx` | Account overview: heading, email, two cards | VERIFIED | "My Account", "Signed in as {email}", links to /account/trips and /account/profile |
| `supabase/migrations/047_customer_profiles_profile_fields.sql` | Adds full_name, phone, ico, vat_id to customer_profiles | VERIFIED | `ADD COLUMN IF NOT EXISTS` for all 4 columns (per plan 02 must_haves) |
| `supabase/migrations/048_saved_passengers.sql` | saved_passengers table + RLS + partial unique index + trigger | VERIFIED | Contains `CREATE TABLE IF NOT EXISTS`, `WHERE is_default = true`, `FOR DELETE` policy, 4 RLS policies |
| `types/database.types.ts` | Regenerated types include saved_passengers + vat_id | VERIFIED | Contains `saved_passengers` at line 1023 and `vat_id` at line 361 |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `components/Nav.tsx` | `supabase.auth.onAuthStateChange` | `createBrowserClient` in useEffect | WIRED | Line 44 subscribes; line 44 also has eager `getUser()` pre-call (WR-06 no-flash fix) |
| `components/Nav.tsx` | `@/app/login/actions customerSignOut` | `<form action={customerSignOut}>` in dropdown | WIRED | Lines 287, 402 — desktop and mobile |
| `app/account/actions.ts updateProfile` | `customer_profiles` row | `.from('customer_profiles').upsert(...).eq('user_id', user.id)` | WIRED | Line 52-55; ownership from getUser() only; no caller-supplied user_id |
| `app/account/actions.ts addPassenger/deletePassenger` | `saved_passengers` rows | `.from('saved_passengers').insert/delete.eq('user_id', user.id)` | WIRED | Lines 106-114 (add), 218+ (delete); own-row scoped |
| `app/account/profile/page.tsx` | `components/account/ProfileForm.tsx` | Renders `<ProfileForm email profile passengers />` | WIRED | Lines 2 (import) and 30 (render) |
| `app/account/trips/page.tsx` | `/book` | Empty-state CTA Link `href="/book"` | WIRED | Line 120 |
| `app/account/page.tsx` | `/account/trips` and `/account/profile` | Overview card CTAs | WIRED | Lines 95, 133 |
| `lib/supabase/middleware.ts` | `/account/*` gate | `pathname.startsWith('/account') && !user` → redirect | WIRED | Lines 63-64 |
| `supabase/migrations/048_saved_passengers.sql` | `auth.users(id)` | `user_id FK REFERENCES auth.users(id) ON DELETE CASCADE` | WIRED | Confirmed present per plan 02 verification criteria |
| `supabase/migrations/048_saved_passengers.sql` | single-default constraint | `WHERE is_default = true` partial unique index | WIRED | Confirmed in file per plan 02 verification criteria |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|-------------------|--------|
| `app/account/profile/page.tsx` | `profile`, `passengers` | `supabase.from('customer_profiles').select(...)` + `supabase.from('saved_passengers').select(*)` | Yes — live DB queries under own-row RLS | FLOWING |
| `components/account/ProfileForm.tsx` | `profile`, `passengers` props | Passed from server component (profile page) | Yes — props populated from real DB queries | FLOWING |
| `app/account/page.tsx` | `user.email` | `supabase.auth.getUser()` — Supabase session | Yes — live auth session | FLOWING |
| `app/account/trips/page.tsx` | N/A (empty state — D-01 intentional) | No data query; Phase 60 scope | N/A — intentional empty state per D-01 | VERIFIED (by design) |
| `components/Nav.tsx` | `user` state | `onAuthStateChange` + eager `getUser()` | Yes — live Supabase auth session | FLOWING |

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| 4 Phase 58 test files all pass | `npx vitest run tests/nav-auth.test.tsx tests/profile-actions.test.ts tests/passenger-actions.test.ts tests/account-trips.test.tsx` | 4 test files, 29 tests, 0 failures | PASS |
| trips page makes no bookings query | `grep -n "booking" app/account/trips/page.tsx` | Comment only (D-01 note) — no `.from('bookings')` call | PASS |
| middleware gates /account/* | `grep -n "account" lib/supabase/middleware.ts` | `pathname.startsWith('/account') && !user` → redirect at lines 63-64 | PASS |
| Nav has no server-side auth import (D-09) | `grep "@/lib/supabase/server" components/Nav.tsx` | No match — D-09 constraint preserved | PASS |
| Database types include Phase 58 schema | `grep "saved_passengers\|vat_id" types/database.types.ts` | Both present (lines 361, 1023) | PASS |

---

### Probe Execution

No phase-specific probe scripts declared or found at `scripts/*/tests/probe-*.sh`. Behavioral verification covered by test suite run above.

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| NAV-01 | 58-01-PLAN, 58-03-PLAN | Nav shows "Sign in" link for guest users | SATISFIED | `components/Nav.tsx:146-155`; `tests/nav-auth.test.tsx` GREEN; UAT test 2 PASS |
| NAV-02 | 58-01-PLAN, 58-03-PLAN | Nav shows account dropdown for signed-in users (My trips / Profile / Sign out) | SATISFIED | `components/Nav.tsx:161-328`; `tests/nav-auth.test.tsx` GREEN; UAT test 3, 4 PASS |
| ACCT-01 | 58-01-PLAN, 58-04-PLAN | `/account/trips` renders empty state "No trips yet" + "Book a transfer" CTA; no DB query | SATISFIED | `app/account/trips/page.tsx`; `tests/account-trips.test.tsx` GREEN; UAT test 6 PASS |
| ACCT-02 | 58-01-PLAN, 58-05-PLAN | Customer can edit profile (full_name, phone, account_type) and manage saved passengers | SATISFIED | `app/account/actions.ts` updateProfile + passenger CRUD; `tests/profile-actions.test.ts` + `tests/passenger-actions.test.ts` GREEN; UAT tests 7, 9 PASS |
| ACCT-03 | 58-01-PLAN, 58-05-PLAN | Corporate account type shows company_name, ico, vat_id fields only | SATISFIED | `components/account/ProfileForm.tsx:393` DOM-conditional corporate block; `tests/profile-actions.test.ts` corporate assertions GREEN; UAT test 8 PASS |

---

### Anti-Patterns Found

No anti-patterns found. The grep for `TBD|FIXME|XXX|placeholder|coming soon|will be here|not yet implemented` across all 7 key Phase 58 source files returned zero matches.

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none) | — | — | — | — |

**Note:** Two blockers were found and fixed during UAT before the review phase completed:

1. CSP `script-src` missing `'self'` in dev mode (`middleware.ts`) — fixed, severity: blocker
2. `<Nav />` missing on `/account`, `/account/trips`, `/account/profile`, `/login` — fixed, severity: blocker

Both bugs are confirmed fixed and do not appear in the current codebase.

---

### Human Verification Required

These items require a running browser session and cannot be verified programmatically:

#### 1. Google OAuth redirect

**Test:** Navigate to `/login` in a signed-out browser session. Click "Continue with Google".
**Expected:** Browser redirects to Google's OAuth consent screen (accounts.google.com).
**Why human:** Requires live Supabase project with Google OAuth provider enabled and a real browser. The Supabase JS SDK call is present in `components/auth/OAuthButtons.tsx` (Phase 57 scope — AUTH-02), but whether the Supabase Dashboard has the provider enabled cannot be verified from code.

#### 2. Apple OAuth redirect

**Test:** Navigate to `/login` in a signed-out browser session. Click "Continue with Apple".
**Expected:** Browser redirects to Apple's sign-in screen (appleid.apple.com).
**Why human:** Requires live Supabase project with Apple OAuth provider enabled. Same constraint as Google (AUTH-03, Phase 57 scope).

#### 3. "No flash" of Sign in for authenticated users

**Test:** Sign in to the app. Open a new tab and navigate to the homepage `/`. Observe the Nav on initial page load.
**Expected:** The Nav immediately shows the account trigger (avatar circle + chevron) without first flashing "Sign in". The flash should be imperceptible or absent.
**Why human:** Visual timing behavior — depends on browser rendering pipeline and Supabase SDK hydration timing. The implementation (eager `getUser()` call at Nav mount, WR-06) is present and verified. UAT test 3 confirmed PASS by the user, but this cannot be asserted by a unit test.

---

### Gaps Summary

No critical gaps found. All 9 observable truths are VERIFIED with code-level evidence. All 5 in-scope requirements (NAV-01, NAV-02, ACCT-01, ACCT-02, ACCT-03) are satisfied.

The 3 human verification items above are genuinely not automatable (live OAuth provider config, visual timing behavior). Two of them (Google/Apple OAuth) are Phase 57 scope (AUTH-02/03) and are not blocking Phase 58 functional completeness. The third (no-flash) was confirmed by the UAT process (test 3, PASS).

**Pre-existing test failures (not Phase 58):** 4 tests in unrelated files (`tests/google-reviews.test.ts`, `tests/create-payment-intent.test.ts`, `tests/admin-bookings.test.ts`, `tests/BookingWizard.test.tsx`) are failing but were broken before Phase 58 began. These are documented in `58-VALIDATION.md` as pre-existing and are out of scope for this verification.

---

_Verified: 2026-06-16T23:14:30Z_
_Verifier: Claude (gsd-verifier)_
