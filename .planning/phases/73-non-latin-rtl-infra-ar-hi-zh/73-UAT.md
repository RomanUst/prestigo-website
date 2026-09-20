---
status: testing
phase: 73-non-latin-rtl-infra-ar-hi-zh
source: [73-VERIFICATION.md]
started: 2026-09-20T19:30:00Z
updated: 2026-09-20T19:30:00Z
---

## Current Test

number: 1
name: No tofu/fallback glyph boxes on ar/hi/zh D-10 pages
expected: |
  Load /ar/, /hi/login, /zh/login and confirm no tofu/fallback glyph boxes
  appear anywhere on the 5 D-10 representative pages. Every ar/hi/zh glyph
  renders via its Noto face (Noto Sans Arabic / Devanagari / SC); no empty boxes.
  Cross-check against 73-RTL-QA.md's already-recorded PASS results.
awaiting: user response

## Tests

### 1. No tofu/fallback glyph boxes on ar/hi/zh D-10 pages
expected: Load /ar/, /hi/login, /zh/login and independently confirm no tofu/fallback glyph boxes appear anywhere on the 5 D-10 representative pages (cross-check against 73-RTL-QA.md's recorded PASS results). Every ar/hi/zh glyph renders via its Noto face; no empty boxes.
result: [pending]

## Summary

total: 1
passed: 0
issues: 0
pending: 1
skipped: 0
blocked: 0

## Gaps
