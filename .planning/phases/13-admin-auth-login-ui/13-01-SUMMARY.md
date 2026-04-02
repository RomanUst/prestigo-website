---
phase: 13-admin-auth-login-ui
plan: "01"
subsystem: auth
tags: [supabase, middleware, server-actions, admin, login]
dependency_graph:
  requires: [10-01]
  provides: [admin-auth-gate, admin-login-page]
  affects: [prestigo/lib/supabase/middleware.ts, prestigo/app/admin/login/]
tech_stack:
  added: []
  patterns: [useActionState, Server Actions, Next.js Middleware redirect, Supabase Auth signInWithPassword]
key_files:
  created:
    - prestigo/app/admin/login/actions.ts
    - prestigo/app/admin/login/page.tsx
  modified:
    - prestigo/lib/supabase/middleware.ts
key_decisions:
  - "redirect() called outside try/catch in signIn — Next.js throws NEXT_REDIRECT internally"
  - "pathname !== '/admin/login' exclusion in middleware prevents infinite redirect loop"
  - "getUser() used (not getSession()) — validates JWT with Supabase auth server"
  - "revalidatePath('/', 'layout') in signOut clears router cache after session invalidation"
  - "Login page uses root layout only — not inside (dashboard) route group"
metrics:
  duration: "2 minutes"
  completed_date: "2026-04-02"
  tasks_completed: 2
  files_changed: 3
---

# Phase 13 Plan 01: Admin Auth Gate + Login Page Summary

Admin auth gate added to middleware redirecting unauthenticated /admin/* to /admin/login, plus a functional email+password login form with signIn/signOut Server Actions backed by Supabase Auth.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Add redirect logic to updateSession() in middleware.ts | 1934d64 | prestigo/lib/supabase/middleware.ts |
| 2 | Create login Server Actions and login page | cb9b46f | prestigo/app/admin/login/actions.ts, prestigo/app/admin/login/page.tsx |

## What Was Built

**middleware.ts (Task 1)**

The `updateSession()` function in `prestigo/lib/supabase/middleware.ts` now contains two redirect rules:

1. Unauthenticated requests to any `/admin/*` path (except `/admin/login`) are redirected to `/admin/login`
2. Authenticated requests to `/admin/login` are redirected to `/admin`

The Supabase session cookie dual-write pattern (writing to both `request.cookies` and `response.cookies`) was preserved exactly. `getUser()` is used instead of `getSession()` for server-side JWT validation.

**actions.ts + page.tsx (Task 2)**

- `signIn(prevState, formData)`: Server Action compatible with React 19 `useActionState`. Returns `{ error: string }` on failure; calls `redirect('/admin')` on success (outside try/catch).
- `signOut()`: Clears session, revalidates layout cache with `revalidatePath('/', 'layout')`, redirects to `/admin/login`.
- `AdminLoginPage`: Client component using `useActionState` for pending state and inline error display. Brand-styled with copper button, anthracite background, Cormorant header.

## Verification

- Next.js build: passed (`/admin/login` listed as static route)
- Vitest regression: 6 files passed, 57 tests green, 0 failures

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check

- [ ] prestigo/lib/supabase/middleware.ts — FOUND (modified)
- [ ] prestigo/app/admin/login/actions.ts — FOUND (created)
- [ ] prestigo/app/admin/login/page.tsx — FOUND (created)
- [ ] commit 1934d64 — Task 1
- [ ] commit cb9b46f — Task 2
