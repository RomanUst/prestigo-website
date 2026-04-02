---
phase: 13
slug: admin-auth-login-ui
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-02
---

# Phase 13 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.1 |
| **Config file** | `prestigo/vitest.config.ts` (existing) |
| **Quick run command** | `nvm use 22 && npx vitest run --reporter=verbose 2>&1 \| tail -20` |
| **Full suite command** | `nvm use 22 && npx vitest run 2>&1` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `nvm use 22 && npx vitest run --reporter=verbose 2>&1 | tail -20`
- **After every plan wave:** Run `nvm use 22 && npx vitest run 2>&1`
- **Before `/gsd:verify-work`:** Full suite must be green + manual smoke test passed
- **Max feedback latency:** ~10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 13-01-01 | 01 | 1 | AUTH-01 | smoke (curl) | `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/admin/pricing` → expect 307/302 | ❌ manual | ⬜ pending |
| 13-01-02 | 01 | 1 | AUTH-01 | regression | `nvm use 22 && npx vitest run 2>&1 \| tail -5` → 0 failures | ✅ existing | ⬜ pending |
| 13-02-01 | 02 | 1 | AUTH-02 | manual | Login form: enter valid creds → POST → redirect to `/admin` | ❌ manual-only | ⬜ pending |
| 13-02-02 | 02 | 1 | AUTH-03 | manual | After login: reload page → still on `/admin` (cookie persists) | ❌ manual-only | ⬜ pending |
| 13-03-01 | 03 | 2 | AUTH-04 | manual | Click Sign Out button → redirect to `/admin/login` + session cleared | ❌ manual-only | ⬜ pending |
| 13-03-02 | 03 | 2 | AUTH-01 | smoke (curl) | `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/admin/pricing` → 307/302 | ❌ manual | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements.

- No new test stubs needed — AUTH flows require live Supabase connection and browser cookie inspection
- Regression gate: existing vitest suite must remain 0 failures throughout execution
- Pre-condition: `NEXT_PUBLIC_SUPABASE_ANON_KEY` must be real value from Supabase Dashboard before any auth code can be tested

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `signInWithPassword` sets session cookie | AUTH-02 | Requires live Supabase + browser cookie inspection; no mock viable | Navigate to `/admin/login`, submit valid creds, verify redirect to `/admin` |
| Session persists across refresh | AUTH-03 | Browser cookie state cannot be inspected by CLI tools | Login, press Cmd+R, verify page stays on `/admin` (not redirected to login) |
| Sign-out clears session | AUTH-04 | Cookie deletion requires browser verification | Click Sign Out, verify redirect to `/admin/login`; then navigate to `/admin/pricing` and verify redirect back to login |
| No infinite loop on `/admin/login` | AUTH-01 | Loop requires browser; curl follows redirects | Navigate to `/admin/login` unauthenticated; verify page renders (not ERR_TOO_MANY_REDIRECTS) |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
