---
phase: 86
review: 86-REVIEW.md
titles: json
findings:
  - id: WR-01
    severity: warning
    disposition: skipped
  - id: WR-02
    severity: warning
    disposition: deferred
  - id: WR-03
    severity: warning
    disposition: deferred
  - id: IN-01
    severity: info
    disposition: deferred
  - id: IN-02
    severity: info
    disposition: deferred
  - id: IN-03
    severity: info
    disposition: deferred
  - id: IN-04
    severity: info
    disposition: deferred
open: 0
total: 7
recorded: 2026-11-03
---

# Phase 86: Code Review Disposition

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| WR-01 | warning | skipped | False positive, checked on production 2026-11-03. On /admin/login, `document.fonts` reports families "Fraunces" and "Inter" loaded. The H1 computes to `Fraunces, Georgia, serif` and `document.fonts.check` returns true, so this Next version registers the real family names and the literals resolve. |
| WR-02 | warning | deferred | Dark-only depth nuance in the wizard panel. The owner approved the visual UAT on production, so it is cosmetic polish for a later admin pass. |
| WR-03 | warning | deferred | The dynamic aria-label plus aria-expanded pair is the UI-SPEC contract and is asserted by tests. Switching to a static label is a small a11y polish for a later admin pass. |
| IN-01 | info | deferred | Tooltip focus-visible gating and Escape dismissal: polish. |
| IN-02 | info | deferred | e.repeat guard for the shortcut and the mobile no-op: polish. |
| IN-03 | info | deferred | Dark hover and active share a colour; the accent bar distinguishes them. |
| IN-04 | info | deferred | Sticky action-row spacing is cosmetic; the owner approved the visual UAT. |

Dispositions: `open`, `fixed`, `skipped`, `deferred`.
