---
phase: 7
slug: foundation-supabase-schema-env-vars-deploy
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-30
---

# Phase 7 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `prestigo/vitest.config.ts` |
| **Quick run command** | `cd prestigo && npx vitest run --reporter=verbose` |
| **Full suite command** | `cd prestigo && npx vitest run` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd prestigo && npx vitest run --reporter=verbose`
- **After every plan wave:** Run `cd prestigo && npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 7-01-01 | 01 | 1 | DB-01 | file-check | `test -f prestigo/supabase/migrations/0001_create_bookings.sql` | ❌ W0 | ⬜ pending |
| 7-01-02 | 01 | 1 | DB-01 | content-check | `grep -c "CREATE TABLE bookings" prestigo/supabase/migrations/0001_create_bookings.sql` | ❌ W0 | ⬜ pending |
| 7-02-01 | 02 | 1 | ENV-01 | file-check | `grep -c "SUPABASE_URL" prestigo/.env.example` | ✅ | ⬜ pending |
| 7-02-02 | 02 | 1 | ENV-01 | content-check | `grep -c "RESEND_API_KEY" prestigo/.env.example` | ✅ | ⬜ pending |
| 7-03-01 | 03 | 2 | DB-02 | manual | Dashboard verification | N/A | ⬜ pending |
| 7-03-02 | 03 | 2 | ENV-02 | manual | Vercel dashboard verification | N/A | ⬜ pending |
| 7-03-03 | 03 | 2 | ENV-03 | manual | Vercel deployment logs | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- Existing infrastructure covers all automated phase requirements.
- No new test stubs needed — DB-01 and ENV-01 are verified via `test` and `grep` shell commands, not Vitest tests.
- DB-02, ENV-02, ENV-03 are manual-only (dashboard operations).

*Wave 0: "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Bookings table created in production Supabase | DB-02 | Dashboard SQL operation — no CLI, no code | Supabase Dashboard > Table Editor > confirm `bookings` table exists with correct columns |
| All 7 env vars set in Vercel Production scope | ENV-02 | Vercel UI operation | Vercel Dashboard > Project > Settings > Environment Variables > confirm each var exists with Production scope only |
| Production deployment succeeds | ENV-03 | External deployment service | Vercel Dashboard > Deployments > latest build shows green; open rideprestige.com, confirm 200 |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
