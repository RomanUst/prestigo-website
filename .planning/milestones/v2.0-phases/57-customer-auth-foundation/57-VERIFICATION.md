---
phase: 57-customer-auth-foundation
verified: 2026-06-11T22:40:00Z
status: human_needed
score: 8/8 must-haves verified
overrides_applied: 0
human_verification:

  - test: "Magic-link email: visit /login, запросить magic-link, открыть письмо, перейти по ссылке — убедиться, что открывается /account в состоянии «You are signed in.», строка customer_profiles создана (account_type = personal)"
    expected: "Успешная аутентификация через email magic-link; строка customer_profiles появляется в Supabase"
    why_human: "Требует реального почтового ящика и живого SMTP Supabase"

  - test: "Google OAuth: на /login нажать «Continue with Google», завершить вход — убедиться, что редирект ведёт на /account, console без CSP-нарушений, строка customer_profiles создана"
    expected: "Успешный вход через Google; строка customer_profiles с account_type = personal"
    why_human: "Требует live-провайдера Google в Supabase Dashboard и реального браузера"

  - test: "Apple OAuth: на /login нажать «Continue with Apple» — если провайдер включён, убедиться в аналогичном результате. Если Apple не настроен, зафиксировать как отложенное."
    expected: "Успешный вход через Apple (или явная отметка «не настроен»)"
    why_human: "Требует Apple Services ID, .p8-ключа и live-провайдера в Supabase Dashboard"

  - test: "Регистрация Corporate: /login → «Create one» → выбрать Corporate, ввести название компании + email + пароль → подтвердить email → /account; строка customer_profiles с account_type = corporate и company_name"
    expected: "Корпоративный профиль создан с нужным account_type и company_name"
    why_human: "Требует реального email-подтверждения"

  - test: "Password reset: /login → «Forgot password?» → submit email → перейти по ссылке из письма → /account/reset-password, задать новый пароль → редирект на /account → войти с новым паролем"
    expected: "Полный end-to-end reset-flow работает"
    why_human: "Требует реального письма со ссылкой для сброса"

  - test: "Разделение admin/customer: войдя как customer, перейти на /admin → убедиться в редиректе на / (не на /admin/login, не 403). Проверить, что вход администратора через /admin/login по-прежнему работает."
    expected: "Customer не может получить доступ к /admin; admin-маршрут не нарушен"
    why_human: "Требует двух реальных аккаунтов (customer + admin) и браузера"

  - test: "Sign-out: на /account нажать «Sign out» → редирект на /; затем зайти на /account напрямую → редирект на /login?return-to=%2Faccount"
    expected: "Сессия полностью очищается; /account снова защищён"
    why_human: "Требует браузерной сессии для проверки cookie-invalidation"
audit_acknowledged:
  milestone: v2.1
  at: 2026-08-26
  status: human_needed
---

# Phase 57: Customer Auth Foundation — Verification Report

