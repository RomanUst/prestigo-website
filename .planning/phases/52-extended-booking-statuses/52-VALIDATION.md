---
phase: 52
slug: extended-booking-statuses
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-27
---

# Phase 52 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `prestigo/vitest.config.ts` |
| **Quick run command** | `cd prestigo && npx vitest run --reporter=verbose 2>&1 | tail -20` |
| **Full suite command** | `cd prestigo && npx vitest run 2>&1` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd prestigo && npx vitest run --reporter=verbose 2>&1 | tail -20`
- **After every plan wave:** Run `cd prestigo && npx vitest run 2>&1`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 52-01-01 | 01 | 1 | STATUS-04-EXT | — | Only valid status values accepted by DB | migration | `supabase db push --local` | ✅ | ⬜ pending |
| 52-01-02 | 01 | 1 | STATUS-04-EXT | — | Zod rejects invalid transitions | unit | `cd prestigo && npx vitest run src/__tests__/gnet-status-push.test.ts` | ✅ | ⬜ pending |
| 52-01-03 | 01 | 1 | STATUS-04-EXT | — | VALID_TRANSITIONS rejects illegal transitions | unit | `cd prestigo && npx vitest run src/__tests__/gnet-status-push.test.ts` | ✅ | ⬜ pending |
| 52-02-01 | 02 | 2 | STATUS-04-EXT | — | GNet status codes map correctly | unit | `cd prestigo && npx vitest run src/__tests__/gnet-status-push.test.ts` | ✅ | ⬜ pending |
| 52-02-02 | 02 | 2 | STATUS-04-EXT | — | StatusBadge renders new statuses | unit | `cd prestigo && npx vitest run` | ✅ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `prestigo/src/__tests__/gnet-status-push.test.ts` — update guard test for `assigned → not null`; add tests for `en_route` and `on_location` transitions
- [ ] Verify existing vitest infrastructure is operational (`cd prestigo && npx vitest run` exits 0)

*Note: Existing test file covers the core flow — Wave 0 is primarily updating the guard assertion and adding three new end-to-end transition tests.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Status badge colors render correctly in browser | STATUS-04-EXT | Visual — no snapshot tests | Open admin bookings table, manually set a booking to `assigned`/`en_route`/`on_location` and verify badge colors match UI-SPEC |
| Status select dropdown shows correct options per status | STATUS-04-EXT | Integration — requires live DB | Confirm only valid next-state options appear in the dropdown for each status |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
