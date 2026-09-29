---
phase: 78-whatsapp-cloud-api-channel-coexistence
plan: 08
subsystem: infra
tags: [whatsapp, meta-templates, i18n, chatwoot, templates-as-code]
requires:
  - phase: 78-whatsapp-cloud-api-channel-coexistence
    provides: "infra/chatwoot/whatsapp-templates.mjs (loadTemplates, validateTemplate, --validate) from plan 78-03"
provides:
  - "4 WA-02 templates in 7 locales (28 of the 56 submissions), offline-validated"
  - "tests/whatsapp-templates.test.ts content rules (Meta validation, price/brand/Uber, native translations, synthetic examples)"
affects: [78-10, 78-13]
tech-stack:
  added: []
  patterns: ["template content rules test reuses validateTemplate and hasCurrencyToken as single sources"]
key-files:
  created:
    - infra/chatwoot/whatsapp-templates/booking-change.json
    - infra/chatwoot/whatsapp-templates/payment-help.json
    - infra/chatwoot/whatsapp-templates/review-request.json
    - infra/chatwoot/whatsapp-templates/trip-reminder.json
    - tests/whatsapp-templates.test.ts
  modified: []
key-decisions:
  - "payment-help never bakes in a link; the buttons request a new one (also keeps the body digit-free)"
  - "review-request body speaks about the customer's trip via {{booking_ref}} so UTILITY is defensible; category may still be re-categorized by Meta (record in 78-13)"
  - "Promo-word and stub-marker regexes in the test are word-bounded / case-sensitive (Spanish 'Todo' otherwise matches TODO)"
requirements-completed: [WA-02]
status: complete
duration: 20min
completed: 2026-09-29
commits: 2
plan_head_before: 5e364e705863cadb8382b2b5c8ba585cb17b9952
plan_head_after: 13ce57deac8e7bb568d0b7cfee8d407ed3868864
actuals:
  tokens: 21000
  tasks: 2
  commits: 2
---

# Phase 78 Plan 08: WhatsApp templates part 1 (WA-02 four) Summary

**Booking change, payment help, review request and trip reminder written as code in 7 native locales, UTILITY, price-free, validated offline (validated=28).**

## Templates

| Key | Meta name | Variables | Buttons |
|-----|-----------|-----------|---------|
| booking-change | prestigo_booking_change | first_name, booking_ref, change_summary | QUICK_REPLY ok, QUICK_REPLY question |
| payment-help | prestigo_payment_help | first_name, booking_ref | QUICK_REPLY new_link, QUICK_REPLY question |
| review-request | prestigo_review_request | first_name, booking_ref | URL review -> https://g.page/r/CdQIkiuHQ1UOEBM/review (same link as the Phase 77 canned response) |
| trip-reminder | prestigo_trip_reminder | first_name, booking_ref, pickup_date, pickup_time, pickup_place | QUICK_REPLY all_good, QUICK_REPLY change |

All four: category UTILITY, parameterFormat NAMED, header null, locales en/ru/es/fr/ar/hi/zh (zh -> `zh_CN`), signed "— Prestigo", no leading or trailing variable, examples synthetic (Anna, PRG-EXAMPLE, 14:30, Prague Airport, Terminal 1).

## Verification output

`node infra/chatwoot/whatsapp-templates.mjs --validate` -> 28 `valid <name> <language> body_chars=<n>` lines (longest body 238 chars, limit 1024), `validated=28`, no `invalid` lines.

`npx vitest run tests/whatsapp-templates.test.ts tests/whatsapp-graph.test.ts` -> 79 passed (36 new content tests + 43 existing). `npx eslint --quiet` clean; `npx tsc --noEmit` reports nothing for the new file. `node scripts/qa/chatwoot_price_gate.mjs` exit 0 with the files staged (both commits).

## Task Commits

1. Task 1 (tracer): `79b114d1` - booking-change in 7 locales + content-rules test. RED confirmed first (no templates found), then GREEN; tracer verify (vitest + validated=7) re-run green before expansion.
2. Task 2: `13ce57de` - payment-help, review-request, trip-reminder; required keys widened to the four; per-template tests (payment-help digit-free in every script, review-request single URL button equal to the canned link, trip-reminder all five variables in every locale).

## Deviations from Plan

**1. [Rule 1 - Bug] Stub-marker regex matched Spanish "Todo"**
- Found during: Task 1 first GREEN run.
- Issue: the case-insensitive `TODO` check flagged the es body ("Todo lo demás sigue igual").
- Fix: case-sensitive, word-bounded `\bTODO\b` and `lorem ipsum`.
- Commit: `79b114d1`.

**2. Process notes**
- node_modules symlinked from the main checkout (gitignored, not committed, nothing installed).
- The plan ledger / cwd sentinel files were not created (git-dir commands are refused by the sandbox in this worktree); `commits:` was measured directly as `git rev-list --count 5e364e70..HEAD` = 2.

Otherwise the plan executed as written.

## Open assumptions

- Meta may re-categorize review-request (or any) UTILITY template to MARKETING on submission; not knowable offline. Plan 78-13 records the outcome.
- Native wording was written in-session and has not had a native-speaker review; Meta's own review is the first external check.
- change_summary, pickup_place and pickup_date values are supplied by the sender at send time; the operator should supply them in the customer's language.

## Known Stubs

None.

## Threat Flags

None. T-78-23 (no price: currency matcher on every string, digit-free payment copy, pre-commit gate), T-78-24 (synthetic examples only, PRG-\d{8}/email/phone rejected) and T-78-25 (promo-word check, review tied to booking ref) are mitigated and tested.

## Self-Check: PASSED

- All four template files and tests/whatsapp-templates.test.ts exist.
- Commits 79b114d1 and 13ce57de exist on the worktree branch.