**Phase Goal:** A customer can authenticate via Supabase Auth (email magic-link/password + Google + Apple OAuth) entirely separate from admin auth, with their profile and account type persisted under row-level security and bookings ready to be linked to a `user_id`.
**Verified:** 2026-06-11T22:40:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| T1 | customer_profiles table exists in migration 044 with account_type CHECK + FK to auth.users + RLS isolating each user to their own row | VERIFIED | `supabase/migrations/044_customer_profiles.sql` — 3 CREATE POLICY (select/insert/update own), REFERENCES auth.users(id) ON DELETE CASCADE, CHECK (account_type IN ('personal', 'corporate')), ENABLE ROW LEVEL SECURITY. Applied to live DB confirmed via Supabase MCP (57-VALIDATION.md). |
| T2 | bookings gains a nullable user_id FK (no NOT NULL, no DEFAULT) so anonymous inserts stay valid | VERIFIED | `supabase/migrations/045_bookings_user_id.sql` — ADD COLUMN IF NOT EXISTS user_id uuid, ON DELETE SET NULL, no NOT NULL, no DEFAULT. Applied live; is_nullable = YES confirmed. types/database.types.ts line 66: `user_id: string | null`. |
| T3 | Migrations 044 and 045 are applied to the LIVE Supabase database | VERIFIED | 57-VALIDATION.md Plan 03 Status: applied 2026-06-11 via Supabase MCP project enakcryrtxlnjvjutfpv; execute_sql confirmed columns, policies, and is_nullable = YES. |
| T4 | Generated TypeScript types reflect the live schema (customer_profiles + bookings.user_id) | VERIFIED | `types/database.types.ts` line 350: `customer_profiles:` table definition present; line 66: `user_id: string | null` on bookings Row type. |
| T5 | A customer can request a magic link, sign in with password, sign up choosing personal/corporate, and trigger Google/Apple OAuth from /login | VERIFIED (auto) | `app/login/actions.ts`: sendMagicLink, signInWithPassword, signUpWithPassword, sendPasswordReset, customerSignOut all exported and fully implemented. `app/login/page.tsx`: four modes (magic/password/register/reset), useActionState wired. `components/auth/OAuthButtons.tsx`: createBrowserClient, signInWithOAuth for 'google' and 'apple'. 31/31 phase auth tests GREEN (auth-customer 10, auth-callback 8, middleware-customer 7 + 6 bonus security). Live OAuth round-trips require human verification (AUTH-02/03). |
| T6 | OAuth + email-confirm + magic-link all land at /auth/callback which exchanges the code/verifies OTP, upserts customer_profiles, and redirects to a validated relative return-to or /account | VERIFIED (auto) | `app/auth/callback/route.ts`: Path 1 (exchangeCodeForSession + upsertProfile), Path 2 (verifyOtp + recovery branch), Path 3 (error → /login?error=auth_callback_error). safeReturnTo guard rejects absolute URLs, //, and /\ backslash form (security fix commit 1089ac6). 8/8 auth-callback tests GREEN. |
| T7 | Middleware redirects unauthenticated /account/* to /login?return-to=..., redirects non-admin authenticated users off /admin to /, and leaves all existing /admin branches working | VERIFIED | `lib/supabase/middleware.ts`: non-admin /admin branch at lines 38-47, unauthenticated /account branch at lines 64-70, existing admin branches untouched (lines 50-61). `middleware.ts` isDynamicPath extended to include /login, /account, /auth. CSP form-action allows accounts.google.com + appleid.apple.com in both buildCsp and buildCspStatic. 7/7 middleware-customer tests GREEN. |
| T8 | Full test suite is green including the ACCT-04 anonymous-booking regression test (no new failures vs pre-phase baseline) | VERIFIED | `tests/webhooks-stripe.test.ts`: 24/24 GREEN (ACCT-04 regression). Phase-relevant: 55/55 GREEN (after security commit 1089ac6 added 6 regression tests: backslash bypass + booking-ownership forgery). Pre-existing 29 failures in 4 unrelated files (google-reviews, create-payment-intent, admin-bookings, BookingWizard) reproduced identically at pre-phase commit 4dcc017. |

**Score:** 8/8 truths verified (automated checks)

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `supabase/migrations/044_customer_profiles.sql` | customer_profiles table + 3 RLS policies | VERIFIED | 3 CREATE POLICY present, ENABLE RLS, (select auth.uid()) form, ON DELETE CASCADE |
| `supabase/migrations/045_bookings_user_id.sql` | nullable user_id FK on bookings | VERIFIED | No NOT NULL, no DEFAULT, ON DELETE SET NULL, partial index WHERE user_id IS NOT NULL |
| `app/login/actions.ts` | sendMagicLink, signInWithPassword, signUpWithPassword, sendPasswordReset, customerSignOut, safeReturnTo, saveBookingWithUserId | VERIFIED | All 7 exports present; safeReturnTo rejects backslash form (1089ac6); saveBookingWithUserId derives user_id from server session |
| `app/auth/callback/route.ts` | GET handler: code exchange + verifyOtp + profile upsert + safe redirect | VERIFIED | All 3 code paths implemented; upsertProfile calls customer_profiles.upsert with onConflict/ignoreDuplicates; safeReturnTo applied |
| `lib/supabase/middleware.ts` | updateSession with /account + non-admin /admin branches | VERIFIED | Non-admin branch before unauthenticated branch (correct order); /account gate present; getUser() used (never getSession) |
| `middleware.ts` | isDynamicPath extended + CSP OAuth domains | VERIFIED | /login, /account, /auth added to isDynamicPath; form-action directive in both buildCsp and buildCspStatic |
| `lib/rate-limit.ts` | '/login': 5 in LIMITS | VERIFIED | Line 22: `'/login': 5, // customer auth` |
| `app/login/page.tsx` | 4-mode customer sign-in UI | VERIFIED | mode state: magic/password/register/reset; useActionState wired for all 4 actions; OAuthButtons imported; role="main"; aria-describedby on errors; return-to passed through |
| `components/auth/OAuthButtons.tsx` | Google + Apple OAuth buttons, createBrowserClient | VERIFIED | createBrowserClient, signInWithOAuth for both providers, /auth/callback redirectTo, aria-label on each button |
| `app/account/page.tsx` | force-dynamic server component + sign-out form | VERIFIED | export const dynamic = 'force-dynamic'; getUser() call; form action={customerSignOut}; .btn-ghost submit |
| `app/account/reset-password/page.tsx` | password update + force-dynamic | VERIFIED | force-dynamic, createBrowserClient, updateUser({ password }), router.push('/account') on success |
| `types/database.types.ts` | Regenerated types with customer_profiles + bookings.user_id | VERIFIED | customer_profiles table at line 350; bookings user_id: string | null at line 66 |
| `tests/auth-customer.test.ts` | Wave-0 test file, now GREEN | VERIFIED | 10/10 tests pass; covers AUTH-01,02,03,04,07,ACCT-04; includes backslash regression (1089ac6) |
| `tests/auth-callback.test.ts` | Wave-0 test file, now GREEN | VERIFIED | 8/8 tests pass; covers AUTH-06; open-redirect, code exchange, verifyOtp, recovery path |
| `tests/middleware-customer.test.ts` | Wave-0 test file, now GREEN | VERIFIED | 7/7 tests pass; covers AUTH-05; non-admin /admin redirect, /account gate, admin branches intact |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `app/login/page.tsx` | `app/login/actions.ts` | useActionState(sendMagicLink/signInWithPassword/signUpWithPassword/sendPasswordReset) | WIRED | Lines 69–75: all 4 action states declared and wired to form actions |
| `app/auth/callback/route.ts` | customer_profiles | `supabase.from('customer_profiles').upsert` | WIRED | upsertProfile helper at line 29; called in both code-exchange and token_hash paths |
| `lib/supabase/middleware.ts` | /account gating | `pathname.startsWith('/account') && !user` redirect to /login | WIRED | Line 64–70 confirmed |
| `customer_profiles.user_id` | `auth.users(id)` | REFERENCES auth.users(id) ON DELETE CASCADE | WIRED | migration 044 line 9; confirmed live via execute_sql |
| `bookings.user_id` | `auth.users(id)` | REFERENCES auth.users(id) ON DELETE SET NULL | WIRED | migration 045 line 9; confirmed live; is_nullable = YES |
| `saveBookingWithUserId` | server session | `supabase.auth.getUser()` → user.id override | WIRED | Lines 236–248 in actions.ts; caller-supplied user_id stripped via destructuring |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|--------------------|--------|
| `app/account/page.tsx` | `user` | `supabase.auth.getUser()` — JWT-validated SSR call | Yes — live Supabase Auth session | FLOWING |
| `app/auth/callback/route.ts` | `data.user` | `exchangeCodeForSession(code)` / `verifyOtp({type, token_hash})` | Yes — real Supabase session exchange | FLOWING |
| `app/login/actions.ts::signUpWithPassword` | `data.user` | `supabase.auth.signUp(...)` | Yes — creates real auth.users row | FLOWING; upserts to customer_profiles with real user.id |

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Phase auth tests (31 tests) | `npx vitest run tests/auth-customer.test.ts tests/auth-callback.test.ts tests/middleware-customer.test.ts` | 3 files passed, 31 tests passed | PASS |
| ACCT-04 anonymous-booking regression | `npx vitest run tests/webhooks-stripe.test.ts` | 1 file passed, 24 tests passed | PASS |
| customer_profiles in types | `grep "customer_profiles" types/database.types.ts` | line 350 found | PASS |
| bookings.user_id nullable in types | `grep "user_id" types/database.types.ts` (bookings section) | `user_id: string | null` at line 66 | PASS |
| safeReturnTo backslash rejection present | `grep "startsWith('/\\\\')"` in actions.ts + callback/route.ts | found in both files | PASS |
| Non-admin /admin gate before unauth check | line order in lib/supabase/middleware.ts | non-admin branch lines 38-47 precedes unauthenticated branch lines 50-54 | PASS |
| /login in isDynamicPath | `grep "startsWith('/login')"` in middleware.ts | line 98 | PASS |
| form-action CSP in both builders | `grep "form-action" middleware.ts` | lines 59 + 83 (both buildCsp and buildCspStatic) | PASS |

---

### Probe Execution

Step 7c не применяется: фаза не объявляет отдельных probe-скриптов (`scripts/*/tests/probe-*.sh` не найдены и не упоминаются в PLAN-файлах).

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|------------|------------|-------------|--------|----------|
| AUTH-01 | 57-02 | Customer can sign in by email (magic-link or password) | SATISFIED | sendMagicLink + signInWithPassword exported; 10/10 auth-customer tests GREEN |
| AUTH-02 | 57-02 | Customer can sign in with Google OAuth | SATISFIED (auto) / HUMAN NEEDED (live) | OAuthButtons.tsx wires Google signInWithOAuth; callback handles code. Live round-trip requires human verification |
| AUTH-03 | 57-02 | Customer can sign in with Apple OAuth | SATISFIED (auto) / HUMAN NEEDED (live) | OAuthButtons.tsx wires Apple signInWithOAuth. Live round-trip requires human verification |
| AUTH-04 | 57-02 | Customer can register and choose account type | SATISFIED | signUpWithPassword reads account_type + company_name; /login register mode shows Personal/Corporate toggle; customer_profiles upserted |
| AUTH-05 | 57-02 | Customer/admin sessions coexist; middleware gates /account without breaking /admin | SATISFIED | 7/7 middleware tests GREEN; non-admin /admin branch added before existing branches |
| AUTH-06 | 57-01, 57-03 | customer_profiles table with RLS isolating each user's row | SATISFIED | Migration 044 applied live; 3 own-row policies confirmed via execute_sql; (select auth.uid()) = user_id in all policies |
| AUTH-07 | 57-02 | Customer can sign out | SATISFIED | customerSignOut: signOut() + redirect('/'); /account form action={customerSignOut} |
| ACCT-04 | 57-01, 57-02 | bookings.user_id nullable FK; anonymous bookings unaffected | SATISFIED | Migration 045 applied live; 24/24 webhooks-stripe tests GREEN; saveBookingWithUserId derives user_id from server session |

**Orphaned requirements check:** REQUIREMENTS.md Traceability table maps AUTH-01..07 and ACCT-04 to Phase 57. All 8 are claimed in plan frontmatter and verified above. No orphans.

**Note on REQUIREMENTS.md checkboxes:** AUTH-06 and ACCT-04 are shown as `[ ]` (unchecked) in REQUIREMENTS.md Traceability — this is a documentation artifact only; the implementation and live schema are fully verified above. The checkboxes in REQUIREMENTS.md appear to not have been updated after Plan 03 completion.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `app/account/page.tsx` | 51 | `user ? 'You are signed in.' : 'Loading...'` | Info (IN-03 from code review) | Dead branch — middleware redirects unauthenticated users before they reach this. Not a stub; middleware makes this branch unreachable in practice. |
| `app/auth/callback/route.ts` | 9-13 | `safeReturnTo` duplicated from `app/login/actions.ts` | Warning (WR-05 from code review) | Security logic in two places — drift risk. Deferred as non-blocking per REVIEW.md. |
| `supabase/migrations/044_customer_profiles.sql` | 14 | `updated_at` column has no update trigger | Warning (WR-03 from code review) | Column permanently reflects creation time after updates. Deferred as non-blocking per REVIEW.md. |

No `TBD`, `FIXME`, or `XXX` markers found in any phase-modified file. No blockers from anti-pattern scan.

The two deferred warnings (WR-03, WR-05) were explicitly accepted as non-blocking by the code review. The two CRITICAL issues (CR-01 open-redirect backslash bypass, CR-02 booking-ownership forgery) were fixed in commit `1089ac6` with regression tests; both are now VERIFIED green.

---

### Human Verification Required

The following items cannot be verified programmatically — they require a live browser, live OAuth providers, and a real email inbox. Per the context note, the user approved the manual round-trip checkpoint during phase execution. These items are recorded here for the formal verification record.

#### 1. Magic-link email delivery (AUTH-01 / AUTH-02 email path)

**Test:** Visit `/login`, введите email, нажмите «Send sign-in link» — убедитесь, что появилось «Check your email», откройте письмо, перейдите по ссылке.
**Expected:** Редирект на `/account`, отображается «You are signed in.», строка в `customer_profiles` с `account_type = personal`.
**Why human:** Требует реального SMTP-inbox и Supabase email delivery.

#### 2. Google OAuth round-trip (AUTH-02)

**Test:** `/login` → «Continue with Google» → завершить Google Sign-In.
**Expected:** Редирект обратно на `/account` (или указанный return-to), строка `customer_profiles` создана, в console нет CSP-нарушений для `accounts.google.com`.
**Why human:** Требует live Google OAuth provider в Supabase Dashboard.

#### 3. Apple OAuth round-trip (AUTH-03)

**Test:** `/login` → «Continue with Apple» → завершить Apple Sign-In (если provider настроен).
**Expected:** Аналогично Google; если Apple не настроен — зафиксировать как deferred.
**Why human:** Требует Apple Services ID + .p8 key + live Supabase provider.

#### 4. Corporate registration with email confirmation (AUTH-04)

**Test:** `/login` → «Create one» → выбрать Corporate, ввести название компании + email + пароль → нажать «Create account» → подтвердить email → проверить `/account`; в Supabase `customer_profiles` — `account_type = corporate`, `company_name` заполнен.
**Expected:** Профиль с корпоративным типом создан.
**Why human:** Требует email-подтверждения (real inbox).

#### 5. Password reset end-to-end

**Test:** `/login` → «Forgot password?» → submit email → открыть reset-письмо → перейти на `/account/reset-password` → ввести новый пароль → убедиться в редиректе на `/account` → войти с новым паролем.
**Expected:** Полный reset-flow завершается успешно.
**Why human:** Требует реального письма со ссылкой.

#### 6. Admin/customer session separation (AUTH-05)

**Test:** Войдя как customer, перейти на `/admin` — убедиться в редиректе на `/` (не `/admin/login`). Затем войти как admin через `/admin/login` — убедиться, что admin-доступ работает.
**Expected:** Две роли полностью изолированы.
**Why human:** Требует двух live-аккаунтов в одном браузере.

#### 7. Sign-out и защита /account (AUTH-07)

**Test:** На `/account` нажать «Sign out» → убедиться в редиректе на `/`; затем перейти на `/account` — убедиться в редиректе на `/login?return-to=%2Faccount`.
**Expected:** Сессия полностью очищена, маршрут снова защищён.
**Why human:** Требует браузерной сессии для проверки cookie-invalidation.

---

### Deferred Items

Нет — все items из списка REQUIREMENTS.md для Phase 57 (AUTH-01..07 + ACCT-04) верифицированы или требуют human-проверки. Warnings из code review (WR-03, WR-04, WR-05, WR-06) явно deferred как non-blocking; они не блокируют фазовую цель.

---

### Gaps Summary

Blockers: **нет**. Все 8 must-have truths подтверждены кодовыми артефактами, живой схемой Supabase, тестами (55/55 GREEN) и проверкой ключевых связей.

Pending: 7 пунктов human-verification (OAuth live round-trips + email flows). Согласно контексту верификации, пользователь уже одобрил manual checkpoint в ходе выполнения фазы. Эти пункты выносятся в UAT-список по стандартному пути `human_needed → 57-UAT.md`.

---

_Verified: 2026-06-11T22:40:00Z_
_Verifier: Claude (gsd-verifier)_
