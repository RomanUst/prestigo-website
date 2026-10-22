---
status: testing
phase: 82-site-crm-chatwoot-sync-foundation
source: [82-VERIFICATION.md]
started: 2026-10-20T23:38:41Z
updated: 2026-10-20T23:38:41Z
---

## Current Test

number: 1
name: /admin/outbox at 375 px
expected: |
  No horizontal page scroll; health counts and the open-events table are readable; Retry and Retry all are reachable.
awaiting: user response

## Tests

### 1. /admin/outbox at 375 px
expected: No horizontal page scroll; Retry and Retry all reachable.
result: [pending]

### 2. /admin/identities at 375 px
expected: Both tabs work; Split and Mark number as shared forms open, validate (e.g. a number without country code shows the error) and can be submitted.
result: [pending]

### 3. /admin/erasure at 375 px
expected: Search, preview, the confirm modal (both checkboxes, typed email) and the audit table fit; closing the modal returns focus to "Erase this person…".
result: [pending]

### 4. /ar/privacy and /ar/data-deletion at 375 px
expected: Right-to-left layout, the new CRM/inbox and retention paragraphs render with no clipping or horizontal scroll.
result: [pending]

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps
