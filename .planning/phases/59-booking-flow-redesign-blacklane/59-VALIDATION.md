---
phase: 59
slug: booking-flow-redesign-blacklane
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-17
---

# Phase 59 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | vitest.config.ts |
| **Quick run command** | `npm run test -- --run` |
| **Full suite command** | `npm run test -- --run && npx tsc --noEmit` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run test -- --run`
- **After every plan wave:** Run `npm run test -- --run && npx tsc --noEmit`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 59-01-01 | 01 | 1 | BOOK-01 | — | N/A | unit | `npm run test -- --run` | ❌ W0 | ⬜ pending |
| 59-01-02 | 01 | 1 | BOOK-02 | — | N/A | unit | `npm run test -- --run` | ❌ W0 | ⬜ pending |
| 59-02-01 | 02 | 2 | BOOK-03 | — | N/A | unit | `npm run test -- --run` | ❌ W0 | ⬜ pending |
| 59-03-01 | 03 | 3 | TRACK-01 | — | Analytics events fire correctly | unit | `npm run test -- --run` | ❌ W0 | ⬜ pending |
| 59-03-02 | 03 | 3 | TRACK-02 | — | Meta Pixel eventId deduplication | unit | `npm run test -- --run` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `__tests__/booking/EntryBar.test.tsx` — stubs for BOOK-01, BOOK-02
- [ ] `__tests__/booking/VehicleCard.test.tsx` — stubs for BOOK-03
- [ ] `__tests__/booking/analytics.test.ts` — stubs for TRACK-01, TRACK-02, TRACK-03, TRACK-05

*Existing vitest infrastructure is in place — only test stubs need to be created.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Route map renders with pickup/dropoff times | BOOK-03 | Google Maps rendering cannot be asserted in vitest | Open /book, select a route, verify map appears on vehicle selection screen |
| Flight number field appears for airport transfers only | BOOK-02 | Requires route type detection via real geocoding | Select airport route, verify flight field appears; select non-airport, verify it is hidden |
| CSP nonce applied to inline scripts | BOOK-05 | Browser security policy | Check DevTools Network headers for Content-Security-Policy with nonce |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
