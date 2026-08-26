---
phase: 63
slug: admin-booking-editing-change-notification
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: validated
nyquist_compliant: true
wave_0_complete: true
created: 2026-08-20
validated: 2026-08-26
---

# Phase 63 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest `^4.1.1` (jsdom, `tests/setup.ts`, `@` alias — see [[project_testing_patterns]]) |
| **Config file** | vitest.config.ts (repo root) |
| **Quick run command** | `npx vitest run tests/admin-bookings.test.ts` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | Unit suite — mocked Supabase/Resend/fetch, no live I/O; seconds, not minutes |

---

## Sampling Rate

- **After every task commit:** Run the quick command on the changed test file(s) (`tests/admin-bookings.test.ts`, `tests/booking-changed-email.test.ts`, or `tests/booking-change-history.test.tsx`)
- **After every plan wave:** Run the full suite (`npx vitest run`)
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** one task (quick command runs at every task commit; no watch mode)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 63-01-01 | 01 | 1 | AEDIT-05, FOLLOW-02 | T-63-01-03 | one-way schema commit + flag key confirmed before migration written | checkpoint (decision) | — (blocking decision gate; auto-selects RESEARCH shape) | n/a | ⬜ pending |
| 63-01-02 | 01 | 1 | AEDIT-05 | T-63-01-01, T-63-01-02 | escapeHtml on every old/new value; changed-fields-only diff (no PII snapshot) | unit | `npx vitest run tests/booking-changed-email.test.ts` | ❌ W0 (Task 2 creates) | ⬜ pending |
| 63-01-03 | 01 | 1 | AEDIT-05, FOLLOW-02 | T-63-01-03 | migration 055 applied live before any audit insert runs (no false-positive verify) | checkpoint (human-action) | — (manual: `list_tables` / `information_schema.tables` confirms `booking_edit_audit_log`) | n/a | ⬜ pending |
| 63-02-01 | 02 | 2 | AEDIT-01, AEDIT-04, AEDIT-05, AEDIT-06 | T-63-02-01, T-63-02-02, T-63-02-03, T-63-02-05, T-63-02-06 | admin guard; zod whitelist + field-by-field payload; NO_CRLF; per-id scoping; logEmail dedup before send | unit (mocked Resend + Supabase) | `npx vitest run tests/admin-bookings.test.ts` | ✅ exists (extended W0) | ⬜ pending |
| 63-02-02 | 02 | 2 | FOLLOW-02 | T-63-02-04 | admin-guarded GET; audit rows filtered strictly by booking_id | unit | `npx vitest run tests/admin-bookings.test.ts` | ✅ exists (extended W0) | ⬜ pending |
| 63-03-01 | 03 | 3 | AEDIT-02, AEDIT-03, AEDIT-07 | T-63-03-01, T-63-03-02, T-63-03-04 | server recompute authoritative; client amount never trusted; 422 on divergence w/o override; override audited | unit | `npx vitest run tests/admin-bookings.test.ts` | ✅ exists (extended W0) | ⬜ pending |
| 63-03-02 | 03 | 3 | AEDIT-05, AEDIT-06 | T-63-03-03 | leg isolation (per-id scoping); at-most-once email; integer-CZK precision | unit | `npx vitest run tests/admin-bookings.test.ts` | ✅ exists (extended W0) | ⬜ pending |
| 63-04-01 | 04 | 3 | FOLLOW-02 | T-63-04-01, T-63-04-02 | values rendered as React text children (auto-escaped), no dangerouslySetInnerHTML | typecheck | `npx tsc --noEmit -p tsconfig.json` (0 BookingChangeHistory errors) | ❌ W0 (Task 1 creates component) | ⬜ pending |
| 63-04-02 | 04 | 3 | FOLLOW-02 | T-63-04-01 | lazy fetch (not on table mount); empty/loading/error/populated states pinned | unit (jsdom, mocked fetch) | `npx vitest run tests/booking-change-history.test.tsx` | ❌ W0 (Task 2 creates) | ⬜ pending |
| 63-05-01 | 05 | 4 | AEDIT-01, AEDIT-04 | T-63-05-03, T-63-05-04 | per-row PATCH scoping; React-controlled values (auto-escaped); terminal-status read-only | typecheck + full suite | `npx vitest run && npx tsc --noEmit` (0 BookingsTable errors) | ✅ suite exists | ⬜ pending |
| 63-05-02 | 05 | 4 | AEDIT-02, AEDIT-03, AEDIT-07 | T-63-05-01, T-63-05-02 | override advisory only (server-authoritative); Routes key server-side via /api/calculate-price; 422 requires explicit override | typecheck + full suite | `npx vitest run && npx tsc --noEmit` (0 BookingsTable errors) | ✅ suite exists | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*
*File Exists: ✅ present today · ❌ W0 = Wave 0 creates it · n/a = checkpoint (no test file)*

---

## Wave 0 Requirements

- [x] Test stubs for AEDIT-01…07 (edit PATCH recompute+override, notification gating, leg isolation, audit-log write) — additive to `tests/admin-bookings.test.ts` (`describe('PATCH /api/admin/bookings')` already exists at line 314)
- [x] Shared fixtures for admin PATCH handler + Supabase mocks (follow existing `vi.hoisted` pattern) — seeded in Plan 01 Task 2 into `tests/admin-bookings.test.ts` for Plans 02/03 to import/extend
- [x] `tests/booking-changed-email.test.ts` — created by Plan 01 Task 2 (change-email builder coverage)
- [x] `tests/booking-change-history.test.tsx` — created by Plan 04 Task 2 (component states + grouping)

**Wave 0 test files (finalized):**
- `tests/admin-bookings.test.ts` (exists — extended with trip-edit / audit / notify / price-recompute / GET audit-log cases)
- `tests/booking-changed-email.test.ts` (new — Plan 01)
- `tests/booking-change-history.test.tsx` (new — Plan 04)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Branded change-email visual rendering (old → new layout) | AEDIT-05 | HTML email rendering is visual | Trigger an edit with "notify client" on; inspect the received email in a client |
| Inline edit UX in the expanded booking row | AEDIT-01…04 | Interactive UI | Edit each field type in the admin panel; confirm per-field save + price-review step |
| History-block internal scroll / long-value wrap on a heavily-edited booking | FOLLOW-02 | Visual overflow backstop (UI-SPEC E3) | Expand a booking with many audit rows; confirm the block scrolls internally and long values wrap (no truncation) |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies (63-01-01 / 63-01-03 are checkpoints — exempt from Nyquist)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (three test files enumerated above)
- [x] No watch-mode flags (every command uses `vitest run`)
- [x] Feedback latency < target (quick command at every task commit)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** planner-approved (plan-time); revalidate after execution via `/gsd-validate-phase` (flips `status: validated`).

## Validation Audit 2026-08-26

Retroactive Nyquist reconciliation at v2.1 backlog cleanup. Frontmatter already
asserted `nyquist_compliant: true`; status flipped draft → validated (#2117
NOT-VALIDATED → VALIDATED). AEDIT-01..07 + FOLLOW-02 covered by green tests
(tests/admin-bookings.test.ts, tests/booking-change-history.test.tsx,
tests/booking-changed-email.test.ts). Full `npx vitest run` suite green. Gaps: 0.
