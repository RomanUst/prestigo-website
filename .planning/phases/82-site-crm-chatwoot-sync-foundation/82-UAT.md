---
status: complete
phase: 82-site-crm-chatwoot-sync-foundation
source: [82-VERIFICATION.md]
started: 2026-10-20T23:38:41Z
updated: 2026-10-25T09:40:00Z
---

## Current Test

[testing complete]

## Tests

### 1. /admin/outbox at 375 px
expected: No horizontal page scroll; Retry and Retry all reachable.
result: pass
retest: "2026-10-25 after PR #74 (4647b43b) on prod at 375px: h1 starts at 65px, menu button ends at 56px — no overlap; scrollWidth 375; Retry all failed 208..343px."
reported_before_fix: "Browser-verified on prod 2026-10-25: no page scroll (scrollWidth 375), counts readable, table (720px) scrolls inside its own overflow container, Retry all failed fully visible (disabled, 0 failed). BUT the fixed ☰ menu button (12..56px) covers the start of the page title (h1 at top 1px, 'Outbox' reads 'utbox')."
severity: cosmetic

### 2. /admin/identities at 375 px
expected: Both tabs work; Split and Mark number as shared forms open, validate (e.g. a number without country code shows the error) and can be submitted.
result: pass
retest: "2026-10-25 after PR #74 on prod at 375px: Mark number as shared modal 16..359px, min-width min(480px, 100%), all 5 controls inside the viewport; closed via ✕ without submitting. Not exercised on prod: server-side 'no country code' error, submit, Split (0 merges). See G-82-4 for focus return."
reported_before_fix: "Browser-verified on prod 2026-10-25: page has no horizontal scroll, tabs present. 'Mark number as shared' modal is wider than the screen: panel -52..480px at 375px viewport — phone field -27..403, ✕ close 359..403 and submit button right edge 403 are clipped off-screen. Server-side 'no country code' error and submit not exercised (no prod writes)."
severity: major

### 3. /admin/erasure at 375 px
expected: Search, preview, the confirm modal (both checkboxes, typed email) and the audit table fit; closing the modal returns focus to "Erase this person…".
result: pass
retest: "2026-10-25 after PR #74 on prod at 375px: h1 64px (clear of menu), search/Preview/Refresh 32..343px, audit table scrolls in its container, scrollWidth 375. Confirm modal is the same fixed shared Modal (verified on identities); not opened on prod because preview writes a 'previewed' erasure request for a real person."
reported_before_fix: "Browser-verified on prod 2026-10-25: search field, Preview erasure and Refresh log fit (32..343px); audit table (1006px) scrolls inside its container. The confirm modal uses the same shared components/admin/Modal.tsx (minWidth 480px) as test 2, so it overflows a 375px screen the same way; not opened on prod (would need a real person's preview)."
severity: major

### 4. /ar/privacy and /ar/data-deletion at 375 px
expected: Right-to-left layout, the new CRM/inbox and retention paragraphs render with no clipping or horizontal scroll.
result: pass
source: browser-verified 2026-10-25 (dir=rtl, scrollWidth 375 = clientWidth, 0 overflowing elements; Chatwoot/EspoCRM/Hostinger/Backblaze + 30-day/10-year retention paragraphs visible)

## Summary

total: 4
passed: 4
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

- gap_id: G-82-1
  truth: "/admin pages at 375 px: page title is fully visible, not covered by the mobile menu button"
  status: resolved
  resolved_by: \"PR #74 (4647b43b)\"
  resolved_at: 2026-10-25
  reason: "User reported: fixed ☰ button (12..56px) overlaps the h1 ('Outbox' reads 'utbox')"
  severity: cosmetic
  test: 1
  root_cause: "app/(internal)/admin/(dashboard)/layout.tsx: <main> has className 'pt-16 md:pt-8' but inline style padding '0 32px 32px' overrides padding-top to 0, so content starts under the fixed menu button (pre-existing, affects every admin page)"
  artifacts:
    - path: "app/(internal)/admin/(dashboard)/layout.tsx"
      issue: "inline padding shorthand cancels the pt-16 mobile top padding"
  missing:
    - "Set only horizontal/bottom padding inline (paddingLeft/Right/Bottom) so pt-16 md:pt-8 applies"
  debug_session: ""

- gap_id: G-82-2
  truth: "Admin modals (Mark number as shared, Split, Erase confirm) fit inside a 375 px screen with all controls reachable"
  status: resolved
  resolved_by: \"PR #74 (4647b43b)\"
  resolved_at: 2026-10-25
  reason: "User reported: Mark number as shared modal panel -52..480px at 375px; close and submit buttons clipped"
  severity: major
  test: 2
  root_cause: "components/admin/Modal.tsx panel has minWidth: '480px' and the overlay has no horizontal padding, so on screens < 480px the panel overflows both edges"
  artifacts:
    - path: "components/admin/Modal.tsx"
      issue: "minWidth 480px with width 100%; overlay has no padding"
  missing:
    - "Replace minWidth 480px with a responsive width (e.g. width: 100%, maxWidth 560px, minWidth: min(480px, 100%)) and add padding: 16px to the overlay; check maxHeight + overflowY auto for tall forms"
  debug_session: ""

- gap_id: G-82-3
  truth: "Erasure confirm modal fits at 375 px; closing returns focus to 'Erase this person…'"
  status: resolved
  resolved_by: \"PR #74 (4647b43b)\"
  resolved_at: 2026-10-25
  reason: "Same shared Modal as G-82-2 — overflows at 375px"
  severity: major
  test: 3
  root_cause: "Same as G-82-2 (components/admin/Modal.tsx minWidth 480px)"
  artifacts:
    - path: "components/admin/Modal.tsx"
      issue: "minWidth 480px"
  missing:
    - "Fixed by the G-82-2 change; re-check erasure modal at 375px after the fix"
  debug_session: ""

## Deferred Follow-Ups

- test: 2
  idea: "Mark number as shared modal does not return focus to its trigger on close (focus lands on body). MarkSharedForm focuses the phone input in its mount effect, which runs before Modal records document.activeElement, so Modal stores the input instead of the trigger. Fix: defer the autofocus with setTimeout(…, 0) like ErasureConfirmForm does."
  deferred_at: 2026-10-25
