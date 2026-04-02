---
phase: 10
slug: auth-infrastructure
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-01
---

# Phase 10 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (existing) |
| **Config file** | `vitest.config.ts` (existing) |
| **Quick run command** | `nvm use 22 && npx vitest run --reporter=verbose 2>&1 | tail -20` |
| **Full suite command** | `nvm use 22 && npx vitest run 2>&1` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `nvm use 22 && npx vitest run --reporter=verbose 2>&1 | tail -20`
- **After every plan wave:** Run full suite
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | Status |
|---------|------|------|-------------|-----------|-------------------|--------|
| 10-01-01 | 01 | 1 | ENV | file-check | `grep -c "NEXT_PUBLIC_SUPABASE_URL" .env.local` | ⬜ pending |
| 10-01-02 | 01 | 1 | ENV | file-check | `grep -c "NEXT_PUBLIC_SUPABASE_ANON_KEY" .env.local` | ⬜ pending |
| 10-02-01 | 01 | 1 | INSTALL | file-check | `grep "@supabase/ssr" package.json` | ⬜ pending |
| 10-02-02 | 01 | 1 | INSTALL | file-check | `grep "@turf/boolean-point-in-polygon" package.json` | ⬜ pending |
| 10-03-01 | 01 | 1 | AUTH-01 | file-check | `test -f lib/supabase/server.ts` | ⬜ pending |
| 10-03-02 | 01 | 1 | AUTH-01 | content-check | `grep "await cookies()" lib/supabase/server.ts` | ⬜ pending |
| 10-04-01 | 01 | 1 | AUTH-01 | file-check | `test -f lib/supabase/middleware.ts` | ⬜ pending |
| 10-04-02 | 01 | 1 | AUTH-01 | content-check | `grep "updateSession" lib/supabase/middleware.ts` | ⬜ pending |
| 10-05-01 | 01 | 1 | AUTH-01 | file-check | `test -f middleware.ts` | ⬜ pending |
| 10-05-02 | 01 | 1 | AUTH-01 | content-check | `grep -v "redirect\|signIn\|signOut" middleware.ts` | ⬜ pending |
| 10-06-01 | 01 | 2 | REGRESSION | build | `npm run build 2>&1 | tail -5` | ⬜ pending |
| 10-06-02 | 01 | 2 | REGRESSION | test | `nvm use 22 && npx vitest run 2>&1 | tail -10` | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. No new test stubs needed for this purely-additive phase.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Booking wizard end-to-end still works | REGRESSION | Requires browser + payment flow | Load booking form, complete a test booking through to Stripe checkout; confirm no 500 errors |
| Middleware does NOT redirect any route | AUTH-01 (partial) | Requires HTTP request observation | `curl -I http://localhost:3000/admin/pricing` → must return 200 or 404, NOT 302 |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
